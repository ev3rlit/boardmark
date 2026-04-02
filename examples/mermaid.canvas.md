---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -220
  y: -120
  zoom: 0.72
---

::: note { id: flowchart, at: { x: -1104, y: -740, w: 618, h: 671 } }

```mermaid
flowchart TD
    Start[Plan change] --> Review{Scope stable?}
    Review -->|Yes| Implement[Implement]
    Review -->|No| Refine[Refine request]
    Implement --> Verify[Test and review]
    Verify --> Ship[Ship]
```

:::

::: note { id: sequence, at: { x: -411, y: -691, w: 813, h: 633 } }

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

::: note { id: state, at: { x: 513, y: -702, w: 359, h: 497 } }

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

::: note { id: er, at: { x: -561, y: 211, w: 585, h: 734 } }

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

::: note { id: journey, at: { x: 260, y: 80, w: 1525, h: 675 } }

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
