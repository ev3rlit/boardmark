# PRD: Shared File Object For Sandpack, Widget, And Other Consumers

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 |
| 작성일 | 2026-04-15 |
| 상태 | Draft |
| 관련 문서 | [`docs/features/sandpack-source-authoring/README.md`](../../sandpack-source-authoring/README.md), [`docs/features/sandpack/README.md`](../README.md) |

---

## 1. 문제

현재 Boardmark의 sandpack 파일은 각 `sandpack` block 안에서만 정의된다.

이 구조는 단일 예제에는 충분하지만, 컴포넌트 쇼케이스나 디자인 시스템 보드처럼 여러 sandpack이 공통 CSS, 공통 유틸리티, 공통 컴포넌트를 공유해야 하는 경우 아래 문제가 생긴다.

- 같은 CSS 파일을 여러 sandpack block에 반복 복사해야 한다
- 공통 버튼 스타일이나 design token 수정 시 모든 note를 수동으로 고쳐야 한다
- sandpack마다 가상 파일 시스템이 완전히 분리되어 있어 문서 단위 재사용이 불가능하다
- 로컬 파일 시스템을 직접 읽지 못하는 sandpack 제약을 문서 레벨의 재사용 구조로 보완할 수 없다

즉 필요한 것은 "sandpack 전용 shared file hack"이 아니라, **문서 안에서 선언한 가상 파일 묶음을 여러 consumer가 공유해서 쓸 수 있는 범용 file object 모델**이다.

여기서 consumer는 현재의 `sandpack` fenced block일 수도 있고, 이후 도입할 수 있는 `widget` 같은 실행형 오브젝트일 수도 있다. 이 문서는 특정 표면보다 **공유 file layer**를 먼저 고정하는 데 목적이 있다.

---

## 2. 목표

### Goals

- 문서 안에 공유 가상 파일 묶음을 선언할 수 있다
- sandpack block 또는 future `widget` object가 그 파일 묶음을 참조해 사용할 수 있다
- 공용 파일과 local file의 merge 규칙이 명확하다
- object header는 JSON canonical syntax를 사용한다
- author-facing 문법과 참조 키를 `id`로 통일한다
- sandpack이 첫 consumer이지만, 구조 자체는 범용 consumer 모델로 설계한다
- future `widget` object가 같은 file layer를 재사용할 수 있는 경계를 유지한다
- parser/registry/composition 책임을 분리해 이후 다른 consumer에도 확장 가능하게 만든다

### Non-Goals

- 호스트 머신의 실제 파일 시스템 직접 접근
- 문서 간 파일셋 공유
- 네트워크 drive 또는 remote repository mount
- 파일셋 전용 WYSIWYG 편집 UI
- sandpack 외 다른 runtime consumer를 이번 단계에서 모두 구현하는 것
- `widget` object 자체를 이번 단계에서 구현하는 것

---

## 3. Canonical Concept

핵심 개념은 `files` object다.

- `files` object는 문서 범위의 공유 가상 파일셋이다
- `sandpack` block이나 future `widget` object 같은 consumer는 `uses`로 파일셋을 참조한다
- 실행 직전 composition layer가 shared files와 local files를 합친다

### 3.1 `files` object 초안

`````md
::: files {"id":"design-system"}

```styles/tokens.css
:root {
  --radius: 12px;
  --foreground: #0f172a;
}
```

```styles/button.css
.button {
  border-radius: var(--radius);
  background: var(--foreground);
  color: white;
}
```

:::
`````

### 3.2 `sandpack` consumer 초안

``````md
::: note {"id":"button-demo","at":{"x":0,"y":0,"w":720,"h":520}}

````sandpack
{
  "template": "react",
  "uses": ["design-system"]
}

```App.js
import "./styles/tokens.css";
import "./styles/button.css";

export default function App() {
  return <button className="button">Hello</button>;
}
```
````

:::
``````

### 3.3 `widget` consumer 초안

`widget` object를 도입하더라도 shared file model은 바뀌지 않는다. 차이는 consumer surface만 달라진다.

``````md
::: widget {"id":"button-demo","engine":"sandpack","at":{"x":0,"y":0,"w":720,"h":520},"uses":["design-system"],"entry":"App.js"}

```App.js
import "./styles/tokens.css";
import "./styles/button.css";

export default function App() {
  return <button className="button">Hello</button>;
}
```

:::
``````

이 문서의 초점은 `widget` object 문법 자체가 아니라, `widget`이 생기더라도 같은 `files` object와 `uses` 규칙을 재사용할 수 있어야 한다는 점이다.

### 3.4 Local override 초안

같은 path가 shared files와 local files에 모두 존재하면 local file이 우선한다.

``````md
````sandpack
{
  "template": "react",
  "uses": ["design-system"]
}

```App.js
import "./styles/button.css";
import "./styles/local.css";

export default function App() {
  return <button className="button">Override</button>;
}
```

```styles/local.css
.button {
  background: rebeccapurple;
}
```
````
``````

---

## 4. Product Rules

### 4.1 Object Header Rules

- `files` object header는 JSON object syntax를 사용한다
- canonical example은 항상 `{"id":"..."}` 형태를 사용한다
- `id`는 문서 내에서 유일해야 한다
- consumer의 `uses` 값은 `files` object의 `id`를 참조한다

### 4.2 File Rules

- `files` object body는 nested fenced file block 목록으로 구성된다
- opening fence의 첫 토큰은 파일 경로다
- 파일 path는 전체 경로를 허용한다
  - 예: `styles/tokens.css`
  - 예: `src/components/Button.tsx`
- 현재 사용자 문법에서는 파일별 active/readOnly/hidden 같은 플래그는 노출하지 않는다

### 4.3 Consumer Rules

- consumer는 `uses`로 하나 이상의 shared file set name을 참조할 수 있다
- consumer는 current `sandpack` block일 수도 있고, future `widget` object일 수도 있다
- merge 순서는 `shared files -> local files`다
- 동일 path 충돌 시 local file이 최종 우선한다
- 동일 path가 여러 shared set에 중복되면 parse/composition error로 처리한다
- 존재하지 않는 `uses` 참조는 오류로 surface해야 한다

### 4.4 Scope Rules

- 공유 범위는 현재 문서 하나로 제한한다
- note body 밖의 실제 로컬 파일 시스템은 읽지 않는다
- sandbox runtime이 문서 외부 파일에 직접 접근해서는 안 된다

### 4.5 UI Rules

- `files` object는 v1에서 캔버스의 일반 오브젝트로 렌더하지 않는다
- `files` object는 문서 리소스로 취급한다
- 현재 문서의 shared files는 앱 화면 우측하단 전역 컨트롤 영역의 폴더 버튼으로 연다
- 폴더 버튼을 누르면 문서에 선언된 shared file set 목록과 내부 파일을 볼 수 있는 패널이 열린다
- v1의 files 패널은 읽기 전용으로 시작한다
- 필요하면 consumer note 또는 future `widget` object 쪽에는 `uses` 참조를 보여주는 작은 badge를 둘 수 있지만, file set 본체를 캔버스에 배치하지는 않는다

### 4.6 Failure Rules

- `files` object parse 실패는 명시적 오류로 surface한다
- 중복 `name`, 중복 shared path, missing reference 모두 오류다
- consumer render 실패 시 어떤 file set merge가 실패했는지 진단 가능해야 한다
- 실패를 조용히 fallback 처리하면 안 된다

### 4.7 Generalization Rules

- `files` object는 sandpack 전용 개념이 아니다
- sandpack은 첫 번째 consumer일 뿐이다
- future `widget` object는 가장 자연스러운 다음 consumer 후보다
- future consumer 예:
  - `widget` object with `engine: sandpack`
  - html preview block
  - custom runtime preview
  - export/build pipeline
  - test playground

---

## 5. Domain Model

초기 공통 모델은 아래 정도로 제한한다.

```ts
type SharedFile = {
  path: string
  source: string
}

type SharedFileSet = {
  id: string
  files: SharedFile[]
}

type SharedFileConsumerReference = {
  uses: string[]
}
```

sandpack composition 시점에는 최종적으로 아래 형태가 필요하다.

```ts
type ComposedFiles = {
  files: Record<string, string>
}
```

---

## 6. Implementation Plan

### Phase 1 — `files` object parser 도입

문서 parser가 `files` object를 읽어 AST 또는 별도 side table로 제공한다.

**목표**

- `files` object 문법을 정식으로 읽는다
- `id` uniqueness를 검증한다
- 파일 fenced block 목록을 구조화된 shared file set으로 변환한다

**변경 범위**

```text
packages/canvas-parser/
  src/
    index.ts
    index.test.ts
    shared-file-object-parser.ts        (신규)
    shared-file-types.ts                (신규)
```

**완료 기준**

- `::: files {"name":"design-system"}` object를 읽을 수 있다
- `::: files {"id":"design-system"}` object를 읽을 수 있다
- file path와 source가 정확히 복원된다
- duplicate `id`를 오류로 처리한다

---

### Phase 2 — sandpack consumer reference 도입

sandpack document model에 `uses`를 추가하고, local file과 shared file을 합성한다.

**목표**

- sandpack이 `uses`를 읽을 수 있다
- shared file set과 local file을 최종 sandpack files로 compose 한다
- composition 경계가 future `widget` consumer에도 재사용 가능하도록 유지된다

**변경 범위**

```text
packages/ui/src/components/fenced-block/
  sandpack-source-types.ts
  sandpack-json-source-parser.ts
  sandpack-nested-source-parser.ts
  sandpack-source-composer.ts          (신규)
  sandpack-source-composer.test.ts     (신규)
packages/ui/src/components/
  sandpack-block.tsx
```

**완료 기준**

- `uses`가 없는 기존 sandpack은 그대로 동작한다
- `uses`가 있는 sandpack은 shared files를 포함해 렌더된다
- local file override가 동작한다
- missing reference와 shared path conflict를 오류로 렌더한다
- sandpack 전용 로직이 shared file model 자체를 잠그지 않는다

---

### Phase 3 — editor/write path 정리

WYSIWYG와 serializer가 `uses`를 round-trip 하도록 정리한다.

**목표**

- sandpack canonical write가 `uses`를 보존한다
- future consumer와 공유 가능한 공통 composition boundary를 분리한다

**변경 범위**

```text
packages/canvas-app/src/components/editor/
  wysiwyg-markdown-bridge.tsx
  wysiwyg-markdown-bridge.test.tsx
packages/ui/src/components/fenced-block/
  sandpack-nested-source-serializer.ts
  sandpack-json-source-serializer.ts
```

**완료 기준**

- `uses`가 editor round-trip에서 유지된다
- serializer가 shared file set 본문을 직접 inline expand하지 않는다
- renderer/editor는 parse/composition 결과만 사용한다

---

### Phase 4 — 범용 consumer registry

sandpack 이외 consumer도 같은 shared file set을 사용할 수 있도록 registry를 도입한다.

**목표**

- `files` object가 특정 runtime에 종속되지 않도록 분리한다
- consumer별 merge/validation 규칙을 registry에서 선택한다
- future `widget` object가 registry를 통해 같은 file layer를 재사용할 수 있게 한다

**변경 범위**

```text
packages/ui/src/components/fenced-block/
  shared-file-consumer.ts              (신규)
  shared-file-consumer-registry.ts     (신규)
```

**완료 기준**

- sandpack consumer가 registry 기반 composition으로 바뀐다
- future runtime 확장 지점이 문서화된다
- `widget` consumer를 붙일 때 sandpack compose 로직을 다시 복제하지 않아도 된다

---

### Phase 5 — Bottom-right Files Panel

우측하단 전역 컨트롤 영역에 폴더 버튼을 추가하고, 현재 문서의 shared file set을 읽기 전용으로 탐색할 수 있게 한다.

**목표**

- `files` object를 캔버스 오브젝트가 아니라 문서 리소스로 노출한다
- 현재 문서에 선언된 shared file set과 내부 파일을 한곳에서 확인할 수 있다

**변경 범위**

```text
packages/canvas-app/src/
  app/
  components/
    controls/
    toolbar/                           (기존 구조에 맞춰 반영)
  store/
```

**패널 표시 항목**

- file set `id`
- 포함 파일 수
- 파일 path 목록
- 참조 중인 consumer 목록 또는 개수
- raw source 보기 또는 복사 액션

**완료 기준**

- 우측하단 줌/undo/redo 컨트롤 근처에 폴더 버튼이 보인다
- 폴더 버튼 클릭 시 현재 문서의 shared file set 목록이 열린다
- file set을 선택하면 내부 파일 목록을 확인할 수 있다
- v1에서는 읽기 전용으로 동작한다
- `files` object 자체는 캔버스 위에 별도 아이콘/노드로 렌더되지 않는다

---

## 7. Open Questions

아직 확정되지 않은 항목:

- `files` object를 AST의 top-level node로 둘지, 별도 side table로 둘지
- `uses`가 하나의 string shorthand를 허용할지
- shared set 간 중복 path를 hard error로 고정할지
- consumer별 partial file import를 나중에 지원할지
- `files` object body에 markdown 설명 문단을 허용할지, fenced file만 허용할지
- files 패널에서 consumer reference를 개수만 보여줄지, 실제 note id 목록까지 보여줄지

현재 초안 기준의 기본 판단은 아래다.

- `uses`는 배열만 허용한다
- shared set 간 path 중복은 오류다
- `files` object body는 fenced file block만 허용한다
- 설명 문단이 필요하면 별도 note를 사용한다
- files 패널은 읽기 전용으로 시작한다
- `files` object는 캔버스 오브젝트로 렌더하지 않는다

---

## 8. Summary

이 기능의 본질은 sandpack 확장이 아니라 **문서 범위 공유 가상 파일셋** 도입이다.

- `files` object가 공유 정의를 담당한다
- `sandpack`은 첫 번째 consumer다
- `widget`은 가장 자연스러운 다음 실행형 consumer 후보다
- author-facing key와 참조 키는 모두 `id`다
- object header는 JSON canonical syntax를 사용한다
- merge 규칙은 `shared -> local`, 충돌 시 local 우선이다
- UI에서는 우측하단 전역 컨트롤의 폴더 버튼으로 files 패널을 열고, 캔버스 오브젝트로는 렌더하지 않는다

이 방향이 맞으면, 이후 sandpack을 넘어서 Boardmark의 `widget` object와 다른 실행형 블록들이 같은 file object layer를 공유할 수 있다.
