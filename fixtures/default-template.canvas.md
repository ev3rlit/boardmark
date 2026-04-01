---
type: canvas
version: 1
viewport:
  x: -180
  y: -120
  zoom: 0.92
---

::: note #welcome x=80 y=72 w=340 h=220 color=yellow

# Boardmark Viewer

Open a `.canvas.md` file or start from this bundled example board.

- `New File` saves a fresh board to disk
- `Open File` lives in the file menu
- `Save` keeps your current document on disk

:::

::: note #overview x=468 y=52 w=320 h=220 color=blue

## What This Shows

- sticky notes with markdown
- labeled edges with context
- mixed content blocks and checklists
- a viewport that feels like a real board

:::

::: note #workflow x=910 y=96 w=320 h=220 color=green

## Reading Flow

1. start with the big idea
2. scan supporting notes
3. follow the edge labels for narrative

> Viewer MVP stays read-only.

:::

::: note #structure x=380 y=360 w=360 h=220 color=pink

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

::: note #details x=824 y=362 w=360 h=220 color=purple

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

::: note #prompting x=1228 y=318 w=320 h=220 color=default

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
