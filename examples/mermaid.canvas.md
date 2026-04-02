---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -220
  y: -120
  zoom: 0.72
---

::: note { id: flowchart, at: { x: -640, y: -380, w: 420, h: 320 } }

```mermaid
flowchart TD
    Start[Plan change] --> Review{Scope stable?}
    Review -->|Yes| Implement[Implement]
    Review -->|No| Refine[Refine request]
    Implement --> Verify[Test and review]
    Verify --> Ship[Ship]
```

:::

::: note { id: sequence, at: { x: -110, y: -420, w: 470, h: 360 } }

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

::: note { id: state, at: { x: 470, y: -390, w: 420, h: 320 } }

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

::: note { id: er, at: { x: -390, y: 90, w: 520, h: 360 } }

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

::: note { id: journey, at: { x: 260, y: 80, w: 520, h: 360 } }

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
