import * as vscode from 'vscode'
import {
  isWebviewToHostMessage,
  type HostToWebviewMessage,
  type WebviewToHostMessage
} from '../shared/protocol'
import { renderWebviewHtml } from './webview-html'
import { TextDocumentBridge } from './text-document-bridge'

/**
 * CustomTextEditorProvider for `.canvas.md`.
 *
 * Responsibilities held here:
 *  - Wire VS Code's TextDocument lifecycle to a single webview panel.
 *  - Push `document/sync` whenever the underlying TextDocument changes.
 *  - Apply webview `document/edit` messages back as a WorkspaceEdit.
 *
 * Responsibilities explicitly NOT held here:
 *  - Parsing or AST manipulation. The webview owns the canvas-app shell;
 *    this provider stays a thin text bridge.
 *  - File I/O. VS Code owns the TextDocument; we only mutate it through
 *    WorkspaceEdit so undo/redo/dirty stay coherent.
 */
export class CanvasEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'boardmark.canvasEditor'

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new CanvasEditorProvider(context)
    return vscode.window.registerCustomEditorProvider(CanvasEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      },
      supportsMultipleEditorsPerDocument: true
    })
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const bridge = new TextDocumentBridge(document)

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')]
    }
    panel.webview.html = renderWebviewHtml({
      webview: panel.webview,
      extensionUri: this.context.extensionUri
    })

    const post = (message: HostToWebviewMessage) => {
      void panel.webview.postMessage(message)
    }

    const sendSync = () => {
      post({
        type: 'document/sync',
        revision: bridge.currentRevision,
        source: document.getText(),
        uri: document.uri.toString()
      })
    }

    const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return
      }
      // Bump revision unconditionally; webview filters echoes by revision.
      bridge.bumpRevision()
      sendSync()
    })

    const saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString()) {
        return
      }
      post({ type: 'document/saved', revision: bridge.currentRevision })
    })

    const messageSubscription = panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      if (!isWebviewToHostMessage(raw)) {
        return
      }
      await this.handleWebviewMessage(raw, document, bridge, sendSync)
    })

    panel.onDidDispose(() => {
      documentChangeSubscription.dispose()
      saveSubscription.dispose()
      messageSubscription.dispose()
    })
  }

  private async handleWebviewMessage(
    message: WebviewToHostMessage,
    document: vscode.TextDocument,
    bridge: TextDocumentBridge,
    sendSync: () => void
  ): Promise<void> {
    switch (message.type) {
      case 'document/ready': {
        sendSync()
        return
      }
      case 'document/edit': {
        if (!bridge.acceptWebviewEdit(message.revision)) {
          // Stale revision — webview is behind. It will re-hydrate from the next sync.
          return
        }
        const edit = new vscode.WorkspaceEdit()
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        )
        edit.replace(document.uri, fullRange, message.nextSource)
        await vscode.workspace.applyEdit(edit)
        return
      }
      case 'command/run': {
        // Phase 3: route extension-level commands triggered from the canvas.
        return
      }
      case 'log': {
        // Forward to a Boardmark output channel in a later phase.
        return
      }
    }
  }
}
