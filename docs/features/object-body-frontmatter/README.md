# PRD: Object Body Frontmatter Metadata
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-02 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

### 1.1 Problem Statement

현재 Boardmark는 파일 레벨 frontmatter와 오브젝트 헤더 메타데이터는 지원하지만, 사용자가 오브젝트별 임의 메타데이터를 구조적으로 저장할 수 있는 전용 공간은 없다.

이 제약 때문에 사용자는 담당자, 상태, 태그, 우선순위, 외부 시스템 식별자 같은 문맥 정보를 body prose와 뒤섞어 적거나, 오브젝트 헤더의 코어 필드에 맞지 않는 값을 억지로 확장해야 한다. 이는 사람이 읽기에도 불명확하고, AI가 안정적으로 생성하거나 수정하기에도 불리하다.

Boardmark는 마크다운 파일이 곧 캔버스 데이터인 제품이므로, 오브젝트 content body 안에 사람이 읽기 쉽고 AI가 다루기 쉬운 object-local metadata 표현을 제공해야 한다.

### 1.2 Product Goal

오브젝트 body 최상단에 YAML frontmatter를 두고, 그 안의 `meta` 데이터를 파싱해 캔버스 앱에서 읽기 전용으로 보여준다.

- 모든 오브젝트(`node`, `edge`)는 object-local metadata를 가질 수 있어야 한다.
- metadata는 오브젝트 body 안에 저장되어 사람과 AI가 직접 읽고 수정할 수 있어야 한다.
- metadata는 코어 오브젝트 계약과 분리되어야 하며, 레이아웃이나 렌더링 규칙을 암묵적으로 바꾸지 않아야 한다.
- 캔버스 앱은 선택된 오브젝트의 metadata를 `Info` 액션을 통해 읽기 전용으로 보여줘야 한다.
- metadata가 없는 기존 문서는 아무 변경 없이 계속 유효해야 한다.
- 잘못된 metadata는 해당 오브젝트 단위 parse issue로 보고되고, 문서 전체 로드는 계속되어야 한다.

### 1.3 Success Criteria

- 사용자는 오브젝트 body 안에 `meta` 구조를 직접 작성하고 Git diff로 검토할 수 있다.
- parser는 body frontmatter의 `meta`를 object-level metadata로 분리해 제공한다.
- metadata가 없는 기존 `.canvas.md` 문서는 결과가 바뀌지 않는다.
- 사용자는 캔버스에서 오브젝트 하나를 선택한 뒤 `Info` 액션으로 metadata를 확인할 수 있다.
- 잘못된 YAML이 있더라도 다른 오브젝트는 계속 렌더된다.

---

## 2. Goals & Non-Goals

### Goals

- 오브젝트 body 최상단 YAML frontmatter 문법 정의
- 사용자 정의 metadata를 `meta` 루트 아래에 배치하는 계약 정의
- `node`와 `edge` 모두 같은 규칙을 따르도록 정의
- parser가 body raw text와 parsed metadata를 분리하는 방향 정의
- `CanvasNode` / `CanvasEdge`에 optional user metadata 필드가 추가되는 계약 정의
- `ObjectContextMenu`에서 진입하는 읽기 전용 `Info` 패널 UX 정의
- metadata empty state와 parse failure 정책 정의

### Non-Goals

- 캔버스 앱 안에서 metadata 생성/수정 UI 제공
- metadata schema editor 또는 key autocomplete 제공
- metadata 기반 검색, 필터, 정렬, 그룹화
- metadata를 이용한 style, renderer, layout override
- 파일 레벨 frontmatter 계약 변경
- 기존 `docs/canvas-md-prd.md` 전체 개정

---

## 3. Core User Stories

```text
AS  사용자
I WANT  오브젝트 body 안에 구조화된 메타데이터를 직접 적고
SO THAT 상태, 태그, 담당자 같은 문맥 정보를 본문과 분리해서 관리할 수 있다

AS  AI와 함께 작업하는 사용자
I WANT  object-local metadata가 사람이 읽을 수 있는 YAML로 저장되고
SO THAT 에이전트가 안전하게 읽고 생성하고 수정할 수 있다

AS  캔버스 사용자
I WANT  오브젝트를 선택한 뒤 Info 액션으로 metadata를 보고
SO THAT 보드 위 본문을 어지럽히지 않고 상세 정보를 확인할 수 있다

AS  기존 사용자
I WANT  metadata가 없는 문서도 그대로 열리고 렌더링되며
SO THAT 새 포맷 도입이 기존 보드를 깨지 않도록 할 수 있다
```

---

## 4. Format Contract

### 4.1 Canonical Example

```md
::: note { id: idea-a, at: { x: 120, y: 80, w: 320, h: 220 } }
---
meta:
  owner: "dan"
  status: "draft"
  tags:
    - canvas
    - metadata
  priority: 2
---

# 핵심 아이디어

오브젝트 본문 내용
:::
```

### 4.2 Body Frontmatter Rules

- object body frontmatter는 오브젝트 body의 첫 블록이어야 한다.
- 구분자는 파일 레벨 frontmatter와 동일한 YAML `---` 문법을 사용한다.
- 한 오브젝트 안에서 body frontmatter는 최대 1개만 허용한다.
- body frontmatter가 없으면 해당 오브젝트는 기존과 동일하게 처리한다.
- frontmatter 뒤의 나머지 body는 기존과 동일하게 component-defined payload로 유지한다.
- `note`와 `edge`뿐 아니라 모든 body-bearing object에 동일 규칙을 적용한다.

### 4.3 User Metadata Namespace

- 사용자 정의 metadata는 반드시 `meta` 루트 아래에 둔다.
- `meta`는 object, array, string, number, boolean, null을 허용한다.
- `meta` 아래의 key 이름은 사용자 자유다.
- 코어 오브젝트 계약과 사용자 metadata key space를 분리하기 위해 top-level freeform key는 허용하지 않는다.

예시:

```md
---
meta:
  jira:
    issueKey: "BM-142"
  owner: "design"
  review:
    required: true
    approvers:
      - "dan"
      - "mina"
---
```

### 4.4 Reserved Boundary

- body frontmatter는 `id`, `at`, `style`, `from`, `to` 같은 코어 헤더 필드를 대체하거나 override하지 못한다.
- geometry, edge endpoint, renderer/component 선택, style 적용은 계속 오브젝트 헤더가 소유한다.
- v1 metadata는 정보성 데이터로만 취급하며 렌더링 동작을 직접 바꾸지 않는다.

### 4.5 Parsing Rules

- parser는 body frontmatter를 파싱해 `meta`를 object-level metadata로 분리한다.
- body raw text와 parsed metadata는 별도 책임으로 다룬다.
- metadata가 정상일 때는 `body`와 `metadata`가 함께 보존된다.
- metadata가 없을 때는 `metadata`만 비어 있고 object는 정상 처리한다.
- YAML 형식이 잘못되면 해당 오브젝트만 parse issue로 수집한다.
- metadata parse failure는 문서 전체 fatal error가 아니다.

---

## 5. Data Contract Direction

### 5.1 Domain Model

향후 구현은 `CanvasNode` / `CanvasEdge`에 optional user metadata 필드를 추가하는 방향으로 정의한다.

```ts
type CanvasObjectUserMetadata = Record<string, unknown>

type CanvasNode = {
  id: string
  component: string
  at: CanvasObjectAt
  style?: CanvasObjectStyle
  metadata?: CanvasObjectUserMetadata
  body?: string
}

type CanvasEdge = {
  id: string
  from: string
  to: string
  style?: CanvasObjectStyle
  metadata?: CanvasObjectUserMetadata
  body?: string
}
```

### 5.2 Ownership Rules

- 파일 레벨 frontmatter는 문서 전역 계약을 계속 소유한다.
- 오브젝트 헤더 메타데이터는 코어 오브젝트 계약을 계속 소유한다.
- body frontmatter의 `meta`는 user-defined metadata 전용 공간이다.
- parser는 object header와 body frontmatter를 혼합하지 않고 분리된 필드로 제공해야 한다.

---

## 6. App UX Requirements

### 6.1 Entry Point

- 사용자가 오브젝트 하나를 선택하면 기존 `ObjectContextMenu`에 `Info` 액션이 추가되어야 한다.
- `Info`는 single selection일 때만 활성화한다.
- 다중 선택 시 `Info`는 비활성화하거나 열리지 않아야 한다.

### 6.2 Metadata Panel

- `Info`를 누르면 읽기 전용 metadata 패널이 열린다.
- 이 패널은 캔버스 본문 시야를 크게 방해하지 않는 보조 상세 뷰여야 한다.
- 패널은 dismiss 가능해야 한다.
- 패널은 object-context-menu에서 진입하는 선택 기반 상세 보기로 정의한다.

### 6.3 Panel Contents

v1 패널은 아래 정보만 보여준다.

- 오브젝트 기본 식별 정보: `id`
- 오브젝트 종류 정보: `component` 또는 edge 여부
- 사용자 metadata: `meta` 구조를 key-value 형태로 렌더링
- metadata가 없을 때의 empty state

### 6.4 Explicit Exclusions

- metadata는 오브젝트 카드 본문에 inline으로 노출하지 않는다.
- v1은 metadata 수정 UI를 제공하지 않는다.
- v1은 validation UI, schema editor, 검색/필터 연동을 제공하지 않는다.

---

## 7. Product Rules

### 7.1 Backward Compatibility

- body frontmatter가 없는 기존 문서는 그대로 유효하다.
- 기존 body content는 새 기능 때문에 재해석되거나 강제 변환되지 않는다.

### 7.2 Failure Handling

- invalid YAML은 해당 오브젝트 parse issue로만 수집한다.
- parse issue는 어느 오브젝트에서 실패했는지 식별 가능해야 한다.
- 다른 오브젝트와 문서 전체 렌더링은 가능한 한 계속 유지한다.

### 7.3 Scope Discipline

- metadata는 user-defined information storage다.
- metadata를 코어 layout/style contract로 승격하는 작업은 별도 기능으로 다룬다.

---

## 8. Acceptance Criteria

- `note` body 맨 위 frontmatter의 `meta`가 정상 파싱된다.
- `edge` body 맨 위 frontmatter의 `meta`가 정상 파싱된다.
- frontmatter가 없는 기존 문서는 결과가 바뀌지 않는다.
- `meta` 안의 nested object와 array가 보존된다.
- body frontmatter 뒤 일반 Markdown body가 그대로 렌더된다.
- 잘못된 YAML은 해당 오브젝트 parse issue로 보고되고 다른 오브젝트는 계속 렌더된다.
- 단일 선택 시 `Info` 액션으로 metadata가 보인다.
- metadata가 없는 오브젝트는 empty state가 보인다.
- 다중 선택 시 `Info`는 열리지 않거나 비활성화된다.

---

## 9. Open Notes

- 이 문서는 신규 기능 PRD만 다루며 기존 `docs/canvas-md-prd.md` 전체 개정은 포함하지 않는다.
- 초기 버전은 parser와 viewer contract 정리에 집중하고, editing UX는 후속 단계로 미룬다.
- 향후 metadata search, automation, schema validation이 필요하면 별도 feature 문서로 분리한다.
