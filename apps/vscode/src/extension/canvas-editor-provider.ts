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
 *  - Wire VS Code's TextDocument lifecycle to URI-scoped webview sessions.
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

  private readonly sessions = new Map<string, DocumentSession>()

  private constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const session = this.acquireSession(document)

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

    const sessionConnection = session.attach(post)

    const messageSubscription = panel.webview.onDidReceiveMessage(async (raw: unknown) => {
      if (!isWebviewToHostMessage(raw)) {
        return
      }
      await this.handleWebviewMessage(raw, session, panel.webview, sessionConnection, respond)
    })

    panel.onDidDispose(() => {
      messageSubscription.dispose()
      session.detach(sessionConnection)
    })
  }

  private acquireSession(document: vscode.TextDocument): DocumentSession {
    const key = document.uri.toString()
    const existing = this.sessions.get(key)

    if (existing) {
      existing.updateDocument(document)
      return existing
    }

    const session = new DocumentSession(document, () => {
      this.sessions.delete(key)
    })
    this.sessions.set(key, session)

    return session
  }

  private async handleWebviewMessage(
    message: WebviewToHostMessage,
    session: DocumentSession,
    webview: vscode.Webview,
    connection: DocumentSessionConnection,
    respond: (id: string, result: { ok: true; value?: unknown } | { ok: false; error: string }) => void
  ): Promise<void> {
    switch (message.type) {
      case 'document/ready': {
        session.sendSync(connection)
        return
      }
      case 'document/edit': {
        if (!session.canAcceptWebviewEdit(message.revision)) {
          // Stale revision: the webview is behind. Push the latest source back.
          respond(message.id, {
            ok: false,
            error: 'The canvas edit was based on a stale TextDocument revision.'
          })
          session.sendSync(connection)
          return
        }

        const document = session.document
        const validation = validateBoardmarkDocument(message.nextSource, document.uri.toString())

        if (validation.status === 'invalid') {
          respond(message.id, {
            ok: false,
            error: validation.message
          })
          session.sendSync(connection)
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
          session.sendSync(connection)
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
        const saved = await session.document.save()
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
          document: session.document,
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

type DocumentSessionConnection = {
  readonly post: (message: HostToWebviewMessage) => void
}

class DocumentSession {
  private readonly bridge: TextDocumentBridge
  private readonly connections = new Set<DocumentSessionConnection>()
  private readonly changeSubscription: vscode.Disposable
  private readonly saveSubscription: vscode.Disposable
  private currentDocument: vscode.TextDocument

  public constructor(
    document: vscode.TextDocument,
    private readonly onEmpty: () => void
  ) {
    this.currentDocument = document
    this.bridge = new TextDocumentBridge(document)
    this.changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== this.currentDocument.uri.toString()) {
        return
      }

      this.currentDocument = event.document
      this.bridge.bumpRevision()
      this.sendSync()
    })
    this.saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== this.currentDocument.uri.toString()) {
        return
      }

      this.post({
        type: 'document/saved',
        revision: this.bridge.currentRevision
      })
    })
  }

  public get document(): vscode.TextDocument {
    return this.currentDocument
  }

  public updateDocument(document: vscode.TextDocument): void {
    this.currentDocument = document
  }

  public attach(post: (message: HostToWebviewMessage) => void): DocumentSessionConnection {
    const connection = { post }
    this.connections.add(connection)
    return connection
  }

  public detach(connection: DocumentSessionConnection): void {
    this.connections.delete(connection)

    if (this.connections.size > 0) {
      return
    }

    this.changeSubscription.dispose()
    this.saveSubscription.dispose()
    this.onEmpty()
  }

  public canAcceptWebviewEdit(revision: number): boolean {
    return this.bridge.canAcceptWebviewEdit(revision)
  }

  public sendSync(connection?: DocumentSessionConnection): void {
    const source = this.currentDocument.getText()
    const validation = validateBoardmarkDocument(source, this.currentDocument.uri.toString())

    if (validation.status === 'invalid') {
      this.post({
        type: 'document/error',
        message: validation.message,
        uri: this.currentDocument.uri.toString()
      }, connection)
      return
    }

    this.post({
      type: 'document/sync',
      revision: this.bridge.currentRevision,
      source,
      uri: this.currentDocument.uri.toString()
    }, connection)
  }

  private post(message: HostToWebviewMessage, connection?: DocumentSessionConnection): void {
    if (connection) {
      connection.post(message)
      return
    }

    for (const target of this.connections) {
      target.post(message)
    }
  }
}
