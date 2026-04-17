import * as vscode from 'vscode'
import { CanvasEditorProvider } from './canvas-editor-provider'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(CanvasEditorProvider.register(context))

  context.subscriptions.push(
    vscode.commands.registerCommand('boardmark.openAsCanvas', async () => {
      const active = vscode.window.activeTextEditor
      if (!active) {
        return
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        active.document.uri,
        CanvasEditorProvider.viewType
      )
    }),
    vscode.commands.registerCommand('boardmark.openAsText', async () => {
      const active = vscode.window.activeTextEditor
      if (!active) {
        return
      }
      await vscode.commands.executeCommand('vscode.openWith', active.document.uri, 'default')
    })
  )
}

export function deactivate(): void {
  // No-op. CustomTextEditorProvider disposables are tied to context.subscriptions.
}
