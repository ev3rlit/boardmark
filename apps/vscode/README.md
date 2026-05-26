# @boardmark/vscode

VS Code extension package for opening Boardmark markdown documents in the shared canvas editor.

> **Status:** The package still contains the older scaffold. The current target architecture is tracked in [`docs/architecture/vscode-extension-host-integration/README.md`](../../docs/architecture/vscode-extension-host-integration/README.md).
>
> The extension should no longer be designed as a `.canvas.md`-only viewer MVP. It should integrate VS Code `TextDocument` sessions with the existing `CanvasApp` editor shell.

## Layout

```
src/
  extension/   # Node — VS Code extension host
    index.ts                    # activate() / deactivate()
    canvas-editor-provider.ts   # CustomTextEditorProvider
    text-document-bridge.ts     # revision tracking (edit-loop guard)
    webview-html.ts             # CSP + bundle loader
  webview/     # Browser — canvas-app shell host
    index.html
    main.tsx                    # placeholder mount (Phase 1)
    host-bridge.ts              # postMessage proxy
    vscode-api.ts               # acquireVsCodeApi() wrapper
  shared/      # Shared by both — message protocol only
    protocol.ts                 # discriminated unions + type guards
```

**Boundary rule (CLAUDE §3, §4):** `extension/` and `webview/` MUST NOT import each other. They communicate only through `shared/protocol.ts`.

## Build

```bash
pnpm --filter @boardmark/vscode build
# → dist/extension/index.cjs   (CJS, externals: vscode)
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
  /tmp/boardmark-vscode-smoke/smoke.md
```

After each source edit, wait for the watcher to rebuild, then run `Developer: Reload Window` in the Extension Development Host. The custom editor loads from `dist/`, so this is faster than manually running a full build every time, but it is not browser-style HMR.

## Known Gaps

The current scaffold does not yet match the current product architecture:

1. **Document targeting** — `package.json` still describes and activates only `*.canvas.md`.
2. **Canvas mount** — `webview/main.tsx` still renders a raw markdown placeholder instead of `<CanvasApp />`.
3. **Bridge wiring** — `host-bridge.ts` only handles `document/sync`; it does not implement the bridge contracts consumed by `createCanvasStore`.
4. **Asset filename hashing** — `webview-html.ts` still assumes fixed `assets/index.js` and `assets/index.css` names.
5. **VS Code lifecycle integration** — canvas edits are not yet routed through `WorkspaceEdit` and VS Code save/dirty handling.

## Local Install For Manual Testing

```bash
pnpm --filter @boardmark/vscode build
pnpm --filter @boardmark/vscode package        # produces boardmark-0.0.1.vsix
code --install-extension apps/vscode/boardmark-0.0.1.vsix
```
