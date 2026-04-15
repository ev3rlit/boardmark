# Sandpack 소스 작성 포맷 개선

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 |
| 작성일 | 2026-04-15 |
| 상태 | 계획 중 |
| 관련 ADR | [`docs/adr/005-sandpack-source-authoring-format.md`](../../adr/005-sandpack-source-authoring-format.md) |
| 선행 문서 | [`docs/features/sandpack/README.md`](../sandpack/README.md) |

---

## 1. 문제

현재 sandpack fenced block은 파일 내용을 **JSON 문자열**로 인코딩한다.

````md
```sandpack
{
  "template": "react",
  "files": {
    "App.js": "import { useState } from \"react\";\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;\n}"
  }
}
```
````

이 포맷은 파서 구현이 단순하지만 **작성자 경험이 근본적으로 나쁘다.**

- 모든 줄바꿈이 `\n`, 모든 `"`이 `\"`로 인코딩된다
- IDE 구문 강조, 자동 완성, 포매터가 전혀 동작하지 않는다
- 10줄 이상 코드는 읽고 수정하기 사실상 불가능하다
- 멀티파일 구성을 넣을수록 유지보수 비용이 지수적으로 늘어난다

---

## 2. 목표

### Goals

- 코드를 이스케이프 없이 실제 코드로 작성할 수 있다
- IDE / 텍스트 에디터에서 각 파일의 구문 강조·자동 완성이 동작한다
- 여러 파일을 명확하고 자연스럽게 표현한다
- 기존 JSON 방식 sandpack block과의 하위 호환 또는 명확한 마이그레이션 경로를 제공한다
- 파일 언어 자동 추론으로 반복 작성을 줄인다
- 레이아웃 제어로 문서 목적에 맞게 패널을 선택할 수 있다

### Non-Goals

- MDX 파이프라인 전면 도입 (이 기능의 범위 밖, ADR-005 참고)
- WYSIWYG 에디터에서 `<Sandpack>` 컴포넌트 props를 직접 편집하는 UI
- sandpack 이외 런타임 (Vue, Svelte 등) 지원
- 프리셋 시스템, 노트 간 파일 공유 (후속 단계)

---

## 3. Canonical Syntax (Option G)

ADR-005에서 결정된 포맷. MDX 컴포넌트를 외부 래퍼로, 실제 언어 fenced block을 파일 표현으로 쓴다.

````mdx
<Sandpack template="react">

```App.js
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

```styles.css
body { margin: 0; }
```

</Sandpack>
````

### 3.1 컴포넌트 props 계약

| prop | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `template` | string | 권장 | sandpack 템플릿. 기본값 `react` |
| `customSetup.dependencies` | `Record<string, string>` | 선택 | npm 패키지와 버전 |
| `layout` | `"default" \| "preview" \| "editor"` | 선택 | 표시할 패널. 기본값 `default` |
| `readOnly` | boolean | 선택 | 에디터 편집 잠금. 기본값 `false` |

### 3.2 파일 블록 info string 계약

| 형태 | 설명 |
|------|------|
| ` ```App.js ` | 파일명. 확장자로 언어 자동 추론 |
| ` ```App.js active ` | 초기 활성 탭 |
| ` ```App.js readOnly ` | 해당 파일만 편집 잠금 |
| ` ```App.js hidden ` | 파일 탐색기에서 숨김 |

확장자 → 언어 추론 규칙: `.js` / `.jsx` → `jsx`, `.ts` / `.tsx` → `tsx`, `.css` → `css`, `.json` → `json`. 그 외는 `text`로 fallback.

### 3.3 레이아웃 제어

```mdx
<!-- 결과만 표시 (설명 문서, 시각 자료용) -->
<Sandpack template="react" layout="preview">

<!-- 코드만 표시, 읽기 전용 (코드 설명용) -->
<Sandpack template="react" layout="editor" readOnly>

<!-- 에디터 + 미리보기 (기본값) -->
<Sandpack template="react" layout="default">
```

### 3.4 하위 호환

기존 JSON 방식 fenced block은 전환 기간 동안 동작을 유지한다.

````md
```sandpack
{ "template": "react", "files": { ... } }
```
````

파서가 `<Sandpack>` 컴포넌트와 기존 `sandpack` fenced block을 모두 인식하되, 새 작성은 Option G 포맷을 권장한다.

---

## 4. Product Rules

### 4.1 실패 동작

- `<Sandpack>` 파싱 실패, sandpack 렌더 실패 모두 오류 card로 렌더한다
- 오류 card는 실패 사실, 원인, 원본 소스를 표시한다
- 실패를 조용히 빈 영역으로 숨기면 안 된다

### 4.2 보안

- 기존 sandpack 보안 계약을 그대로 유지한다 (`docs/features/sandpack/README.md` §5.5)
- `<Sandpack>` 래퍼가 추가되어도 iframe sandbox 경계는 변하지 않는다

### 4.3 성능

- sandpack 엔진은 `<Sandpack>` 컴포넌트가 실제로 존재할 때만 lazy load한다
- 일반 markdown 문서의 렌더 경로는 변하지 않는다

---

## 5. 구현 계획

MDX 파이프라인이 없는 현재 상태에서 점진적으로 Option G를 도입한다.

### Phase 0 — 현재 (Option A 유지)

MDX 파이프라인이 없으므로 기존 JSON fenced block을 유지한다. 이 phase에서는 코드 변경 없음.

```
현재 포맷 (JSON 문자열) 계속 사용
MDX 파이프라인 도입 완료 시 Phase 1 진입
```

---

### Phase 1 — remark 플러그인으로 `<Sandpack>` 파싱 지원

MDX 전면 도입 없이 `<Sandpack>` 구문만 처리하는 커스텀 remark 플러그인을 작성한다. `react-markdown`을 유지하면서 가장 낮은 비용으로 Option G 작성 경험을 확보하는 경로다.

**목표:** `<Sandpack>` + 중첩 fenced block을 파싱해 기존 `SandpackBlock` 렌더러에 구조화된 파일 데이터를 전달한다.

**변경 파일**

```
packages/ui/src/components/
  fenced-block/
    sandpack-mdx-parser.ts       (신규) <Sandpack> + 파일 블록 파싱 로직
  markdown-content.tsx           remark 플러그인 추가
```

**`sandpack-mdx-parser.ts` 책임**

```ts
// <Sandpack template="react"> ... </Sandpack> 패턴 인식
// 내부 fenced block을 파일 목록으로 변환
// info string에서 파일명, active/hidden/readOnly 플래그 추출
// 확장자 → 언어 자동 추론

type SandpackFile = {
  code: string
  name: string        // "App.js"
  language: string    // 자동 추론된 언어
  active?: boolean
  readOnly?: boolean
  hidden?: boolean
}

type ParsedSandpack = {
  template: string
  files: SandpackFile[]
  dependencies?: Record<string, string>
  layout?: "default" | "preview" | "editor"
  readOnly?: boolean
}
```

**완료 기준**

- `<Sandpack template="react">` + 파일 블록이 올바르게 파싱된다
- 파일 언어가 확장자에서 자동 추론된다
- 파싱 실패 시 오류 card가 표시된다
- 기존 JSON fenced block이 계속 동작한다

---

### Phase 2 — SandpackBlock 렌더러 업데이트

`SandpackBlock` 컴포넌트가 Phase 1에서 파싱된 `ParsedSandpack` 구조를 받아 렌더링한다.

**변경 파일**

```
packages/ui/src/components/
  fenced-block/
    sandpack-block.tsx           ParsedSandpack props 수신, layout prop 처리
```

**레이아웃 prop 처리**

```ts
// layout="preview"  → 에디터 패널 숨김
// layout="editor"   → 미리보기 패널 숨김
// layout="default"  → 기본 sandpack 레이아웃 (에디터 + 미리보기)
```

**완료 기준**

- `layout` prop에 따라 올바른 패널 조합이 표시된다
- `readOnly` prop이 에디터 전체 또는 파일별로 적용된다
- 기존 JSON 방식 입력도 계속 동작한다 (adapter 레이어 유지)

---

### Phase 3 — WYSIWYG 에디터 직렬화 업데이트

TipTap의 sandpack 노드가 Option G 포맷으로 직렬화·역직렬화한다.

**변경 파일**

```
packages/canvas-app/src/components/editor/
  wysiwyg-markdown-bridge.tsx    sandpack 노드 serializer 교체
  extensions/
    wysiwyg-special-fenced-block.ts  <Sandpack> 파싱 규칙 추가
```

**직렬화 계약 변경**

```
현재: ```sandpack\n{...JSON...}\n```
변경: <Sandpack template="react">\n```App.js\n...\n```\n</Sandpack>
```

TipTap의 `toMarkdown` 커스텀 serializer에서 sandpack 노드를 Option G 포맷으로 출력하도록 교체한다. 에디터 UX(소스 편집 모드)는 변경하지 않는다.

**완료 기준**

- WYSIWYG 에디터에서 저장한 sandpack 블록이 Option G 포맷으로 출력된다
- WYSIWYG에서 Option G 포맷 문서를 열었을 때 sandpack 블록이 올바르게 로드된다
- 기존 JSON 포맷 문서를 열었을 때 역방향 호환이 유지된다

---

### Phase 4 — 기존 JSON 블록 마이그레이션

기존 JSON 방식 sandpack block을 Option G 포맷으로 일괄 변환한다.

**변경 파일**

```
scripts/
  migrate-sandpack-blocks.ts     (신규) 마이그레이션 스크립트
```

**스크립트 동작**

1. `.canvas.md` 파일에서 ` ```sandpack ` fenced block 탐색
2. JSON body를 파싱해 `files`, `template`, `dependencies` 추출
3. Option G 포맷으로 변환 후 원본 파일 교체
4. 변환 실패한 block은 원본 유지 + 경고 출력

**완료 기준**

- 프로젝트 내 모든 JSON 방식 sandpack block이 Option G 포맷으로 변환된다
- 변환 전후 렌더링 결과가 동일하다

---

## 6. 단계별 의존 관계

```
Phase 0 (현재 유지)
  └── MDX 파이프라인 도입 결정 후
        ↓
Phase 1 (remark 플러그인)
  └── Phase 1 완료 후
        ↓
Phase 2 (렌더러 업데이트)   ←─── 병렬 가능
Phase 3 (에디터 직렬화)     ←─┘
  └── Phase 2, 3 완료 후
        ↓
Phase 4 (마이그레이션)
```

---

## 7. 열린 결정

| 번호 | 질문 | 현재 상태 |
|------|------|------|
| D1 | Phase 1에서 MDX 파이프라인 없이 `<Sandpack>` 파싱을 구현할 최적 방법 | 미결 |
| D2 | Phase 3 TipTap serializer 교체 시 JSON → Option G 역방향 호환 유지 기간 | 미결 |
| D3 | Phase 4 마이그레이션 스크립트 실행 시점 (Phase 3 직후 vs 별도 릴리즈) | 미결 |

---

## 8. 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|------|
| 2026-04-15 | 초안 작성. ADR-005 Option G 결정 반영 | homveloper |
