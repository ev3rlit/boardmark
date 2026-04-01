---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note { id: welcome, at: { x: 80, y: 72, w: 340, h: 220 }, style: { themeRef: boardmark.editorial.soft } }

# Boardmark Viewer

Open a `.canvas.md` file or start from this bundled example board.

- `New File` saves a fresh board to disk
- `Open File` lives in the file menu
- `Save` keeps your current document on disk

:::

::: note { id: overview, at: { x: 468, y: 52, w: 320, h: 220 } }

## What This Shows

- sticky notes with markdown
- labeled edges with context
- mixed content blocks and checklists
- a viewport that feels like a real board

:::

::: note { id: workflow, at: { x: 910, y: 96, w: 320, h: 220 } }

## Reading Flow

1. start with the big idea
2. scan supporting notes
3. follow the edge labels for narrative

> Viewer MVP stays read-only.

:::

::: note { id: structure, at: { x: 380, y: 360, w: 360, h: 220 } }

## MVP Scope

Viewer-only foundation with markdown notes and standalone edges.

```ts
const viewer = {
  parse: true,
  render: true,
  edit: false,
};
```

:::

::: note { id: details, at: { x: 824, y: 362, w: 360, h: 220 } }

## Detail Cluster

### Markdown inside notes

- headings
- lists
- inline `code`
- fenced blocks

```md
## Example note

- summarize the goal
- add related context
- connect to the next note
```

:::

::: note { id: prompting, at: { x: 1228, y: 318, w: 320, h: 220 } }

## Prompting Angle

Use the board to sketch:

- requirements
- tradeoffs
- implementation slices

Then turn each note into a task.

:::

::: edge { id: welcome-overview, from: welcome, to: overview }
main thread
:::

::: edge { id: overview-workflow, from: overview, to: workflow }
reading path
:::

::: edge { id: welcome-structure, from: welcome, to: structure }
:::

::: edge { id: structure-details, from: structure, to: details }
:::

::: edge { id: details-prompting, from: details, to: prompting }
:::
