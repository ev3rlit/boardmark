import * as vscode from 'vscode'

type RenderInput = {
  webview: vscode.Webview
  extensionUri: vscode.Uri
}

/**
 * Builds the HTML shell for the Boardmark webview.
 *
 * Constraints:
 *  - VS Code webviews enforce a strict CSP. We allow only:
 *      script:  the extension's own bundle
 *      style:   inline styles (Tiptap / xyflow rely on them)
 *  - All asset URIs must be passed through `webview.asWebviewUri` so the
 *    `vscode-resource:` scheme is applied.
 *
 * The bundle path assumes `vite.config.webview.ts` outputs to `dist/webview/`
 * with `assets/index-*.js` and `assets/index-*.css`. The exact filenames
 * include hashes; the webview-html module resolves them via the manifest.
 *
 * For Phase 1 we resolve by convention; the manifest read-out is a follow-up.
 */
export function renderWebviewHtml({ webview, extensionUri }: RenderInput): string {
  const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'index.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'index.css'))
  const nonce = createNonce()

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`
  ].join('; ')

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
