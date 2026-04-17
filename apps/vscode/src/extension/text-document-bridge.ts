import type * as vscode from 'vscode'

/**
 * Per-document state held by the extension host.
 *
 * Edit-loop strategy (see docs/architecture/vscode-extension/README.md §5):
 *  - `currentRevision` increments on every TextDocument change we observe.
 *  - When a webview edit arrives, we compare its `revision` to ours.
 *  - If the webview is at the latest revision, we apply the edit and bump.
 *  - If it is behind, we drop the edit; the next sync will re-hydrate it.
 *
 * This keeps the TextDocument as the single source of truth and prevents
 * the round-trip oscillation that happens when both sides re-emit on every
 * change they see.
 */
export class TextDocumentBridge {
  private revision = 0

  constructor(public readonly document: vscode.TextDocument) {}

  public get currentRevision(): number {
    return this.revision
  }

  public bumpRevision(): number {
    this.revision += 1
    return this.revision
  }

  /**
   * Returns true if the webview's reported revision matches ours, meaning the
   * edit is based on the latest source we sent. Bumps and returns true so the
   * caller can apply the edit. Returns false otherwise (edit is stale).
   */
  public acceptWebviewEdit(webviewRevision: number): boolean {
    if (webviewRevision !== this.revision) {
      return false
    }
    this.bumpRevision()
    return true
  }
}
