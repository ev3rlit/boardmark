# Canvas Format v2 & Parser Redesign

## 1. 목적

이 문서는 `.canvas.md` 파일 포맷을 개선하고, 그에 맞춰 `canvas-parser`를 재설계하는 계획을 정리한다.

### 배경

Boardmark의 핵심 정체성은 **마크다운 파일이 곧 캔버스 데이터**라는 것이다.  
이 포맷의 주요 독자는 두 가지다:

1. **AI 에이전트** — 로컬 파일 시스템을 읽고 텍스트를 생성하는 방식으로 캔버스를 만들고 편집한다.
2. **사람** — AI가 만든 뼈대 위에서 콘텐츠를 자유롭게 편집한다.

현재 포맷은 remark-directive의 인라인 attribute 방식을 사용한다:

```md
::: note #welcome x=80 y=72 w=340 color=yellow
```

이 방식의 한계:
- 모든 attribute 값이 `string` — 타입이 없다 (숫자 `80`을 파서가 직접 파싱해야 한다)
- 중첩 객체, 배열 표현 불가
- 커스텀 정규화 로직(`normalizeDirectiveAttributes`)이 필요하다
- AI가 따라야 할 커스텀 문법 규칙이 있다

이 작업은 이 한계를 해소하고, 확장 가능한 오브젝트 모델을 정의한다.  
experimental 단계이므로 하위 호환은 고려하지 않는다.

---

## 2. 설계 원칙

### 2.1 AI-First, Human-Editable

- 메타데이터는 YAML로 표현한다. AI는 YAML을 타입 안전하게 생성하고, 값의 타입(숫자/문자열/불리언)이 명시적이다.
- 콘텐츠는 마크다운으로 표현한다. 사람이 AI가 만든 뼈대 위에서 자유롭게 편집한다.
- 파일은 사람이 읽을 수 있고 git으로 diff 가능해야 한다.

### 2.2 모든 것은 오브젝트

`note`, `edge`, `group`, 미래의 `image`, `frame` — 모두 동일한 구조를 따른다.  
새 타입을 추가해도 파서의 핵심 구조는 바뀌지 않는다.

### 2.3 플랫 구조, 참조로 계층 표현

파일은 오브젝트의 플랫한 목록이다. 포함 관계는 `parent` attribute로 표현한다.  
중첩 `:::` 문법을 사용하지 않는다.

---

## 3. 포맷 명세

### 3.1 파일 구조

```
[파일 레벨 frontmatter]
[오브젝트 블록 목록]
```

### 3.2 파일 레벨 frontmatter

기존과 동일한 YAML frontmatter를 유지한다.

```md
---
type: canvas
version: 1
viewport:
  x: -180
  y: -120
  zoom: 0.92
---
```

### 3.3 오브젝트 블록 구조

모든 오브젝트는 아래 구조를 따른다:

```
::: <type>
<YAML 메타데이터>
---

<Markdown 콘텐츠>

:::
```

- `---` 위: YAML 메타데이터 (파서가 타입 있는 값으로 파싱)
- `---` 아래: 마크다운 콘텐츠 (사람이 자유롭게 편집)
- 콘텐츠가 없는 오브젝트는 `---`를 생략한다

#### 콘텐츠 없는 오브젝트 (edge)

```md
::: edge
id: welcome-overview
from: welcome
to: overview
kind: curve
:::
```

#### 콘텐츠 있는 오브젝트 (note)

```md
::: note
id: welcome
x: 80
y: 72
w: 340
color: yellow
---

# Boardmark Viewer

Open a `.canvas.md` file or start from this bundled example board.

- `New File` saves a fresh board to disk
- `Open File` lives in the file menu

:::
```

### 3.4 그룹과 포함 관계

`group`은 별도의 오브젝트 타입이다. 포함 관계는 자식이 `parent` attribute로 표현한다.

```md
::: group
id: pipeline
x: 100
y: 100
w: 600
h: 400
color: blue
---

## AI 파이프라인

데이터 처리 단계를 묶는 그룹.

:::

::: note
id: ingest
parent: pipeline
x: 20
y: 80
---

# Ingest

:::
```

- 자식 오브젝트의 `x`, `y`는 **parent 기준 상대 좌표**다.
- `parent` attribute가 없으면 캔버스 루트 기준 절대 좌표다.
- `parent`가 지정한 오브젝트가 존재하지 않으면 파서가 warning을 발행하고 루트로 처리한다.

---

## 4. 도메인 모델 변경

`packages/canvas-domain/src/index.ts`에만 영향을 준다.

### 4.1 CanvasNode

```ts
// 변경 전
type CanvasNode = {
  id: string
  type: 'note'          // ← 고정값
  x: number
  y: number
  w?: number
  color?: CanvasNodeColor
  content: string       // ← 항상 string
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

// 변경 후
type CanvasNode = {
  id: string
  kind: 'note' | 'group'   // ← type → kind, group 추가
  x: number
  y: number
  w?: number
  h?: number               // ← 신규 (group에서 사용)
  color?: CanvasNodeColor
  parent?: string          // ← 신규 (포함 관계)
  content?: string         // ← optional로 변경
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}
```

### 4.2 CanvasEdge

구조 변경 없음. `kind` 필드명 충돌을 피하기 위해 edge의 종류 필드를 `edgeKind`로 변경한다.

```ts
// 변경 전
type CanvasEdge = {
  id: string
  from: string
  to: string
  kind?: CanvasEdgeKind   // ← curve | straight
  content?: string
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}

// 변경 후
type CanvasEdge = {
  id: string
  from: string
  to: string
  edgeKind?: CanvasEdgeKind  // ← kind → edgeKind
  content?: string
  position: CanvasSourceRange
  sourceMap: CanvasDirectiveSourceMap
}
```

---

## 5. 레이어 분리 검토

현재 의존성 방향:

```
canvas-domain
    ↑
canvas-parser ──────────────────────────────── 이 작업의 주 변경 대상
    ↑
canvas-repository ──────────────────────────── 변경 없음
    ↑
canvas-app ───────────────────────────────── 변경 없음
    ↑
apps/desktop, apps/web ─────────────────────── 변경 없음
```

```
canvas-domain
    ↑
canvas-renderer ────────────────────────────── 도메인 타입 변경에 따라 소폭 수정
```

### 파서 변경이 상위 레이어에 미치는 영향

`canvas-repository`는 `parseCanvasDocument(source)`를 호출하고 `CanvasAST`를 받는다.  
파서 내부 구현이 어떻게 바뀌든 이 인터페이스가 유지되면 상위 레이어는 바뀌지 않는다.

**`canvas-repository`는 변경이 없다.** 레이어 분리가 올바르게 작동하는 지점이다.

### 도메인 타입 변경이 renderer에 미치는 영향

`canvas-renderer`의 `toFlowNode`는 `CanvasNode`를 직접 읽는다.  
`type: 'note'` → `kind: 'note' | 'group'` 변경으로 인해 아래가 필요하다:

- `kind: 'group'` 노드를 React Flow `type: 'canvas-group'`으로 매핑
- `parent` 필드를 React Flow `parentId`로 전달

이것은 포맷 변경의 필연적 결과이며, renderer 변경 범위는 `toFlowNode` 함수 하나다.

### 결론

레이어 분리는 충분하다. 이번 작업에서 변경이 필요한 파일은 아래로 국한된다.

---

## 6. 구현 계획

### Phase 1: 도메인 타입 변경

**변경 파일: `packages/canvas-domain/src/index.ts`**

- `CanvasNode.type` → `CanvasNode.kind: 'note' | 'group'`
- `CanvasNode.h?: number` 추가
- `CanvasNode.parent?: string` 추가
- `CanvasNode.content` → `content?: string` (optional)
- `CanvasEdge.kind` → `CanvasEdge.edgeKind`
- `CANVAS_NODE_KINDS` 상수 추가 (`['note', 'group']`)

이 단계 완료 후 타입 오류가 발생하는 파일을 확인한다. 파서와 renderer만 오류가 나야 한다.

---

### Phase 2: 파서 재작성

**변경 파일: `packages/canvas-parser/src/index.ts`**

remark/unified 의존성을 제거하고 직접 파싱한다.

새 파싱 파이프라인:

```
parseCanvasDocument(source)
  │
  ├─ splitFrontmatter(source)
  │    └─ YAML frontmatter 추출 → CanvasFrontmatter
  │
  ├─ splitObjectBlocks(body)
  │    └─ ::: 경계 기준으로 블록 목록 추출
  │       각 블록은 { type, rawBody, startLine, endLine } 보존
  │
  └─ parseObjectBlock(block) × N
       ├─ type === 'edge' → parseEdgeBlock()
       └─ type === 'note' | 'group' → parseNodeBlock()
            ├─ splitYamlAndContent(rawBody)
            │    └─ '---' 기준으로 yamlSection / markdownSection 분리
            ├─ parseYaml(yamlSection)   ← js-yaml 사용, 타입 있는 값
            └─ buildSourceMap()         ← objectRange, openingLine, bodyRange, closingLine
```

블록 분리 규칙:
- `^:::\s+(\w[\w-]*)` 로 시작하는 줄 → 블록 열림, 타입 이름 추출
- `^:::$` 줄 → 블록 닫힘
- 코드 펜스(` ``` ` / `~~~`) 내부의 `:::` 는 무시

`---` 구분자 규칙:
- 블록 바디에서 처음 등장하는 `^---$` 줄이 구분자
- 구분자 없으면 전체가 YAML 섹션, 콘텐츠 없음
- 구분자 이후가 마크다운 콘텐츠

**의존성 변경:**
- `remark-directive`, `remark-parse`, `unified`, `mdast-util-to-markdown`, `unist-util-visit` 제거
- `js-yaml` 추가

**변경 파일: `packages/canvas-parser/src/index.test.ts`**

기존 테스트를 새 포맷으로 전면 재작성한다.

---

### Phase 3: renderer 수정

**변경 파일: `packages/canvas-renderer/src/index.ts`**

`toFlowNode` 함수만 수정한다:

```ts
// 변경 전
export function toFlowNode(node: CanvasNode): Node<CanvasFlowNodeData> {
  return {
    id: node.id,
    type: 'canvas-note',   // ← 고정
    ...
  }
}

// 변경 후
export function toFlowNode(node: CanvasNode): Node<CanvasFlowNodeData> {
  return {
    id: node.id,
    type: node.kind === 'group' ? 'canvas-group' : 'canvas-note',
    parentId: node.parent,   // ← React Flow parent-child
    ...
  }
}
```

---

### Phase 4: fixture 및 template 업데이트

**변경 파일:**
- `fixtures/default-template.canvas.md` — 새 포맷으로 재작성

---

## 7. 변경 파일 요약

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `packages/canvas-domain/src/index.ts` | 타입 수정 | `kind`, `parent`, `h`, `edgeKind` 변경 |
| `packages/canvas-parser/src/index.ts` | 전면 재작성 | 새 파싱 파이프라인 |
| `packages/canvas-parser/src/index.test.ts` | 전면 재작성 | 새 포맷 기준 테스트 |
| `packages/canvas-renderer/src/index.ts` | 소폭 수정 | `toFlowNode` group/parent 처리 |
| `fixtures/default-template.canvas.md` | 재작성 | 새 포맷으로 변환 |
| `packages/canvas-repository/src/index.ts` | **변경 없음** | 인터페이스 유지 |
| `packages/canvas-app/src/**` | **변경 없음** | repository 경계 위에 있음 |
| `apps/**` | **변경 없음** | canvas-app 경계 위에 있음 |

---

## 8. 테스트 계획

### Unit Tests (`canvas-parser`)

- `:::note\n[yaml]\n:::` — 콘텐츠 없는 노드 파싱
- `:::note\n[yaml]\n---\n[markdown]\n:::` — 콘텐츠 있는 노드 파싱
- `:::group\n[yaml]\n---\n[markdown]\n:::` — 그룹 파싱
- `:::edge\n[yaml]\n:::` — edge 파싱
- YAML 값 타입: `x: 80` → number, `locked: true` → boolean
- `parent` 참조 대상이 존재하는 경우 → 정상 처리
- `parent` 참조 대상이 없는 경우 → warning + 루트로 fallback
- 코드 펜스 내부의 `:::` 무시
- `---` 구분자가 없는 경우 → 전체가 YAML
- 잘못된 YAML → warning + 해당 블록 건너뜀

### Source Map Tests

- 각 오브젝트의 `objectRange`가 실제 source offset/line과 일치하는지
- `openingLineRange`, `bodyRange`, `closingLineRange`가 정확한지
- 다중 오브젝트 문서에서 source map이 독립적으로 정확한지

---

## 9. 범위 제외

- 기존 포맷과의 하위 호환 (experimental 단계이므로 완전 교체)
- canvas-renderer의 group 노드 시각적 렌더링 구현 (renderer 수정은 매핑만)
- YAML 이외의 메타데이터 포맷
- 중첩 `:::` 문법


---

## 10. 수용 기준

- 새 포맷 파일이 파서로 정확히 파싱된다.
- YAML 값이 올바른 타입(number, boolean, string)으로 파싱된다.
- `parent` 참조가 올바르게 처리된다.
- source map이 각 오브젝트의 실제 위치와 일치한다.
- `canvas-repository` 코드에 변경이 없다.
- `canvas-app` 코드에 변경이 없다.
- 모든 unit test와 source map test가 통과한다.
