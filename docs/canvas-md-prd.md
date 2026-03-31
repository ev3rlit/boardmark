# PRD: Boardmark
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-03-31 |
| 상태 | 초안 |
| 작성자 | 버미 |

---

## 1. Overview

### 1.1 Problem Statement

기존 캔버스 앱(Figma, Miro, Obsidian Canvas)은 내부 포맷이 JSON/바이너리로 되어 있어 AI가 직접 생성·수정하기 어렵다. AI가 가장 잘 다루는 포맷은 마크다운이지만, 마크다운은 2D 공간 정보를 표현하는 표준이 없다.

**Boardmark**는 마크다운 확장 문법(`:::` Directive)을 사용해 스티키 노트 기반 캔버스를 `.canvas.md` 단일 파일로 표현하는 AI-native 캔버스 에디터다.

### 1.2 Vision

> "AI가 마크다운을 쓰듯 캔버스를 그린다."

파일 자체가 사람이 읽을 수 있고, AI가 생성할 수 있으며, Git으로 버전 관리되는 캔버스.

### 1.3 Target User

- AI와 함께 아이디어를 시각화하고 싶은 개발자 / 기술 기획자
- 마크다운 기반 노트 툴(Obsidian 등)에 익숙한 사용자
- 캔버스 앱을 코드와 함께 사용하고 싶은 사람

---

## 2. Goals & Non-Goals

### Goals (MVP 범위)

- [x] `.canvas.md` 파일 포맷 정의 및 파서 구현
- [x] 웹/데스크톱 환경에서 `.canvas.md` 파일을 열어 viewer로 렌더링
- [x] 노드(스티키 노트)를 캔버스에 자유 위치로 렌더링
- [x] 노드 내부에 마크다운 + 코드블럭 렌더링
- [x] URL 기반 스타일 팩 / UI 컴포넌트 팩 로딩
- [x] 노드 간 연결선(Edge) 렌더링
- [x] 팬(pan) / 줌(zoom) 가능한 캔버스 viewer 제공

### Non-Goals (MVP 이후)

- 실시간 협업 (CRDT/Yjs)
- 모바일 앱
- 테마 마켓플레이스 / 레지스트리 서버
- 이미지, 임베드 노드 타입
- AI 자동 레이아웃

---

## 3. Core Concepts

### 3.1 파일 포맷: `.canvas.md`

```markdown
---
type: canvas
version: 1
style: https://styles.boardmark.dev/default@1.0.0
components: https://ui.boardmark.dev/sticky-classic@1.0.0
viewport: { x: 0, y: 0, zoom: 1 }
---

::: note #idea-a x=120 y=80 color=yellow
# 핵심 아이디어

AI가 마크다운을 제일 잘 씁니다.

```js
const canvas = new Boardmark()
```
:::

::: note #idea-b x=480 y=200 color=blue
## 연결된 노드

- 항목 1
- 항목 2
:::

::: edge #flow-a from=idea-a to=idea-b kind=curve
핵심 아이디어가 연결된 노드로 이어진다
:::
```

### 3.2 노드 문법

```
::: {type} #{id} {key=value ...}
{마크다운 내용}
:::
```

| 필드 | 설명 | 예시 |
|------|------|------|
| type | 노드 타입 | `note`, `code` |
| id | 고유 식별자 | `#idea-a` |
| x, y | 캔버스 절대 위치 (px) | `x=120 y=80` |
| w | 노드 너비 (기본: 320px) | `w=400` |
| color | 추상 색상 토큰 | `yellow`, `blue`, `pink` |

### 3.3 엣지 문법

```
::: edge #{id} from={node-id} to={node-id} {key=value ...}
{엣지 라벨용 마크다운}
:::
```

| 필드 | 설명 | 예시 |
|------|------|------|
| id | 엣지 고유 식별자 | `#flow-a` |
| from | 시작 노드 id | `from=idea-a` |
| to | 도착 노드 id | `to=idea-b` |
| kind | 엣지 렌더 타입 | `kind=curve` |
| content | 엣지 라벨용 마크다운 | `핵심 흐름` |

### 3.4 팩 시스템

```
style pack     → CSS variables (색상, 폰트, 간격 토큰)
component pack → 노드 타입별 React 컴포넌트
preset         → style + component 의 검증된 조합
```

```markdown
# 개별 선언
style: https://styles.boardmark.dev/notion-dark@1.0.0
components: https://ui.boardmark.dev/sticky-classic@1.0.0

# 프리셋으로 묶음
preset: https://presets.boardmark.dev/notion-dark@1.0.0
```

---

## 4. User Stories

### 핵심 스토리 (MVP 필수)

```
AS  개발자
I WANT  .canvas.md 파일을 열면 캔버스로 렌더링되는 것을
SO THAT 마크다운 파일 하나로 아이디어를 시각화할 수 있다

AS  사용자
I WANT  웹과 데스크톱 앱에서 같은 `.canvas.md` 파일이 동일하게 보이는 것을
SO THAT 사용 환경에 상관없이 같은 캔버스 경험을 얻을 수 있다

AS  처음 사용하는 사용자
I WANT  앱을 실행하면 바로 예시 캔버스가 보이고 새 파일 만들기와 파일 열기 선택지가 보이는 것을
SO THAT 별도 준비 없이 바로 제품을 이해하고 사용해볼 수 있다

AS  사용자
I WANT  캔버스를 팬/줌하며 노드와 연결선을 탐색할 수 있는 것을
SO THAT 큰 보드를 읽고 구조를 빠르게 이해할 수 있다

AS  사용자
I WANT  하단의 간단한 도구 메뉴와 우측 하단 줌 컨트롤로 캔버스를 조작할 수 있는 것을
SO THAT 복잡한 UI 없이도 기본 탐색 모드를 바로 이해할 수 있다

AS  사용자
I WANT  엣지를 별도 블록으로 정의하고 라벨을 마크다운으로 적을 수 있는 것을
SO THAT 연결 관계 자체에 설명과 맥락을 담을 수 있다

AS  사용자
I WANT  URL 한 줄로 테마(스타일 + 컴포넌트)를 바꿀 수 있는 것을
SO THAT 같은 내용을 다른 시각적 스타일로 표현할 수 있다
```

---

## 5. Functional Requirements

### 5.1 파서 (remark 기반)

- `remark-directive` 플러그인으로 `:::` 블럭 파싱
- Frontmatter 파싱 (type, version, style, components, viewport)
- 잘못된 노드/엣지는 해당 오브젝트만 제외하고 나머지는 계속 파싱
- 제외된 오브젝트와 실패 이유는 parse issue로 수집
- 파싱 결과: `CanvasAST` + `CanvasParseIssue[]` 반환

### 5.2 캔버스 렌더러

- 노드를 `absolute position`으로 배치
- 노드 레이어는 HTML/React 컴포넌트로 렌더링
- 엣지 레이어는 SVG overlay로 렌더링
- 패닝(pan) / 줌(zoom) 지원
- 노드 선택, 다중 선택
- 별도 `edge` directive 기반 엣지(SVG 베지어 곡선) 렌더링
- 엣지 라벨은 마크다운 텍스트로 렌더링
- 하단 중앙 floating tool menu에 `선택` / `Pan` 버튼 배치
- 우측 하단에 zoom in / zoom out 컨트롤 배치

### 5.3 파일 로딩 및 뷰 상태

- 앱 실행 시 기본 템플릿 캔버스를 즉시 로드
- 시작 화면에서 새 파일 만들기 / 파일 열기 액션 제공
- 새 파일 만들기 시 템플릿 기반 `.canvas.md` 파일 생성 후 바로 로드
- 데스크톱 앱(Electron)에서 기존 `.canvas.md` 파일 열기
- 좌측 상단 file menu에 `파일 열기` / `저장` 액션 배치
- 파일 내용 로드 후 파서 결과를 상태 저장소에 반영
- 현재 viewport, 선택 상태, tool mode, 로드 에러, parse issue를 viewer 상태로 관리

### 5.4 노드 내부 마크다운 렌더링

- `react-markdown` + `rehype-highlight`로 코드 하이라이팅
- 헤딩, 리스트, 링크, 인라인 코드 렌더링
- `:::` 안의 ` ``` ` 코드블럭 충돌 없이 파싱

### 5.5 팩 로딩

- Frontmatter의 URL fetch → JSON 메타데이터 파싱
- CSS variables 주입 (style pack)
- 컴포넌트 팩 로딩은 MVP에서 로컬 또는 제한된 범위로 우선 지원
- 로컬 캐시 (`localStorage`) + 오프라인 fallback

---

## 6. Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Boardmark App                    │
│                                                     │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │ Electron Shell  │    │       캔버스 뷰          │ │
│  │ File Open / IPC │    │ DOM Nodes + SVG Edges   │ │
│  └────────┬────────┘    └────────────┬────────────┘ │
│           │                          │              │
│           ▼                          ▼              │
│  ┌─────────────────────────────────────────────────┐│
│  │              Canvas Store (Zustand)             ││
│  │   nodes / edges / viewport / viewer state      ││
│  └──────────────────────┬──────────────────────────┘│
│                         │                           │
│                         ▼                           │
│              ┌──────────────────────┐              │
│              │    unified Parser    │              │
│              │ + remark-directive   │              │
│              └──────────────────────┘              │
│                         │                           │
│       ┌─────────────────┴──────────────────┐        │
│       ▼                                    ▼        │
│  ┌───────────────┐                  ┌─────────────┐ │
│  │   Node Layer  │                  │  Edge Layer │ │
│  │ HTML / React  │                  │ SVG Overlay │ │
│  └───────────────┘                  └─────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │             Pack Loader                         ││
│  │   style URL → CSS vars / component URL → JS    ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| 레이어 | 선택 | 이유 |
|--------|------|------|
| 앱 셸 | Electron | 데스크톱 런처, 새 파일 생성, 파일 열기, 저장, 로컬 앱 배포 |
| 프론트엔드 | React | 캔버스 UI와 렌더링 생태계 |
| 상태관리 | Zustand | 단순, 경량 |
| 파서 | unified + remark-parse + remark-directive | `:::` 문법 기반 AST 파싱 |
| 마크다운 렌더 | react-markdown + rehype-highlight | 노드 내부 markdown/code block 렌더링 |
| 캔버스 뷰 | DOM nodes + SVG edge overlay | rich markdown 노드와 유연한 엣지 렌더링 분리 |
| 스타일 | Tailwind CSS + CSS variables | 앱 UI와 runtime style pack 분리 |
| 로깅 | pino | 개발/런타임 로그 구조화 |
| 에러 처리 | neverthrow + 명시적 에러 핸들링 | 파싱/파일/IPC 경계에서 Result 기반 실패 표현 |
| 단위 테스트 | Vitest | 파서, 렌더러, UI 상태를 검증하는 빠른 TS 단위 테스트 |

> 편집기(`CodeMirror`)와 정밀 텍스트 패치(`MagicString`)는 viewer MVP 이후 단계에서 재검토한다.

---

## 7. MVP Scope (Phase 1)

### In Scope

| 기능 | 우선순위 |
|------|---------|
| `.canvas.md` 파서 | P0 |
| 웹/데스크톱 공용 viewer 앱 셸 | P0 |
| 노드 캔버스 렌더링 (absolute position) | P0 |
| 노드 내 마크다운 + 코드블럭 렌더링 | P0 |
| 앱 시작 시 기본 템플릿 캔버스 표시 | P0 |
| 새 파일 만들기 | P0 |
| 기존 파일 열기 | P0 |
| 파일 저장 | P0 |
| 팬 / 줌 | P1 |
| 엣지(연결선) 렌더링 | P1 |
| 엣지 라벨 마크다운 렌더링 | P1 |
| 하단 floating tool menu | P1 |
| 우측 하단 zoom control | P1 |
| URL 기반 스타일 팩 로딩 | P1 |
| URL 기반 컴포넌트 팩 로딩 | P2 |
| 노드 선택 / 하이라이트 | P2 |

### Out of Scope (Phase 1)

- 협업, 공유
- 이미지/임베드 노드
- 그룹 노드
- AI 자동 레이아웃
- 테마 레지스트리 서버
- 양방향 편집
- 노드 드래그 기반 파일 수정
- 내장 텍스트 에디터
- E2E 테스트 코드

---

## 8. File Format Spec (v1)

```typescript
interface CanvasAST {
  frontmatter: CanvasFrontmatter
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

interface CanvasParseIssue {
  level: 'warning' | 'error'
  kind: 'invalid-node' | 'invalid-edge' | 'unsupported-node-type' | 'invalid-frontmatter'
  message: string
  line?: number
  objectId?: string
}

// Frontmatter
interface CanvasFrontmatter {
  type: 'canvas'
  version: number
  style?: string        // URL
  components?: string   // URL
  preset?: string       // URL (style + components 묶음)
  viewport?: {
    x: number
    y: number
    zoom: number
  }
}

// 노드 (파싱 결과)
interface CanvasNode {
  id: string
  type: 'note' | 'code'
  x: number
  y: number
  w?: number
  color?: 'yellow' | 'blue' | 'pink' | 'green' | 'purple' | 'default'
  content: string       // 내부 마크다운 원문
  position: {
    start: { offset: number; line: number }
    end:   { offset: number; line: number }
  }
}

interface CanvasEdge {
  id: string
  from: string
  to: string
  kind?: 'curve' | 'straight'
  content?: string      // 엣지 라벨용 마크다운 원문
  position: {
    start: { offset: number; line: number }
    end:   { offset: number; line: number }
  }
}
```

---

## 9. Success Metrics (MVP)

| 지표 | 목표 |
|------|------|
| 앱 실행 → 첫 캔버스 표시 시간 | < 500ms |
| 파일 열기 → 렌더링 시간 | < 200ms |
| 파일 열기 → 첫 캔버스 표시 시간 | < 500ms |
| 팬/줌 상호작용 반응 시간 | < 16ms/frame 목표 |
| 코드블럭 포함 파일 파싱 오류율 | 0% |
| 단일 오브젝트 파싱 실패 시 앱 크래시 | 0건 |

---

## 10. Open Questions

- [ ] 노드 너비/높이가 `auto`일 때 위치 계산 기준은?
- [ ] 컴포넌트 팩 포맷: React 컴포넌트 vs Web Components 중 무엇이 배포하기 유리한가?
- [ ] Electron 환경에서 원격 component pack 로딩 범위를 어디까지 허용할 것인가?
- [ ] `:::code` 타입을 별도로 둘 것인가, `:::note lang=ts`로 통합할 것인가?
- [ ] 엣지 라벨의 배치 기준은 midpoint 고정으로 충분한가, 수동 오프셋이 필요한가?
- [ ] 스타일 팩 미로딩 시 fallback 기본 테마는 어떻게 번들할 것인가?

---

## Appendix A. 관련 기술 레퍼런스

- [Markdown Directive Spec](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [unified](https://unifiedjs.com/)
- [Electron](https://www.electronjs.org/)
- [Vitest](https://vitest.dev/)
- Markmap, D2, SvgBob — 유사 마크다운 시각화 레퍼런스
