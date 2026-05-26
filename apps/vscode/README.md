# @boardmark/vscode

VS Code extension package for opening Boardmark markdown documents in the shared canvas editor.

> **Status:** The package now mounts the shared `CanvasApp` in a `CustomTextEditorProvider`. VS Code `TextDocument` remains the source of truth; canvas edits go through `WorkspaceEdit`, save goes through `TextDocument.save()`, and host-only image/session wiring lives under `src/extension` and `src/webview`.

## Layout

```
src/
  extension/   # Node — VS Code extension host
    index.ts                    # activate() / deactivate()
    canvas-editor-provider.ts   # CustomTextEditorProvider
    text-document-bridge.ts     # per-session revision tracking
    markdown-image-source.ts    # markdown image path policy
    vscode-image-requests.ts    # VS Code fs/dialog/image host requests
    webview-html.ts             # CSP + bundle loader
  webview/     # Browser — canvas-app shell host
    index.html
    main.tsx                    # CanvasApp mount
    host-bridge.ts              # postMessage proxy + CanvasApp bridge adapters
    vscode-api.ts               # acquireVsCodeApi() wrapper
  shared/      # Shared by both — message protocol only
    protocol.ts                 # discriminated unions + type guards
```

**Boundary rule (CLAUDE §3, §4):** `extension/` and `webview/` MUST NOT import each other. They communicate only through `shared/protocol.ts`.

## Build

```bash
pnpm --filter @boardmark/vscode build
# → dist/extension/index.js    (CJS, externals: vscode)
# → dist/webview/               (browser bundle for the webview)
```

Both bundles use Vite. The extension bundle is built in SSR mode with `vscode` marked external; the webview bundle is built as a regular browser bundle and loaded by `webview-html.ts` via `webview.asWebviewUri`.

## Development Loop

For repeated Extension Development Host testing, keep the Vite build watchers running:

```bash
pnpm --filter @boardmark/vscode watch
```

Then open or reload the Extension Development Host:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --extensionDevelopmentPath="$(pwd)/apps/vscode" \
  "$(pwd)/apps/vscode/fixtures/smoke.md"
```

After each source edit, wait for the watcher to rebuild, then run `Developer: Reload Window` in the Extension Development Host. The custom editor loads from `dist/`, so this is faster than manually running a full build every time, but it is not browser-style HMR.

You can also use the checked-in launch config:

1. Open this repo in VS Code.
2. Run `pnpm --filter @boardmark/vscode watch` or use the `pnpm: watch - apps/vscode` task.
3. Start `Boardmark VS Code Extension` from Run and Debug.

## Manual Smoke Checklist

- Run `Boardmark: Open as Canvas` on `apps/vscode/fixtures/smoke.md`.
- Edit a note in the canvas and confirm the text editor becomes dirty.
- Save from VS Code or the canvas shortcut and confirm the file writes through `TextDocument.save()`.
- Open the same markdown file in text and canvas editors, edit raw markdown, and confirm all canvas panels re-sync.
- Paste or drop an image and confirm it is written to `<document-name>.assets/` with a document-relative markdown `src`.
- Export a canvas image or fenced block image and confirm the VS Code save dialog writes the selected PNG/JPEG target.

## Known Gaps

The current host integration intentionally leaves these outside the extension adapter:

1. **Marketplace polish** — icon, gallery metadata, and publish workflow are not final.
2. **Remote/non-file documents** — image import currently requires a file-backed `TextDocument`.
3. **Automated extension-host E2E** — manual Extension Development Host smoke remains the verification path for VS Code UI behavior.
4. **Bundle size tuning** — webview code splitting is still future work; current build emits large chunks from renderer dependencies.

## Local Install For Manual Testing

```bash
pnpm --filter @boardmark/vscode build
pnpm --filter @boardmark/vscode package        # produces boardmark-0.0.1.vsix
code --install-extension apps/vscode/boardmark-0.0.1.vsix
```
