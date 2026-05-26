import * as vscode from 'vscode'
import { validateBoardmarkDocument } from './boardmark-document-validation'
import { CanvasEditorProvider } from './canvas-editor-provider'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(CanvasEditorProvider.register(context))

  context.subscriptions.push(
    vscode.commands.registerCommand('boardmark.openAsCanvas', async () => {
      const active = vscode.window.activeTextEditor
      if (!active) {
        return
      }
      const validation = validateBoardmarkDocument(
        active.document.getText(),
        active.document.uri.toString()
      )

      if (validation.status === 'invalid') {
        await vscode.window.showErrorMessage(validation.message)
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
