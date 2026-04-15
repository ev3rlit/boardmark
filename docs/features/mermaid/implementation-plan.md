# Mermaid Markdown Support 구현 계획

## 1. 목적

이 문서는 `docs/features/mermaid/README.md`의 요구사항을 현재 Boardmark 구조에 맞춰 실제 구현 작업으로 풀어낸다.

이번 작업의 목표는 **공용 markdown preview 경계에서 ` ```mermaid ` fenced block을 안정적으로 SVG diagram으로 렌더링하는 것**이다.

첫 단계는 “빠르게 보이게 만들기”가 아니라 아래를 같이 충족해야 한다.

- web / desktop 공통 동작
- 기존 markdown / code highlight 경로 보존
- 보안 경계 유지
- 실패 시 진단 가능한 fallback
- 일반 문서 성능 회귀 최소화

---

## 2. 현재 구조 요약

현재 Mermaid 도입에 직접 관련된 경계는 아래와 같다.

- `packages/ui/src/components/markdown-content.tsx`
  - `ReactMarkdown`에 `remark-gfm`, `rehype-highlight`를 연결한 공용 markdown renderer
- `packages/ui/src/components/markdown-content.test.tsx`
  - markdown 지원 문법에 대한 현재 단위 테스트
- `packages/canvas-app/src/components/scene/canvas-scene.tsx`
  - note preview와 edge label preview가 `MarkdownContent`를 사용
- `packages/canvas-renderer/src/builtins/note/sticky-note-renderer.tsx`
  - built-in note renderer가 `MarkdownContent`를 사용
- `packages/canvas-renderer/src/builtins/note/notebook-note-renderer.tsx`
  - 다른 built-in note renderer도 같은 경로를 사용
- `packages/canvas-domain/src/index.ts`
  - frontmatter 타입 정의. 첫 단계에서는 변경 없이 가는 편이 단순함

핵심 의미는 아래다.

- Mermaid 지원을 `MarkdownContent` 안에 제대로 넣으면 note, edge, built-in renderer 대부분이 함께 개선된다.
- parser와 edit-service를 건드리지 않아도 첫 버전 기능 가치를 전달할 수 있다.

---

## 3. 구현 원칙

### 3.1 Parser-First가 아니라 Renderer-First

- Mermaid source는 기존 markdown body text 그대로 저장한다.
- parser는 Mermaid를 특별 취급하지 않는다.
- 렌더러만 `mermaid` fenced code block을 해석한다.

이 선택이 맞는 이유:

- source schema를 건드리지 않는다.
- source patch, object source map, bi-editing 계약을 건드리지 않는다.
- 기존 `.canvas.md`와 완전 호환된다.

### 3.2 Shared Boundary 유지

- Mermaid detection과 render는 `MarkdownContent`에서만 시작한다.
- note renderer, edge renderer, scene preview가 따로 Mermaid를 해석하면 안 된다.

### 3.3 보안 설정 중앙화

- Mermaid init 옵션은 하나의 중앙 모듈에서만 가진다.
- 각 컴포넌트가 자체적으로 `mermaid.initialize()`를 호출하지 않는다.
- unsafe option override를 열어두지 않는다.

### 3.4 실패를 숨기지 않기

- parse/render 에러는 diagram block 단위에서 UI로 드러낸다.
- 빈 영역 fallback이나 조용한 plain text 강등은 사용하지 않는다.

### 3.5 일반 문서 성능 보호

- Mermaid block이 없는 markdown에서는 Mermaid 런타임을 로드하지 않는다.
- Mermaid 런타임 로드는 dynamic import + module-level cache로 처리한다.

---

## 4. 제안 구조

```text
packages/ui/src/
  components/
    markdown-content.tsx
    markdown-content.test.tsx
    mermaid-diagram.tsx
    mermaid-diagram.test.tsx
  lib/
    mermaid-renderer.ts
```

### 4.1 `markdown-content.tsx`

책임:

- 일반 markdown tree 렌더링 유지
- fenced code block이 `mermaid`인지 판별
- `mermaid`면 `MermaidDiagram`으로 위임
- 그 외 code block은 기존 highlight 경로 유지

구현 방향:

- `ReactMarkdown`의 `components.code` override를 추가한다.
- `inline` code는 현재처럼 plain inline code로 렌더한다.
- block code는 `className`에서 language를 읽고 `mermaid`일 때만 특수 처리한다.

### 4.2 `mermaid-diagram.tsx`

책임:

- Mermaid source를 받아 비동기로 SVG를 생성
- loading / success / error 상태 관리
- 안전한 wrapper와 접근성 속성 제공
- 넓은 diagram overflow 처리

상태 모델 제안:

- `idle`
- `loading`
- `ready`
- `error`

출력 규칙:

- `ready`: SVG diagram 표시
- `loading`: skeleton 또는 최소 placeholder 표시
- `error`: 에러 메시지 + source fallback 표시

### 4.3 `mermaid-renderer.ts`

책임:

- `mermaid` 패키지 lazy import
- singleton initialization
- diagram id 생성과 render 호출
- 중앙 옵션 관리

권장 API 예시:

```ts
type MermaidRenderResult = {
  svg: string
}

export async function renderMermaidDiagram(source: string, id: string): Promise<MermaidRenderResult>
```

중앙 옵션에서 고정할 항목:

- `startOnLoad: false`
- 보수적 `securityLevel`
- 단일 기본 theme
- 필요 시 `fontFamily` 등 최소 시각 옵션

---

## 5. 단계별 구현 계획

### Phase 1. 의존성 및 경계 준비

- 루트 `package.json`에 `mermaid` 의존성 추가
- `packages/ui` 안에 Mermaid 전용 모듈 경계 파일 추가
- 기존 `MarkdownContent` 테스트가 현재 동작을 계속 보장하도록 baseline 유지

완료 기준:

- 코드베이스에 Mermaid 런타임을 로드할 자리와 테스트 자리가 생긴다.

### Phase 2. Mermaid Renderer 유틸 구현

- `mermaid-renderer.ts` 작성
- dynamic import + module-level promise cache 추가
- Mermaid initialize를 단 한 번만 수행하는 경로 정리
- 렌더 함수가 `svg` 또는 명시적 에러를 반환하도록 계약 고정

완료 기준:

- 임의 Mermaid source를 비동기로 SVG string으로 바꿀 수 있다.
- 초기화/렌더 실패가 삼켜지지 않고 호출부까지 전달된다.

### Phase 3. `MermaidDiagram` 컴포넌트 구현

- source prop 기반 비동기 render 처리
- loading UI
- error UI
- 성공 시 SVG 삽입 wrapper
- note 폭 안에서 안전하게 보이는 기본 스타일 추가

완료 기준:

- 독립 컴포넌트 단위에서 Mermaid source를 화면에 렌더링할 수 있다.
- 문법 오류 source도 실패 card로 안정적으로 표시된다.

### Phase 4. `MarkdownContent` 통합

- `components.code` override 추가
- fenced code language 판별 로직 추가
- `mermaid` block을 `MermaidDiagram`으로 연결
- 나머지 block은 기존 highlight 결과 유지

완료 기준:

- `MarkdownContent`를 쓰는 note body / edge label / built-in renderer에서 Mermaid가 일관되게 보인다.

### Phase 5. 스타일과 접근성 정리

- diagram surface 클래스 정리
- overflow, max-width, padding, background 조정
- `role`, `aria-label`, 실패 텍스트 정리
- light editorial theme과 충돌하지 않는 기본 Mermaid theme 검증

완료 기준:

- diagram이 현재 카드/노트 스타일 안에서 튀지 않고 읽힌다.
- 실패 상태와 로딩 상태가 시각적으로 명확하다.

### Phase 6. 테스트와 예시 문서

- `markdown-content.test.tsx` 확장
- `mermaid-diagram.test.tsx` 추가
- 필요 시 example `.canvas.md`에 Mermaid fixture 추가
- web / desktop 수동 검증 체크리스트 수행

완료 기준:

- 최소 대표 문법과 실패 케이스가 자동 테스트로 커버된다.

### Phase 7. 후속 확장 후보 정리

첫 릴리즈 직후가 아니라, 안정화 이후 검토할 항목:

- document frontmatter 기반 `mermaidTheme`
- copy source / collapse source UX
- diagram export 또는 image snapshot
- 별도 diagram object type

완료 기준:

- 현재 구현을 흔들지 않고 다음 확장을 붙일 경계가 문서화된다.

---

## 6. 상세 설계 포인트

### 6.1 Code Block 판별 방식

현재 `react-markdown`에서는 fenced code block이 `code` component로 들어온다.

권장 판별:

- `inline === true`면 Mermaid 대상이 아니다.
- `className`에서 `language-mermaid`를 읽으면 Mermaid block으로 처리한다.
- source text는 trailing newline 정리만 하고 의미 변경은 하지 않는다.

### 6.2 SVG 삽입 방식

Mermaid는 최종적으로 SVG string을 반환하므로, React에서는 제한된 지점에서만 삽입해야 한다.

원칙:

- 삽입 위치는 `MermaidDiagram` 내부로 한정한다.
- 일반 markdown renderer에 raw HTML 허용을 추가하지 않는다.
- 삽입 전후 wrapper class와 상태 class를 명확히 구분한다.

### 6.3 Theme Strategy

첫 버전은 단일 theme 고정이 맞다.

이유:

- frontmatter 타입, parser 검증, 문서 저장 contract까지 넓히지 않아도 된다.
- Mermaid 지원 그 자체가 핵심 가치다.
- 지금 시점의 ROI는 “보인다”가 대부분을 차지하고, theme choice는 부가 가치다.

후속 확장 여지를 위해:

- `mermaid-renderer.ts`는 theme 값을 내부 상수 하나로 캡슐화한다.
- `MarkdownContent`와 `MermaidDiagram`은 theme를 직접 결정하지 않는다.

### 6.4 Edge Label 처리

공용 `MarkdownContent` 경계를 쓰므로 edge label도 Mermaid 대상이 된다.

실무적으로는 edge label 폭이 좁아 diagram 가독성이 낮을 수 있다. 첫 버전 정책은 아래로 둔다.

- 렌더는 허용한다.
- wrapper가 폭을 넘으면 내부 스크롤 또는 축소된 viewport를 허용한다.
- edge label용 별도 금지 규칙은 두지 않는다.

이유:

- 공용 규칙이 더 단순하다.
- 특정 surface만 예외 처리하면 예측 가능성이 떨어진다.

### 6.5 Error UX

오류 UI 최소 요소:

- 제목: `Mermaid diagram could not render`
- 본문: Mermaid가 반환한 에러 메시지 또는 일반화된 실패 설명
- source: 원문 fenced body를 monospace pre 영역에 표시

이 방향이 필요한 이유:

- 사용자가 문법 오류를 직접 고칠 수 있다.
- AI가 만든 잘못된 source도 바로 디버깅 가능하다.
- “왜 안 보이는지”를 숨기지 않는다.

---

## 7. 테스트 계획

### 7.1 Unit Tests

`packages/ui/src/components/markdown-content.test.tsx`

- 기존 CommonMark / GFM 렌더링이 그대로 유지된다.
- ` ```mermaid ` block이 code block이 아니라 Mermaid wrapper로 렌더링된다.
- 비-`mermaid` fenced code block은 기존 highlight 경로를 유지한다.

`packages/ui/src/components/mermaid-diagram.test.tsx`

- Mermaid render 성공 시 SVG wrapper가 표시된다.
- Mermaid render 실패 시 error card와 source fallback이 표시된다.
- source prop이 바뀌면 diagram이 다시 렌더링된다.

`packages/ui/src/lib/mermaid-renderer.test.ts`

- dynamic import가 한 번만 초기화된다.
- render 에러가 호출부에 전달된다.

### 7.2 Manual Checks

- web app에서 sample note body Mermaid 렌더 확인
- desktop app에서 동일 sample 렌더 확인
- 긴 flowchart가 note 폭 안에서 깨지지 않는지 확인
- sequence diagram이 과도한 height에서도 스크롤/레이아웃 파손 없이 보이는지 확인
- 문법 오류 source가 전체 note를 깨지 않고 오류 card로 표시되는지 확인
- Mermaid가 없는 일반 문서에서 초기 로딩 회귀가 체감되지 않는지 확인

---

## 8. 검증 대상 파일

구현 시 실제 수정 가능성이 높은 파일은 아래다.

- `package.json`
- `packages/ui/src/components/markdown-content.tsx`
- `packages/ui/src/components/markdown-content.test.tsx`
- `packages/ui/src/components/mermaid-diagram.tsx`
- `packages/ui/src/components/mermaid-diagram.test.tsx`
- `packages/ui/src/lib/mermaid-renderer.ts`
- `examples/markdown.md`

첫 버전에서는 아래 파일은 가능하면 건드리지 않는 편이 좋다.

- `packages/canvas-parser/src/index.ts`
- `packages/canvas-domain/src/index.ts`
- `packages/canvas-app/src/services/edit-service.ts`

---

## 9. 리스크와 대응

### 9.1 Mermaid 번들 비용

- 대응: dynamic import와 shared cache 사용

### 9.2 SVG 삽입 보안 우려

- 대응: Mermaid 전용 경계에서만 삽입, 보수적 security 설정 유지

### 9.3 렌더 타이밍 불안정

- 대응: loading 상태를 명시적으로 두고 async 결과를 상태 머신으로 관리

### 9.4 향후 theme 요구 확장

- 대응: theme 결정을 중앙 유틸로 숨기고 public prop으로 퍼뜨리지 않음

### 9.5 edge label 가독성

- 대응: 첫 단계는 공용 규칙 유지, 실제 사용성 이슈가 확인되면 surface별 제한을 후속으로 검토

---

## 10. 구현 순서 제안

실제 작업 순서는 아래가 가장 안전하다.

1. `mermaid` 의존성과 중앙 renderer 유틸 추가
2. 독립 `MermaidDiagram` 컴포넌트와 테스트 작성
3. `MarkdownContent`에 `code` override 연결
4. 스타일과 fallback UX 조정
5. example 문서와 수동 검증

이 순서를 따르면 공용 경계를 먼저 고정한 뒤 연결할 수 있어, 중간 단계에서도 회귀 지점을 명확하게 추적할 수 있다.
