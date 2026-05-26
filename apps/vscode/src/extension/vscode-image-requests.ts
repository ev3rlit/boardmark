import { dirname } from 'node:path'
import * as vscode from 'vscode'
import type { HostRequestMethod } from '../shared/protocol'
import { resolveMarkdownImageSource } from './markdown-image-source'

export type HostRequestResult =
  | { readonly ok: true; readonly value?: unknown }
  | { readonly ok: false; readonly error: string }

export async function handleImageHostRequest(input: {
  readonly document: vscode.TextDocument
  readonly method: HostRequestMethod
  readonly payload: unknown
  readonly webview: vscode.Webview
}): Promise<HostRequestResult | null> {
  if (
    input.method !== 'image/resolve' &&
    input.method !== 'image/open' &&
    input.method !== 'image/reveal'
  ) {
    return null
  }

  const payloadResult = readImageSourcePayload(input.payload)

  if (!payloadResult.ok) {
    return {
      ok: false,
      error: payloadResult.error
    }
  }

  if (
    payloadResult.value.documentUri &&
    payloadResult.value.documentUri !== input.document.uri.toString()
  ) {
    return {
      ok: false,
      error: 'Image request document URI does not match the attached VS Code TextDocument.'
    }
  }

  if (input.document.uri.scheme !== 'file' && !/^(https?:|data:|blob:|file:)/i.test(payloadResult.value.src)) {
    return {
      ok: false,
      error: 'Relative image paths require a file-backed VS Code TextDocument.'
    }
  }

  const resolution = resolveMarkdownImageSource({
    documentFsPath: input.document.uri.fsPath,
    src: payloadResult.value.src,
    workspaceFolderFsPath: vscode.workspace.getWorkspaceFolder(input.document.uri)?.uri.fsPath
  })

  if (!resolution.ok) {
    return {
      ok: false,
      error: resolution.error.message
    }
  }

  if (resolution.value.kind === 'passthrough') {
    return handlePassthroughImageRequest(input.method, resolution.value.src)
  }

  const fileUri = vscode.Uri.file(resolution.value.fsPath)
  const uri = fileUri.with({
    query: resolution.value.query,
    fragment: resolution.value.fragment
  })

  if (input.method === 'image/resolve') {
    const statResult = await statUri(fileUri)

    if (!statResult.ok) {
      return statResult
    }

    return {
      ok: true,
      value: {
        src: input.webview.asWebviewUri(uri).toString()
      }
    }
  }

  if (input.method === 'image/open') {
    return runVsCodeCommand(
      () => vscode.commands.executeCommand('vscode.open', uri),
      'VS Code could not open the image source.'
    )
  }

  return runVsCodeCommand(
    () => vscode.commands.executeCommand('revealFileInOS', uri),
    'VS Code could not reveal the image source.'
  )
}

export function readLocalResourceRoots(document: vscode.TextDocument, extensionUri: vscode.Uri): vscode.Uri[] {
  const roots = [
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  ]

  if (document.uri.scheme !== 'file') {
    return roots
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)

  if (workspaceFolder) {
    roots.push(workspaceFolder.uri)
    return roots
  }

  roots.push(vscode.Uri.file(dirname(document.uri.fsPath)))
  return roots
}

function readImageSourcePayload(payload: unknown):
  | {
      readonly ok: true
      readonly value: {
        readonly src: string
        readonly documentUri?: string
      }
    }
  | { readonly ok: false; readonly error: string } {
  if (typeof payload !== 'object' || payload === null || !('src' in payload)) {
    return {
      ok: false,
      error: 'Image request payload must include a string src.'
    }
  }

  const record = payload as Record<string, unknown>

  if (typeof record.src !== 'string') {
    return {
      ok: false,
      error: 'Image request payload src must be a string.'
    }
  }

  if ('documentUri' in record && typeof record.documentUri !== 'string') {
    return {
      ok: false,
      error: 'Image request payload documentUri must be a string.'
    }
  }

  return {
    ok: true,
    value: {
      src: record.src,
      documentUri: typeof record.documentUri === 'string' ? record.documentUri : undefined
    }
  }
}

async function handlePassthroughImageRequest(
  method: HostRequestMethod,
  src: string
): Promise<HostRequestResult> {
  if (method === 'image/resolve') {
    return {
      ok: true,
      value: {
        src
      }
    }
  }

  if (method === 'image/reveal') {
    return {
      ok: false,
      error: 'Remote or embedded images cannot be revealed in the VS Code file explorer.'
    }
  }

  return runVsCodeCommand(
    () => vscode.env.openExternal(vscode.Uri.parse(src)),
    'VS Code could not open the image source.'
  )
}

async function statUri(uri: vscode.Uri): Promise<HostRequestResult> {
  try {
    await vscode.workspace.fs.stat(uri)
    return {
      ok: true,
      value: undefined
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'VS Code could not read the image file.'
    }
  }
}

async function runVsCodeCommand(
  run: () => Thenable<unknown>,
  fallback: string
): Promise<HostRequestResult> {
  try {
    await run()
    return {
      ok: true,
      value: undefined
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallback
    }
  }
}
