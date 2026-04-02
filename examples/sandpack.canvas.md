---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -200
  y: -100
  zoom: 0.72
---

::: note { id: basic-react, at: { x: -800, y: -300, w: 700, h: 500 } }

# Basic React

```sandpack
{
  "template": "react",
  "files": {
    "App.js": "export default function App() {\n  return (\n    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>\n      <h1>Hello from Sandpack</h1>\n      <p>This is a live React preview inside Boardmark.</p>\n    </div>\n  )\n}"
  }
}
```

:::

::: note { id: react-ts, at: { x: 0, y: -300, w: 700, h: 500 } }

# React + TypeScript

```sandpack
{
  "template": "react-ts",
  "files": {
    "App.tsx": "type GreetingProps = { name: string }\n\nfunction Greeting({ name }: GreetingProps) {\n  return <p>Hello, <strong>{name}</strong>!</p>\n}\n\nexport default function App() {\n  return (\n    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>\n      <Greeting name=\"Boardmark\" />\n    </div>\n  )\n}"
  }
}
```

:::

::: note { id: with-deps, at: { x: 800, y: -300, w: 700, h: 500 } }

# With Dependencies

```sandpack
{
  "template": "react",
  "files": {
    "App.js": "import { useState } from 'react'\n\nexport default function App() {\n  const [count, setCount] = useState(0)\n  return (\n    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(c => c + 1)}>Increment</button>\n      <button onClick={() => setCount(0)} style={{ marginLeft: 8 }}>Reset</button>\n    </div>\n  )\n}"
  },
  "dependencies": {
    "react": "^18.0.0"
  }
}
```

:::

::: note { id: multi-file, at: { x: -800, y: 300, w: 700, h: 500 } }

# Multi File

```sandpack
{
  "template": "react",
  "files": {
    "App.js": "import Button from './Button'\n\nexport default function App() {\n  return (\n    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>\n      <h2>Component Preview</h2>\n      <Button label=\"Primary\" />\n      <Button label=\"Secondary\" />\n    </div>\n  )\n}",
    "Button.js": "export default function Button({ label }) {\n  return (\n    <button\n      style={{\n        margin: 4,\n        padding: '8px 16px',\n        borderRadius: 6,\n        border: '1px solid #6042d6',\n        background: '#e6deff',\n        cursor: 'pointer',\n        fontWeight: 600,\n      }}\n    >\n      {label}\n    </button>\n  )\n}"
  }
}
```

:::

::: note { id: json-error, at: { x: 0, y: 300, w: 700, h: 500 } }

# Error: Invalid JSON

```sandpack
{
  "template": "react",
  "files": {
    "App.js": "this is not valid JSON
}
```

:::

::: note { id: missing-files, at: { x: 800, y: 300, w: 700, h: 500 } }

# Error: Missing files

```sandpack
{
  "template": "react"
}
```

:::
