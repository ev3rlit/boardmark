import { describe, expect, it } from 'vitest'
import { compileDefaultWebviewCsp, compileWebviewCsp } from './webview-csp'
import {
  BOARDMARK_CANVAS_WEBVIEW_RUNTIME_POLICY,
  WEBVIEW_RUNTIME_POLICY_NONE
} from './webview-runtime-policy'

const webview = {
  cspSource: 'vscode-resource://boardmark'
} as const

describe('compileWebviewCsp', () => {
  it('keeps the default policy narrow without remote runtime capability', () => {
    const csp = compileDefaultWebviewCsp({
      webview,
      nonce: 'test-nonce'
    })

    expect(readDirective(csp, 'default-src')).toEqual(["'none'"])
    expect(readDirective(csp, 'child-src')).toEqual(["'none'"])
    expect(readDirective(csp, 'frame-src')).toEqual(["'none'"])
    expect(readDirective(csp, 'connect-src')).toEqual(["'none'"])
    expect(csp).not.toContain('sandpack')
    expect(csp).not.toContain('codesandbox.io')
  })

  it('adds Sandpack remote preview origins only when the runtime policy enables them', () => {
    const csp = compileWebviewCsp({
      webview,
      nonce: 'test-nonce',
      runtimePolicy: BOARDMARK_CANVAS_WEBVIEW_RUNTIME_POLICY
    })

    expect(readDirective(csp, 'child-src')).toEqual([
      'https://2-19-8-sandpack.codesandbox.io',
      'https://preview.sandpack-static-server.codesandbox.io',
      'https://*.sandpack.codesandbox.io'
    ])
    expect(readDirective(csp, 'frame-src')).toEqual([
      'https://2-19-8-sandpack.codesandbox.io',
      'https://preview.sandpack-static-server.codesandbox.io',
      'https://*.sandpack.codesandbox.io'
    ])
    expect(readDirective(csp, 'connect-src')).toEqual([
      'https://2-19-8-sandpack.codesandbox.io',
      'https://preview.sandpack-static-server.codesandbox.io',
      'https://*.sandpack.codesandbox.io'
    ])
  })

  it('does not widen script sources when remote runtime capability is enabled', () => {
    const csp = compileWebviewCsp({
      webview,
      nonce: 'test-nonce',
      runtimePolicy: BOARDMARK_CANVAS_WEBVIEW_RUNTIME_POLICY
    })

    expect(readDirective(csp, 'script-src')).toEqual([
      'vscode-resource://boardmark',
      "'nonce-test-nonce'"
    ])
    expect(readDirective(csp, 'script-src')).not.toContain('https:')
  })

  it('keeps CodeSandbox creation APIs out of runtime connect-src', () => {
    const csp = compileWebviewCsp({
      webview,
      nonce: 'test-nonce',
      runtimePolicy: BOARDMARK_CANVAS_WEBVIEW_RUNTIME_POLICY
    })

    expect(readDirective(csp, 'connect-src')).not.toContain('https://codesandbox.io')
    expect(readDirective(csp, 'connect-src')).not.toContain('https://api.codesandbox.io')
  })

  it('keeps remote preview blocked for an explicit empty runtime policy', () => {
    const csp = compileWebviewCsp({
      webview,
      nonce: 'test-nonce',
      runtimePolicy: WEBVIEW_RUNTIME_POLICY_NONE
    })

    expect(readDirective(csp, 'frame-src')).toEqual(["'none'"])
    expect(readDirective(csp, 'child-src')).toEqual(["'none'"])
    expect(readDirective(csp, 'connect-src')).toEqual(["'none'"])
  })
})

function readDirective(csp: string, directiveName: string): string[] {
  const directive = csp
    .split('; ')
    .find((entry) => entry.startsWith(`${directiveName} `))

  if (!directive) {
    throw new Error(`CSP directive "${directiveName}" was not compiled.`)
  }

  return directive.slice(directiveName.length + 1).split(' ')
}
