import { basename, dirname, extname, join } from 'node:path'
import * as vscode from 'vscode'
import type { HostRequestMethod } from '../shared/protocol'
import {
  readMarkdownAssetDirectoryName,
  resolveMarkdownImageSource,
  toDocumentRelativeMarkdownPath
} from './markdown-image-source'

export type HostRequestResult =
  | { readonly ok: true; readonly value?: unknown }
  | { readonly ok: false; readonly error: string }

export async function handleImageHostRequest(input: {
  readonly document: vscode.TextDocument
  readonly method: HostRequestMethod
  readonly payload: unknown
  readonly webview: vscode.Webview
}): Promise<HostRequestResult | null> {
  if (input.method === 'image/import') {
    return importImageAsset(input)
  }

  if (input.method === 'image-export/save') {
    return saveExportedImage(input)
  }

  if (input.method !== 'image/resolve' && input.method !== 'image/open' && input.method !== 'image/reveal') {
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

async function importImageAsset(input: {
  readonly document: vscode.TextDocument
  readonly payload: unknown
}): Promise<HostRequestResult> {
  if (input.document.uri.scheme !== 'file') {
    return {
      ok: false,
      error: 'Image import requires a file-backed VS Code TextDocument.'
    }
  }

  const payloadResult = readImageImportPayload(input.payload)

  if (!payloadResult.ok) {
    return payloadResult
  }

  if (payloadResult.value.documentUri && payloadResult.value.documentUri !== input.document.uri.toString()) {
    return {
      ok: false,
      error: 'Image import document URI does not match the attached VS Code TextDocument.'
    }
  }

  const assetDirectory = vscode.Uri.file(
    join(dirname(input.document.uri.fsPath), readMarkdownAssetDirectoryName(input.document.uri.fsPath))
  )
  const targetUri = await readNextAvailableUri(assetDirectory, payloadResult.value.fileName)

  try {
    await vscode.workspace.fs.createDirectory(assetDirectory)
    await vscode.workspace.fs.writeFile(targetUri, Uint8Array.from(payloadResult.value.bytes))
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'VS Code could not import the image asset.'
    }
  }

  return {
    ok: true,
    value: {
      src: toDocumentRelativeMarkdownPath({
        documentFsPath: input.document.uri.fsPath,
        targetFsPath: targetUri.fsPath
      })
    }
  }
}

async function saveExportedImage(input: {
  readonly document: vscode.TextDocument
  readonly payload: unknown
}): Promise<HostRequestResult> {
  const payloadResult = readImageExportPayload(input.payload)

  if (!payloadResult.ok) {
    return payloadResult
  }

  const target = await vscode.window.showSaveDialog({
    defaultUri: readDefaultExportUri(input.document, payloadResult.value.fileName),
    filters: readImageExportFilters(payloadResult.value.mimeType),
    saveLabel: 'Export Image'
  })

  if (!target) {
    return {
      ok: true,
      value: {
        status: 'cancelled'
      }
    }
  }

  try {
    await vscode.workspace.fs.writeFile(target, Uint8Array.from(payloadResult.value.bytes))
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'VS Code could not save the exported image.'
    }
  }

  return {
    ok: true,
    value: {
      status: 'saved'
    }
  }
}

function readImageImportPayload(payload: unknown):
  | {
      readonly ok: true
      readonly value: {
        readonly bytes: readonly number[]
        readonly documentUri?: string
        readonly fileName: string
      }
    }
  | HostRequestResult {
  if (typeof payload !== 'object' || payload === null) {
    return {
      ok: false,
      error: 'Image import payload must be an object.'
    }
  }

  const record = payload as Record<string, unknown>
  const bytesResult = readByteArray(record.bytes, 'Image import payload bytes must be an array of bytes.')

  if (!bytesResult.ok) {
    return bytesResult
  }

  if (typeof record.fileName !== 'string') {
    return {
      ok: false,
      error: 'Image import payload fileName must be a string.'
    }
  }

  if ('documentUri' in record && typeof record.documentUri !== 'string') {
    return {
      ok: false,
      error: 'Image import payload documentUri must be a string.'
    }
  }

  return {
    ok: true,
    value: {
      bytes: bytesResult.value,
      documentUri: typeof record.documentUri === 'string' ? record.documentUri : undefined,
      fileName: readSafeFileName(record.fileName, 'image')
    }
  }
}

function readImageExportPayload(payload: unknown):
  | {
      readonly ok: true
      readonly value: {
        readonly bytes: readonly number[]
        readonly fileName: string
        readonly mimeType: 'image/jpeg' | 'image/png'
      }
    }
  | HostRequestResult {
  if (typeof payload !== 'object' || payload === null) {
    return {
      ok: false,
      error: 'Image export payload must be an object.'
    }
  }

  const record = payload as Record<string, unknown>
  const bytesResult = readByteArray(record.bytes, 'Image export payload bytes must be an array of bytes.')

  if (!bytesResult.ok) {
    return bytesResult
  }

  if (typeof record.fileName !== 'string') {
    return {
      ok: false,
      error: 'Image export payload fileName must be a string.'
    }
  }

  if (record.mimeType !== 'image/jpeg' && record.mimeType !== 'image/png') {
    return {
      ok: false,
      error: 'Image export payload mimeType must be image/jpeg or image/png.'
    }
  }

  return {
    ok: true,
    value: {
      bytes: bytesResult.value,
      fileName: readSafeFileName(record.fileName, 'boardmark-export'),
      mimeType: record.mimeType
    }
  }
}

function readByteArray(value: unknown, error: string):
  | { readonly ok: true; readonly value: readonly number[] }
  | { readonly ok: false; readonly error: string } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error
    }
  }

  if (!value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return {
      ok: false,
      error
    }
  }

  return {
    ok: true,
    value
  }
}

function readSafeFileName(fileName: string, fallbackBaseName: string): string {
  const trimmed = basename(fileName.trim())

  if (trimmed.length > 0 && trimmed !== '.' && trimmed !== '..') {
    return trimmed
  }

  return fallbackBaseName
}

async function readNextAvailableUri(directory: vscode.Uri, fileName: string): Promise<vscode.Uri> {
  const extension = extname(fileName)
  const baseName = basename(fileName, extension)
  let index = 0

  while (true) {
    const candidate = vscode.Uri.joinPath(
      directory,
      `${baseName}${index === 0 ? '' : `-${index}`}${extension}`
    )

    try {
      await vscode.workspace.fs.stat(candidate)
      index += 1
    } catch {
      return candidate
    }
  }
}

function readDefaultExportUri(document: vscode.TextDocument, fileName: string): vscode.Uri | undefined {
  if (document.uri.scheme === 'file') {
    return vscode.Uri.file(join(dirname(document.uri.fsPath), fileName))
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]

  if (workspaceFolder) {
    return vscode.Uri.joinPath(workspaceFolder.uri, fileName)
  }

  return undefined
}

function readImageExportFilters(mimeType: 'image/jpeg' | 'image/png'): Record<string, string[]> {
  if (mimeType === 'image/jpeg') {
    return {
      JPEG: ['jpg', 'jpeg']
    }
  }

  return {
    PNG: ['png']
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
