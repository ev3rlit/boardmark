# Boardmark Viewer MVP 다음 세션용 컨텍스트 프롬프트

아래 프롬프트를 다음 세션 시작 시 그대로 사용하면 된다.

```text
You are continuing implementation work for the Boardmark repository.

Read these files first and treat them as the source of truth:
- RULE.md
- DESIGN.md
- docs/canvas-md-prd.md
- docs/features/viewer-mvp-implementation-plan.md

Current objective:
Implement the Viewer MVP, not the editor.

Product scope for this session:
- Parse `.canvas.md` and render it as a canvas viewer
- Support only one node type for MVP: sticky note (`note`)
- Support standalone `edge` directives with markdown labels
- Use a DOM node layer + SVG edge overlay canvas architecture
- Do not implement bidirectional editing
- Do not implement CodeMirror
- Do not implement MagicString
- Do not implement custom style packs
- Do not implement custom component packs
- Do not write E2E tests
- Write only unit tests with Vitest

Important UX requirements:
- When the Electron app launches, show a default template canvas immediately
- Also show entry actions so a new user can try the product right away
- `New File` creates a new `.canvas.md` from a template, saves it to a chosen path, then loads it
- `Open File` opens an existing `.canvas.md`
- `Save` saves the current document; if the current document started from the template and has no path yet, first open a save dialog
- Top-left: file menu with `Open File` and `Save`
- Bottom-center: floating tool menu with only `Select` and `Pan`
- Bottom-right: zoom in / zoom out controls

Important parsing policy:
- The app must keep running even if parsing encounters invalid objects
- Invalid nodes or invalid edges must be ignored individually
- Valid remaining nodes and edges must still render
- Collect parse issues explicitly and keep them in state
- Only treat the whole document as failed when frontmatter or document root parsing is fatally invalid
- Do not silently swallow issues; surface them in state and make UI exposure possible

Technical direction:
- Electron
- React
- Zustand
- neverthrow
- unified + remark-parse + remark-directive
- react-markdown + rehype-highlight
- Tailwind CSS + CSS variables
- pino
- Vitest

Architecture expectations:
- Keep parser and renderer separate
- Parser returns `CanvasAST` plus parse issues
- Use `neverthrow` for explicit boundary error handling
- Prefer `Result` / `ResultAsync` for parser, file IO, and IPC operations
- Renderer consumes validated AST data only
- State should include document, nodes, edges, viewport, selection, tool mode, load state, save state, entry state, parse issues
- Keep modules small and explicit, following RULE.md

Suggested implementation order:
1. Inspect current repo layout and establish app/package structure if missing
2. Define domain types:
   - `CanvasFrontmatter`
   - `CanvasNode`
   - `CanvasEdge`
   - `CanvasAST`
   - `CanvasParseIssue`
3. Implement parser with partial-failure behavior
4. Add template `.canvas.md` fixture for startup and new-file creation
5. Implement Electron document-entry flow:
   - startup template load
   - new file
   - open file
   - save
6. Implement Zustand viewer store
7. Implement canvas renderer:
   - viewport container
   - DOM note layer
   - SVG edge layer
   - markdown node rendering
   - edge label rendering
8. Implement overlay UI controls in the required positions
9. Add Vitest coverage for parser, store, controls, and document-entry behavior

Parsing behavior details to preserve:
- Missing required node fields -> skip that node, emit issue
- Missing required edge fields -> skip that edge, emit issue
- Invalid `from` / `to` references -> skip that edge, emit issue
- Unsupported node type -> skip that object, emit issue
- Valid objects must still render even if invalid ones exist in the same file

Implementation constraints:
- Make surgical changes only
- Reuse existing patterns where present
- Do not add speculative abstractions
- Do not add broad try/catch or silent success-shaped fallbacks
- Keep errors explicit and actionable
- Use apply_patch for code edits

Expected deliverable for this session:
- Working Electron viewer MVP foundation in code
- Startup template flow
- New/Open/Save entry actions
- Sticky-note canvas rendering
- Edge rendering with markdown labels
- Floating controls in the required positions
- Unit tests only

Before coding, scan the codebase and then proceed directly with implementation.
```
