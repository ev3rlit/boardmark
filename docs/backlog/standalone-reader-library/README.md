# boardmark-reader 독립 라이브러리 기술 구현 명세

## 개요

`boardmark-reader`는 `.canvas.md`(캔버스 방식)와 일반 `.md`(상하 구조 선형 읽기 방식) 모두를 단일 API로 처리하는 독립 라이브러리다.

Boardmark 앱 내부(Electron, Zustand, React Flow, canvas-app)에 대한 의존 없이, 블로그·문서 사이트·Next.js 앱 등 어디서든 import 해서 쓸 수 있는 형태를 목표로 한다.

**라이브러리 책임 범위: 렌더링만.** 파싱은 소비자가 담당하거나 별도 선택적 패키지(`boardmark-parser`)를 사용한다.

---

## 핵심 아이디어

라이브러리는 파싱된 데이터 구조(`CanvasDocument`)를 입력으로 받아 렌더링만 수행한다. 소비자는 데이터를 어떻게 만들지 자유롭게 선택할 수 있다.

```
source (string)
     │
     ▼  ← 소비자 영역 (boardmark-parser 또는 직접 구현)
parseCanvasDocument()
     │
     ▼
CanvasDocument  ──── mode: canvas? ────┬── No  → LinearView (react-markdown)
                                       └── Yes → CanvasView (absolute layout)
     ▲
     │
  boardmark-reader-react 입력 경계
```

---

## 패키지 구조

```
packages/
  boardmark-types/             ← 공유 타입만. 의존성 없음
    src/
      canvas-document.ts       ← CanvasDocument, CanvasNode, CanvasEdge 타입
      index.ts
    package.json

  boardmark-parser/            ← 선택적. .canvas.md → CanvasDocument 변환
    src/
      parse.ts                 ← canvas-parser 로직 추출 (js-yaml만 의존)
      linearize.ts             ← CanvasDocument → 소스 순서 노드 배열 변환
      index.ts
    package.json

  boardmark-reader-react/      ← 렌더러. boardmark-types만 의존
    src/
      BoardmarkView.tsx        ← 메인 컴포넌트 (mode 분기)
      CanvasView.tsx           ← 캔버스 모드 (CSS absolute + SVG edges)
      LinearView.tsx           ← 선형 모드 (react-markdown)
      index.ts
    package.json
```

---

## 의존성 설계

| 패키지 | 의존성 |
|---|---|
| `boardmark-types` | 없음 |
| `boardmark-parser` | `boardmark-types`, `js-yaml`, `neverthrow` |
| `boardmark-reader-react` | `boardmark-types`, `react`, `react-dom`, `react-markdown`, `remark-gfm` |

`boardmark-reader-react`는 `boardmark-parser`를 의존하지 않는다. 파싱 방법은 소비자가 결정한다.

**제거 항목 및 이유:**

- **React Flow**: 캔버스 모드는 CSS `position: absolute` + SVG path로 자체 구현. 외부 소비자에게 무거운 의존성을 강요하지 않는다.
- **Zustand**: 독립 라이브러리에 외부 상태 관리자 불필요. 필요한 상태는 컴포넌트 내부 `useState`로 관리한다.
- **Electron / IPC**: 브라우저, Node.js 서버 어디서든 동작해야 한다.
- **canvas-app / canvas-repository**: 파일 I/O, 저장, 편집 기능은 포함하지 않는다.

---

## 공개 API

### 타입 (boardmark-types)

```ts
import type { CanvasDocument, CanvasNode, CanvasEdge } from 'boardmark-types'

interface CanvasDocument {
  mode: 'canvas' | 'linear'
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

interface CanvasNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  component: string   // 'note' | 'image' | ...
  body: string        // markdown 본문
}

interface CanvasEdge {
  id: string
  source: string
  target: string
}
```

### React 어댑터 (boardmark-reader-react)

```ts
import { BoardmarkView } from 'boardmark-reader-react'

<BoardmarkView
  document={canvasDocument}      // 필수: CanvasDocument
  className?: string
  onError?: (err: Error) => void
/>
```

소비자가 `mode: 'linear'`로 설정한 `CanvasDocument`를 넘기면 선형 모드로 렌더된다.

### 파서 (boardmark-parser, 선택적)

```ts
import { parse, linearize } from 'boardmark-parser'

const document = parse(markdownString)
// → CanvasDocument (mode는 frontmatter.type === 'canvas' 여부로 결정)

const nodes = linearize(document)
// → 소스 순서 노드 배열 (CanvasNode[])
```

파서가 필요 없는 소비자(서버사이드 전처리, 커스텀 파서 등)는 `boardmark-parser`를 설치하지 않아도 된다.

---

## 소비자 사용 예시

### boardmark-parser를 쓰는 경우

```ts
import { parse } from 'boardmark-parser'
import { BoardmarkView } from 'boardmark-reader-react'

const document = parse(markdownString)

<BoardmarkView document={document} />
```

### 직접 데이터를 구성하는 경우

```ts
import type { CanvasDocument } from 'boardmark-types'
import { BoardmarkView } from 'boardmark-reader-react'

const document: CanvasDocument = {
  mode: 'canvas',
  nodes: [...],
  edges: [...],
}

<BoardmarkView document={document} />
```

---

## 모드별 렌더링 규칙

### 선형 모드 (mode: 'linear')

- 노드를 소스 파일 등장 순서(`sourceMap.objectRange.start.line` 오름차순)로 정렬 (`boardmark-parser`가 처리)
- 각 노드의 `body`를 `react-markdown`으로 렌더
- edge는 렌더하지 않음 (관계선은 선형 읽기에서 의미 없음)
- `component`가 `note` 이외인 노드는 `body`만 표시하거나 스킵

### 캔버스 모드 (mode: 'canvas')

- 외부 컨테이너: `position: relative; overflow: hidden`
- 각 노드: `position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px`
- 엣지: SVG overlay (z-index 낮음), 노드 중심점 직선 연결 (MVP)
- pan/zoom: CSS `transform: translate(x, y) scale(z)` + wheel/drag 이벤트

---

## 검증 방법

1. `pnpm -F boardmark-parser test` — parse + linearize 단위 테스트
2. `pnpm -F boardmark-reader-react test` — CanvasDocument를 받아 렌더되는지 확인
3. `mode: 'canvas'` 문서를 넘겼을 때 캔버스 모드로 렌더 확인
4. `mode: 'linear'` 문서를 넘겼을 때 선형 모드로 렌더 확인
5. `boardmark-parser` 없이 직접 구성한 `CanvasDocument`로 렌더 가능한지 확인
6. `nodes`가 빈 배열이거나 `edges`가 없을 때 에러 없이 렌더 확인

---

## 구현 시 주의사항

- `boardmark-reader-react`는 `boardmark-parser`를 import하지 않는다. 파싱 로직이 렌더러에 섞이지 않도록 한다.
- `CanvasDocument` 타입은 `boardmark-types`에서만 정의한다. 렌더러와 파서가 같은 타입을 공유한다.
- `CanvasView.tsx`의 pan/zoom 구현은 pointer events API 기반으로 터치/마우스 통합 처리한다.
- `onError` prop을 통해 렌더 실패를 소비자에게 위임한다. 라이브러리 내부에서 콘솔 출력이나 silent fallback을 쓰지 않는다.
- `boardmark-parser`의 `parse.ts` 로직은 현재 `packages/canvas-parser`에서 추출한다. 추출 시 `js-yaml` 외 앱 내부 의존을 모두 제거한다.
