---
type: canvas
version: 1
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note #welcome x=-145 y=451 w=340 h=220 color=yellow

# Boardmark Viewer

Open a `.canvas.md` file or start from this bundled example board.

- `New File` saves a fresh board to disk
- `Open File` lives in the file menu
- `Save` keeps your current document on disk

:::

::: note #overview x=430 y=41 w=320 h=220 color=blue

## What This Shows

- sticky notes with markdown
- labeled edges with context
- mixed content blocks and checklists
- a viewport that feels like a real board

:::

::: note #workflow x=1120 y=-81 w=320 h=220 color=green

## Reading Flow

1. start with the big idea
2. scan supporting notes
3. follow the edge labels for narrative

> Viewer MVP stays read-only.

:::

::: note #structure x=330 y=762 w=360 h=220 color=pink

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

::: note #details x=810 y=724 w=360 h=220 color=purple

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

::: note #prompting x=1282 y=383 w=320 h=220 color=default

## Prompting Angle

Use the board to sketch:

- requirements
- tradeoffs
- implementation slices

Then turn each note into a task.

:::

::: edge #welcome-overview from=welcome to=overview kind=curve
main thread
:::

::: edge #overview-workflow from=overview to=workflow kind=curve
reading path
:::

::: edge #welcome-structure from=welcome to=structure kind=curve
:::

::: edge #structure-details from=structure to=details kind=curve
:::

::: edge #details-prompting from=details to=prompting kind=curve
:::

::: note #note-1 x=-78 y=177 w=320 h=220
New note
:::

::: note #note-2 x=100 y=-100 w=320 h=220
New note
:::

::: note #note-3 x=817 y=201 w=320 h=220
New note
:::

::: note #note-4 x=-98 y=748 w=320 h=220
New note
:::

::: note #note-5 x=-120 y=293 w=320 h=220
New note
:::

::: note #note-6 x=433 y=439 w=320 h=220
New note
:::
