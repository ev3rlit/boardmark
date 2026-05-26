import * as vscode from 'vscode'
import {
  isWebviewToHostMessage,
  type HostToWebviewMessage,
  type WebviewToHostMessage
} from '../shared/protocol'
import { validateBoardmarkDocument } from './boardmark-document-validation'
import { renderWebviewHtml } from './webview-html'
import { TextDocumentBridge } from './text-document-bridge'
import { handleImageHostRequest, readLocalResourceRoots } from './vscode-image-requests'

/**
 * CustomTextEditorProvider for Boardmark markdown documents.
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
      localResourceRoots: readLocalResourceRoots(document, this.context.extensionUri)
    }
    panel.webview.html = renderWebviewHtml({
      webview: panel.webview,
      extensionUri: this.context.extensionUri
    })

    const post = (message: HostToWebviewMessage) => {
      void panel.webview.postMessage(message)
    }

    const respond = (id: string, result: { ok: true; value?: unknown } | { ok: false; error: string }) => {
      post(
        result.ok
          ? { type: 'response', id, ok: true, value: result.value }
          : { type: 'response', id, ok: false, error: result.error }
      )
    }

    const sendSync = () => {
      const source = document.getText()
      const validation = validateBoardmarkDocument(source, document.uri.toString())

      if (validation.status === 'invalid') {
        post({
          type: 'document/error',
          message: validation.message,
          uri: document.uri.toString()
        })
        return
      }

      post({
        type: 'document/sync',
        revision: bridge.currentRevision,
        source,
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
      await this.handleWebviewMessage(raw, document, bridge, panel.webview, sendSync, respond)
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
    webview: vscode.Webview,
    sendSync: () => void,
    respond: (id: string, result: { ok: true; value?: unknown } | { ok: false; error: string }) => void
  ): Promise<void> {
    switch (message.type) {
      case 'document/ready': {
        sendSync()
        return
      }
      case 'document/edit': {
        if (!bridge.canAcceptWebviewEdit(message.revision)) {
          // Stale revision: the webview is behind. Push the latest source back.
          respond(message.id, {
            ok: false,
            error: 'The canvas edit was based on a stale TextDocument revision.'
          })
          sendSync()
          return
        }

        const validation = validateBoardmarkDocument(message.nextSource, document.uri.toString())

        if (validation.status === 'invalid') {
          respond(message.id, {
            ok: false,
            error: validation.message
          })
          sendSync()
          return
        }

        if (message.nextSource === document.getText()) {
          respond(message.id, {
            ok: true,
            value: {
              source: message.nextSource
            }
          })
          return
        }

        const edit = new vscode.WorkspaceEdit()
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        )
        edit.replace(document.uri, fullRange, message.nextSource)
        const applied = await vscode.workspace.applyEdit(edit)

        if (!applied) {
          respond(message.id, {
            ok: false,
            error: 'VS Code rejected the WorkspaceEdit for the current Boardmark document.'
          })
          sendSync()
          return
        }

        respond(message.id, {
          ok: true,
          value: {
            source: message.nextSource
          }
        })
        return
      }
      case 'document/save': {
        const saved = await document.save()
        respond(
          message.id,
          saved
            ? { ok: true }
            : { ok: false, error: 'VS Code did not save the current Boardmark document.' }
        )
        return
      }
      case 'request': {
        const imageResult = await handleImageHostRequest({
          document,
          method: message.method,
          payload: message.payload,
          webview
        })

        if (imageResult) {
          respond(message.id, imageResult)
          return
        }

        respond(message.id, {
          ok: false,
          error: `VS Code bridge method "${message.method}" is not implemented yet.`
        })
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
