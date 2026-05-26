export const WEBVIEW_RUNTIME_CAPABILITIES = {
  sandboxedRemotePreview: 'sandboxed-remote-preview'
} as const

export type WebviewRuntimeCapability =
  (typeof WEBVIEW_RUNTIME_CAPABILITIES)[keyof typeof WEBVIEW_RUNTIME_CAPABILITIES]

export type WebviewRuntimePolicy = {
  readonly capabilities: readonly WebviewRuntimeCapability[]
}

export const WEBVIEW_RUNTIME_POLICY_NONE: WebviewRuntimePolicy = {
  capabilities: []
}

export const BOARDMARK_CANVAS_WEBVIEW_RUNTIME_POLICY: WebviewRuntimePolicy = {
  capabilities: [
    WEBVIEW_RUNTIME_CAPABILITIES.sandboxedRemotePreview
  ]
}

export function hasWebviewRuntimeCapability(
  policy: WebviewRuntimePolicy,
  capability: WebviewRuntimeCapability
): boolean {
  return policy.capabilities.includes(capability)
}
