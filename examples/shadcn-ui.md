---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -240
  y: -180
  zoom: 0.5
---

::: note {"id":"overview","at":{"x":-1180,"y":-220,"w":420,"h":340}}

# shadcn/ui Showcase

이 보드는 shadcn/ui 감각의 컴포넌트와 화면 조합을 Boardmark 안에서 바로 보여주기 위한 샘플입니다.

- 버튼과 배지
- 설정 패널
- 탭이 있는 대시보드
- 커맨드 팔레트 스타일 리스트
- 다이얼로그 기반 상세 카드

모든 샘플은 preview 기본값으로 렌더됩니다.

:::

::: note {"id":"buttons","at":{"x":-660,"y":-380,"w":760}}

# Button Row

가장 기본적인 shadcn/ui 스타일 버튼, 카드, 배지 조합입니다.

````sandpack
{
  "template": "react"
}

```App.js
import "./styles.css";

const buttonVariants = [
  { label: "Primary", className: "btn btn-primary" },
  { label: "Secondary", className: "btn btn-secondary" },
  { label: "Outline", className: "btn btn-outline" },
  { label: "Ghost", className: "btn btn-ghost" }
];

export default function App() {
  return (
    <main className="page">
      <section className="card">
        <div className="stack">
          <div>
            <p className="eyebrow">Component primitive</p>
            <h1>Buttons and badges</h1>
            <p className="lede">
              Neutral surfaces, strong contrast, soft radius, and compact action rows.
            </p>
          </div>

          <div className="button-grid">
            {buttonVariants.map((button) => (
              <button key={button.label} className={button.className}>
                {button.label}
              </button>
            ))}
          </div>

          <div className="badge-row">
            <span className="badge">Default</span>
            <span className="badge badge-secondary">Secondary</span>
            <span className="badge badge-outline">Outline</span>
          </div>
        </div>
      </section>
    </main>
  );
}
```

```styles.css
:root {
  color-scheme: light;
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  --background: #f8fafc;
  --foreground: #0f172a;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --border: #e2e8f0;
  --primary: #0f172a;
  --primary-foreground: #f8fafc;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top left, rgba(148, 163, 184, 0.18), transparent 28%),
    var(--background);
  color: var(--foreground);
}

.page {
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: min(100%, 520px);
  border: 1px solid var(--border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.stack {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 10px;
  font-size: 30px;
}

.lede {
  margin: 0;
  color: var(--muted-foreground);
  line-height: 1.6;
}

.button-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.btn {
  min-width: 110px;
  border-radius: 10px;
  border: 1px solid transparent;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
}

.btn-secondary {
  background: var(--muted);
  color: var(--foreground);
}

.btn-outline {
  border-color: var(--border);
  background: white;
  color: var(--foreground);
}

.btn-ghost {
  background: transparent;
  color: var(--foreground);
}

.badge-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}

.badge-secondary {
  background: var(--muted);
  color: var(--foreground);
}

.badge-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--foreground);
}
```
````

:::

::: note {"id":"settings","at":{"x":180,"y":-380,"w":760}}

# Settings Panel

Radix `Switch`와 lucide 아이콘으로 만드는 설정 패널입니다.

````sandpack
{
  "template": "react",
  "dependencies": {
    "@radix-ui/react-switch": "^1.2.5",
    "clsx": "^2.1.1",
    "lucide-react": "^0.511.0"
  }
}

```App.js
import { useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import { Bell, MoonStar, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import "./styles.css";

const initialSettings = [
  {
    id: "alerts",
    title: "Release alerts",
    description: "Send updates when new components are published.",
    icon: Bell,
    enabled: true
  },
  {
    id: "dark",
    title: "Dark mode preview",
    description: "Preview components against a dark neutral surface.",
    icon: MoonStar,
    enabled: false
  },
  {
    id: "review",
    title: "Strict review mode",
    description: "Require approval before design tokens are changed.",
    icon: ShieldCheck,
    enabled: true
  }
];

export default function App() {
  const [settings, setSettings] = useState(initialSettings);

  function toggleSetting(id) {
    setSettings((current) =>
      current.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item
      )
    );
  }

  return (
    <main className="page">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p>Workspace settings</p>
            <h1>Preview controls</h1>
          </div>
          <span className="chip">3 sections</span>
        </header>

        <div className="settings-list">
          {settings.map((item) => {
            const Icon = item.icon;

            return (
              <article key={item.id} className={clsx("setting-row", item.enabled && "setting-row--active")}>
                <div className="setting-icon">
                  <Icon size={18} />
                </div>
                <div className="setting-copy">
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
                <Switch.Root
                  checked={item.enabled}
                  className="switch-root"
                  onCheckedChange={() => toggleSetting(item.id)}
                >
                  <Switch.Thumb className="switch-thumb" />
                </Switch.Root>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
```

```styles.css
:root {
  color-scheme: light;
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  --background: #f8fafc;
  --foreground: #111827;
  --muted: #f8fafc;
  --muted-foreground: #6b7280;
  --border: #e5e7eb;
  --ring: #111827;
}

body {
  margin: 0;
  background: linear-gradient(180deg, #f8fafc, #eef2ff);
  color: var(--foreground);
}

.page {
  display: grid;
  place-items: center;
  padding: 24px;
}

.panel {
  width: min(100%, 560px);
  border: 1px solid var(--border);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  padding: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-header p {
  margin: 0 0 6px;
  color: var(--muted-foreground);
  font-size: 13px;
}

.panel-header h1 {
  margin: 0;
  font-size: 30px;
}

.chip {
  align-self: start;
  border-radius: 999px;
  background: #111827;
  color: white;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
}

.settings-list {
  display: grid;
  gap: 12px;
}

.setting-row {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 14px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 16px;
}

.setting-row--active {
  background: rgba(243, 244, 246, 0.8);
}

.setting-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #111827;
  color: white;
}

.setting-copy h2 {
  margin: 0 0 6px;
  font-size: 16px;
}

.setting-copy p {
  margin: 0;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.switch-root {
  position: relative;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: #d1d5db;
  border: none;
  cursor: pointer;
  transition: background 160ms ease;
}

.switch-root[data-state="checked"] {
  background: #111827;
}

.switch-thumb {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: white;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
  transform: translateX(3px);
  transition: transform 160ms ease;
}

.switch-thumb[data-state="checked"] {
  transform: translateX(23px);
}
```
````

:::

::: note {"id":"dashboard","at":{"x":1167,"y":-370,"w":900}}

# Dashboard Tabs

Radix `Tabs`로 구성한 shadcn/ui 스타일 분석 대시보드입니다.

````sandpack
{
  "template": "react",
  "dependencies": {
    "@radix-ui/react-tabs": "^1.1.12",
    "lucide-react": "^0.511.0"
  }
}

```App.js
import * as Tabs from "@radix-ui/react-tabs";
import { BarChart3, Clock4, LayoutGrid, Zap } from "lucide-react";
import "./styles.css";

const metrics = [
  { label: "Active previews", value: "18", icon: LayoutGrid },
  { label: "Review latency", value: "14m", icon: Clock4 },
  { label: "Interaction score", value: "92", icon: Zap }
];

export default function App() {
  return (
    <main className="page">
      <Tabs.Root defaultValue="overview" className="shell">
        <header className="shell-header">
          <div>
            <p>Design review workspace</p>
            <h1>Component telemetry</h1>
          </div>
          <BarChart3 size={20} />
        </header>

        <Tabs.List className="tabs-list" aria-label="Dashboard sections">
          <Tabs.Trigger value="overview" className="tab-trigger">Overview</Tabs.Trigger>
          <Tabs.Trigger value="states" className="tab-trigger">States</Tabs.Trigger>
          <Tabs.Trigger value="tokens" className="tab-trigger">Tokens</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" className="tabs-panel">
          <section className="metrics">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="metric-card">
                  <Icon size={18} />
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              );
            })}
          </section>
          <section className="canvas-card">
            <div className="canvas-grid">
              <div className="canvas-box canvas-box--large" />
              <div className="canvas-box" />
              <div className="canvas-box" />
              <div className="canvas-box canvas-box--wide" />
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="states" className="tabs-panel">
          <section className="state-list">
            {["Empty", "Loading", "Success", "Error"].map((state) => (
              <article key={state} className="state-card">
                <p>{state}</p>
                <div className="state-preview" />
              </article>
            ))}
          </section>
        </Tabs.Content>

        <Tabs.Content value="tokens" className="tabs-panel">
          <section className="token-list">
            {[
              ["Radius", "0.75rem"],
              ["Shadow", "0 1px 2px rgba(0,0,0,0.06)"],
              ["Border", "hsl(214 32% 91%)"],
              ["Foreground", "hsl(222 47% 11%)"]
            ].map(([name, value]) => (
              <article key={name} className="token-row">
                <span>{name}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </main>
  );
}
```

```styles.css
:root {
  color-scheme: light;
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  --background: #f8fafc;
  --foreground: #111827;
  --muted: #f1f5f9;
  --muted-foreground: #6b7280;
  --border: #e2e8f0;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top, rgba(125, 211, 252, 0.18), transparent 28%),
    linear-gradient(180deg, #f8fafc, #eff6ff);
  color: var(--foreground);
}

.page {
  display: grid;
  place-items: center;
  padding: 24px;
}

.shell {
  width: min(100%, 620px);
  border: 1px solid var(--border);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  padding: 22px;
}

.shell-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 18px;
}

.shell-header p {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.shell-header h1 {
  margin: 0;
  font-size: 30px;
}

.tabs-list {
  display: inline-flex;
  gap: 8px;
  padding: 4px;
  border-radius: 12px;
  background: var(--muted);
}

.tab-trigger {
  border: none;
  border-radius: 10px;
  background: transparent;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted-foreground);
  cursor: pointer;
}

.tab-trigger[data-state="active"] {
  background: white;
  color: var(--foreground);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.tabs-panel {
  margin-top: 18px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  display: grid;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 16px;
  background: white;
}

.metric-card span {
  color: var(--muted-foreground);
  font-size: 13px;
}

.metric-card strong {
  font-size: 26px;
}

.canvas-card,
.state-card,
.token-row {
  border: 1px solid var(--border);
  border-radius: 18px;
  background: white;
}

.canvas-card {
  padding: 16px;
}

.canvas-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 90px;
  gap: 12px;
}

.canvas-box {
  border-radius: 16px;
  background: linear-gradient(135deg, #dbeafe, #e0e7ff);
}

.canvas-box--large {
  grid-row: span 2;
}

.canvas-box--wide {
  grid-column: span 2;
}

.state-list {
  display: grid;
  gap: 12px;
}

.state-card {
  padding: 14px;
}

.state-card p {
  margin: 0 0 12px;
  font-weight: 600;
}

.state-preview {
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
}

.token-list {
  display: grid;
  gap: 10px;
}

.token-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
}

.token-row span {
  color: var(--muted-foreground);
}
```
````

:::

::: note {"id":"command","at":{"x":-508,"y":426,"w":569},"style":{"bg":{"color":"#00000000"}}}
````sandpack
{
  "template": "react",
  "dependencies": {
    "lucide-react": "^0.511.0"
  }
}

```App.js
import { FileCode2, LayoutTemplate, Search, Sparkles, TerminalSquare } from "lucide-react";
import "./styles.css";

const commands = [
  {
    id: "canvas",
    label: "Open canvas examples",
    shortcut: "G C",
    icon: LayoutTemplate
  },
  {
    id: "sandpack",
    label: "Insert sandpack note",
    shortcut: "N S",
    icon: FileCode2
  },
  {
    id: "prompt",
    label: "Generate UI prompt",
    shortcut: "A I",
    icon: Sparkles
  },
  {
    id: "terminal",
    label: "Open terminal log",
    shortcut: "T L",
    icon: TerminalSquare
  }
];

export default function App() {
  return (
    <main className="page">
      <section className="palette">
        <header className="search-row">
          <Search size={18} />
          <input readOnly value="Search commands, notes, and examples..." />
        </header>
        <div className="group-label">Quick actions</div>
        <div className="command-list">
          {commands.map((command, index) => {
            const Icon = command.icon;

            return (
              <button
                key={command.id}
                className={`command-item ${index === 0 ? "command-item--active" : ""}`}
              >
                <span className="command-left">
                  <span className="command-icon">
                    <Icon size={16} />
                  </span>
                  <span>{command.label}</span>
                </span>
                <kbd>{command.shortcut}</kbd>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
```

```styles.css
:root {
  color-scheme: light;
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  --background: #f8fafc;
  --foreground: #111827;
  --muted: #f1f5f9;
  --muted-foreground: #6b7280;
  --border: #e2e8f0;
}

body {
  margin: 0;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  color: var(--foreground);
}

.page {
  display: grid;
  place-items: center;
  padding: 24px;
}

.palette {
  width: min(100%, 520px);
  border: 1px solid var(--border);
  border-radius: 18px;
  background: white;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.search-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding: 14px 16px;
  color: var(--muted-foreground);
}

.search-row input {
  border: none;
  outline: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 14px;
}

.group-label {
  padding: 12px 16px 8px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.command-list {
  display: grid;
  gap: 4px;
  padding: 0 8px 8px;
}

.command-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  border: none;
  border-radius: 12px;
  padding: 12px;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
}

.command-item--active {
  background: var(--muted);
}

.command-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.command-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #111827;
  color: white;
}

kbd {
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 4px 8px;
  background: white;
  color: var(--muted-foreground);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
```
````
:::

::: note {"id":"dialog","at":{"x":260,"y":420,"w":915,"h":599}}

# Dialog Detail Card

Radix `Dialog`로 만드는 상세 카드 패턴입니다.

````sandpack
{
  "template": "react",
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.14",
    "lucide-react": "^0.511.0"
  }
}

```App.js
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, X } from "lucide-react";
import "./styles.css";

export default function App() {
  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Case study</p>
        <h1>Boardmark Preview Kit</h1>
        <p className="lede">
          A compact component set for showing product concepts directly on a canvas.
        </p>

        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button className="primary-button">
              Open details
              <ArrowUpRight size={16} />
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="overlay" />
            <Dialog.Content className="dialog">
              <div className="dialog-header">
                <div>
                  <Dialog.Title>Release summary</Dialog.Title>
                  <Dialog.Description>
                    Stable primitives for note previews, settings, and component review.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button className="icon-button" aria-label="Close">
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>

              <div className="dialog-grid">
                <article>
                  <span>Focus</span>
                  <strong>Preview continuity</strong>
                </article>
                <article>
                  <span>Support</span>
                  <strong>Buttons, tabs, dialogs</strong>
                </article>
                <article>
                  <span>Review state</span>
                  <strong>Ready for iteration</strong>
                </article>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </section>
    </main>
  );
}
```

```styles.css
:root {
  color-scheme: light;
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  --background: #f8fafc;
  --foreground: #111827;
  --muted-foreground: #6b7280;
  --border: #e5e7eb;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top, rgba(196, 181, 253, 0.24), transparent 28%),
    linear-gradient(180deg, #ffffff, #f8fafc);
  color: var(--foreground);
}

.page {
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: min(100%, 500px);
  border: 1px solid var(--border);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);
  padding: 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 10px;
  font-size: 30px;
}

.lede {
  margin: 0 0 20px;
  color: var(--muted-foreground);
  line-height: 1.6;
}

.primary-button,
.icon-button {
  border: none;
  cursor: pointer;
}

.primary-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  background: #111827;
  color: white;
  padding: 11px 16px;
  font-weight: 600;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
}

.dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(92vw, 520px);
  transform: translate(-50%, -50%);
  border-radius: 20px;
  border: 1px solid var(--border);
  background: white;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
  padding: 20px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.dialog-header h2 {
  margin: 0 0 6px;
  font-size: 24px;
}

.dialog-header p {
  margin: 0;
  color: var(--muted-foreground);
  line-height: 1.6;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #111827;
}

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.dialog-grid article {
  border-radius: 16px;
  background: #f8fafc;
  padding: 14px;
}

.dialog-grid span {
  display: block;
  margin-bottom: 8px;
  color: var(--muted-foreground);
  font-size: 12px;
}

.dialog-grid strong {
  font-size: 15px;
  line-height: 1.5;
}
```
````

:::

::: edge {"id":"overview-buttons","from":"overview","to":"buttons"}
Primitives
:::

::: edge {"id":"buttons-settings","from":"buttons","to":"settings"}
Controls
:::

::: edge {"id":"settings-dashboard","from":"settings","to":"dashboard"}
Workspace shell
:::

::: edge {"id":"buttons-command","from":"buttons","to":"command"}
Power tools
:::

::: edge {"id":"settings-dialog","from":"settings","to":"dialog"}
Modal pattern
:::

::: edge {"id":"dashboard-dialog","from":"dashboard","to":"dialog"}
Detail flow
:::
