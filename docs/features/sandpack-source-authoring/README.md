# Sandpack 소스 작성 포맷 개선

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.5 |
| 작성일 | 2026-04-15 |
| 상태 | 계획 중 |
| 관련 ADR | [`docs/adr/005-sandpack-source-authoring-format.md`](../../adr/005-sandpack-source-authoring-format.md) |
| 선행 문서 | [`docs/features/sandpack/README.md`](../sandpack/README.md) |

> 참고: 이 문서는 `note` content body와 WYSIWYG round-trip 제약을 반영한 구현 계획이다. 현재 내용은 ADR-005의 Option G와 차이가 있으므로, 구현 확정 전 ADR 정합화가 필요하다.

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

이 포맷은 파서 구현이 단순하지만 작성자 경험이 근본적으로 나쁘다.

- 모든 줄바꿈이 `\n`, 모든 `"`이 `\"`로 인코딩된다
- 10줄 이상 코드는 읽고 수정하기 사실상 불가능하다
- 멀티파일 구성을 넣을수록 유지보수 비용이 급격히 늘어난다

추가로, Boardmark의 실제 작성 맥락은 일반 markdown 문서가 아니라 **오브젝트의 content body**, 특히 `note` body다. 이 점을 고려하면 MDX 컴포넌트형 문법은 예쁘더라도 아래 문제가 있다.

- `sandpack`이 note body 안의 블록인지, 문서 루트 문법인지 컨텍스트가 약하다
- 현재 WYSIWYG는 `sandpack`을 특수 fenced block 하나로 다루는데, MDX 래퍼 + 내부 블록 조합은 이 모델과 충돌한다
- markdown string ↔ WYSIWYG node ↔ markdown string round-trip 비용이 커진다

즉 지금 필요한 것은 "실제 코드처럼 쓸 수 있는 문법"이면서도, **note body 안에 자연스럽게 들어가고 WYSIWYG에서 한 개의 special block으로 다룰 수 있는 포맷**이다.

---

## 2. 목표

### Goals

- 코드를 이스케이프 없이 실제 코드 줄로 작성할 수 있다
- sandpack이 `note` 같은 오브젝트의 content body 안에 들어간다는 점이 문서와 예시에서 명확하다
- WYSIWYG에서 sandpack 하나를 여전히 단일 special block으로 취급할 수 있다
- 여러 파일을 파일 단위로 읽고 수정할 수 있다
- 기존 JSON 방식 sandpack block과의 하위 호환 또는 명확한 마이그레이션 경로를 제공한다
- `dual-read → canonical write → bulk migration`의 단계적 마이그레이션 경로를 제공한다
- `template`, `layout`, `readOnly`, `dependencies` 같은 기본 설정을 함께 표현할 수 있다
- JSON parser와 nested fenced parser가 서로 독립된 구현체로 유지된다
- 파싱/직렬화 방식이 인터페이스 기반으로 확장 가능하다
- 기본 사용자 경험은 항상 preview 우선이다

### Non-Goals

- MDX 파이프라인 전면 도입
- WYSIWYG 에디터에서 `<Sandpack>` 컴포넌트 props를 직접 편집하는 UI
- 일반 markdown 에디터에서 nested file block까지 완전한 IDE 구문 강조를 보장하는 것
- sandpack 이외 런타임 (Vue, Svelte 등) 지원
- 프리셋 시스템, 노트 간 파일 공유

---

## 3. Canonical Syntax

구현 기준 포맷은 **outer `sandpack` fenced block + inner file fenced block**이다. sandpack은 문서 루트의 독립 문법이 아니라, 오브젝트의 content body 안에서 작성한다.

`````md
::: note { id: react-demo, at: { x: 0, y: 0, w: 720, h: 520 } }

# Counter Demo

````sandpack {
  template: react
}

```App.js
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount((value) => value + 1)}>
      {count}
    </button>
  );
}
```

```styles.css
body {
  margin: 0;
}
```
````

:::
`````

### 3.1 배치 규칙

- sandpack은 `note` 같은 오브젝트의 content body 안에서 작성한다
- canonical authoring 예시는 항상 전체 오브젝트 맥락과 함께 제시한다
- sandpack 하나는 source 상에서도 바깥 `sandpack` fenced block 하나로 표현된다

### 3.2 바깥 `sandpack` block 계약

바깥 block의 언어 태그는 항상 `sandpack`이다. block body는 아래 두 부분으로 구성된다.

1. 선택적 옵션 객체
2. 파일별 inner fenced block 목록

옵션 객체는 opening fence 뒤에 inline으로 쓰거나, opening fence 다음 줄에 멀티라인으로 쓸 수 있다.

````md
````sandpack { template: react, layout: preview, readOnly: true }

```App.js
export default function App() {
  return <div>Hello</div>;
}
```
````
````

````md
````sandpack
{
  template: react,
  layout: code,
  readOnly: true
}

```App.js
export default function App() {
  return <div>Hello</div>;
}
```
````
````

| 필드 | 타입 | 필수 | 설명 |
|------|------|:---:|------|
| `template` | string | 권장 | sandpack 템플릿. 기본값 `react` |
| `dependencies` | `Record<string, string>` | 선택 | npm 패키지와 버전 |
| `layout` | `"preview" \| "code"` | 선택 | 표시할 패널. 기본값 `preview` |
| `readOnly` | boolean | 선택 | 에디터 전체 편집 잠금. 기본값 `false` |

옵션 객체가 없으면 파일 fenced block부터 바로 시작할 수 있다.

- `layout`을 생략하면 preview만 표시한다
- `layout: code`를 지정하면 preview와 code를 함께 표시한다
- 옵션 키는 Boardmark object header와 유사한 key/value 감각을 따른다
- boolean은 `true`, `false` 소문자를 사용한다

### 3.3 내부 파일 block 계약

| 형태 | 설명 |
|------|------|
| ` ```App.js ` | 파일 경로 |
| ` ```src/components/Button.js ` | 중첩 경로 파일 |

파서는 opening fence의 첫 토큰을 파일 경로로 읽는다.

현재 사용자 문법에서는 `active`, `hidden`, 파일별 `readOnly` 같은 파일 단위 플래그를 노출하지 않는다. 기본 UX는 항상 preview 우선이며, 코드 패널을 열었을 때의 초기 탭 선택은 시스템 기본값으로 처리한다.

확장자 → 언어 추론 규칙:

- `.js` / `.jsx` → `jsx`
- `.ts` / `.tsx` → `tsx`
- `.css` → `css`
- `.json` → `json`
- 그 외 → `text`

### 3.4 하위 호환

기존 JSON 방식 fenced block은 전환 기간 동안 동작을 유지한다.

````md
```sandpack
{ "template": "react", "files": { ... } }
```
````

파서는 아래 두 포맷을 모두 인식한다.

- 기존 JSON body
- 새 nested fenced body

새 작성과 재직렬화 기본 출력은 nested fenced 포맷을 권장한다.

### 3.5 단계적 마이그레이션 원칙

이 기능은 강제 일괄 전환이 아니라 단계적 마이그레이션으로 도입한다.

- 읽기 단계에서는 JSON과 nested fenced를 모두 허용한다
- 메모리 내부에서는 두 포맷을 같은 `SandpackDocument`로 정규화한다
- 다시 쓰는 단계에서는 nested fenced를 canonical output으로 사용한다
- 마지막 단계에서 별도 마이그레이션 스크립트로 남은 JSON block을 정리한다

즉 전략은 `dual-read → canonical write → bulk migration`이다.

---

## 4. Product Rules

### 4.1 실패 동작

- nested fenced 파싱 실패, JSON 파싱 실패, sandpack 렌더 실패 모두 오류 card로 렌더한다
- 오류 card는 실패 사실, 원인, 원본 소스를 표시한다
- 실패를 조용히 빈 영역으로 숨기면 안 된다

### 4.2 보안

- 기존 sandpack 보안 계약을 그대로 유지한다 (`docs/features/sandpack/README.md` §5.5)
- outer/inner fenced block 포맷으로 바뀌어도 iframe sandbox 경계는 변하지 않는다

### 4.3 성능

- sandpack 엔진은 `sandpack` fenced block이 실제로 존재할 때만 lazy load한다
- 일반 markdown 문서의 렌더 경로는 변하지 않는다

### 4.4 WYSIWYG 규칙

- WYSIWYG는 sandpack을 계속 단일 special fenced block으로 다룬다
- WYSIWYG 내부 canonical source는 바깥 `sandpack` fenced block의 raw body다
- MDX wrapper 같은 다중 블록 구조를 sandpack canonical source로 채택하지 않는다

### 4.5 파싱/직렬화 아키텍처 규칙

- JSON parsing과 nested fenced parsing은 같은 파일이나 같은 구현체 안에서 함께 관리하지 않는다
- 각 포맷은 동일한 인터페이스를 구현하는 독립 parser로 분리한다
- parser 구현체들은 서로를 import하거나 fallback 대상으로 호출하지 않는다
- parser 선택은 registry 같은 조합 레이어에서만 수행한다
- serializer도 parser와 같은 원칙으로 포맷별 독립 구현체로 분리한다
- renderer와 editor는 포맷별 구현 세부사항이 아니라 공통 도메인 모델만 사용한다
- canonical format 전환 책임은 parser가 아니라 serializer 레이어에 둔다

### 4.6 레이아웃 규칙

- `layout` 미기입 시 기본값은 `preview`다
- `layout: preview`는 preview만 표시한다
- `layout: code`는 preview와 code를 함께 표시한다
- 기본 사용자 경험은 항상 preview 먼저다

---

## 5. 구현 계획

현재 구조를 유지한 채 nested fenced sandpack 포맷을 점진적으로 도입한다.

### Phase 0 — 현재 (JSON 유지)

기존 JSON fenced block을 유지한다. 이 phase에서는 코드 변경이 없다.

```
현재 포맷 (JSON 문자열) 계속 사용
nested fenced 포맷 파서 준비 후 Phase 1 진입
```

---

### Phase 1 — sandpack parser/registry 도입

`sandpack` fenced block body를 구조화된 설정으로 바꾸는 parser 계층을 추가한다. 이 단계에서는 markdown 파이프라인을 바꾸지 않고, 기존 `source: string` 계약을 유지한다.

**목표:** raw `sandpack` source를 읽어 포맷별 parser가 공통 도메인 모델로 변환하고, 상위 레이어는 registry를 통해 parser를 선택한다.

**변경 파일**

```
packages/ui/src/components/
  fenced-block/
    sandpack-source-parser.ts             (신규) parser 인터페이스
    sandpack-source-parser-registry.ts    (신규) parser 등록/선택
    sandpack-json-source-parser.ts        (신규) JSON parser
    sandpack-nested-source-parser.ts      (신규) nested fenced parser
    sandpack-source-types.ts              (신규) 공통 도메인 타입
  sandpack-block.tsx             registry 사용
  markdown-content.test.tsx      새 포맷 렌더 테스트 추가
```

**도메인/인터페이스 계약**

```ts
type SandpackFile = {
  code: string
  name: string
  language: string
  active?: boolean
  readOnly?: boolean
  hidden?: boolean
}

type SandpackDocument = {
  template: string
  files: SandpackFile[]
  dependencies?: Record<string, string>
  layout?: "preview" | "code"
  readOnly?: boolean
}

type SandpackParseResult = {
  document: SandpackDocument
  format: string
}

interface SandpackSourceParser {
  readonly format: string
  canParse(source: string): boolean
  parse(source: string): SandpackDocument
}
```

**구현 원칙**

- `sandpack-json-source-parser.ts`는 JSON만 책임진다
- `sandpack-nested-source-parser.ts`는 nested fenced만 책임진다
- 두 parser는 서로를 알지 못한다
- registry가 parser 목록과 우선순위를 관리한다
- `SandpackBlock`은 registry의 `parse(source)` 결과만 받는다
- renderer는 `SandpackDocument`만 사용하고 parser 구현 세부사항을 모른다

**완료 기준**

- JSON parser와 nested fenced parser가 파일 단위로 분리된다
- JSON 방식과 nested fenced 방식이 모두 registry를 통해 파싱된다
- read path가 dual-read 구조로 동작한다
- inline/멀티라인 옵션 객체가 올바르게 읽힌다
- 내부 파일 block이 순서대로 파일 목록으로 변환된다
- 파싱 실패 시 오류 card가 표시된다

---

### Phase 2 — SandpackBlock 렌더러 업데이트

`SandpackBlock` 컴포넌트가 `SandpackDocument` 구조를 받아 layout, readOnly, dependencies를 반영해 렌더링한다.

**변경 파일**

```
packages/ui/src/components/
  sandpack-block.tsx             registry + SandpackDocument 사용
  sandpack-block.test.tsx        layout/readOnly/오류 케이스 테스트 추가
```

**레이아웃 처리**

```ts
// layout 미기입      → preview만 표시
// layout="preview"  → preview만 표시
// layout="code"     → preview + code
```

**완료 기준**

- `layout` 값에 따라 올바른 패널 조합이 표시된다
- `readOnly`가 에디터 전체 또는 파일별로 적용된다
- `dependencies`가 기존 Sandpack 설정으로 올바르게 전달된다
- renderer가 parser format 분기 없이 공통 도메인 모델만 사용한다
- 기존 JSON 방식 입력도 계속 동작한다

---

### Phase 3 — WYSIWYG 직렬화 인터페이스 업데이트

TipTap의 sandpack 노드는 여전히 special fenced block 하나를 유지하되, 직렬화도 포맷별 독립 구현체 + registry 구조로 정리하고 기본 출력 포맷을 nested fenced로 바꾼다.

**변경 파일**

```
packages/canvas-app/src/components/editor/
  wysiwyg-markdown-bridge.tsx    sandpack serializer/parser 교체
  views/
    special-fenced-block-view.tsx raw source 편집 UX 유지
  wysiwyg-markdown-bridge.test.tsx
packages/ui/src/components/
  fenced-block/
    sandpack-source-serializer.ts            (신규) serializer 인터페이스
    sandpack-source-serializer-registry.ts   (신규) serializer 등록/선택
    sandpack-json-source-serializer.ts       (신규) JSON serializer
    sandpack-nested-source-serializer.ts     (신규) nested fenced serializer
```

**직렬화 계약 변경**

```text
현재: ```sandpack\n{...JSON...}\n```
변경: ````sandpack { template: react, layout: code }\n```App.js\n...\n```\n````
```

```ts
interface SandpackSourceSerializer {
  readonly format: string
  serialize(document: SandpackDocument): string
}
```

에디터 UX는 유지한다. 사용자는 여전히 sandpack을 raw source textarea로 편집하지만, serializer 선택은 registry가 담당하고 기본 출력 포맷만 nested fenced 방식으로 바뀐다.

**완료 기준**

- JSON serializer와 nested fenced serializer가 파일 단위로 분리된다
- WYSIWYG 에디터에서 저장한 sandpack 블록이 nested fenced 포맷으로 출력된다
- WYSIWYG에서 nested fenced 포맷 문서를 열었을 때 sandpack 블록이 올바르게 로드된다
- 기존 JSON 포맷 문서를 열었을 때 역방향 호환이 유지된다
- write path가 nested fenced canonical output으로 수렴한다

---

### Phase 4 — 기존 JSON 블록 마이그레이션

기존 JSON 방식 sandpack block을 nested fenced 포맷으로 일괄 변환한다.

**변경 파일**

```
scripts/
  migrate-sandpack-blocks.ts     (신규) 마이그레이션 스크립트
```

**스크립트 동작**

1. `.canvas.md` 파일에서 ` ```sandpack ` fenced block 탐색
2. JSON body를 파싱해 `template`, `dependencies`, `layout`, `files` 추출
3. nested fenced 포맷으로 변환 후 원본 파일 교체
4. 변환 실패한 block은 원본 유지 + 경고 출력

**완료 기준**

- 프로젝트 내 JSON 방식 sandpack block이 nested fenced 포맷으로 변환된다
- 변환 전후 렌더링 결과가 동일하다
- 단계적 마이그레이션의 마지막 bulk migration 단계가 완료된다

---

## 6. 단계별 의존 관계

```
Phase 0 (현재 유지)
  └── Phase 1 source parser
        ↓
Phase 2 renderer update
        ↓
Phase 3 WYSIWYG serializer
        ↓
Phase 4 migration
```

Phase 2와 Phase 3은 일부 병렬 작업이 가능하지만, `SandpackDocument`와 parser/serializer 인터페이스 계약은 Phase 1에서 먼저 고정해야 한다.

---

## 7. 열린 결정

| 번호 | 질문 | 현재 상태 |
|------|------|------|
| D1 | `dependencies`를 metadata header만 지원할지, 향후 `package.json` hidden file도 허용할지 | 미결 |
| D2 | Phase 4 마이그레이션 스크립트 실행 시점 (Phase 3 직후 vs 별도 릴리즈) | 미결 |
| D3 | parser 선택을 `canParse()` 우선순위 기반으로 할지, 더 엄격한 포맷 식별 규칙을 둘지 | 미결 |
| D4 | WYSIWYG 저장 시 항상 nested fenced로 쓸지, 원본 format 유지 정책을 병행할지 | 미결 |

---

## 8. 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|------|
| 2026-04-15 | 초안 작성. ADR-005 Option G 결정 반영 | homveloper |
| 2026-04-15 | note body/WYSIWYG 제약 반영. nested fenced 기반 구현 계획으로 재정렬 | Codex |
| 2026-04-15 | parser/serializer 인터페이스와 수평 분리 원칙 반영 | Codex |
| 2026-04-15 | layout 기본값을 preview로 단순화하고 파일별 active 문법을 사용자 노출 범위에서 제거 | Codex |
| 2026-04-15 | sandpack 옵션 표현을 YAML에서 Boardmark식 객체 문법으로 전환 | Codex |
