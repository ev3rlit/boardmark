# ADR-005: Sandpack 소스 인라인 작성 포맷

| 항목      | 내용                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| 문서 번호 | ADR-005                                                                              |
| 상태      | 🟢 결정됨 (Accepted)                                                                 |
| 작성일    | 2026-04-15                                                                           |
| 관련 기능 | Sandpack live preview, canvas note authoring                                         |
| 관련 문서 | `docs/features/sandpack/README.md`, `docs/adr/001-fenced-block-renderer-pipeline.md` |

---

## 1. 맥락

현재 Boardmark의 sandpack fenced block은 block body를 **JSON 문자열**로 표현한다.

````md
```sandpack
{
  "template": "react",
  "files": {
    "App.js": "export default function App() {\n  return <div>Hello</div>;\n}"
  }
}
```
````

이 포맷은 파서 구현이 단순하고 ADR-001에서 확립한 `{ source: string }` 렌더러 계약과 잘 맞는다.

**그러나 사용자 경험에서 근본적인 문제가 있다.**

- 파일 내용이 JSON 문자열로 직렬화되어 모든 줄바꿈이 `\n`, 모든 `"`가 `\"`로 인코딩된다.
- 실제 코드가 아니라 이스케이프된 문자열이기 때문에 IDE 구문 강조, 자동 완성, 포매터가 동작하지 않는다.
- 코드가 길어질수록 한 줄 문자열이 수백 자를 넘어 읽기와 수정이 사실상 불가능해진다.
- 템플릿 리터럴이나 여러 파일을 넣는 순간 유지보수 비용이 급격히 증가한다.

이 문제는 sandpack 기능이 확장될수록 커진다. Boardmark를 **코드 실행 가능한 캔버스 노트**로 발전시키려면, 작성자가 코드를 코드로 쓸 수 있어야 한다.

---

## 2. 결정 드라이버

1. **프로그래밍 자유도** — 변수 선언, 화살표 함수, 템플릿 리터럴, import 등을 이스케이프 없이 자연스럽게 작성할 수 있어야 한다.
2. **코드 편집 경험** — IDE / 텍스트 에디터에서 구문 강조와 자동 완성이 동작해야 한다. markdown 안에서 코드를 직접 편집할 수 있어야 한다.
3. **작성자 UX** — 문법을 외우거나 인코딩을 신경 쓰지 않아도 직관적으로 sandpack block을 작성할 수 있어야 한다.
4. **멀티파일 지원** — 여러 파일을 자연스럽고 명확하게 표현할 수 있어야 한다.
5. **파서 구현 비용** — Boardmark 파서 수정 범위가 합리적이어야 한다.
6. **생태계 호환성** — 기존 remark/rehype 생태계 또는 표준 markdown 도구와 얼마나 잘 맞는가.

---

## 3. 검토한 옵션

### Option A — 현재 방식: JSON 문자열 임베딩 (baseline)

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

**장점**

- 파서가 JSON.parse 한 번으로 처리 가능
- ADR-001 렌더러 계약(`{ source: string }`)을 그대로 유지
- 현재 구현 비용 없음

**단점**

- 코드가 이스케이프된 문자열 → IDE 지원 전혀 없음
- 줄바꿈·따옴표 인코딩 오류가 조용히 발생함
- 10줄 이상 코드에서 작성·수정이 사실상 불가능
- 템플릿 리터럴 사용 불가

**프로그래밍 자유도**: ✗ / **편집 경험**: ✗ / **작성자 UX**: ✗

---

### Option B — MDX 컴포넌트

```mdx
<Sandpack
  template="react"
  files={{
    "App.js": `
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
    `
  }}
/>
```

**장점**

- 코드를 템플릿 리터럴로 작성 → 이스케이프 불필요
- JSX 구문이므로 `.mdx` 파일에서 IDE 지원 가능
- `@mdx-js/react` 생태계와 완전히 일치
- props로 임의 설정을 자유롭게 전달 가능 → 프로그래밍 자유도 최대
- 장기적으로 컴포넌트 임포트, 공유 데이터 주입 등으로 확장 가능

**단점**

- Boardmark가 현재 MDX 파이프라인이 아닌 remark + rehype + react-markdown 기반
- 전환하려면 파서·렌더러 파이프라인을 MDX 처리 가능하게 교체해야 함 (높은 마이그레이션 비용)
- JSX 파싱이 markdown 파서에 통합되어야 하므로 Boardmark 포맷 자체가 `.md`에서 `.mdx`로 변경
- 사용자가 JSX 문법을 알아야 함

**프로그래밍 자유도**: ✓✓ / **편집 경험**: ✓✓ / **작성자 UX**: △ (JSX 지식 필요)

---

### Option C — 파일 구분자 주석 (File separator comments)

````md
```sandpack template=react
// @file App.js
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// @file utils.js
export const add = (a, b) => a + b;
```
````

`// @file <path>` 주석으로 파일 경계를 선언한다. 파서는 이 패턴을 감지해 파일 맵으로 분리한다.

**장점**

- 코드가 실제 코드처럼 보임 (이스케이프 없음)
- fenced block 안에서 자연스럽게 멀티파일 지원
- 파서 변경이 최소 (언어 태그에서 설정 추출 + `// @file` 분리 로직만 추가)
- Boardmark 포맷이 `.md`를 유지함

**단점**

- `// @file` 주석이 실제 JS 주석과 외형이 같아 혼란 가능
- info string 파라미터(`template=react`) 파싱을 추가해야 함
- 코드 블록 언어가 `sandpack`이라 IDE 구문 강조 미지원 (언어 감지 어려움)

**프로그래밍 자유도**: ✓ / **편집 경험**: △ (구문 강조 없음) / **작성자 UX**: ✓

---

### Option D — YAML 헤더 + 코드 섹션

````md
```sandpack
template: react
dependencies:
  react-query: "^5"
---
// App.js (entry)
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// utils.js
export const add = (a, b) => a + b;
```
````

block body를 `---` 구분자로 **YAML 설정 헤더** + **코드 섹션**으로 나눈다. 코드 섹션에서는 `// filename.js` 주석으로 파일 경계를 선언한다.

**장점**

- 설정(template, dependencies)이 YAML로 읽기 쉬움
- 코드 섹션은 이스케이프 없는 실제 코드
- YAML 파싱은 기존 remark 파이프라인과 친화적

**단점**

- YAML + `---` 구분자 + 파일 주석 세 가지 규칙을 조합한 커스텀 포맷
- 파서 구현 복잡도가 Option C보다 높음
- YAML의 들여쓰기 민감성이 사용자 실수를 유발할 수 있음

**프로그래밍 자유도**: ✓ / **편집 경험**: △ / **작성자 UX**: △ (규칙이 많음)

---

### Option E — 멀티 fenced block (파일별 분리)

````md
```sandpack template=react

```

```jsx sandpack:App.js entry
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

```css sandpack:styles.css
body {
  margin: 0;
  background: #f5f5f5;
}
```
````

sandpack 선언 block과 각 파일 block을 별도 fenced block으로 분리한다. 파일 block의 언어가 실제 파일 언어(`jsx`, `css`, `ts`)가 되어 IDE 구문 강조가 동작한다.

**장점**

- 각 파일 block에서 IDE 구문 강조·자동 완성 완전히 동작
- 파일 언어(jsx, ts, css)가 명시되어 코드 작성 경험이 가장 자연스러움
- 이스케이프 전혀 없음

**단점**

- Boardmark 파서가 연속된 fenced block들을 하나의 sandpack 단위로 묶는 로직이 필요
- sandpack block 경계 판단이 context-dependent → 파서 복잡도 상승
- block 사이에 다른 markdown 요소가 끼어들면 연결이 끊어짐
- sandpack 선언 block과 파일 block의 관계가 암묵적

**프로그래밍 자유도**: ✓✓ / **편집 경험**: ✓✓ / **작성자 UX**: △ (블록 관계가 비직관적)

---

### Option G — MDX 컴포넌트 + 중첩 fenced block (remark-sandpack 방식) ⭐

[remark-sandpack](https://github.com/thecuvii/remark-sandpack)이 채택한 방식. MDX 컴포넌트를 외부 래퍼로, 실제 언어 fenced block을 파일 표현으로 쓴다.

````mdx
<Sandpack template="react" customSetup={{ dependencies: { "react-query": "^5" } }}>

```js name=App.js active
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

```css name=styles.css
body {
  margin: 0;
}
```

</Sandpack>
````

`<Sandpack>` 컴포넌트가 설정(template, dependencies, options)을 props로 받고, 내부의 fenced block들이 파일 목록이 된다. 각 fenced block info string의 `name=` 속성으로 파일 경로를 지정하며, `active`, `readOnly`, `hidden` 플래그를 추가할 수 있다.

**장점**

- 코드가 실제 언어 fenced block → **IDE 구문 강조·자동 완성 완전히 동작**
- 이스케이프 전혀 없음, 템플릿 리터럴 사용 가능
- 설정이 props로 표현되어 명시적이고 자유로움 (임의 prop 추가 가능)
- remark-sandpack 레퍼런스 구현이 존재 → 생태계 검증됨
- MDX 파이프라인 전환 시 Option B의 이점을 그대로 흡수
- `.md` → `.mdx` 전환 없이도 remark 플러그인으로 부분 지원 가능

**단점**

- MDX 처리 파이프라인이 필요 (순수 `.md` 포맷에서는 동작하지 않음)
- Boardmark 포맷이 MDX 구문을 포함하게 됨 → 포맷 정체성 질문이 생김
- JSX 문법에 익숙하지 않은 사용자에게는 `<Sandpack>` 태그가 낯설 수 있음

**프로그래밍 자유도**: ✓✓ / **편집 경험**: ✓✓ / **작성자 UX**: ✓ (remark-sandpack 레퍼런스로 학습 가능)

**Option G 개선 방향**

Option G를 기반으로 추가 설계할 수 있는 두 가지 확장이 있다.

_파일 언어 자동 추론_

현재 remark-sandpack은 info string에 언어와 파일명을 모두 명시해야 한다. 파일명의 확장자로 언어를 추론하면 info string이 단순해진다.

````mdx
<!-- 현재: 언어 + name= 모두 필요 -->

<Sandpack template="react">```js name=App.js ... ```</Sandpack>

<!-- 개선: 확장자로 언어 자동 추론 -->

<Sandpack template="react">```App.js ... ```</Sandpack>
````

파서가 info string이 `언어` 패턴인지 `파일명` 패턴인지 판단하면 된다. 파일명 패턴(`.`을 포함하고 알려진 확장자)이면 언어를 추론하고, 그렇지 않으면 기존 방식으로 처리한다.

_레이아웃 제어_

`layout` prop 하나로 어떤 패널을 노출할지 선택한다. 문서 목적에 따라 에디터만, 결과만, 혹은 전체를 보여줄 수 있다.

```mdx
<!-- 결과만 표시 (설명 문서용) -->

<Sandpack template="react" layout="preview">

<!-- 코드만 표시, 편집 불가 (코드 설명용) -->

<Sandpack template="react" layout="editor" readOnly>

<!-- 기본: 에디터 + 미리보기 -->

<Sandpack template="react" layout="default">
```

Sandpack의 기존 `options.visibleFiles`, `options.activeFile` props를 추상화한 것으로, 구현 비용이 낮다.

---

### Option F — remark-directive 중첩 구문

````md
:::sandpack{template="react"}

::file{name="App.js" entry}

```jsx
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

::

::file{name="styles.css"}

```css
body {
  margin: 0;
}
```

::

:::
````

[remark-directive](https://github.com/remarkjs/remark-directive)의 `:::container` + `::leaf` 구문을 활용한다. 파일별로 실제 언어 fenced block을 중첩할 수 있다.

**장점**

- remark 생태계 표준 확장 문법을 사용
- 각 파일 block이 실제 언어 fenced block → IDE 구문 강조 가능
- `:::sandpack` / `::file` 구분이 명시적으로 계층 구조를 표현
- remark-directive 플러그인 도입 시 별도 커스텀 파서 불필요

**단점**

- `:::` / `::` 문법이 일반 사용자에게 낯설 수 있음
- remark-directive 의존성 추가 필요
- 중첩 깊이가 깊어지면 가독성이 떨어짐

**프로그래밍 자유도**: ✓✓ / **편집 경험**: ✓✓ / **작성자 UX**: △ (directive 문법 학습 필요)

---

## 4. 트레이드오프 비교표

| 기준                      | A (JSON 문자열) | B (MDX) | C (파일 구분자) | D (YAML+코드) | E (멀티 block) | F (directive) |  **G (MDX+fenced)** ⭐   |
| ------------------------- | :-------------: | :-----: | :-------------: | :-----------: | :------------: | :-----------: | :----------------------: |
| 이스케이프 없는 코드 작성 |        ✗        |    ✓    |        ✓        |       ✓       |       ✓        |       ✓       |          **✓**           |
| IDE 구문 강조             |        ✗        |    △    |        ✗        |       ✗       |       ✓        |       ✓       |          **✓✓**          |
| 멀티파일 표현 명확성      |        △        |    ✓    |        ✓        |       ✓       |       △        |       ✓       |          **✓✓**          |
| 작성자 학습 비용          |      낮음       |  중간   |      낮음       |     중간      |      중간      |     높음      |         **낮음**         |
| 파서 구현 복잡도          |      낮음       |  높음   |      낮음       |     중간      |      높음      |     중간      |         **중간**         |
| Boardmark `.md` 포맷 유지 |        ✓        |    ✗    |        ✓        |       ✓       |       ✓        |       ✓       |     **△** (MDX 포함)     |
| 프로그래밍 자유도         |        ✗        |   ✓✓    |        ✓        |       ✓       |       ✓✓       |      ✓✓       |          **✓✓**          |
| 생태계 레퍼런스 존재      |        ✓        |   ✓✓    |        △        |       △       |       △        |       ✓       | **✓✓** (remark-sandpack) |
| 장기 확장성               |        ✗        |   ✓✓    |        △        |       △       |       △        |       ✓       |          **✓✓**          |

---

## 5. 논의가 필요한 질문들

### Q1. Boardmark 포맷을 `.md`에서 `.mdx`로 전환할 의향이 있는가?

Option G는 `.md` 포맷을 완전히 버리지 않고 MDX 구문을 점진적으로 도입하는 경로다. `<Sandpack>` 컴포넌트 표현만 MDX 방식으로 처리하고, 나머지 markdown은 그대로 유지할 수 있다. 단, 파서가 JSX 컴포넌트 구문을 해석해야 한다.

- **JSX 구문 도입 가능하다** → Option G (remark-sandpack 방식) 채택
- **`.md` 를 완전히 유지한다** → Option C 또는 F

### Q2. 단기 개선이 필요한가, 장기 설계를 먼저 정하는가?

Option G는 remark-sandpack 레퍼런스 구현이 있어 다른 MDX 전환 경로보다 구현 비용이 낮다. 단기에 도입해도 장기 방향과 일치한다.

- **지금 당장 개선 + 장기 방향 일치** → Option G
- **최소 비용으로 일단 개선** → Option C를 단기 도입, 이후 G로 전환

### Q3. IDE 구문 강조가 필수인가?

Option C, D는 코드를 실제 코드처럼 쓸 수 있지만 언어 식별자가 `sandpack`이라 IDE 구문 강조는 여전히 동작하지 않는다. 이를 해결하려면 언어 식별자가 실제 파일 언어여야 한다 (Option E, F, B).

### Q4. 일반 사용자와 개발자 작성자를 동시에 고려하는가?

Option B와 F는 개발자에게 이상적이지만 마크다운 기반 사용자에게는 진입 장벽이 있다. Boardmark의 주 사용자 페르소나가 개발자라면 이 장벽은 수용 가능하다.

---

## 6. 결정

> **미결 — 논의 후 결정 예정**

**현재 제안 방향: Option G (MDX 컴포넌트 + 중첩 fenced block)**

````mdx
<Sandpack template="react">

```js name=App.js active
export default function App() {
  return <button>Hello</button>;
}
```
````

</Sandpack>
```

**Option G로 결정.** remark-sandpack이 이 방식을 채택해 생태계 검증이 되어 있으며, 결정 드라이버 3가지(프로그래밍 자유도, 코드 편집 경험, 작성자 UX)를 모두 충족하는 유일한 옵션이다.

**구현 전제 조건:**

- Boardmark 파서가 note body 안의 `<Sandpack>` JSX 컴포넌트 구문을 처리할 수 있어야 함
- remark-sandpack 플러그인 도입 또는 동등한 커스텀 remark 플러그인 구현
- 기존 JSON 방식 sandpack block → Option G 포맷 마이그레이션 스크립트 작성

**단계적 전환:**

- **현재 (MDX 파이프라인 없음):** Option A(JSON 방식) 유지
- **MDX 파이프라인 도입 시점:** Option G로 전환, 기존 JSON block은 마이그레이션 스크립트로 일괄 변환
- **Option G 확장:** 파일 언어 자동 추론, 레이아웃 제어는 초기 구현에 포함

---

## 7. MDX 도입 시 코드베이스 마이그레이션 비용 분석

현재 기술 스택을 기준으로 MDX를 도입할 경우 비용이 발생하는 지점을 분석한다.

### 7-1. 영역별 비용 요약

| 영역             | 현재 기술                         |     비용     | 핵심 이유                               |
| ---------------- | --------------------------------- | :----------: | --------------------------------------- |
| WYSIWYG 에디터   | TipTap v3 + MarkdownManager       | 🔴 매우 높음 | 데이터 모델 비호환, JSX 직렬화 불가     |
| 테스트 인프라    | vitest, 200+ 테스트               | 🔴 매우 높음 | react-markdown 기반 테스트 전면 재작성  |
| 마크다운 렌더러  | react-markdown v9 + remark/rehype |   🟠 높음    | 파이프라인 전체 교체 필요               |
| 캔버스 포맷 파서 | 커스텀 `:::` 디렉티브 파서        |   🟠 높음    | MDX 구문과 `:::` 경계가 충돌            |
| 빌드 설정        | Vite (web + desktop)              |   🟢 낮음    | `@mdx-js/vite` 플러그인 추가만으로 해결 |
| 패키지 의존성    | 기존 npm 패키지 유지 가능         |   🟢 낮음    | +300KB 번들 증가, 기존 패키지 유지      |

---

### 7-2. 영역별 상세

#### WYSIWYG 에디터 — 🔴 매우 높음

**현재 구조**

- TipTap v3 (`@tiptap/markdown` extension)이 markdown 문자열 ↔ ProseMirror document 간 직렬화를 담당
- `packages/canvas-app/src/components/editor/wysiwyg-markdown-bridge.tsx` (~400줄)
- `WysiwygSpecialFencedBlock` extension이 mermaid/sandpack의 편집 모드를 처리
- `:::` 디렉티브 경계 정규화 로직이 에디터 내부에 포함

**MDX 도입 시 문제**

- TipTap의 markdown 직렬화는 JSX 구문을 지원하지 않는다. `<Sandpack>` 컴포넌트 표현이 직렬화 과정에서 손실된다.
- 현재: `markdown string ↔ ProseMirror JSON ↔ markdown string` (완전한 round-trip 보장)
- MDX 도입 시: JSX 노드를 ProseMirror 스키마에 추가해야 하고, 직렬화에서 JSX AST를 보존하는 커스텀 serializer가 필요하다.
- `:::` 경계 정규화 로직이 MDX의 JSX 컴포넌트 경계와 충돌할 수 있다.

**변경 범위:** `wysiwyg-markdown-bridge.tsx`, `WysiwygSpecialFencedBlock` extension, `SpecialFencedBlockView`, TipTap schema 전체

---

#### 테스트 인프라 — 🔴 매우 높음

**현재 테스트 현황**

| 파일                               | 테스트 수 | 내용                                          |
| ---------------------------------- | --------- | --------------------------------------------- |
| `markdown-content.test.tsx`        | ~50개     | 마크다운 렌더링, 코드 하이라이팅, 이미지 처리 |
| `wysiwyg-markdown-bridge.test.tsx` | ~30개     | markdown ↔ ProseMirror round-trip             |
| `canvas-parser/index.test.ts`      | ~100개    | `:::` 디렉티브 파싱, 메타데이터               |

**MDX 도입 시 문제**

- react-markdown 기반 50개 테스트는 MDX 렌더러 구조와 달라 전면 재작성 필요
- round-trip 테스트 30개는 JSX 노드가 포함된 경우 비대칭 직렬화 문제로 깨진다
- `:::` 디렉티브 파서 테스트 100개는 MDX 구문 변경 시 전수 검토 필요

---

#### 마크다운 렌더러 — 🟠 높음

**현재 구조**

- `packages/ui/src/components/markdown-content.tsx` (~180줄)
- `ReactMarkdown` (react-markdown v9) + `remark-gfm` + `remark-breaks`
- fenced block은 `<pre>` 컴포넌트 override + 언어별 레지스트리로 처리 (ADR-001)
- Shiki v4 기반 코드 하이라이팅

**MDX 도입 시 문제**

- react-markdown은 JSX 실행을 지원하지 않는다. MDX 컴파일러(`@mdx-js/mdx`)로 교체 필요.
- ADR-001에서 확립한 fenced block 레지스트리 구조(`registry.ts`)는 MDX 컴포넌트 맵으로 재구성해야 한다.
- 기존 `{ source: string }` 렌더러 계약이 변경될 수 있다.

**변경 범위:** `markdown-content.tsx` 전체, `fenced-block/registry.ts`, 관련 렌더러 컴포넌트

---

#### 캔버스 포맷 파서 — 🟠 높음

**현재 구조**

- `packages/canvas-parser/src/index.ts` (~1000줄)
- `:::` 시작 / `:::` 종료로 note, image, edge, group 경계를 파싱
- note body는 raw markdown 문자열로 저장

**MDX 도입 시 문제**

- MDX의 JSX 컴포넌트 구문(`<Sandpack>`)과 Boardmark의 `:::` 디렉티브가 같은 body 안에 공존할 경우 파서 충돌 가능
- note body를 raw string으로 다루는 현재 방식은 JSX AST를 보존하지 못한다
- `.canvas.md` 파일은 사람이 읽고 쓰는 텍스트 포맷인데, JSX를 포함하면 직렬화 계약이 변한다

**변경 범위:** `canvas-parser/index.ts` 파서 코어, canvas format spec, 기존 `.canvas.md` 마이그레이션 스크립트

---

#### 빌드 설정 — 🟢 낮음

web, desktop 모두 Vite 기반이라 MDX 플러그인 추가만으로 해결된다.

```ts
// vite.config.ts
import mdx from '@mdx-js/vite'
plugins: [mdx(), react(), ...]
```

번들 크기는 약 +250KB gzip 증가 (MDX 컴파일러 +300KB, react-markdown 제거 -50KB).

---

### 7-3. 권장 마이그레이션 경로

MDX 전면 도입은 위 분석 기준으로 최소 12~16주의 비용을 요구한다. 현실적인 점진적 경로는 다음과 같다.

**경로 A — 현재 포맷 유지 + remark 플러그인 (낮은 비용)**

react-markdown을 유지하면서 커스텀 remark 플러그인으로 `<Sandpack>` 구문만 처리한다. MDX 파이프라인 없이도 Option G에 가까운 작성 경험을 제공할 수 있다.

- 영향 범위: `markdown-content.tsx`, 신규 remark 플러그인 1개
- 비용: 1~2주
- 한계: 완전한 JSX 실행이 아니므로 컴포넌트 props 타입 검사 등이 동작하지 않음

**경로 B — MDX 격리 도입 (중간 비용)**

`.canvas.md` 포맷은 유지하되, note body 안에서 특정 패턴(예: `<Sandpack>`)만 MDX 처리한다. 전면 포맷 전환 없이 캔버스 포맷의 안정성을 지키면서 MDX 이점을 부분적으로 얻는다.

- 영향 범위: `markdown-content.tsx`, `canvas-parser` (부분), 빌드 설정
- 비용: 4~6주
- 한계: 캔버스 파서와 MDX 파서의 경계를 명확히 설계해야 함

**경로 C — 전면 MDX 전환 (매우 높은 비용)**

포맷, 파서, 에디터, 테스트 전체를 MDX로 전환한다. 에디터(TipTap)의 JSX 직렬화 문제가 가장 큰 블로커다.

- 비용: 12~16주
- 전제 조건: TipTap의 MDX 직렬화 솔루션 또는 에디터 교체 결정

---

## 9. 열린 결정

| 번호 | 질문                                                       | 현재 상태 |
| ---- | ---------------------------------------------------------- | --------- |
| D1   | MDX 도입 범위: 전면 전환 vs 격리 도입 vs remark 플러그인만 | 미결      |
| D2   | TipTap sandpack 노드 serializer 교체 구현 시점             | 미결      |
| D3   | 기존 JSON 방식 sandpack block 마이그레이션 스크립트 설계   | 미결      |
| D4   | 파일 언어 자동 추론 규칙 (확장자 → 언어 매핑 기준)         | 미결      |

---

## 8. 변경 이력

| 날짜       | 변경 내용                                                                     | 작성자     |
| ---------- | ----------------------------------------------------------------------------- | ---------- |
| 2026-04-15 | 초안 작성, 6개 옵션 트레이드오프 정리                                         | homveloper |
| 2026-04-15 | Option G (MDX+fenced) 추가, remark-sandpack 레퍼런스 반영, 제안 방향 업데이트 | homveloper |
| 2026-04-15 | 코드베이스 분석 기반 MDX 마이그레이션 비용 분석 섹션 추가                     | homveloper |
| 2026-04-15 | Option G로 결정 확정, 단계적 전환 경로 및 전제 조건 명시                      | homveloper |
