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

추가로 Boardmark의 실제 작성 맥락은 독립 markdown 문서가 아니라 **오브젝트의 content body**, 특히 `note` body다. 이 맥락에서는 source authoring 경험만이 아니라 아래 제약도 함께 고려해야 한다.

- sandpack은 note body 안에서 자연스럽게 보이고 저장되어야 한다
- 현재 WYSIWYG는 `sandpack`을 특수 fenced block 하나로 취급한다
- markdown string ↔ WYSIWYG node ↔ markdown string round-trip이 깨지면 안 된다
- ADR-001, ADR-002, ADR-003에서 잡은 renderer/serializer/caret 계약과 충돌이 작아야 한다

---

## 2. 결정 드라이버

1. **프로그래밍 자유도** — 변수 선언, 화살표 함수, 템플릿 리터럴, import 등을 이스케이프 없이 자연스럽게 작성할 수 있어야 한다.
2. **코드 편집 경험** — IDE / 텍스트 에디터에서 구문 강조와 자동 완성이 동작해야 한다. markdown 안에서 코드를 직접 편집할 수 있어야 한다.
3. **작성자 UX** — 문법을 외우거나 인코딩을 신경 쓰지 않아도 직관적으로 sandpack block을 작성할 수 있어야 한다.
4. **멀티파일 지원** — 여러 파일을 자연스럽고 명확하게 표현할 수 있어야 한다.
5. **파서 구현 비용** — Boardmark 파서 수정 범위가 합리적이어야 한다.
6. **생태계 호환성** — 기존 remark/rehype 생태계 또는 표준 markdown 도구와 얼마나 잘 맞는가.
7. **WYSIWYG round-trip 안정성** — sandpack이 여전히 단일 special fenced block으로 모델링될 수 있어야 한다.
8. **오브젝트 body 적합성** — `note` content body 안에서 배치 규칙과 문법 경계가 명확해야 한다.

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

### Option H — outer `sandpack` fenced block + inner file fenced block ⭐

Boardmark의 현재 special fenced block 모델을 유지하면서, `sandpack` block body 안에서 파일별 fenced block을 다시 파싱하는 방식이다.

`````md
::: note { id: react-demo, at: { x: 0, y: 0, w: 720, h: 520 } }

````sandpack
template: react
layout: default
dependencies:
  react: "^19.0.0"
  react-dom: "^19.0.0"
---

```App.js active
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((value) => value + 1)}>{count}</button>;
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

바깥 `sandpack` fenced block 하나가 sandpack 전체를 나타내고, block body 안에서 선택적 YAML metadata header와 파일 fenced block들을 읽어 구조화된 파일 목록으로 변환한다.

**장점**

- ADR-001의 `{ source: string }` 렌더러 계약과 가장 자연스럽게 맞는다
- WYSIWYG에서 sandpack을 계속 단일 special fenced block으로 유지할 수 있다
- `note` body 안에 들어가는 실제 사용 맥락이 문법에서 분명하다
- 코드를 JSON 문자열이 아니라 실제 줄 단위 코드로 작성할 수 있다
- 기존 JSON 방식과의 하위 호환 및 점진적 마이그레이션이 쉽다

**단점**

- 일반 markdown 에디터는 바깥 block을 `sandpack`으로 보기 때문에 내부 파일 코드의 IDE 구문 강조를 보장하지 못한다
- inner fenced block은 CommonMark 기본 AST가 아니라 `sandpack` body 재파싱 로직이 필요하다
- metadata header와 inner fenced block 조합은 Boardmark 고유 규칙이므로 별도 문서화가 필요하다

**프로그래밍 자유도**: ✓ / **편집 경험**: △ / **작성자 UX**: ✓✓ / **WYSIWYG 적합성**: ✓✓

---

## 4. 트레이드오프 비교표

| 기준 | A (JSON 문자열) | B (MDX) | C (파일 구분자) | D (YAML+코드) | E (멀티 block) | F (directive) | G (MDX+fenced) | **H (outer sandpack + inner fences)** ⭐ |
|------|:---------------:|:-------:|:---------------:|:-------------:|:--------------:|:-------------:|:---------------:|:----------------------------------------:|
| 이스케이프 없는 코드 작성 | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **✓** |
| IDE 구문 강조 | ✗ | △ | ✗ | ✗ | ✓ | ✓ | ✓✓ | △ |
| 멀티파일 표현 명확성 | △ | ✓ | ✓ | ✓ | △ | ✓ | ✓✓ | **✓** |
| 작성자 학습 비용 | 낮음 | 중간 | 낮음 | 중간 | 중간 | 높음 | 낮음 | **낮음** |
| 파서 구현 복잡도 | 낮음 | 높음 | 낮음 | 중간 | 높음 | 중간 | 중간 | **중간** |
| Boardmark `.md` 포맷 유지 | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | △ | **✓** |
| WYSIWYG round-trip 적합성 | ✓✓ | ✗ | ✓ | ✓ | ✗ | △ | ✗ | **✓✓** |
| note body 문맥 적합성 | △ | △ | △ | △ | △ | ✓ | △ | **✓✓** |
| 생태계 레퍼런스 존재 | ✓ | ✓✓ | △ | △ | △ | ✓ | ✓✓ | △ |
| 장기 확장성 | ✗ | ✓✓ | △ | △ | △ | ✓ | ✓✓ | ✓ |

---

## 5. 논의가 필요한 질문들

### Q1. canonical source는 WYSIWYG single-block 모델을 유지해야 하는가?

ADR-002와 ADR-003을 기준으로 보면 sandpack은 WYSIWYG에서 여전히 특수 fenced block 하나로 취급되는 편이 안전하다. wrapper + child block 조합은 selection, caret, serializer에서 비용이 크다.

- **single-block 모델 유지가 우선이다** → Option H
- **source authoring 경험이 우선이고 editor 모델을 확장해도 된다** → Option G 또는 F

### Q2. note body 안에서 sandpack의 포함 관계가 source 상에 분명해야 하는가?

Boardmark 문서는 독립 markdown 페이지가 아니라 canvas object body의 집합이다. 실제 사용 예시는 `note` body 안에 sandpack이 들어가는 형태여야 하며, 이 맥락이 source에도 드러나는 편이 낫다.

- **object body 문맥을 source에 드러내야 한다** → Option H 또는 F
- **문법 자체의 생태계 친화성이 더 중요하다** → Option G

### Q3. IDE 구문 강조와 WYSIWYG 안정성 중 무엇을 우선하는가?

Option G, F, E는 IDE 경험이 강하지만 WYSIWYG/round-trip 비용이 높다. Option H는 IDE 경험을 일부 포기하는 대신 현재 renderer/serializer 계약과 잘 맞는다.

### Q4. metadata를 어디에 둘 것인가?

Option H를 채택할 경우 `template`, `layout`, `readOnly`, `dependencies`를 outer `sandpack` block body 안의 metadata header에 둘지, info string이나 hidden file로 분산할지 정해야 한다.

---

## 6. 결정

**Option H로 결정.**

Boardmark의 canonical sandpack source format은 **outer `sandpack` fenced block + inner file fenced block**이다.

`````md
::: note { id: react-demo, at: { x: 0, y: 0, w: 720, h: 520 } }

````sandpack
template: react
layout: default
---

```App.js active
export default function App() {
  return <button>Hello</button>;
}
```
````

:::
`````

이 결정은 source authoring만이 아니라 Boardmark의 실제 저장/편집 모델을 함께 고려한 결과다.

**선정 이유**

- `sandpack`을 WYSIWYG에서 계속 단일 special fenced block으로 다룰 수 있다
- ADR-001의 fenced block renderer 계약과 가장 잘 맞는다
- `note` content body 안에서 sandpack이 들어가는 실제 사용 맥락이 문법에 드러난다
- JSON 문자열 문제를 해결하면서도 MDX/JSX serializer 문제를 피할 수 있다
- 기존 JSON 포맷에서 점진적 전환이 쉽다

**구현 전제 조건:**

- `sandpack` fenced block body를 JSON 또는 nested fenced로 읽는 전용 parser가 필요하다
- outer block body의 metadata header와 inner file fenced block 계약을 문서화해야 한다
- WYSIWYG serializer는 sandpack을 계속 single special block으로 유지해야 한다
- 기존 JSON 방식 sandpack block → Option H 포맷 마이그레이션 스크립트가 필요하다

**단계적 전환:**

- **현재:** Option A(JSON 방식) 유지
- **1단계:** renderer가 JSON + Option H를 모두 인식
- **2단계:** WYSIWYG serializer 기본 출력 포맷을 Option H로 전환
- **3단계:** 기존 JSON block을 Option H로 마이그레이션
- **하위 호환:** 전환 기간 동안 JSON body 입력은 계속 허용

---

## 7. 구현 영향 분석

Option H는 현재 아키텍처를 크게 뒤집지 않고 도입할 수 있지만, `sandpack` block body를 다시 파싱하는 계약이 새로 필요하다.

### 7.1 영역별 영향 요약

| 영역 | 현재 기술 | 비용 | 핵심 이유 |
|------|-----------|:----:|-----------|
| WYSIWYG 에디터 | TipTap v3 + MarkdownManager | 🟠 중간 | serializer 기본 출력 포맷 변경 필요 |
| 마크다운 렌더러 | react-markdown v9 + remark/rehype | 🟢 낮음 | 기존 fenced block registry 위에서 parser만 추가 |
| Sandpack 렌더러 | `SandpackBlock` + JSON parse | 🟠 중간 | JSON + nested fenced dual parser 필요 |
| 캔버스 포맷 파서 | 커스텀 `:::` 디렉티브 파서 | 🟢 낮음 | note body는 여전히 raw markdown 문자열 유지 |
| 마이그레이션 | 기존 `.canvas.md` | 🟠 중간 | JSON block → Option H 변환 스크립트 필요 |

### 7.2 세부 영향

#### WYSIWYG 에디터

- `sandpack`은 계속 special fenced block 하나로 유지한다
- raw source textarea 편집 UX는 유지할 수 있다
- 기본 serializer 출력만 JSON에서 nested fenced로 바꾸면 된다
- selection/caret 모델은 기존 special fenced block 계약을 재사용할 수 있다

#### 마크다운 렌더러

- `ReactMarkdown`와 ADR-001의 fenced block registry 구조를 유지한다
- `sandpack` 렌더러 직전에 `source`를 JSON 또는 nested fenced로 해석하는 parser만 추가하면 된다
- MDX/JSX 파이프라인 도입이 필요 없다

#### 캔버스 포맷 파서

- `:::` 기반 note/object parser는 그대로 둔다
- note body는 여전히 raw markdown string으로 저장된다
- `sandpack`의 세부 문법은 note body 전체가 아니라 `sandpack` fenced block body 안에서만 해석하면 된다

#### 선택하지 않은 MDX 경로

MDX 기반 옵션은 source authoring과 IDE 경험은 강하지만, 현재 코드베이스에서는 아래 비용이 크다.

- TipTap markdown serializer가 JSX 구문을 안정적으로 round-trip 하지 못한다
- `note` body 안의 `:::` 디렉티브와 JSX wrapper를 함께 다뤄야 한다
- renderer, test, serializer 계약을 동시에 바꿔야 한다

따라서 MDX 경로는 장기 실험 후보로는 남길 수 있지만, current canonical source로는 채택하지 않는다.

---

## 8. 열린 결정

| 번호 | 질문 | 현재 상태 |
|------|------|-----------|
| D1 | metadata header를 YAML로 고정할지, 더 제한된 key/value 문법으로 줄일지 | 미결 |
| D2 | `dependencies`를 metadata header만 지원할지, 향후 `package.json` hidden file도 허용할지 | 미결 |
| D3 | TipTap sandpack 노드 serializer 기본 출력 포맷 전환 시점 | 미결 |
| D4 | 파일 언어 자동 추론 규칙 (확장자 → 언어 매핑 기준) | 미결 |
| D5 | 기존 JSON block 마이그레이션 시점 (serializer 전환 직후 vs 별도 릴리즈) | 미결 |

---

## 9. 변경 이력

| 날짜       | 변경 내용                                                                     | 작성자     |
| ---------- | ----------------------------------------------------------------------------- | ---------- |
| 2026-04-15 | 초안 작성, 6개 옵션 트레이드오프 정리                                         | homveloper |
| 2026-04-15 | Option G (MDX+fenced) 추가, remark-sandpack 레퍼런스 반영, 제안 방향 업데이트 | homveloper |
| 2026-04-15 | 코드베이스 분석 기반 MDX 마이그레이션 비용 분석 섹션 추가                     | homveloper |
| 2026-04-15 | Option G로 결정 확정, 단계적 전환 경로 및 전제 조건 명시                      | homveloper |
| 2026-04-15 | note body/WYSIWYG 제약 반영. Option H(outer sandpack + inner fences)로 결정 수정 | Codex |
