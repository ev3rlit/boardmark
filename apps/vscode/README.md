# @boardmark/vscode

VS Code extension scaffold for Boardmark canvas (`*.canvas.md`).

> **Status:** Phase 1 scaffold only. Wires up the CustomTextEditor lifecycle and the host ↔ webview message channel; renders raw markdown source as a placeholder. The full `<CanvasApp />` mount lands in the next slice.
>
> See [`docs/architecture/vscode-extension/README.md`](../../docs/architecture/vscode-extension/README.md) for the design rationale, phase plan, and open questions.

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

## Pending before this scaffold runs

These were intentionally left out to keep the scaffold surgical:

1. **`pnpm install`** — `@types/vscode`, `@vscode/vsce`, and `vite` aren't pulled until the workspace install runs. The TypeScript "Cannot find module 'vscode'" diagnostics resolve after install.
2. **Asset filename hashing** — `webview-html.ts` currently assumes `assets/index.js` and `assets/index.css`. Vite emits hashed filenames; replace the hardcoded paths with a manifest read-out before the first real run.
3. **Bridge wiring** — `host-bridge.ts` only handles `document/sync`. The four bridges that `createCanvasStore` consumes (`documentPicker`, `documentPersistenceBridge`, `imageAssetBridge`, `documentRepository`) need request/response message round-trips with correlation ids. This is Phase 2.
4. **`canvas-repository`'s `BoardmarkDocumentBridge` interface location** — see open question #5 in the architecture doc. May need to move to a lower layer before three hosts (web/desktop/vscode) all depend on it.

## Local install for manual testing (after Phase 2 lands)

```bash
pnpm --filter @boardmark/vscode build
pnpm --filter @boardmark/vscode package        # produces boardmark-0.0.1.vsix
code --install-extension apps/vscode/boardmark-0.0.1.vsix
```
