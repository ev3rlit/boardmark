# ADR-004: Keyboard, Wheel, Gesture 입력 파이프라인 설계

| 항목 | 내용 |
|------|------|
| 문서 번호 | ADR-004 |
| 상태 | 🟢 결정됨 (Accepted) |
| 작성일 | 2026-04-09 |
| 관련 기능 | Canvas keyboard shortcuts, wheel zoom, trackpad pinch, input arbitration |
| 관련 문서 | `docs/architecture/README.md` |
| 관련 파일 | `packages/canvas-app/src/app/commands/canvas-app-commands.ts`, `packages/canvas-app/src/app/commands/canvas-object-commands.ts`, `packages/canvas-app/src/app/keyboard/canvas-app-keymap.ts`, `packages/canvas-app/src/app/keyboard/canvas-object-keymap.ts`, `packages/canvas-app/src/app/hooks/use-canvas-keyboard-shortcuts.ts`, `packages/canvas-app/src/keyboard/key-event-matchers.ts`, `packages/canvas-app/src/components/scene/canvas-scene.tsx` |

---

## 1. 맥락

현재 Boardmark의 입력 처리 구조는 키보드 단축키 중심으로 설계되어 있다.

- keyboard shortcut은 `key-event-matchers.ts`에서 해석된다.
- app/object keymap은 각각 `canvas-app-keymap.ts`, `canvas-object-keymap.ts`에 존재한다.
- 실제 dispatch는 `use-canvas-keyboard-shortcuts.ts`가 `window keydown/keyup`를 구독해 수행한다.
- 실행은 `canvas-app-commands.ts`, `canvas-object-commands.ts`가 담당한다.

이 구조는 플랫폼별 undo/redo shortcut, delete, zoom shortcut, 방향키 nudge처럼
**이산적인 keyboard command**에는 잘 맞는다.

하지만 wheel zoom, trackpad pinch, Safari gesture event 같은 입력은 같은 파이프라인에 자연스럽게 들어오지 못한다.

- `use-canvas-keyboard-shortcuts.ts`는 이름 그대로 `KeyboardEvent`만 다룬다.
- 따라서 `wheel`, `gesturechange` 같은 입력은 결국 `CanvasScene` 같은 UI 컴포넌트에서 직접 해석하게 된다.
- 그 결과 input matching, context gating, command execution이 keyboard와 non-keyboard 사이에서 분리된다.

이 문제는 단순한 버그가 아니라,
**입력 계층이 keyboard에 과도하게 특화되어 있고, input intent가 first-class contract로 존재하지 않기 때문**이다.

이 ADR의 목적은 아래 질문에 답하는 것이다.

1. Boardmark는 keyboard, wheel, gesture를 어떤 추상 모델로 다뤄야 하는가
2. 현재 구조를 유지할 것인가, 아니면 입력 파이프라인을 intent 중심으로 재구성할 것인가
3. Unreal Engine의 Enhanced Input 스타일과 VS Code의 keybinding resolver 스타일 중 어떤 관점을 채택할 것인가

---

## 2. 결정 드라이버

1. **입력 장치 확장성** — keyboard 외 wheel, trackpad pinch, future pointer/pen 입력까지 수용 가능해야 한다.
2. **정책 일관성** — `canExecute`, editable target 차단, selection/editing state gating이 입력 장치에 따라 갈라지면 안 된다.
3. **UI 레이어 단순성** — `CanvasScene` 같은 컴포넌트는 raw DOM event를 intent로 바꾸는 최소 책임만 가져야 한다.
4. **RULE.md 정합성** — 작고 명시적인 계약, 좁은 interface, source of truth 분산 방지 원칙을 지켜야 한다.
5. **점진적 도입 가능성** — 전체 입력 시스템을 한 번에 갈아엎지 않고 keyboard path를 보존하며 도입 가능해야 한다.
6. **테스트 가능성** — key, wheel, gesture를 같은 vocabulary로 테스트할 수 있어야 한다.
7. **플랫폼 명확성** — UI shortcut 문구는 `Cmd/Ctrl` 병기가 아니라 실제 플랫폼 정책과 동일한 표기를 사용해야 한다.

---

## 3. 현재 구조 진단

### 3.1 잘 되는 부분

- keyboard shortcut matching은 `matcher -> keymap -> dispatcher -> command`로 계층이 비교적 선명하다.
- app-level command와 object-level command가 분리되어 있어 책임이 어느 정도 명확하다.
- `canExecute*Command()`가 존재해서 selection/editing state gating을 한 곳에서 재사용할 수 있다.

### 3.2 구조적 한계

#### A. dispatcher가 KeyboardEvent 전용이다

현재 dispatch entrypoint는 `use-canvas-keyboard-shortcuts.ts` 하나뿐이다.

- 입력 타입: `keydown`, `keyup`
- 이벤트 타입: `KeyboardEvent`
- binding lookup도 keyboard map만 전제한다

즉 구조 자체가 keyboard outside input을 1급 시민으로 다루지 못한다.

#### B. non-keyboard input은 결국 컴포넌트에서 직접 실행한다

wheel/pinch는 현재 `CanvasScene`에서 직접 해석하고 직접 viewport를 바꾼다.

이 상태에서는:

- keyboard zoom은 command system을 타고
- wheel zoom은 scene component를 타고
- future gesture는 또 다른 경로를 타게 된다

즉 “동일 기능, 서로 다른 실행 경로”가 생긴다.

#### C. command model이 이산 keyboard action에 치우쳐 있다

현재 command는 `zoom-in`, `zoom-out`, `undo`, `delete-selection` 같은 discrete action 위주다.

이 모델은 keyboard에는 적합하지만 wheel/pinch는 원래 아래 속성을 가진다.

- 연속 입력
- anchor point 필요
- raw delta/scale 존재

따라서 keyboard command만으로는 충분하지 않고, 최소한 `input intent` 계층이 한 번 더 필요하다.

#### D. context 생성이 루트 컴포넌트에 묶여 있다

`CanvasApp`는 많은 store selector를 모아 command context를 만든다.
이 구조는 keyboard shortcut hook에는 적합하지만, scene-level raw input이 동일 경로를 재사용하려면 context를 다시 주입하거나 더 낮은 dispatch contract가 필요하다.

---

## 4. 검토한 옵션

### Option A — 현재 방식 유지: Keyboard Pipeline + Non-Keyboard Patch

**구조**

- keyboard는 현 구조 유지
- wheel/gesture는 각 UI 컴포넌트에서 별도 처리
- 공통 matcher 정도만 일부 공유

**장점**

- 가장 작은 변경
- 당장 bug fix 속도가 빠르다
- 기존 keyboard test/command path를 거의 건드리지 않는다

**단점**

- 입력 장치가 늘수록 컴포넌트별 patch가 누적된다
- 동일 기능이 여러 실행 경로로 분산된다
- input policy가 UI 계층으로 새기 쉽다
- source of truth는 store 하나라도 실행 policy의 source of truth는 분산된다

**판단**

단기 대응에는 유효하지만, 구조적 해법은 아니다.

---

### Option B — Unreal Enhanced Input 스타일: Action / Modifier / Trigger 기반

Unreal Enhanced Input의 핵심 아이디어는 “키 하나”보다 “의미 있는 입력 액션”을 중심에 두는 것이다.

예를 들어:

- `ZoomViewport`
- `PanCanvas`
- `ActivateTemporaryPan`
- `DeleteSelection`

그리고 raw input은 action으로 들어가기 전에 modifier/trigger를 거친다.

Boardmark에 옮기면 아래처럼 생각할 수 있다.

```ts
type CanvasInputAction =
  | { kind: 'zoom-viewport'; direction: 'in' | 'out'; anchorClientX: number; anchorClientY: number }
  | { kind: 'delete-selection' }
  | { kind: 'temporary-pan'; state: 'start' | 'end' }

type InputTrigger = (event: RawInputEvent, context: InputContext) => boolean
type InputModifier = (event: RawInputEvent) => RawInputEvent
```

**장점**

- keyboard, wheel, gesture를 공통 action vocabulary로 묶기 좋다
- input device가 늘어나도 action contract는 비교적 안정적이다
- trigger/modifier 개념이 ctrl/cmd 조건, gesture threshold, axis inversion 같은 문제를 표현하기 쉽다

**단점**

- Unreal은 게임 입력에 최적화된 모델이라 문서 편집기에는 과할 수 있다
- modifier/trigger layer를 크게 만들면 mini framework가 되기 쉽다
- RULE.md 관점에서 과한 추상화, 지나친 조합형 시스템으로 흐를 위험이 있다

**Boardmark 관점 판단**

철학은 매우 유용하다.
다만 Unreal처럼 범용 입력 스택 전체를 재현하는 것은 과하다.
Boardmark에는 “action first” 사고만 제한적으로 차용하는 것이 적절하다.

---

### Option C — VS Code 스타일: Keybinding Resolver 중심

VS Code의 강점은 “같은 key chord라도 현재 context에 따라 어떤 command가 실행될지 resolver가 결정한다”는 점이다.

핵심 개념은 대략 아래와 같다.

- keybinding rule
- when/context expression
- command id
- resolver priority

Boardmark에 옮기면:

```ts
type CanvasBindingRule<TEvent> = {
  commandId: string
  matches: (event: TEvent) => boolean
  when: (context: CanvasInputContext) => boolean
  preventDefault: boolean
}
```

**장점**

- 현재 keymap 구조와 가장 자연스럽게 연결된다
- `allowEditableTarget`, `canExecute`, selection/editing state를 resolver 조건으로 모으기 좋다
- keyboard binding conflict 해결 모델이 명확하다

**단점**

- VS Code 모델은 기본적으로 keybinding 문제에 최적화되어 있다
- wheel/pinch 같은 continuous input은 resolver만으로 자연스럽게 설명되지 않는다
- 결국 keyboard 바깥 입력에는 별도 규칙 계층이 추가된다

**Boardmark 관점 판단**

현재 구조를 정리하는 데는 매우 유용하다.
다만 이것만으로는 wheel/pinch 문제의 본질을 해결하지 못한다.

---

### Option D — Hybrid: Input Intent Pipeline + Per-Device Resolver

이 옵션은 Unreal의 “action 중심 사고”와 VS Code의 “resolver/context gating”을 결합한다.

구조는 아래와 같다.

1. raw event를 device-specific matcher가 받는다
2. matcher는 `CanvasInputIntent`를 만든다
3. resolver가 현재 context에서 intent를 허용/차단/정규화한다
4. dispatcher가 최종 command 또는 viewport operation을 실행한다

예시:

```ts
type CanvasInputIntent =
  | { kind: 'command'; commandId: 'undo' | 'redo' | 'delete-selection' }
  | {
      kind: 'viewport-zoom'
      mode: 'step' | 'continuous'
      direction?: 'in' | 'out'
      deltaScale?: number
      anchorClientX: number
      anchorClientY: number
    }
  | { kind: 'temporary-pan'; state: 'start' | 'end' }

interface CanvasInputResolver {
  resolve(intent: CanvasInputIntent, context: CanvasInputContext): CanvasResolvedInput | null
}
```

여기서 중요한 점은:

- keyboard는 `command` intent를 많이 만든다
- wheel/pinch는 `viewport-zoom` intent를 만든다
- resolver는 editable target, selection, editing state, tool mode를 기준으로 허용 여부를 판단한다

**장점**

- keyboard와 non-keyboard를 같은 입력 vocabulary 위에 올릴 수 있다
- current keymap/command 시스템을 완전히 버리지 않고 감쌀 수 있다
- UI 컴포넌트는 raw event -> intent 변환만 담당하면 된다
- future input device 확장성이 좋다
- RULE.md의 “좁은 interface + 구체 타입 반환” 원칙에 잘 맞는다

**단점**

- Option A보다 구현량이 크다
- keyboard-only mental model에 익숙한 코드에서 개념이 한 단계 늘어난다
- resolver와 command boundary를 잘못 설계하면 책임이 다시 섞일 수 있다

**Boardmark 관점 판단**

현재 저장소에 가장 맞는 균형안이다.

---

### Option E — Full Unified Input Graph

모든 입력을 완전한 graph / state machine으로 모델링하는 방식이다.

예:

- active pointer state
- active gesture state
- chord state
- tool mode state
- editor focus state

**장점**

- 이론적으로 가장 일반적이다
- 복잡한 multi-input interaction까지 설명 가능하다

**단점**

- 지금 요구사항보다 과하다
- 디버깅/유지보수 비용이 크다
- source of truth가 여러 군데로 분산될 위험이 있다

**판단**

현재 단계에는 부적절하다.

---

## 5. 결정

**채택안은 Option D — Hybrid: Input Intent Pipeline + Per-Device Resolver** 다.

이 결정은 아래 원칙을 따른다.

1. keyboard command path는 버리지 않는다
2. raw input device별 matcher는 유지하되, matcher의 출력은 `intent`로 통일한다
3. resolver는 VS Code처럼 context gating을 담당한다
4. action vocabulary는 Unreal처럼 “입력 의미” 중심으로 설계하되, 범용 modifier/trigger framework로 키우지는 않는다
5. continuous input은 command와 별도의 intent kind를 가질 수 있다

즉 Boardmark는 다음 둘을 동시에 채택한다.

- **Unreal에서 가져올 것:** action/intent first 사고
- **VS Code에서 가져올 것:** context-aware resolver와 rule-based dispatch

하지만 둘 다 그대로 복제하지는 않는다.

추가로 아래도 함께 결정한다.

1. 현재 1차 목표는 `keyboard`, `mouse`, `trackpad`를 같은 입력 vocabulary로 수용하는 것이다.
2. 현재 단계에서는 full unified input graph를 도입하지 않는다.
3. 대신 이번 하이브리드 구조는 **추후 graph 기반 입력 상태 모델로 확장 가능한 형태**로 설계한다.
4. 따라서 새 input contract는 “지금 필요한 최소 추상화”이면서도, 향후 `drag`, `pinch`, `temporary tool`, `editing arbitration` 같은 상태성 입력을 올릴 수 있어야 한다.
5. inline editing 중 wheel/pinch zoom은 허용한다.
6. pointer drag / resize / selection box arbitration도 이번 개선 범위에 포함한다.
7. desktop/web 입력 차이는 matcher 계층에서 흡수하고, resolver는 플랫폼 중립 규칙을 유지한다.
8. shortcut UI 문구는 운영체제별 실제 정책과 동일해야 하며 `Cmd/Ctrl` 병기는 사용하지 않는다.
9. `Space temporary pan`은 이미 현재 제품의 핵심 입력 기능이므로 이번 V1에 반드시 포함한다.

---

## 6. 제안 구조

### 6.1 권장 모듈 구성

```text
packages/canvas-app/src/input/
  canvas-input-intents.ts          # intent union
  canvas-input-context.ts          # resolver context type
  canvas-input-resolver.ts         # intent -> resolved action
  canvas-keyboard-input.ts         # keyboard matcher + keymap adapter
  canvas-wheel-input.ts            # wheel matcher
  canvas-gesture-input.ts          # gesture matcher
  canvas-input-dispatcher.ts       # resolved action 실행
```

기존 파일은 아래처럼 축소된다.

- `key-event-matchers.ts`: raw keyboard/wheel/gesture matcher helper
- `canvas-app-keymap.ts`: keyboard binding rule 정의
- `use-canvas-keyboard-shortcuts.ts`: 이름을 `use-canvas-input-listeners.ts`로 확장 가능
- `CanvasScene`: scene-local raw wheel/gesture subscription만 담당

### 6.2 권장 contract

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

type CanvasInputContext = {
  editingState: CanvasEditingState
  isEditableTarget: boolean
  toolMode: ToolMode
  viewport: CanvasViewport
}

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

### 6.4 graph-compatible 원칙

이번 결정은 full graph를 지금 도입하지 않는 대신, 아래 원칙을 강제한다.

1. intent 이름은 장치가 아니라 의미를 기준으로 짓는다.
   - 예: `viewport-zoom`
   - 비예: `ctrl-wheel-zoom`
2. resolver는 현재 context를 입력으로 받되, 향후 state machine의 node data로 승격할 수 있는 값만 사용한다.
   - 예: `editingState`, `toolMode`, `isEditableTarget`
3. dispatcher는 side effect 실행만 담당하고, raw DOM event 해석을 다시 하지 않는다.
4. UI component는 raw event subscription 위치일 뿐, 장기 정책의 소유자가 아니다.
5. platform-specific raw input 차이는 matcher에서 흡수하고, resolver/dispatcher vocabulary는 플랫폼 중립을 유지한다.

이 원칙을 지키면 나중에 아래와 같은 확장이 가능하다.

- `temporary-pan`을 keydown/keyup pair가 아니라 explicit input state로 승격
- `dragging-node`, `gesture-pinching`, `inline-editing`을 state graph node로 모델링
- keyboard/mouse/trackpad 충돌을 resolver rule이 아니라 state transition으로 설명

### 6.3 책임 분리

**Matcher**

- raw event를 읽는다
- 입력 장치별 해석만 한다
- store mutation이나 command 실행은 하지 않는다

**Resolver**

- 현재 context에서 intent가 유효한지 판단한다
- keyboard와 non-keyboard에 공통 정책을 적용한다
- 예: inline editing 중 wheel zoom 허용 여부, editable target 우선순위

**Dispatcher**

- resolved input을 실제 store action 또는 command execution으로 연결한다

**UI component**

- raw DOM event를 받는 위치일 뿐이다
- 입력 정책의 최종 소유자가 아니다

---

## 7. 단계적 도입 전략

### Phase 1 — keyboard path 정리

- 현재 `keymap -> canExecute -> execute` 구조를 input resolver vocabulary로 감싼다
- 기존 keyboard behavior는 그대로 유지한다

### Phase 2 — wheel zoom 이관

- `CanvasScene`의 wheel handler가 직접 `setViewport` 하지 않도록 바꾼다
- wheel은 `viewport-zoom` intent를 만들고 resolver/dispatcher를 탄다

### Phase 3 — gesture pinch 이관

- Safari gesture event, future browser pinch path를 같은 intent로 정규화한다
- inline editing 중에도 zoom intent는 허용한다

### Phase 4 — temporary tool / pointer input 확장

- `Space` temporary pan 같은 상태성 입력도 같은 resolver로 이동한다
- pointer drag / resize / selection box와의 arbitration도 같은 vocabulary로 끌어온다

### Phase 5 — 필요 시 graph 승격 검토

아래 조건이 2개 이상 충족되면 full unified input graph 승격을 검토한다.

1. 입력 충돌 규칙이 resolver rule만으로 설명되지 않는다
2. drag/pan/pinch/edit 상태가 동시에 얽혀 버그가 반복된다
3. pointer capture, gesture lifecycle, temporary tool state를 명시적 상태로 다뤄야 한다
4. keyboard/mouse/trackpad 간 동일 기능이 여전히 다중 경로로 유지된다

즉 full graph는 현재의 대체안이 아니라,
하이브리드 구조가 충분히 버티지 못할 때의 **명시적 2단계 진화 경로**로 둔다.

---

## 8. 결과와 후속 조치

### 기대 효과

- keyboard와 wheel/pinch가 같은 정책 vocabulary를 공유한다
- UI 컴포넌트에 input policy가 덜 새어 나온다
- 테스트를 “어떤 raw event가 어떤 intent로 해석되고, 어떤 command/action으로 실행되는가” 관점에서 쓸 수 있다

### 수용한 비용

- 새로운 input layer 도입으로 개념 수가 조금 늘어난다
- 초기 전환 시 keyboard path를 감싸는 보일러플레이트가 생긴다

### 즉시 필요한 후속 작업

1. `CanvasInputIntent` 초안 타입 정의
2. keyboard path를 intent/resolve/dispatch로 감싼 최소 spike 구현
3. zoom path를 `viewport-zoom` intent로 이관하는 설계 스파이크
4. inline editing 중 wheel/pinch 허용 정책 반영
5. platform-specific shortcut label policy 반영

---

## 9. 참고 관점

### Unreal Enhanced Input에서 차용할 관점

- raw key/button보다 action 의미를 우선한다
- 장치가 달라도 같은 action으로 합류할 수 있게 한다
- 단, Boardmark는 modifier/trigger framework를 과하게 일반화하지 않는다

### VS Code keybinding system에서 차용할 관점

- binding resolution은 현재 context에 의존한다
- command id는 stable contract로 유지한다
- 단, Boardmark는 keybinding resolver를 keyboard에만 한정하지 않고 intent resolver로 확장한다

---

## 10. 결정 요약

Boardmark는 입력 시스템을 완전한 게임 엔진식으로 갈 필요는 없고,
단순 keyboard shortcut table로 버티기에도 한계가 보인다.

따라서:

- **Action/Intent 중심 사고는 Unreal에서 차용하고**
- **Context-aware resolution은 VS Code에서 차용하며**
- **실제 구현은 Boardmark 규모에 맞는 좁은 hybrid input pipeline으로 제한한다**
- **장기적으로는 full graph로 승격 가능한 graph-compatible 구조를 유지한다**

이 방향이 현재 구조와 RULE.md 모두에 가장 잘 맞는다.
