import type * as vscode from 'vscode'
import {
  WEBVIEW_RUNTIME_CAPABILITIES,
  WEBVIEW_RUNTIME_POLICY_NONE,
  hasWebviewRuntimeCapability,
  type WebviewRuntimePolicy
} from './webview-runtime-policy'

type WebviewCspInput = {
  readonly webview: Pick<vscode.Webview, 'cspSource'>
  readonly nonce: string
  readonly runtimePolicy: WebviewRuntimePolicy
}

type CspDirectives = {
  readonly [directive: string]: readonly string[]
}

const SANDBOXED_REMOTE_PREVIEW_SOURCES = [
  // @codesandbox/sandpack-client@2.19.8 builds this host from its package version.
  'https://2-19-8-sandpack.codesandbox.io',
  'https://preview.sandpack-static-server.codesandbox.io',
  // Sandpack has used generated *.sandpack.codesandbox.io runtime hosts.
  // Keep this scoped to the remote preview capability rather than global CSP.
  'https://*.sandpack.codesandbox.io'
] as const

export function compileWebviewCsp({
  webview,
  nonce,
  runtimePolicy
}: WebviewCspInput): string {
  const directives: CspDirectives = {
    'default-src': ["'none'"],
    'img-src': [webview.cspSource, 'https:', 'data:'],
    'font-src': [webview.cspSource],
    'style-src': [webview.cspSource, "'unsafe-inline'"],
    'script-src': [webview.cspSource, `'nonce-${nonce}'`],
    'child-src': readFrameSources(runtimePolicy),
    'frame-src': readFrameSources(runtimePolicy),
    'connect-src': readConnectSources(runtimePolicy)
  }

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

export function compileDefaultWebviewCsp(input: {
  readonly webview: Pick<vscode.Webview, 'cspSource'>
  readonly nonce: string
}): string {
  return compileWebviewCsp({
    webview: input.webview,
    nonce: input.nonce,
    runtimePolicy: WEBVIEW_RUNTIME_POLICY_NONE
  })
}

function readFrameSources(policy: WebviewRuntimePolicy): readonly string[] {
  if (!hasWebviewRuntimeCapability(policy, WEBVIEW_RUNTIME_CAPABILITIES.sandboxedRemotePreview)) {
    return ["'none'"]
  }

  return SANDBOXED_REMOTE_PREVIEW_SOURCES
}

function readConnectSources(policy: WebviewRuntimePolicy): readonly string[] {
  if (!hasWebviewRuntimeCapability(policy, WEBVIEW_RUNTIME_CAPABILITIES.sandboxedRemotePreview)) {
    return ["'none'"]
  }

  return SANDBOXED_REMOTE_PREVIEW_SOURCES
}
