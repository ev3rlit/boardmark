# Boardmark Architecture

## Package Dependency Layers

```mermaid
graph TD
    subgraph APPS["Applications"]
        WEB["apps/web<br>Vite Web App"]
        DESKTOP["apps/desktop<br>Electron Desktop App"]
    end

    subgraph APP_LAYER["Application Layer"]
        CANVAS_APP["@boardmark/canvas-app<br>Canvas editor shell<br>(store, services, components)"]
        TEMPLATES["@boardmark/templates<br>Pre-built canvas templates"]
    end

    subgraph RUNTIME_LAYER["Runtime Layer"]
        RENDERER["@boardmark/canvas-renderer<br>React node & edge renderers<br>(shapes, notes)"]
        REPOSITORY["@boardmark/canvas-repository<br>File I/O & document persistence"]
        UI["@boardmark/ui<br>Shared UI primitives<br>(StickyNoteCard, MarkdownContent)"]
    end

    subgraph PARSE_LAYER["Parse Layer"]
        PARSER["@boardmark/canvas-parser<br>Markdown → CanvasAST<br>(unified / remark)"]
    end

    subgraph DOMAIN_LAYER["Domain Layer"]
        DOMAIN["@boardmark/canvas-domain<br>Types, constants, design tokens<br>(CanvasAST, CanvasNode, BuiltInRendererKey…)"]
    end

    %% App → Application Layer
    WEB --> CANVAS_APP
    DESKTOP --> CANVAS_APP

    %% Application Layer
    CANVAS_APP --> RENDERER
    CANVAS_APP --> REPOSITORY
    CANVAS_APP --> PARSER
    CANVAS_APP --> DOMAIN
    TEMPLATES -.->|peer dep| UI

    %% Runtime Layer
    RENDERER --> UI
    RENDERER --> DOMAIN
    REPOSITORY --> PARSER
    REPOSITORY --> DOMAIN

    %% Parse Layer
    PARSER --> DOMAIN
```

## Internal Structure: `canvas-app`

```mermaid
graph TD
    subgraph CANVAS_APP["@boardmark/canvas-app"]
        APP["app/<br>CanvasApp (root component)"]
        STORE["store/<br>Zustand store<br>(state, slices, selectors)"]
        SERVICES["services/<br>Edit / Save / Document services"]
        COMPONENTS["components/<br>Scene, Controls, Menus, Primitives"]
        DOCUMENT["document/<br>CanvasDocumentState"]
    end

    APP --> STORE
    APP --> COMPONENTS
    COMPONENTS --> STORE
    COMPONENTS --> SERVICES
    SERVICES --> STORE
    SERVICES --> DOCUMENT
    DOCUMENT --> STORE
```

## Data Flow

```mermaid
graph TD
    MD["Markdown file (.canvas.md)"]
    PARSE["canvas-parser<br>parseCanvasDocument()"]
    AST["CanvasAST<br>(nodes, edges, frontmatter)"]
    STORE_NODE["canvas-app Store<br>Zustand"]
    SCENE["CanvasScene<br>@xyflow/react"]
    RENDER["canvas-renderer<br>Shape / Note components"]
    DOM["Browser DOM"]

    MD --> PARSE
    PARSE --> AST
    AST --> STORE_NODE
    STORE_NODE --> SCENE
    SCENE --> RENDER
    RENDER --> DOM

    DOM -->|"user edit"| STORE_NODE
    STORE_NODE -->|"save"| MD
```

## Package Summary

| Package | Role | Key Exports |
|---|---|---|
| `canvas-domain` | Types & design tokens — no runtime deps | `CanvasAST`, `CanvasNode`, `CanvasEdge`, `BuiltInRendererKey` |
| `canvas-parser` | Markdown → AST | `parseCanvasDocument()` |
| `canvas-renderer` | AST → React components | Shape & Note renderers |
| `canvas-repository` | File persistence bridge | `createCanvasMarkdownDocumentRepository()`, `BoardmarkDocumentBridge` |
| `ui` | Shared UI components | `StickyNoteCard`, `MarkdownContent` |
| `canvas-app` | Editor shell (store + services + UI) | `CanvasApp`, `createCanvasStore` |
| `templates` | Pre-built canvas content | `CalendarTemplate`, template registry |
| `apps/web` | Web entry point (Vite) | — |
| `apps/desktop` | Desktop entry point (Electron) | — |
