# PRD: Input Pipeline Improvement
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-09 |
| 상태 | 초안 |
| 작성자 | Codex |
| 관련 ADR | `docs/adr/004-input-intent-pipeline.md` |

---

## 1. Overview

### 1.1 Problem Statement

현재 Boardmark의 입력 처리는 keyboard shortcut에는 비교적 잘 맞지만,
`mouse`, `wheel`, `trackpad pinch`까지 포함한 전체 입력 계층으로 보면 구조가 갈라져 있다.

- keyboard shortcut은 `matcher -> keymap -> dispatcher -> command` 경로를 탄다.
- 하지만 `Ctrl+wheel`, Safari gesture pinch, future pointer interaction은 같은 경로를 타지 못한다.
- 그 결과 non-keyboard 입력은 `CanvasScene` 같은 UI 컴포넌트에서 직접 해석하고 직접 실행하는 형태로 흘러간다.
- 동일한 기능이라도 입력 장치에 따라 실행 경로가 달라지고, gating policy도 분산되기 쉽다.

이 문제는 단순히 줌 버그 하나의 문제가 아니다.

- 어떤 입력이 허용되는가
- 어떤 입력이 editor에 우선권을 가지는가
- 어떤 입력이 command로 해석되는가
- 어떤 입력이 viewport operation으로 해석되는가

이 네 가지가 keyboard와 non-keyboard 사이에서 공통 모델 없이 분산되고 있다는 것이 본질이다.

즉 이번 작업의 본질은 “휠 줌 버그 수정”이 아니라,  
**keyboard, mouse, trackpad를 하나의 일관된 입력 파이프라인 위에 올리는 것**이다.

### 1.2 Product Goal

Boardmark의 입력 시스템을 `hybrid input intent pipeline`으로 재구성한다.

- keyboard, mouse, trackpad는 모두 같은 입력 vocabulary 위에서 해석되어야 한다.
- raw DOM event와 command execution 사이에 `intent` 계층이 존재해야 한다.
- 현재 context에 따라 입력 허용/차단/정규화가 가능해야 한다.
- keyboard path는 유지하되, non-keyboard input도 같은 정책 계층을 지나야 한다.
- 이번 구조는 지금 당장 full input state graph를 도입하지 않더라도, 추후 graph 기반 구조로 확장 가능해야 한다.

### 1.3 Success Criteria

- keyboard, wheel, gesture 입력이 서로 다른 ad-hoc 실행 경로를 가지지 않는다.
- 플랫폼별 실제 zoom shortcut, `Ctrl+wheel`, trackpad pinch가 같은 zoom semantics를 공유한다.
- editable target, selection, editing state, tool mode에 따른 입력 gating이 공통 계층에서 결정된다.
- `CanvasScene` 같은 UI 컴포넌트는 raw event subscription과 anchor 전달만 담당하고, 입력 정책의 소유자가 아니다.
- 새로운 입력 장치가 추가되더라도 command layer를 다시 설계하지 않고 intent/resolver에만 연결할 수 있다.

---

## 2. Goals & Non-Goals

### Goals

- keyboard, wheel, gesture 입력을 공통 `CanvasInputIntent` vocabulary로 정규화
- input device별 matcher와 context-aware resolver의 책임 분리
- 기존 command 시스템(`canExecute`, `execute`)과의 호환 유지
- viewport zoom처럼 anchor가 필요한 입력을 command와 별도 intent로 모델링
- `keyboard`, `mouse`, `trackpad`를 같은 입력 시스템의 1급 시민으로 취급
- 추후 full unified input graph로 확장 가능한 graph-compatible boundary 확보
- 운영체제별 UI shortcut 문구와 실제 정책을 일치시킴

### Non-Goals

- full unified input graph를 이번 작업에서 도입
- 게임 엔진 수준의 일반화된 modifier/trigger framework 구현
- 사용자 키맵 설정 UI 추가
- 모바일 touch-first gesture system 전체 설계
- pointer drawing, stylus pressure, multi-touch authoring 도입

---

## 3. Core User Stories

```text
AS  키보드 중심 사용자
I WANT  shortcut과 canvas interaction이 같은 규칙으로 동작하고
SO THAT 같은 기능이 입력 수단에 따라 다르게 느껴지지 않는다

AS  트랙패드 사용자
I WANT  pinch zoom이 keyboard zoom과 같은 의미 체계로 동작하고
SO THAT 줌 동작을 장치별로 따로 학습하지 않아도 된다

AS  캔버스 구현자
I WANT  keyboard, wheel, gesture를 같은 intent vocabulary로 테스트하고
SO THAT 입력 장치가 늘어나도 구조적 중복 없이 기능을 추가할 수 있다

AS  향후 아키텍처를 확장할 개발자
I WANT  지금의 입력 파이프라인이 full graph로 확장 가능한 경계를 유지하고
SO THAT 현재 구조를 전면 폐기하지 않고 다음 단계로 진화시킬 수 있다
```

---

## 4. Current State

### 4.1 Current Product Behavior

현재 입력 구조는 대략 아래처럼 동작한다.

- keyboard shortcut
  - `key-event-matchers.ts`
  - `canvas-app-keymap.ts`
  - `canvas-object-keymap.ts`
  - `use-canvas-keyboard-shortcuts.ts`
  - `canvas-app-commands.ts`
  - `canvas-object-commands.ts`
- wheel / gesture
  - `CanvasScene` 등 UI 컴포넌트에서 직접 DOM event 구독
  - 필요한 경우 matcher 일부만 재사용
  - 최종 store mutation 또는 viewport update는 컴포넌트에서 직접 수행

### 4.2 Why This Is Not Enough

현재 구조는 keyboard에는 적합하지만 전체 입력 시스템으로는 부족하다.

- dispatcher entrypoint가 `KeyboardEvent` 전용이다.
- wheel/gesture는 keymap과 resolver 구조를 재사용하기 어렵다.
- 동일 기능이 keyboard path와 scene-local path로 갈라진다.
- input policy가 UI 컴포넌트에 새어 나온다.
- “왜 지금 이 입력은 무시되었는가”를 하나의 vocabulary로 설명하기 어렵다.

### 4.3 Current Input Interpretation

현재 코드베이스 기준 입력 해석은 아래처럼 동작한다.

#### Keyboard

- global keyboard dispatch는 `window`의 `keydown` / `keyup`를 직접 구독한다.
- app keyboard binding이 먼저 평가되고, 매칭되지 않거나 실행되지 않을 때만 object binding이 평가된다.
- editable target 안에서는 `allowEditableTarget: false`인 binding이 차단된다.
- `window blur`가 발생하면 `deactivate-pan-shortcut`이 강제로 실행된다.

현재 app-level keyboard command는 아래 축을 가진다.

- `Space` keydown -> `activate-pan-shortcut`
- `Space` keyup -> `deactivate-pan-shortcut`
- undo / redo
- delete selection
- zoom in / zoom out
- escape로 context menu dismiss

현재 object-level keyboard command는 아래 축을 가진다.

- select all
- copy / cut / paste / paste-in-place / duplicate
- arrow nudge
- `Shift + arrow` large nudge

#### Tool Mode / Temporary Pan

- 현재 실제 active tool은 `toolMode`가 아니라 `readActiveToolMode()` 결과다.
- 즉 `panShortcutActive`가 `true`면 사용자가 select tool에 있어도 런타임 active mode는 `pan`으로 바뀐다.
- 이 때문에 `Space temporary pan`은 이미 “버튼 모드 전환”이 아니라 “임시 상태 오버레이”로 동작한다.

#### Scene Pointer / Drag / Selection

- `select` 모드에서만 node drag, edge reconnect, selection interaction이 켜진다.
- `pan` 모드에서는 `panOnDrag`만 켜지고 selection drag는 꺼진다.
- box selection은 `supportsMultiSelect && activeToolMode === 'select'`일 때만 켜진다.
- selection change는 `filterSelectionChanges()`를 통해 select mode가 아닐 때 차단된다.
- node drag commit은 드래그 종료 시점에만 store mutation으로 반영된다.
- 다중 선택 상태에서 선택된 노드를 끌면 selection nudge로 정규화되고, 아니면 단일 node move로 커밋된다.

#### Wheel / Gesture

- React Flow의 기본 `zoomOnScroll`, `zoomOnPinch`, `panOnScroll`은 모두 꺼져 있다.
- scene root가 native `wheel`과 `gesturestart/change/end`를 직접 구독한다.
- 현재 `wheel zoom`은 `Ctrl+wheel`만 인식하고 `Cmd+wheel`은 무시한다.
- gesture pinch는 별도 `gesturechange` 경로를 사용한다.
- 현재 wheel/gesture zoom은 command dispatcher를 통하지 않고 scene에서 직접 viewport를 계산해 `setViewport()`를 호출한다.

#### Zoom Execution Paths

- keyboard zoom은 `canvas-app-commands.ts`의 `zoom-in` / `zoom-out` command를 사용한다.
- button zoom은 `ZoomControls`에서 `reactFlow.zoomIn()` / `zoomOut()`을 호출한 뒤 `setViewport()`로 동기화한다.
- wheel/gesture zoom은 `CanvasScene`에서 직접 `readViewportAfterWheelZoom()` 계산 후 `setViewport()`를 호출한다.

즉 현재 zoom은 이미 세 가지 실행 경로로 나뉘어 있다.

#### Editor / Inline Editing Boundary

- `canCanvasMutateSelection()`은 `editingState.status === 'idle'`일 때만 `true`다.
- 따라서 keyboard app/object command 대부분은 inline editing 중 차단된다.
- 하지만 scene-local wheel/gesture zoom은 현재 command gating을 통하지 않는다.
- `BodyEditorHost`는 `onWheelCapture`에서 `stopPropagation()`을 호출하므로, editor 내부 wheel은 바깥 scene으로 전달되지 않는다.
- textarea / raw block editor / WYSIWYG surface는 모두 `nodrag`, `nopan`, `nowheel` 클래스를 사용한다.
- raw block preview는 `onMouseDown(event.preventDefault())` 후 즉시 edit 진입을 요청한다.

#### Shortcut Labeling

- 현재 shortcut label은 `Cmd/Ctrl` 병기 문자열을 사용한다.
- 이 표기는 실제 platform policy와 1:1 대응하지 않는다.

### 4.4 Current Conflicts Against Target

현재 코드 기준으로 문서화해보면, 이번 리팩토링이 다뤄야 할 충돌은 명확하다.

- keyboard는 command gating을 타지만 wheel/gesture는 scene direct execution으로 우회한다.
- `Space temporary pan`은 이미 상태성 입력인데, keyboard shortcut layer와 pointer layer가 통합되어 있지 않다.
- editor host는 wheel propagation을 막지만, 이 규칙이 resolver vocabulary로 표현되지는 않는다.
- zoom 실행 경로가 keyboard / button / wheel / gesture로 분산되어 있다.
- shortcut label 정책은 실제 platform rule과 불일치한다.

---

## 5. Product Principles

### 5.1 Intent First

- raw input device가 아니라 사용자 의도를 기준으로 모델링한다.
- `Ctrl+wheel`, trackpad pinch, keyboard shortcut이 모두 같은 `zoom` 의미로 합류할 수 있어야 한다.

### 5.2 Context-Aware Resolution

- 같은 intent라도 현재 context에 따라 허용/차단/정규화될 수 있어야 한다.
- `editingState`, `toolMode`, `isEditableTarget`, selection 상태가 resolution 입력이어야 한다.

### 5.3 UI Is Not The Policy Owner

- UI 컴포넌트는 raw event를 받는 위치일 뿐이다.
- 장기 입력 정책은 input layer가 소유해야 한다.

### 5.4 Graph-Compatible Boundaries

- 지금은 hybrid pipeline으로 가더라도, intent 이름과 resolver context는 state graph로 승격 가능한 형태여야 한다.
- 장치명을 intent 이름에 박지 않는다.

---

## 6. Scope

### 6.1 V1 In Scope

- keyboard app/object shortcut의 intent layer 도입
- wheel zoom의 intent/resolver path 이관
- trackpad gesture pinch의 intent/resolver path 이관
- `Space` temporary pan의 intent/resolver path 이관
- pointer drag / resize / selection box arbitration 정리
- 공통 input context 정의
- input resolver / dispatcher 경계 정의
- 기존 zoom command semantics와 viewport anchor behavior 정리
- continuous zoom을 수용하는 intent contract 정의
- matcher / resolver / scene 통합 테스트 보강

### 6.2 Out of Scope for V1

- drag/pan/pinch/edit 상태 전체를 graph node로 모델링
- pointer capture lifecycle의 완전한 상태 기계화
- mobile touch gesture 설계
- 키맵 커스터마이즈 UI

### V1 이후 백로그

V1 이후 남은 구조적 후속 작업은 별도 backlog 문서에서 관리한다.

- `docs/backlog/input-pipeline-followup/README.md`

---

## 7. Proposed Model

### 7.1 Input Layers

권장 구조는 아래와 같다.

```text
Raw DOM / platform event
  -> matcher
  -> CanvasInputIntent
  -> resolver(context)
  -> CanvasResolvedInput
  -> dispatcher
  -> command / viewport operation / state mutation
```

### 7.2 Key Concepts

#### `CanvasInputIntent`

raw input를 의미 있는 입력 의도로 변환한 값이다.

예:

```ts
type CanvasInputIntent =
  | { kind: 'command'; commandId: CanvasAppCommandId | CanvasObjectCommandId }
  | {
      kind: 'viewport-zoom'
      mode: 'step' | 'continuous'
      direction?: 'in' | 'out'
      deltaScale?: number
      anchorClientX: number
      anchorClientY: number
    }
  | { kind: 'temporary-pan'; state: 'start' | 'end' }
```

#### `CanvasInputContext`

resolver가 intent를 해석할 때 필요한 현재 상태다.

예:

```ts
type CanvasInputContext = {
  editingState: CanvasEditingState
  isEditableTarget: boolean
  toolMode: ToolMode
  viewport: CanvasViewport
}
```

#### `CanvasResolvedInput`

resolver를 거쳐 실제 실행 가능한 형태로 정리된 결과다.

예:

```ts
type CanvasResolvedInput =
  | { kind: 'execute-command'; commandId: CanvasAppCommandId | CanvasObjectCommandId }
  | {
      kind: 'apply-viewport-zoom'
      mode: 'step' | 'continuous'
      direction?: 'in' | 'out'
      deltaScale?: number
      anchorClientX: number
      anchorClientY: number
    }
```

### 7.3 Device Responsibilities

**Keyboard**

- keyboard matcher는 key chord를 읽고 `command` intent를 생성한다.
- resolver는 editable target, `canExecute`, current mode를 기준으로 허용 여부를 결정한다.

**Wheel**

- wheel matcher는 modifier, delta 방향, anchor 좌표를 읽고 `viewport-zoom` intent를 만든다.
- 실제 viewport mutation은 wheel handler가 직접 수행하지 않는다.

**Trackpad Gesture**

- gesture matcher는 scale delta와 anchor 좌표를 읽고 `viewport-zoom` intent를 만든다.
- keyboard zoom과 같은 zoom semantics를 사용해야 하며, contract는 continuous zoom도 수용해야 한다.

---

## 8. UX Requirements

### 8.1 Zoom Consistency

- 플랫폼별 실제 zoom shortcut, `Ctrl+wheel`, trackpad pinch는 같은 zoom semantics를 공유해야 한다.
- viewport anchor가 있는 입력은 포인터/gesture 위치를 기준으로 확대/축소되어야 한다.
- 사용자는 입력 장치에 따라 zoom magnitude가 완전히 다른 시스템처럼 느끼면 안 된다.
- input contract는 discrete step만이 아니라 future continuous zoom도 수용해야 한다.

### 8.2 Editing Arbitration

- inline editing 중 어떤 입력이 editor에 우선권을 가지는지 명시적이어야 한다.
- wheel/gesture zoom은 inline editing 중에도 허용한다.
- 다만 text selection, IME, pointer interaction과의 충돌은 resolver가 일관된 규칙으로 판단해야 한다.

### 8.3 Shortcut Label Policy

- shortcut UI 문구는 실제 플랫폼 정책과 동일해야 한다.
- `Cmd/Ctrl` 같은 병기 문구는 사용하지 않는다.
- 예:
  - macOS에서는 `Cmd+=`
  - Windows에서는 `Ctrl+=`

### 8.4 Predictability

- 동일한 intent는 가능한 한 동일한 결과를 가져야 한다.
- 동일한 기능이 입력 장치별로 전혀 다른 gating policy를 가지면 안 된다.

---

## 9. Architecture Requirements

### 9.1 Required Boundaries

- matcher는 raw event 해석만 한다.
- resolver는 context-aware policy 판단만 한다.
- dispatcher는 side effect 실행만 한다.
- command layer는 계속 business action의 stable contract로 유지한다.
- platform-specific 차이는 matcher에서 흡수하고, resolver는 플랫폼 중립 규칙만 다룬다.

### 9.2 Forbidden Patterns

- UI 컴포넌트가 raw event를 해석하고 바로 store mutation까지 수행하는 구조
- keyboard와 wheel이 같은 기능에 대해 서로 다른 can-execute 규칙을 갖는 구조
- `ctrl-wheel-zoom` 같은 device-specific 이름을 public intent contract에 쓰는 구조
- resolver가 raw DOM event 세부사항을 다시 파싱하는 구조

---

## 10. Implementation Plan

### Phase 1 — Intent Contract 도입

- `CanvasInputIntent`
- `CanvasInputContext`
- `CanvasResolvedInput`
- 최소 dispatcher contract 정의
- V1 구현에서는 `app-command`, `object-command`, `viewport-zoom`, `temporary-pan`,
  `pointer-node-move-commit`, `pointer-node-resize-commit`, `pointer-edge-reconnect-commit`
  intent를 사용한다

### Phase 2 — Keyboard Path 래핑

- 기존 keyboard shortcut path를 intent/resolver/dispatcher 구조로 감싼다
- `useCanvasKeyboardShortcuts.ts` 대신 `useCanvasInputListeners.ts`가 window keyboard/blur를 구독한다
- keyboard zoom shortcut도 command가 아니라 `viewport-zoom` intent로 정규화한다
- undo/redo/delete/object shortcut의 editable target 차단 규칙은 유지한다

### Phase 3 — Wheel Zoom 이관

- scene-local wheel handling이 direct execution 대신 intent 생성만 하도록 바꾼다
- resolver/dispatcher를 통해 viewport zoom을 실행한다
- discrete step semantics는 유지하되, contract는 continuous zoom까지 열어둔다
- `CanvasScene`는 wheel raw event와 viewport bounds만 전달하고 직접 `setViewport()` 하지 않는다

### Phase 4 — Trackpad Gesture 이관

- gesture pinch를 같은 zoom intent로 합류시킨다
- keyboard zoom semantics와 차이가 없도록 맞춘다
- inline editing 중에도 허용한다
- editor host / WYSIWYG surface는 일반 scroll wheel만 로컬에 가두고,
  zoom-qualified wheel은 scene pipeline으로 통과시킨다

### Phase 5 — Temporary Tool / Pointer 확장

- `Space` 기반 temporary pan을 같은 input pipeline 안으로 끌어온다
- React Flow render-time flag는 resolver가 계산한 pointer capability를 사용한다
- node drag stop / resize end / edge reconnect는 explicit pointer commit intent를 거쳐 dispatcher로 실행한다
- `Space`를 drag/resize/select-box 중간에 눌러도 현재 interaction은 끊지 않고,
  다음 pointer start부터 pan arbitration에 반영한다

### Why `temporary pan` is included in V1

`Space` temporary pan은 이미 현재 제품의 핵심 입력 기능이므로 이번 V1에 반드시 포함한다.

- keydown 시점에는 `temporary-pan:start`
- keyup 시점에는 `temporary-pan:end`
- 그 사이 pointer drag는 일반 selection drag가 아니라 pan 후보가 된다

즉 temporary pan은 단순 shortcut 하나가 아니라,
**keyboard 상태와 pointer drag 해석을 함께 묶는 상태성 입력 기능**이다.

이번 V1에서 이를 포함하는 이유는 아래와 같다.

- wheel/gesture만 통합하면 입력 의미 통합은 되지만 실제 drag 충돌 모델은 여전히 분산된다.
- temporary pan까지 같이 넣어야 `keyboard + mouse/trackpad`의 실제 우선순위를 한 번에 정리할 수 있다.
- 현재 제품에 이미 존재하는 기능이므로 새 입력 파이프라인 바깥에 남겨두면 구조가 다시 갈라진다.

### Phase 6 — Graph Escalation Checkpoint

다음 조건이 누적되면 full unified input graph로 승격 검토를 시작한다.

- resolver rule만으로 입력 충돌을 설명하기 어렵다
- drag/pinch/edit 상태가 반복적으로 얽힌다
- pointer capture lifecycle을 상태로 관리해야 한다
- keyboard/mouse/trackpad가 여전히 중복 경로를 가진다

---

## 11. Acceptance Criteria

- keyboard shortcut path가 intent/resolver vocabulary 위에 올라간다
- wheel zoom과 gesture zoom이 같은 zoom semantics를 사용한다
- `Space temporary pan`이 keyboard state + pointer drag 규칙 안에서 같은 pipeline으로 해석된다
- `CanvasScene`은 direct execution 대신 input pipeline 경계를 사용한다
- matcher / resolver / dispatcher 테스트가 분리된다
- shortcut UI 문구가 실제 플랫폼 정책과 일치한다
- feature 문서와 ADR-004가 같은 결론을 말한다

---

## 12. Open Questions

- pointer drag / resize / selection box / temporary pan의 구체 우선순위를 어떤 규칙 표로 문서화할지

---

## 13. Recommendation

이번 feature의 권장 구현 방향은 아래와 같다.

- 지금은 hybrid input intent pipeline으로 간다
- keyboard, mouse, trackpad를 모두 같은 입력 시스템의 1급 시민으로 취급한다
- full unified input graph는 지금 도입하지 않는다
- 대신 모든 새 입력 contract는 graph-compatible하게 설계한다

이 방향이 현재 Boardmark 규모, RULE.md 원칙, 그리고 ADR-004 결정과 가장 잘 맞는다.
