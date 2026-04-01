# Boardmark Pack System Design

## 1. 목적

이 문서는 Boardmark의 style pack과 component pack을 실제 구현 전에 계약 수준에서 고정하기 위한 설계 문서다.

목표는 다음과 같다.

- style pack을 자유형 CSS 묶음이 아니라 semantic token foundation collection으로 제한한다.
- component pack을 namespace 기반 React renderer registry로 정의한다.
- 새로운 시각 스타일과 새로운 노드 유형을 동시에 수용하되, renderer와 data schema를 분리한다.

관련 JSON Schema 초안은 아래 파일을 source of truth로 둔다.

- `schemas/style-pack.schema.json`
- `schemas/component-pack.schema.json`

built-in default style의 구체적인 contract는 아래 파일을 따른다.

- `docs/features/post-viewer/contract/boardmark-default.style-pack.json`

---

## 2. 설계 원칙

### 2.1 Style과 Component를 분리한다

- style pack은 색, 타이포, 간격, radius, shadow 같은 foundation token 세트를 담당한다.
- component pack은 특정 node type을 어떻게 렌더링할지 담당한다.
- 컴포넌트가 직접 raw color나 임의 CSS var 이름을 기대하지 않도록 한다.
- style pack은 특정 컴포넌트 구조를 알지 않는다.
- 어떤 semantic token을 어떻게 조합해 쓸지는 component pack 책임이다.
- frontmatter는 pack source를 등록하고 optional global default만 가진다.
- 실제 style/component 적용 선택은 node 단위가 우선이다.

### 2.2 Data Type과 Renderer를 분리한다

- `type`은 데이터 구조를 의미한다.
- `renderer`는 그 데이터를 어떻게 그릴지 선택하는 namespace key다.
- 같은 `note` 데이터라도 sticky, notebook, sticker처럼 여러 renderer가 가능하다.
- `chart.bar`, `quadrant`처럼 아예 다른 데이터 구조는 별도 node type으로 확장한다.

### 2.3 Namespace는 flat string으로 관리한다

- namespace는 `d3.chart`, `boardmark.note.sticky`, `company.analytics.chart.bar`처럼 `.` 구분자 문자열로 본다.
- MVP에서는 prefix tree를 만들지 않고 flat string registry로 유지한다.
- pack 병합 시 동일 namespace 충돌은 마지막 선언 우선으로 고정한다.

### 2.4 Runtime Safety를 우선한다

- 원격 arbitrary React code 실행은 허용하지 않는다.
- component pack manifest는 renderer namespace와 registry key만 선언한다.
- 실제 구현체는 로컬 번들 registry 또는 검증된 로컬 pack에서만 찾는다.

### 2.5 적용 범위는 Node가 우선한다

- frontmatter의 `defaultStyle`, `defaultComponent`는 optional global default다.
- node는 `styleRef`, `renderer`로 자신이 사용할 foundation/renderer를 직접 지정할 수 있다.
- 최종 적용 우선순위는 `node override` → `frontmatter global default` → built-in default다.

---

## 3. Style Pack 계약

style pack은 semantic token foundation을 하나 이상 제공한다.

### 고정 필드

- `kind`: `boardmark.style-pack`
- `schemaVersion`: `1`
- `namespace`: pack 식별 namespace
- `defaultFoundation`: 기본 foundation key
- `foundations`: foundation map

### 고정 token family

- `color.*`
- `font.*`
- `space.*`
- `radius.*`
- `shadow.*`

주의:

- `note.*` 같은 component-specific token family는 두지 않는다.
- note, sticker, chart annotation 같은 표현은 component pack이 `color.object.*`, `color.state.*`, `color.surface.*` 등을 조합해서 만든다.
- 색 계열 선택은 `palette`가 담당하고, 같은 계열 안에서의 시각 강도와 분위기는 `tone`이 담당한다.

### 예시

```json
{
  "$schema": "https://schemas.boardmark.dev/style-pack.schema.json",
  "kind": "boardmark.style-pack",
  "schemaVersion": 1,
  "namespace": "boardmark.editorial",
  "defaultFoundation": "light",
  "foundations": {
    "light": {
      "tokens": {
        "color.surface": "#f8f9fa",
        "color.text.primary": "#2b3437",
        "color.accent": "#6042d6",
        "font.body": "Manrope, sans-serif",
        "space.4": "1rem",
        "radius.lg": "1.25rem",
        "shadow.float": "0 20px 40px rgba(43,52,55,0.08)",
        "color.object.amber": "#fff5bf"
      }
    },
    "soft": {
      "extends": "light",
      "tokens": {
        "color.surface": "#f6f3ee",
        "color.text.primary": "#342f2b"
      }
    }
  }
}
```

### 해석 규칙

- 하나의 style pack 안에는 여러 foundation을 둘 수 있다.
- foundation은 `defaultFoundation` 또는 명시적 선택 key로 고른다.
- 여러 style pack은 선언 순서대로 병합한다.
- 같은 foundation key 안에서 같은 token key는 마지막 선언이 우선한다.
- schema 검증 실패 시 그 pack은 적용하지 않고 fallback으로 떨어진다.
- 앱은 항상 `boardmark.default` built-in style pack을 제공하고, 그 안에 최소 하나의 기본 foundation을 둔다.
- style pack은 component-specific alias를 강제하지 않는다.
- component pack은 semantic token을 조합해 자신의 renderer 스타일을 만든다.

### foundation 선택 규칙

- pack namespace는 배포 단위다.
- foundation key는 pack 내부 variant다.
- 최종 선택 키는 `packNamespace.foundationKey` 형태로 본다.
- 예: `boardmark.editorial.light`, `boardmark.editorial.soft`
- 문서가 foundation을 명시하지 않으면 `defaultFoundation`을 사용한다.

### frontmatter와 node 연결

- frontmatter의 `style`은 사용 가능한 style pack source 목록이다.
- frontmatter의 `defaultStyle`은 optional global default selector다.
- node의 `styleRef`는 실제 적용 selector다.
- node가 `styleRef`를 생략하면 frontmatter `defaultStyle`을 보고, 그것도 없으면 built-in default foundation을 사용한다.

---

## 4. Component Pack 계약

component pack은 namespace 기반 renderer registry manifest다.

### 고정 필드

- `kind`: `boardmark.component-pack`
- `schemaVersion`: `1`
- `namespace`: pack root namespace
- `components`: renderer entry 목록

### component entry 필드

- `key`: pack 내부 key
- `nodeType`: 이 renderer가 소비하는 node type
- `registryKey`: 실제 구현체를 찾을 registry key
- `propsSchemaRef`: node `data` payload를 검증할 schema 참조
- `supportsMarkdown`: markdown body 렌더 여부
- `category`: `note | chart | diagram | sticker | layout | custom`

### 예시

```json
{
  "$schema": "https://schemas.boardmark.dev/component-pack.schema.json",
  "kind": "boardmark.component-pack",
  "schemaVersion": 1,
  "namespace": "d3",
  "components": [
    {
      "key": "chart.bar",
      "nodeType": "chart.bar",
      "registryKey": "d3.chart.bar",
      "propsSchemaRef": "./node-types/chart.bar.schema.json",
      "category": "chart"
    },
    {
      "key": "chart.line",
      "nodeType": "chart.line",
      "registryKey": "d3.chart.line",
      "propsSchemaRef": "./node-types/chart.line.schema.json",
      "category": "chart"
    }
  ]
}
```

### 해석 규칙

- resolved renderer key는 `registryKey`를 그대로 사용한다.
- 같은 namespace key를 여러 pack이 제공하면 마지막 선언 우선이다.
- component manifest는 로드하되, 구현체는 로컬 registry에서만 찾는다.
- 앱은 항상 `boardmark.default.note` renderer를 포함한 built-in default component pack을 제공한다.

### frontmatter와 node 연결

- frontmatter의 `components`는 사용 가능한 component pack source 목록이다.
- frontmatter의 `defaultComponent`는 optional global default renderer selector다.
- node의 `renderer`는 실제 적용 selector다.
- node가 `renderer`를 생략하면 frontmatter `defaultComponent`를 보고, 그것도 없으면 built-in default renderer를 사용한다.

---

## 5. Node Type과 Renderer 분리

Boardmark node는 앞으로 아래 개념으로 나누는 것이 좋다.

- `type`: 데이터 구조
- `renderer`: 시각 구현 선택
  - optional이며 생략 시 frontmatter/global default 또는 built-in default를 따른다
- `props`: 공통 위치/크기 같은 layout 정보
- `data`: node type별 구조화 데이터
- `content`: markdown body가 필요한 타입에서만 사용

예시:

```ts
type CanvasNodeObject =
  | {
      type: 'note'
      styleRef?: 'boardmark.editorial.light' | 'boardmark.editorial.soft'
      renderer?: 'boardmark.note.sticky' | 'boardmark.note.notebook'
      props: { x: number; y: number; w?: number }
      content: string
      data?: { color?: string }
    }
  | {
      type: 'chart.bar'
      styleRef?: 'boardmark.editorial.light'
      renderer?: 'd3.chart.bar'
      props: { x: number; y: number; w?: number; h?: number }
      data: {
        labels: string[]
        values: number[]
      }
    }
  | {
      type: 'quadrant'
      styleRef?: 'boardmark.editorial.soft'
      renderer?: 'boardmark.quadrant.basic'
      props: { x: number; y: number; w?: number; h?: number }
      data: {
        xLabel: string
        yLabel: string
        items: Array<{ label: string; x: number; y: number }>
      }
    }
```

핵심:

- `sticky note`, `수첩`, `스티커`는 대체로 같은 `note` type 위의 renderer 차이로 다룬다.
- `chart`, `quadrant`는 대체로 별도 `type`으로 다룬다.
- 예를 들어 built-in note renderer는 `color.object.amber`, `color.object.blue`, `color.surface.lowest`, `color.text.primary`, `shadow.float` 같은 semantic token을 조합해서 UI를 만든다.

---

## 6. Renderer 계약

MVP 이후 component pack을 붙일 때 renderer가 기대할 최소 props는 아래 수준이 적절하다.

```ts
type NodeRendererProps<TData> = {
  nodeId: string
  nodeType: string
  rendererKey: string
  selected: boolean
  width?: number
  height?: number
  content?: string
  data: TData
  tokens: Record<string, string>
}
```

설계 의도:

- renderer는 이미 검증된 data만 받는다.
- token은 선택된 foundation이 해석된 결과만 받는다.
- renderer는 파일 I/O, parser, pack loader를 직접 알지 않는다.
- renderer는 semantic token을 조합해 자신의 visual rule을 만들고, style pack은 그 조합 방식을 알지 않는다.
- built-in renderer data는 대체로 `variant + palette + tone` 조합으로 표현 의도를 넘기고, 실제 색 값은 style pack token에서 읽는다.

---

## 7. Example Node Schemas

실제 node data schema는 type별로 별도 JSON Schema로 두는 것이 적절하다.

### 7.1 `note`

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "color": { "type": "string" },
    "variant": { "enum": ["sticky", "notebook", "sticker"] }
  }
}
```

### 7.2 `chart.bar`

```json
{
  "type": "object",
  "required": ["labels", "values"],
  "properties": {
    "labels": {
      "type": "array",
      "items": { "type": "string" }
    },
    "values": {
      "type": "array",
      "items": { "type": "number" }
    }
  }
}
```

### 7.3 `quadrant`

```json
{
  "type": "object",
  "required": ["xLabel", "yLabel", "items"],
  "properties": {
    "xLabel": { "type": "string" },
    "yLabel": { "type": "string" },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["label", "x", "y"],
        "properties": {
          "label": { "type": "string" },
          "x": { "type": "number" },
          "y": { "type": "number" }
        }
      }
    }
  }
}
```

---

## 8. 권장 구현 순서

1. `schemas/style-pack.schema.json`을 foundation collection 구조로 먼저 고정한다.
2. `schemas/component-pack.schema.json`을 고정한다.
3. built-in default style/component pack payload를 만든다.
4. `NodeRendererProps` 계약을 renderer layer에 도입한다.
5. `note`, `chart.bar`, `quadrant` 같은 예시 node schema를 별도 파일로 분리한다.
6. pack loader가 schema 검증 후에만 runtime registry로 승격하도록 만든다.
