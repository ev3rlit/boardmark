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

::: note { id: note-1, at: { x: -78, y: 177, w: 320, h: 220 } }
New note
:::

::: note { id: note-2, at: { x: 100, y: -100, w: 320, h: 220 } }
New note
:::

::: note { id: note-3, at: { x: 817, y: 201, w: 320, h: 220 } }
New note
:::

::: note { id: note-4, at: { x: -98, y: 748, w: 320, h: 220 } }
New note
:::

::: note { id: note-5, at: { x: -120, y: 293, w: 320, h: 220 } }
New note
:::

::: note { id: note-6, at: { x: 433, y: 439, w: 320, h: 220 } }
New note
:::

::: boardmark.shape.ellipse { id: shape-1, at: { x: -51, y: 1372, w: 200, h: 120 } }
Ellipse

```yaml props
palette: green
tone: soft
```
:::

::: boardmark.shape.rect { id: shape-2, at: { x: 212, y: 1391, w: 180, h: 120 } }
Rectangle

```yaml props
palette: neutral
tone: default
```
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
