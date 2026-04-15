---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -220
  y: -120
  zoom: 0.72
---

::: note { id: flowchart, at: { x: -789, y: -264, w: 618, h: 671 } }

# Flowchart

```mermaid
flowchart TD
    Start[Plan change] --> Review{Scope stable?}
    Review -->|Yes| Implement[Implement]
    Review -->|No| Refine[Refine request]
    Implement --> Verify[Test and review]
    Verify --> Ship[Ship]
```

:::

::: note { id: sequence, at: { x: -48, y: -256, w: 813, h: 633 } }

# Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant Boardmark
    participant Mermaid
    User->>Boardmark: Open markdown preview
    Boardmark->>Mermaid: Render fenced block
    Mermaid-->>Boardmark: Return SVG
    Boardmark-->>User: Show diagram
```

:::

::: note { id: state, at: { x: 889, y: -202, w: 359, h: 497 } }

# State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: render start
    Loading --> Ready: svg success
    Loading --> Error: parse failure
    Error --> Loading: retry
    Ready --> [*]
```

:::

::: note { id: er, at: { x: -690, y: 446, w: 585, h: 734 } }

# ER Diagram

```mermaid
erDiagram
    DOCUMENT ||--o{ NOTE : contains
    NOTE ||--o{ EDGE : connects
    NOTE {
        string id
        string body
        string style
    }
    EDGE {
        string id
        string from
        string to
    }
```

:::

::: note { id: journey, at: { x: 225, y: 306, w: 1525, h: 675 } }

# User Journey

```mermaid
journey
    title Mermaid support rollout
    section Rendering
      Detect mermaid block: 5: Boardmark
      Lazy import engine: 4: Boardmark
      Render SVG preview: 5: Boardmark
    section Validation
      Surface block error: 5: Boardmark
      Keep other markdown intact: 5: Boardmark
```

:::

::: note { id: gantt, at: { x: -1599, y: 1197, w: 1668, h: 357 } }

# Gantt Chart

```mermaid
gantt
    title Boardmark v1 Release Plan
    dateFormat  YYYY-MM-DD
    section Core
    Parser design        :done,    p1, 2026-01-01, 2026-01-14
    Canvas renderer      :done,    p2, 2026-01-10, 2026-01-28
    section Features
    Mermaid support      :active,  f1, 2026-02-01, 2026-02-20
    Image insertion      :         f2, 2026-02-15, 2026-03-05
    HTML sandbox         :         f3, 2026-03-01, 2026-03-20
    section Release
    Beta                 :         r1, 2026-03-21, 2026-03-28
    v1.0 launch          :milestone, 2026-04-01, 1d
```

:::

::: note { id: pie, at: { x: 100, y: 1050, w: 600, h: 480 } }

# Pie Chart

```mermaid
pie title Note type distribution
    "Text" : 42
    "Code" : 23
    "Diagram" : 18
    "Image" : 10
    "Table" : 7
```

:::

::: note { id: gitgraph, at: { x: 800, y: 1050, w: 1000, h: 480 } }

# Git Graph

```mermaid
gitGraph
    commit id: "init"
    commit id: "parser v1"
    branch feature/mermaid
    checkout feature/mermaid
    commit id: "detect block"
    commit id: "lazy import"
    commit id: "render SVG"
    checkout main
    branch feature/images
    checkout feature/images
    commit id: "image node"
    checkout main
    merge feature/mermaid id: "merge mermaid"
    merge feature/images id: "merge images"
    commit id: "v1.0"
```

:::

::: note { id: mindmap, at: { x: -1318, y: 1618, w: 1009, h: 767 } }

# Mind Map

```mermaid
mindmap
  root((Boardmark))
    Canvas
      Notes
      Edges
      Viewport
    Markdown
      CommonMark
      Frontmatter
      Fenced blocks
    Diagrams
      Mermaid
      PlantUML
    Themes
      Styles
      Tokens
      Dark mode
```

:::

::: note { id: timeline, at: { x: -220, y: 1650, w: 1000, h: 620 } }

# Timeline

```mermaid
timeline
    title Boardmark roadmap
    2025 Q4 : Core parser
            : Canvas engine
    2026 Q1 : Mermaid diagrams
            : Image support
    2026 Q2 : HTML sandbox
            : Collaboration MVP
    2026 Q3 : Plugin API
            : Export to PDF
```

:::

::: note { id: xychart, at: { x: 880, y: 1650, w: 920, h: 620 } }

# XY Chart

```mermaid
xychart-beta
    title "Weekly active canvases"
    x-axis [Jan, Feb, Mar, Apr, May, Jun, Jul]
    y-axis "Canvases" 0 --> 500
    bar  [120, 185, 230, 290, 340, 410, 480]
    line [120, 185, 230, 290, 340, 410, 480]
```

:::

::: note { id: quadrant, at: { x: -1104, y: 2400, w: 840, h: 720 } }

# Quadrant Chart

```mermaid
quadrantChart
    title Feature priority matrix
    x-axis Low effort --> High effort
    y-axis Low impact --> High impact
    quadrant-1 Do first
    quadrant-2 Plan
    quadrant-3 Deprioritize
    quadrant-4 Delegate
    Mermaid render: [0.2, 0.85]
    Dark mode: [0.35, 0.75]
    Collaboration: [0.8, 0.9]
    Export PDF: [0.6, 0.55]
    Custom fonts: [0.45, 0.3]
    Spell check: [0.3, 0.2]
    Plugin API: [0.75, 0.7]
```

:::

::: note { id: classDiagram, at: { x: -160, y: 2400, w: 1054, h: 1013 } }

# Class Diagram

```mermaid
classDiagram
    class CanvasDocument {
        +string id
        +Note[] notes
        +Edge[] edges
        +Viewport viewport
        +render() SVG
        +toMarkdown() string
    }
    class Note {
        +string id
        +string body
        +Position at
        +Style style
        +parse() ASTNode
    }
    class Edge {
        +string id
        +string from
        +string to
        +string? label
    }
    class Viewport {
        +number x
        +number y
        +number zoom
    }
    CanvasDocument "1" --> "many" Note : contains
    CanvasDocument "1" --> "many" Edge : connects
    CanvasDocument "1" --> "1" Viewport : views
    Edge --> Note : from
    Edge --> Note : to
```

:::
