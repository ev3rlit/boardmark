import * as vscode from 'vscode'
import { compileWebviewCsp } from './webview-csp'
import type { WebviewRuntimePolicy } from './webview-runtime-policy'

type RenderInput = {
  webview: vscode.Webview
  extensionUri: vscode.Uri
  runtimePolicy: WebviewRuntimePolicy
}

/**
 * Builds the HTML shell for the Boardmark webview.
 *
 * Constraints:
 *  - VS Code webviews enforce a strict CSP. Host runtime capabilities are
 *    compiled in `webview-csp.ts` so renderer packages do not own CSP details.
 *  - All asset URIs must be passed through `webview.asWebviewUri` so the
 *    `vscode-resource:` scheme is applied.
 *
 * The bundle path assumes `vite.config.webview.ts` outputs to `dist/webview/`
 * with `assets/index-*.js` and `assets/index-*.css`. The exact filenames
 * include hashes; the webview-html module resolves them via the manifest.
 *
 * The stable file names are emitted by `vite.config.webview.ts`.
 */
export function renderWebviewHtml({ webview, extensionUri, runtimePolicy }: RenderInput): string {
  const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'index.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'index.css'))
  const nonce = createNonce()
  const csp = compileWebviewCsp({ webview, nonce, runtimePolicy })

  return /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Boardmark Canvas</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return nonce
}
