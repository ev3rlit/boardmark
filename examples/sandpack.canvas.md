---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -260
  y: -180
  zoom: 0.52
---

::: note {"id":"overview","at":{"x":-1180,"y":-220,"w":380,"h":320}}

# Sandpack Gallery

이 보드는 새 nested fenced `sandpack` 문법 예시를 모아 둔 샘플입니다.

- 간단한 카운터
- 실제 계산기
- 멀티파일 컴포넌트
- 테트리스 같은 복합 레이아웃
- 외부 의존성 사용

각 노트는 바로 실행 가능한 예제를 포함합니다.

:::

::: note {"id":"counter-demo","at":{"x":-700,"y":-375,"w":720,"h":635}}

# Counter

기본 상태 관리와 간단한 스타일이 들어간 가장 작은 React 예제입니다.

````sandpack
{
  "template": "react"
}

```App.js
import { useMemo, useState } from "react";

const palettes = [
  { accent: "#0f766e", surface: "#ccfbf1", label: "Mint" },
  { accent: "#7c3aed", surface: "#ede9fe", label: "Violet" },
  { accent: "#dc2626", surface: "#fee2e2", label: "Coral" }
];

export default function App() {
  const [count, setCount] = useState(3);
  const [paletteIndex, setPaletteIndex] = useState(0);

  const palette = useMemo(() => palettes[paletteIndex], [paletteIndex]);

  return (
    <div
      style={{
        minHeight: "100vh",
        margin: 0,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg, #f8fafc, #e2e8f0)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif"
      }}
    >
      <section
        style={{
          width: 320,
          borderRadius: 24,
          padding: 24,
          background: "#ffffff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)"
        }}
      >
        <p style={{ margin: 0, color: "#64748b", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Interactive Counter
        </p>
        <h1 style={{ margin: "16px 0 8px", fontSize: 64, lineHeight: 1, color: palette.accent }}>
          {count}
        </h1>
        <p style={{ margin: "0 0 20px", color: "#475569" }}>
          현재 테마: <strong>{palette.label}</strong>
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button onClick={() => setCount((value) => value - 1)} style={buttonStyle(palette.surface, palette.accent)}>
            -1
          </button>
          <button onClick={() => setCount((value) => value + 1)} style={buttonStyle(palette.accent, "#ffffff")}>
            +1
          </button>
          <button onClick={() => setCount(0)} style={buttonStyle("#e2e8f0", "#0f172a")}>
            Reset
          </button>
        </div>
        <button
          onClick={() => setPaletteIndex((value) => (value + 1) % palettes.length)}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 14,
            padding: "12px 14px",
            background: palette.surface,
            color: palette.accent,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Change Accent
        </button>
      </section>
    </div>
  );
}

function buttonStyle(background, color) {
  return {
    flex: 1,
    border: "none",
    borderRadius: 14,
    padding: "12px 14px",
    background,
    color,
    fontWeight: 700,
    cursor: "pointer"
  };
}
```
````

:::

::: note {"id":"calculator-demo","at":{"x":140,"y":-380,"w":760,"h":660}}

# Calculator

버튼 입력, 사칙연산, 소수점, clear/backspace까지 포함한 조금 더 실용적인 예제입니다.

````sandpack
{
  "template": "react"
}

```App.js
import { useState } from "react";

const keys = [
  "7", "8", "9", "/",
  "4", "5", "6", "*",
  "1", "2", "3", "-",
  "0", ".", "=", "+"
];

export default function App() {
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState(null);
  const [operator, setOperator] = useState(null);
  const [shouldReplace, setShouldReplace] = useState(true);

  function inputDigit(value) {
    if (shouldReplace) {
      setDisplay(value === "." ? "0." : value);
      setShouldReplace(false);
      return;
    }

    if (value === "." && display.includes(".")) {
      return;
    }

    setDisplay((current) => current === "0" && value !== "." ? value : current + value);
  }

  function applyOperator(nextOperator) {
    const numericValue = Number(display);

    if (storedValue === null) {
      setStoredValue(numericValue);
      setOperator(nextOperator);
      setShouldReplace(true);
      return;
    }

    const nextValue = runCalculation(storedValue, numericValue, operator);
    setStoredValue(nextValue);
    setDisplay(String(trimNumber(nextValue)));
    setOperator(nextOperator);
    setShouldReplace(true);
  }

  function handleEqual() {
    if (operator === null || storedValue === null) {
      return;
    }

    const nextValue = runCalculation(storedValue, Number(display), operator);
    setDisplay(String(trimNumber(nextValue)));
    setStoredValue(null);
    setOperator(null);
    setShouldReplace(true);
  }

  function handleKeyPress(value) {
    if (/\d|\./.test(value)) {
      inputDigit(value);
      return;
    }

    if (value === "=") {
      handleEqual();
      return;
    }

    applyOperator(value);
  }

  function handleBackspace() {
    if (shouldReplace) {
      return;
    }

    setDisplay((current) => {
      if (current.length <= 1) {
        setShouldReplace(true);
        return "0";
      }

      return current.slice(0, -1);
    });
  }

  function clearAll() {
    setDisplay("0");
    setStoredValue(null);
    setOperator(null);
    setShouldReplace(true);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at top, #1e293b, #020617)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif"
      }}
    >
      <section
        style={{
          width: 340,
          borderRadius: 28,
          padding: 20,
          background: "rgba(15, 23, 42, 0.88)",
          boxShadow: "0 30px 80px rgba(2, 6, 23, 0.5)"
        }}
      >
        <div
          style={{
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            background: "#e2e8f0",
            color: "#0f172a",
            textAlign: "right"
          }}
        >
          <div style={{ minHeight: 20, color: "#475569", fontSize: 13 }}>
            {storedValue !== null ? `${trimNumber(storedValue)} ${operator ?? ""}` : "Ready"}
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15, wordBreak: "break-all" }}>
            {display}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <button onClick={clearAll} style={wideButton("#f97316")}>Clear</button>
          <button onClick={handleBackspace} style={wideButton("#334155")}>Backspace</button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12
          }}
        >
          {keys.map((key) => (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              style={keyButton(key)}
            >
              {key}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function runCalculation(left, right, operator) {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? 0 : left / right;
    default:
      return right;
  }
}

function trimNumber(value) {
  return Number.isInteger(value) ? value : Number(value.toFixed(6));
}

function wideButton(background) {
  return {
    flex: 1,
    border: "none",
    borderRadius: 16,
    padding: "12px 14px",
    background,
    color: "#f8fafc",
    fontWeight: 700,
    cursor: "pointer"
  };
}

function keyButton(key) {
  const isOperator = ["+", "-", "*", "/", "="].includes(key);

  return {
    border: "none",
    borderRadius: 18,
    padding: "16px 0",
    background: isOperator ? "#8b5cf6" : "#1e293b",
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: 700,
    cursor: "pointer"
  };
}
```
````

:::

::: note {"id":"catalog-demo","at":{"x":980,"y":-360,"w":1373,"h":640}}

# Multi-file Product Cards

여러 파일과 nested path를 사용하는 컴포넌트 조합 예제입니다.

````sandpack
{
  "template": "react"
}

```App.js
import { products } from "./src/data/products";
import { ProductCard } from "./src/components/ProductCard";
import "./styles.css";

export default function App() {
  return (
    <main className="catalog-page">
      <header className="catalog-hero">
        <p className="eyebrow">Release candidates</p>
        <h1>Product card gallery</h1>
        <p>Nested file paths, reusable components, and stylesheet imports.</p>
      </header>

      <section className="catalog-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </main>
  );
}
```

```src/components/ProductCard.jsx
export function ProductCard({ product }) {
  return (
    <article className="product-card">
      <div className="product-chip">{product.badge}</div>
      <h2>{product.name}</h2>
      <p>{product.description}</p>
      <div className="product-footer">
        <strong>{product.price}</strong>
        <button>Inspect</button>
      </div>
    </article>
  );
}
```

```src/data/products.js
export const products = [
  {
    id: "logic-lens",
    badge: "Analysis",
    name: "Logic Lens",
    description: "Trace state transitions, inspect flows, and annotate edge cases.",
    price: "$49"
  },
  {
    id: "grid-keeper",
    badge: "Layout",
    name: "Grid Keeper",
    description: "Coordinate dense editorial layouts without losing visual rhythm.",
    price: "$79"
  },
  {
    id: "branch-scout",
    badge: "Git",
    name: "Branch Scout",
    description: "Compare branches, highlight risk, and review impact before merge.",
    price: "$59"
  }
];
```

```styles.css
:root {
  color-scheme: light;
  font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
}

body {
  margin: 0;
  background: linear-gradient(180deg, #f8fafc, #dbeafe);
}

.catalog-page {
  padding: 32px;
}

.catalog-hero {
  margin-bottom: 28px;
}

.catalog-hero h1 {
  margin: 8px 0;
  font-size: 40px;
}

.catalog-hero p {
  margin: 0;
  max-width: 520px;
  color: #475569;
}

.eyebrow {
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.product-card {
  padding: 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 50px rgba(30, 41, 59, 0.12);
}

.product-chip {
  display: inline-flex;
  margin-bottom: 12px;
  border-radius: 999px;
  padding: 6px 10px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.product-card h2 {
  margin: 0 0 8px;
}

.product-card p {
  margin: 0 0 18px;
  color: #475569;
}

.product-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.product-footer button {
  border: none;
  border-radius: 999px;
  padding: 10px 14px;
  background: #0f172a;
  color: white;
  font-weight: 700;
}
```
````

:::

::: note {"id":"tetris-layout-demo","at":{"x":-760,"y":420,"w":960,"h":760}}

# Tetris-like Dashboard Layout

정교한 타일 배치와 불규칙한 비율을 가진 보드형 레이아웃 예제입니다.

````sandpack
{
  "template": "react"
}

```App.js
import "./styles.css";

const tiles = [
  { id: "score", title: "Score", value: "48,120", className: "tile tile-score" },
  { id: "level", title: "Level", value: "12", className: "tile tile-level" },
  { id: "lines", title: "Lines", value: "182", className: "tile tile-lines" },
  { id: "queue", title: "Queue", value: "T  L  I", className: "tile tile-queue" },
  { id: "matrix", title: "Matrix", value: "", className: "tile tile-matrix" },
  { id: "stats", title: "Move Stats", value: "Spin chain + back-to-back", className: "tile tile-stats" }
];

const matrix = [
  "0003300000",
  "0033300000",
  "0030555000",
  "0000550000",
  "0000770000",
  "0000770000",
  "0011220000",
  "0011220000",
  "4444666600",
  "4444666600",
  "4444666600",
  "4444666600"
];

export default function App() {
  return (
    <main className="dashboard">
      <section className="dashboard-grid">
        {tiles.map((tile) => (
          <article key={tile.id} className={tile.className}>
            <p>{tile.title}</p>
            {tile.id === "matrix" ? (
              <div className="matrix">
                {matrix.flatMap((row, rowIndex) =>
                  row.split("").map((cell, columnIndex) => (
                    <span
                      key={`${rowIndex}-${columnIndex}`}
                      className={`cell color-${cell}`}
                    />
                  ))
                )}
              </div>
            ) : (
              <strong>{tile.value}</strong>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
```

```styles.css
body {
  margin: 0;
  min-height: 100vh;
  font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.25), transparent 28%),
    radial-gradient(circle at bottom right, rgba(244, 114, 182, 0.24), transparent 32%),
    #0f172a;
  color: #e2e8f0;
}

.dashboard {
  padding: 28px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-auto-rows: 88px;
  gap: 16px;
}

.tile {
  border-radius: 28px;
  padding: 18px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.18);
  backdrop-filter: blur(18px);
}

.tile p {
  margin: 0 0 10px;
  color: #94a3b8;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.tile strong {
  font-size: 34px;
  line-height: 1;
}

.tile-score {
  grid-column: span 2;
}

.tile-level {
  grid-column: span 2;
}

.tile-lines {
  grid-column: span 2;
}

.tile-queue {
  grid-column: span 2;
}

.tile-matrix {
  grid-column: span 5;
  grid-row: span 5;
}

.tile-stats {
  grid-column: span 3;
  grid-row: span 5;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background:
    linear-gradient(180deg, rgba(59, 130, 246, 0.2), transparent 42%),
    rgba(15, 23, 42, 0.8);
}

.matrix {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.cell {
  aspect-ratio: 1;
  border-radius: 10px;
  background: rgba(51, 65, 85, 0.5);
}

.color-0 { background: rgba(51, 65, 85, 0.42); }
.color-1 { background: #38bdf8; }
.color-2 { background: #fb7185; }
.color-3 { background: #c084fc; }
.color-4 { background: #f97316; }
.color-5 { background: #facc15; }
.color-6 { background: #4ade80; }
.color-7 { background: #60a5fa; }
```
````

:::

::: note {"id":"dependency-demo","at":{"x":360,"y":420,"w":920,"h":760}}

# External Dependencies

`date-fns`, `lucide-react`, `clsx`를 함께 사용하는 예제입니다.

````sandpack
{
  "template": "react",
  "dependencies": {
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.511.0"
  }
}

```App.js
import { addDays, format } from "date-fns";
import { CalendarDays, CircleCheckBig, Clock3 } from "lucide-react";
import clsx from "clsx";
import "./styles.css";

const baseDate = new Date("2026-04-15T09:00:00");

const milestones = [
  {
    id: "spec",
    title: "Spec review",
    offset: 0,
    status: "done",
    note: "JSON header shape agreed"
  },
  {
    id: "parser",
    title: "Parser integration",
    offset: 2,
    status: "active",
    note: "Dual-read and canonical write"
  },
  {
    id: "migration",
    title: "Bulk migration",
    offset: 5,
    status: "planned",
    note: "Repository-wide cleanup later"
  }
];

export default function App() {
  return (
    <main className="timeline-page">
      <header className="timeline-header">
        <CalendarDays size={32} />
        <div>
          <p>External dependency demo</p>
          <h1>Release timeline</h1>
        </div>
      </header>

      <section className="timeline-list">
        {milestones.map((item) => (
          <article key={item.id} className={clsx("timeline-card", `timeline-card--${item.status}`)}>
            <div className="timeline-icon">
              {item.status === "done" ? <CircleCheckBig size={20} /> : <Clock3 size={20} />}
            </div>
            <div className="timeline-copy">
              <p className="timeline-date">{format(addDays(baseDate, item.offset), "EEE, MMM d")}</p>
              <h2>{item.title}</h2>
              <p>{item.note}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
```

```styles.css
body {
  margin: 0;
  min-height: 100vh;
  font-family: "Manrope", ui-sans-serif, system-ui, sans-serif;
  background: linear-gradient(180deg, #fffdf8, #fef3c7);
  color: #1f2937;
}

.timeline-page {
  padding: 32px;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}

.timeline-header p {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  color: #92400e;
}

.timeline-header h1 {
  margin: 6px 0 0;
  font-size: 42px;
}

.timeline-list {
  display: grid;
  gap: 16px;
}

.timeline-card {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 16px;
  padding: 18px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 40px rgba(146, 64, 14, 0.08);
}

.timeline-card--done {
  outline: 3px solid rgba(34, 197, 94, 0.16);
}

.timeline-card--active {
  outline: 3px solid rgba(59, 130, 246, 0.16);
}

.timeline-card--planned {
  outline: 3px solid rgba(245, 158, 11, 0.16);
}

.timeline-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: #111827;
  color: white;
}

.timeline-date {
  margin: 0 0 6px;
  color: #92400e;
  font-size: 13px;
  font-weight: 700;
}

.timeline-copy h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.timeline-copy p:last-child {
  margin: 0;
  color: #4b5563;
}
```
````

:::

::: note {"id":"preview-only-demo","at":{"x":1460,"y":500,"w":640,"h":520}}

# Preview Default

이 예제처럼 `layout`을 생략하면 preview 기본값으로 렌더됩니다.

````sandpack
{
  "template": "react"
}

```App.js
export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        margin: 0,
        background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif"
      }}
    >
      <div
        style={{
          borderRadius: 24,
          padding: 28,
          background: "#ffffff",
          boxShadow: "0 18px 50px rgba(22, 101, 52, 0.12)",
          textAlign: "center"
        }}
      >
        <p style={{ margin: 0, color: "#15803d", fontWeight: 700 }}>Preview default</p>
        <h1 style={{ margin: "8px 0 0" }}>No code pane</h1>
      </div>
    </div>
  );
}
```
````

:::

::: edge {"id":"overview-counter","from":"overview","to":"counter-demo"}
Starting point
:::

::: edge {"id":"counter-calculator","from":"counter-demo","to":"calculator-demo"}
More interaction
:::

::: edge {"id":"calculator-catalog","from":"calculator-demo","to":"catalog-demo"}
Multi-file
:::

::: edge {"id":"counter-tetris","from":"counter-demo","to":"tetris-layout-demo"}
Layout stress
:::

::: edge {"id":"calculator-dependencies","from":"calculator-demo","to":"dependency-demo"}
Dependency example
:::

::: edge {"id":"catalog-preview","from":"catalog-demo","to":"preview-only-demo"}
Preview default
:::
