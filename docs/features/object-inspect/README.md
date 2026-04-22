# PRD: Object Inspect
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-23 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

### 1.1 Problem Statement

Boardmark는 캔버스 편집기이지만, 실제 데이터의 진실은 `.canvas.md` source에 있다.

현재 사용자는 note, shape, edge를 캔버스에서 선택할 수 있고 selection toolbar로 일부 quick action을 실행할 수 있다. 하지만 아래 질문에는 즉시 답할 수 없다.

- 지금 선택한 오브젝트가 source 상 어느 줄에 있는가?
- 이 오브젝트의 header와 body range는 어디인가?
- 이 오브젝트를 AI나 다른 에디터에 넘기려면 어떤 id와 range를 써야 하는가?
- selection toolbar에서 지금 보고 있는 오브젝트의 "실제 코드 위치"를 바로 열 수 있는가?

이 단절 때문에 Boardmark의 핵심 장점인 **canvas와 markdown source의 왕복 가능성**이 UI에서 잘 드러나지 않는다.

### 1.2 Why This Has High ROI

이 기능은 ROI가 높다.

- parser와 domain model은 이미 `sourceMap.objectRange`, `headerLineRange`, `bodyRange`를 가지고 있다.
- selection toolbar라는 자연스러운 진입점이 이미 존재한다.
- 기능 자체는 작지만, 디버깅, AI handoff, source-based editing, canvas trust를 모두 동시에 개선한다.
- FigJam/Miro/Freeform이 잘하지 못하는 Boardmark 고유 강점을 직접 노출한다.

### 1.3 Product Goal

사용자가 캔버스에서 오브젝트를 선택했을 때, selection toolbar의 `Inspect` 액션을 통해 그 오브젝트의 실제 source 위치와 구조 정보를 즉시 확인할 수 있어야 한다.

### 1.4 Success Criteria

- 사용자는 selection toolbar에서 `Inspect`를 눌러 현재 선택 오브젝트의 source 위치를 확인할 수 있다.
- 사용자는 최소한 object id, object kind, source line range, header/body range를 볼 수 있다.
- 사용자는 source 범위를 복사하거나 source editor로 점프할 수 있다.
- inspect surface는 `.canvas.md`를 수정하지 않고 runtime-only로 동작한다.

---

## 2. Goals & Non-Goals

### Goals

- selection toolbar에 `Inspect` entry 추가
- 단일 선택 오브젝트의 source metadata 노출
- source jump / range copy / id copy 같은 실용 액션 제공
- node, edge, group을 동일 vocabulary로 설명하는 inspect contract 정의
- sourceMap 기반 정보 노출을 UI feature로 승격

### Non-Goals

- source editor 자체 구현
- source code inline editing
- AST 전체 inspector
- parse diagnostics viewer 전체 통합
- multi-object batch inspect v1

---

## 3. Target User & Core Scenarios

### Target User

- markdown source와 canvas를 함께 다루는 개발자
- 특정 오브젝트를 AI prompt나 issue comment에 정확히 넘기고 싶은 사용자
- large canvas에서 "이 오브젝트가 source 어디 있지?"를 자주 묻는 사용자

### Core User Stories

```text
AS  Boardmark 사용자
I WANT  선택한 오브젝트의 실제 source 위치를 바로 보고
SO THAT canvas와 markdown을 오가며 정확하게 편집할 수 있다

AS  AI-native 사용자
I WANT  object id와 source range를 복사해 다른 세션이나 툴에 넘기고
SO THAT 추가 설명 없이도 같은 오브젝트를 다시 찾을 수 있다

AS  디버깅 중인 사용자
I WANT  selection toolbar에서 inspect를 열어 header/body/object range를 확인하고
SO THAT 저장 결과와 화면 결과가 어디서 어긋나는지 빠르게 진단할 수 있다
```

---

## 4. Current State

현재 코드 기준으로 아래 조건은 이미 충족돼 있다.

- `CanvasNode`, `CanvasEdge`, `CanvasGroup`는 모두 `sourceMap`을 가진다.
- `sourceMap`에는 `objectRange`, `headerLineRange`, `bodyRange`, `closingLineRange`가 있다.
- selection toolbar는 `packages/canvas-app/src/components/scene/selection-toolbar.tsx`에서 공용 toolbar로 렌더된다.
- selection은 store에서 object id 단위로 유지되고, toolbar는 현재 selection에 반응한다.

즉 v1 inspect는 "새 데이터 모델 도입"이 아니라, **이미 존재하는 parser-derived metadata를 UI로 노출하는 일**에 가깝다.

---

## 5. Product Rules

### 5.1 Entry Rule

- `Inspect`는 selection toolbar에 노출한다.
- v1에서는 단일 선택일 때만 활성화한다.
- 다중 선택에서는 disabled 상태 또는 "Single selection only" 설명을 제공한다.

### 5.2 Inspect Surface Rule

inspect는 destructive modal이 아니라 lightweight 정보 surface여야 한다.

권장 형태:

- popover
- compact side sheet
- small inspector card

v1 목표는 빠른 확인이지, 별도 복잡한 panel 시스템 도입이 아니다.

### 5.3 Canonical Inspect Payload

v1 inspect surface는 최소 아래 필드를 보여준다.

- object kind: `node` / `edge` / `group`
- object id
- component kind 또는 edge/group type label
- object range start/end line
- header range start/end line
- body range start/end line

선택적으로 함께 보여줄 수 있다.

- object position (`at.x`, `at.y`, `at.w`, `at.h`)
- `locked`, `z`
- source snippet preview

### 5.4 Actions

v1 inspect surface의 기본 액션은 아래를 권장한다.

- `Copy object id`
- `Copy source range`
- `Copy inspect summary`
- `Reveal in source` 또는 동등한 jump action

`Reveal in source`는 host 환경에 따라 graceful degradation이 가능해야 한다.

- source editor bridge가 있으면 점프
- 없으면 range copy fallback

### 5.5 Runtime-Only Rule

- inspect open/closed state는 runtime UI state다.
- inspect 자체는 문서 source를 수정하지 않는다.
- inspect는 parser output을 읽기만 한다.

### 5.6 Trust Rule

inspect는 추정값을 보여주면 안 된다.

- line/offset은 반드시 parser의 `sourceMap` 기준이어야 한다.
- source snippet이 있다면 실제 range text와 일치해야 한다.
- "대충 이 근처" 같은 표현은 금지한다.

---

## 6. Functional Requirements

### 6.1 Toolbar Integration

- 단일 오브젝트가 선택되면 selection toolbar에 `Inspect` 버튼이 보여야 한다.
- 현재 `Auto height`, `Background color`, `Outline color`와 같은 수준의 quick action으로 배치할 수 있다.
- inspect 버튼은 node, edge, group 중 inspect 가능한 object에서만 활성화한다.

### 6.2 Object Resolution

- 현재 selection이 node면 해당 node inspect payload를 연다.
- 현재 selection이 edge면 해당 edge inspect payload를 연다.
- 현재 selection이 group이면 해당 group inspect payload를 연다.

### 6.3 Source Summary

inspect surface는 아래와 같은 요약을 제공해야 한다.

- `note welcome`
- `object: lines 11-17`
- `header: lines 11-11`
- `body: lines 12-16`

이 정보는 사람이 issue, PR comment, AI prompt에 그대로 옮겨 적을 수 있을 만큼 간결해야 한다.

### 6.4 Reveal in Source

가능한 host에서는 source editor open/jump를 제공해야 한다.

예시:

- desktop: `.canvas.md` editor로 이동 후 range selection
- web: source panel 또는 read-only source drawer로 이동

v1에서 host별 구현 차이가 있어도 inspect contract 자체는 동일해야 한다.

### 6.5 Copy Contracts

- `Copy object id`는 plain text id만 복사한다.
- `Copy source range`는 `object lines 11-17` 같은 요약 문자열을 복사한다.
- `Copy inspect summary`는 object kind, id, line range를 포함한 compact block을 복사한다.

---

## 7. UX Requirements

### 7.1 Layout

- inspect surface는 현재 선택 흐름을 깨지 않아야 한다.
- selection toolbar에서 한 번 더 열리는 light surface가 적합하다.
- source snippet이 길더라도 전체 surface를 차지하지 않게 접거나 truncate한다.

### 7.2 Terminology

사용자-facing 용어는 sourceMap 내부 타입명을 그대로 노출하지 말고, 아래처럼 번역한다.

- `Object range`
- `Header`
- `Body`
- `Source`

`headerLineRange` 같은 내부 코드 이름은 복사 payload에는 들어갈 수 있지만, 기본 UI label로 쓰지 않는다.

### 7.3 Empty / Unsupported State

아주 이른 runtime 오류나 malformed state로 sourceMap을 읽지 못하면:

- inspect surface는 열리되
- "Source metadata unavailable"를 명시하고
- 빈 성공 상태처럼 보이지 않아야 한다.

---

## 8. Open Questions

- web에서 `Reveal in source`를 별도 source drawer로 둘지, clipboard-first로 시작할지
- group drill-down selection 상태에서 `Inspect`가 group을 가리킬지, 내부 node를 가리킬지
- source snippet preview를 v1에 포함할지, line range까지만 보여줄지

---

## 9. Recommended Rollout

### Phase 1

- selection toolbar에 inspect 버튼 추가
- 단일 selection node/edge/group payload 표시
- id / range copy

### Phase 2

- host별 source jump
- compact source snippet preview

### Phase 3

- multi-selection inspect summary
- diagnostics / parse issue inspector와의 연결

---

## 10. Verification Expectations

- 단일 node 선택 시 inspect 버튼이 보인다.
- edge와 group도 동일 규칙으로 inspect된다.
- copy payload가 실제 `sourceMap` line range와 일치한다.
- inspect는 source를 변경하지 않는다.
- sourceMap이 없는 경우 오류 상태가 명시적으로 보인다.
