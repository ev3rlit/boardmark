# Caret Navigation Capability Contract Refactor

## Context

The WYSIWYG body editor's caret navigation works but has a structural problem: the global navigation plugin (`editor-navigation-plugin.ts`) branches directly on node type names (`isNavigableBlockNodeName`) to decide which nodes are "raw block" vs "text flow" targets. As the document grows (tables, nested lists, blockquotes), this pattern forces the plugin to accumulate more syntax-specific conditions.

The fix is ADR-003 Option C: replace the node-name branching with a `CaretCapabilityProvider` interface the plugin can query, and extract the editable target resolver into its own module. Three node types (wysiwygCodeBlock, wysiwygSpecialFencedBlock, wysiwygHtmlFallbackBlock) share the same raw-block capability — the refactor makes this structural rather than implied.

---

## Current file map

```

caret-navigation/

  editor-navigation-plugin.ts   ← global coordinator + inline resolver (readEditableTargets, findAdjacentEditableTarget)

  selection-state.ts            ← isNavigableBlockNodeName, isNavigableBlockSelection, readEditorDerivedBlockMode

views/

  raw-block-editor.tsx          ← shared raw block shell (useRawBlockEditingState, handleRawBlockKeyDown, ...)

  code-block-node-view.tsx      ← uses raw-block-editor

  special-fenced-block-view.tsx ← uses raw-block-editor

  html-fallback-block-view.tsx  ← uses raw-block-editor

wysiwyg-markdown-bridge.tsx     ← wires extensions, passes callbacks

```

---

## Target file map (after)

```

caret-navigation/

  caret-capabilities.ts          ← NEW: CaretCapability union + CaretCapabilityProvider interface

  block-caret-capabilities.ts    ← NEW: concrete rawBlockCapability, createDefaultCapabilityProvider()

  editable-target-resolver.ts    ← NEW: readEditableTargets, findAdjacentEditableTarget (extracted from plugin)

  editor-navigation-plugin.ts    ← MODIFIED: uses capability provider + resolver; no more isNavigableBlockNodeName

  selection-state.ts             ← MODIFIED: remove isNavigableBlockNodeName export; keep isNavigableBlockSelection (via provider), readEditorDerivedBlockMode

```

---

## Changes

### 1. Create `caret-capabilities.ts`

```ts
export type CaretDirection = "up" | "down";

export type EntryPlacement = "leading" | "trailing";

export type CaretCapability =
  | { kind: "text-flow" }
  | {
      kind: "raw-block";

      entryPlacement: (direction: CaretDirection) => EntryPlacement;

      exitsAtBoundary: (input: {
        direction: CaretDirection;

        selectionStart: number;

        selectionEnd: number;

        valueLength: number;
      }) => boolean;
    }
  | { kind: "grid" };

export interface CaretCapabilityProvider {
  getForNodeName(nodeName: string): CaretCapability | null;
}
```

**RULE.md note**: `CaretCapabilityProvider` is valid here because the plugin (consumer) depends on it and there are multiple implementations possible (concrete default + test mocks). One method, returns concrete union. Interface lives near the consumer.

---

### 2. Create `block-caret-capabilities.ts`

```ts
import type {
  CaretCapability,
  CaretCapabilityProvider,
} from "./caret-capabilities";

export const rawBlockCapability: CaretCapability = {
  kind: "raw-block",

  entryPlacement: (direction) =>
    direction === "down" ? "leading" : "trailing",

  exitsAtBoundary: ({
    direction,
    selectionStart,
    selectionEnd,
    valueLength,
  }) => {
    if (selectionStart !== selectionEnd) return false;

    return direction === "up"
      ? selectionStart === 0
      : selectionStart === valueLength;
  },
};

const RAW_BLOCK_NODE_NAMES = new Set([
  "wysiwygCodeBlock",

  "wysiwygSpecialFencedBlock",

  "wysiwygHtmlFallbackBlock",
]);

export function createDefaultCapabilityProvider(): CaretCapabilityProvider {
  return {
    getForNodeName(nodeName) {
      return RAW_BLOCK_NODE_NAMES.has(nodeName) ? rawBlockCapability : null;
    },
  };
}
```

`entryPlacement` formalizes what the plugin already does implicitly: `direction === 'up'` → `caretPlacement: 'end'` (trailing), `direction === 'down'` → `caretPlacement: 'start'` (leading). This is now the single source of that rule.

---

### 3. Create `editable-target-resolver.ts`

Extract `readEditableTargets` and `findAdjacentEditableTarget` from `editor-navigation-plugin.ts` verbatim, but replace the `isNavigableBlockNodeName(node.type.name)` check with `provider.getForNodeName(node.type.name)?.kind === 'raw-block'`.

```ts
import type { EditorState } from "@tiptap/pm/state";

import { TextSelection } from "@tiptap/pm/state";

import type { CaretCapabilityProvider } from "./caret-capabilities";

type BlockTarget = { kind: "block"; nodeSize: number; position: number };

type TextTarget = {
  kind: "text";
  position: number;
  textEnd: number;
  textStart: number;
};

type EditableTarget = BlockTarget | TextTarget;

export function readEditableTargets(
  state: EditorState,

  provider: CaretCapabilityProvider,
): EditableTarget[] {
  const targets: EditableTarget[] = [];

  state.doc.descendants((node, position) => {
    if (provider.getForNodeName(node.type.name)?.kind === "raw-block") {
      targets.push({ kind: "block", nodeSize: node.nodeSize, position });

      return false;
    }

    if (!node.isTextblock) return true;

    targets.push({
      kind: "text",

      position,

      textEnd: position + node.nodeSize - 1,

      textStart: position + 1,
    });

    return false;
  });

  return targets;
}

export function findAdjacentEditableTarget(
  state: EditorState,

  input:
    | { direction: "down" | "up"; position: number }
    | { direction: "down" | "up"; selection: TextSelection },

  provider: CaretCapabilityProvider,
): EditableTarget | null {
  const targets = readEditableTargets(state, provider);

  const currentIndex =
    "position" in input
      ? targets.findIndex(
          (t) => t.kind === "block" && t.position === input.position,
        )
      : targets.findIndex(
          (t) =>
            t.kind === "text" &&
            input.selection.from >= t.textStart &&
            input.selection.from <= t.textEnd,
        );

  if (currentIndex === -1) return null;

  const offset = input.direction === "down" ? 1 : -1;

  return targets[currentIndex + offset] ?? null;
}
```

---

### 4. Modify `editor-navigation-plugin.ts`

**Add `capabilityProvider` to options:**

```ts
import { createDefaultCapabilityProvider } from "./block-caret-capabilities";

import { findAdjacentEditableTarget } from "./editable-target-resolver";

import type { CaretCapabilityProvider } from "./caret-capabilities";

type WysiwygEditorNavigationOptions = {
  callbacks: WysiwygEditorNavigationCallbacks;

  capabilityProvider?: CaretCapabilityProvider;
};
```

**In `addOptions()`:**

```ts

addOptions() {

  return {

    callbacks: {},

    capabilityProvider: createDefaultCapabilityProvider()

  }

}

```

**Pass provider through to all helpers** — `createWysiwygEditorNavigationPlugin` takes the provider as a second argument, passes it to `handleVerticalNavigation`, which passes it to `findAdjacentEditableTarget` and `moveFromSelectedBlock`.

**Replace `isNavigableBlockNodeName` uses inside plugin:**

- `selection instanceof NodeSelection && isNavigableBlockNodeName(selection.node.type.name)` → `selection instanceof NodeSelection && provider.getForNodeName(selection.node.type.name)?.kind === 'raw-block'`

**Remove** the now-inlined `readEditableTargets` and `findAdjacentEditableTarget` functions from the plugin (they live in `editable-target-resolver.ts` now).

**Keep** `isNavigableBlockSelection` usage — but it needs to be updated or re-derived. The simplest: keep `isNavigableBlockSelection` in `selection-state.ts` but make it accept a provider, or inline the check in the plugin directly.

---

### 5. Modify `selection-state.ts`

- **Remove** `isNavigableBlockNodeName` export (moved to `block-caret-capabilities.ts` as a private set)

- **Update** `isNavigableBlockSelection` to use `CaretCapabilityProvider`:

```ts
export function isNavigableBlockSelection(
  selection: Selection,

  provider: CaretCapabilityProvider,
) {
  return (
    selection instanceof NodeSelection &&
    provider.getForNodeName(selection.node.type.name)?.kind === "raw-block"
  );
}
```

This function is called only in the plugin's `handleKeyDown`, so the provider is already available there.

- **Keep** `readEditorDerivedBlockMode` unchanged — it reads from DOM attributes, not node type names.

- **Keep** `isSelectionInsideTable` unchanged — table is not yet given a capability kind; `grid` is reserved for the next phase.

---

## Call-site ripple

`isNavigableBlockNodeName` is currently imported in:

- `editor-navigation-plugin.ts` — removed, replaced by capability check

- `selection-state.ts` — internal use only once removed

After this refactor, no file imports `isNavigableBlockNodeName` from `selection-state.ts`.

`wysiwyg-markdown-bridge.tsx` — no change needed; `WysiwygEditorNavigation.configure({ callbacks })` still works. The default capability provider is constructed inside `addOptions()`, so callers don't need to change unless they want to inject a custom provider (tests can do this).

---

## Data flow diagram

```

ArrowUp/Down key

      │

      ▼

editor-navigation-plugin.ts

  handleVerticalNavigation(view, direction)

      │

      ├─ isSelectionInsideTable? → return false (grid placeholder)

      │

      ├─ NodeSelection + provider.getForNodeName()?.kind === 'raw-block'

      │     └─ moveFromSelectedBlock(view, { direction, position }, provider)

      │           └─ findAdjacentEditableTarget(state, { direction, position }, provider)

      │

      └─ TextSelection at boundary

            └─ findAdjacentEditableTarget(state, { direction, selection }, provider)

                  └─ readEditableTargets(state, provider)

                        └─ provider.getForNodeName(node.type.name)?.kind === 'raw-block'

                              ↙                              ↘

                    push block target              push text target (isTextblock)



      ▼ (result)

  dispatch transaction (NodeSelection or TextSelection)

  + requestPendingSourceEntry if block target

        │

        ▼

  raw-block view (useRawBlockEditingState)

  reads pendingSourceEntry, focuses textarea, places caret

```

---

## Verification

**Existing tests to run (should all pass without change):**

- `body-editor-host.test.tsx` — integration tests for Escape routing, toolbar, blur/commit behavior

- `wysiwyg-markdown-bridge.test.tsx` — markdown round-trip tests

**New unit tests to add in `editable-target-resolver.test.ts`:**

- `readEditableTargets` returns block targets for all three raw-block node names

- `readEditableTargets` returns text targets for paragraph nodes

- `findAdjacentEditableTarget` correctly finds next/prev from a text selection at boundary

- `findAdjacentEditableTarget` correctly finds next/prev from a block selection

- Custom provider (e.g. no raw blocks) returns only text targets

**Manual verification checklist:**

1. Paragraph → ArrowDown into fenced code block → caret lands after opening fence

2. Fenced code block (at last char) → ArrowDown → caret moves to paragraph below

3. ArrowUp from paragraph into code block → caret lands at end of raw content

4. Escape inside code block → setIsEditing(false) → onExitToHost fires

5. Special fenced block and HTML fallback behave identically to code block in 1–4

6. Table cells: ArrowUp/Down inside table still defers (isSelectionInsideTable returns false for vertical nav)

---

## Order of implementation

1. Create `caret-capabilities.ts` (types only, no dependencies)

2. Create `block-caret-capabilities.ts` (depends on caret-capabilities)

3. Create `editable-target-resolver.ts` (depends on caret-capabilities)

4. Modify `selection-state.ts` — remove `isNavigableBlockNodeName`, update `isNavigableBlockSelection` signature

5. Modify `editor-navigation-plugin.ts` — inject provider, use resolver, remove inline functions

6. Run existing tests; fix any import breakage

7. Add `editable-target-resolver.test.ts`
