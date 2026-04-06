# Boardmark Keyboard Input Abstraction PRD & 구현 계획

## 1. 목적

이 문서는 `@boardmark/canvas-app`의 키보드 입력 처리를 **3계층 추상화**로 재설계하기 위한 제품 요구사항과 구현 계획을 함께 정의한다.

현재 구조는 `matchesUndoKey`, `matchesSpaceKey` 같은 매처 함수들이 키맵 바인딩에 직접 참조되는 방식이다. 키 조합이 코드로 표현되어 있어 직렬화와 오버라이드가 불가능하고, 키 변경 시마다 `canvas-app` 내부를 수정해야 하는 강한 결합이 생긴다.

이번 작업의 목표는 "어떤 키를 눌렀는가"(KeyChord), "어떤 의도인가"(InputAction), "무엇을 실행하는가"(Command) 세 레이어를 완전히 분리하여 각 레이어를 독립적으로 교체·확장할 수 있게 만드는 것이다.

---

## 2. 사용자 가치

이 기능은 최종 사용자보다 **개발자 경험과 장기 유지보수성**을 위한 내부 아키텍처 개선이다.

- 키맵 변경 시 하나의 데이터 파일만 수정하면 된다.
- 새로운 커맨드 추가 시 키 매처 함수를 새로 작성하지 않아도 된다.
- InputAction 레이어 덕분에 키보드 외 입력(게임패드, 터치 등)을 나중에 같은 파이프라인으로 수용할 수 있다.
- 내부적으로 오버라이드 API가 존재하므로 향후 사용자 설정 키맵 기능의 기반이 된다.

---

## 3. 제품 요구사항

### 3.1 범위

- 기존 6개 키 바인딩(Space pan, Cmd+Z, Shift+Cmd+Z, Delete/Backspace, Escape)을 새 구조로 100% 동일하게 재현한다.
- 키 조합을 함수가 아닌 `KeyChord` 데이터 구조체로 표현한다.
- `InputActionId`를 도입하여 물리 입력과 커맨드 사이에 의미론적 중간 레이어를 둔다.
- `InputMappingContext`로 바인딩 테이블을 하나의 직렬화 가능한 데이터 객체로 관리한다.
- 내부 오버라이드 API(`mergeKeymapOverrides`)를 제공하되 public UI에는 노출하지 않는다.

### 3.2 비범위

- 사용자에게 키 재설정 UI를 노출하는 기능
- 키맵 설정을 파일/로컬스토리지에 영속 저장하는 기능
- 게임패드, 터치, 마우스 제스처 입력
- 다중 IMC 스택과 우선순위 런타임 전환 (현재는 단일 컨텍스트)

### 3.3 기존 커맨드 레이어

`canvas-app-commands.ts`의 커맨드 정의(`canExecute`, `execute`)는 **변경하지 않는다**. 이 레이어는 이미 잘 설계되어 있으며, 입력 추상화의 영향을 받지 않는다.

### 3.4 내부 오버라이드 정책

- `mergeKeymapOverrides(base, overrides)` 함수는 구현하되 `canvas-app` 외부로 export하지 않는다.
- 오버라이드는 동일한 `InputActionId`와 `InputTrigger` 쌍에 대해 `KeyChord`를 교체하는 방식으로만 허용한다.
- 덮어쓰기 전용이며, 기본 바인딩의 추가·삭제는 지원하지 않는다.

---

## 4. 설계

### 4.1 계층 구조

```
KeyboardEvent
    │
    ▼
[ Layer 1: KeyChord ] ─ 직렬화 가능한 키 조합 데이터
    │  matchesChord(event, chord)
    ▼
[ Layer 2: InputAction ] ─ 의미론적 입력 의도 (platform-agnostic)
    │  resolveInputAction(context, event)
    ▼
[ Layer 3: Command ] ─ 기존 canExecute / execute 그대로
    │  ACTION_TO_COMMAND 테이블
    ▼
  실행
```

### 4.2 Layer 1 — KeyChord

키 조합을 함수 대신 순수 데이터로 표현한다. `matchesChord` 하나가 모든 매칭 로직을 담당한다.

```ts
// keyboard/key-chord.ts

type KeyChord = {
  key?: string      // event.key 값 (대소문자 무시)
  code?: string     // event.code 값 (물리 키 위치 기반, e.g. 'Space')
  mod?: boolean     // Mac=metaKey, 기타=ctrlKey
  shift?: boolean
  alt?: boolean
  ctrl?: boolean    // 명시적 Ctrl (mod와 별개)
}

function matchesChord(event: KeyEventLike, chord: KeyChord): boolean
```

`code`는 언어 입력 방식에 무관한 물리 키가 필요한 경우(Space 등)에만 사용하고, 일반 문자 키는 `key`를 사용한다.

### 4.3 Layer 2 — InputAction

물리 키와 커맨드 사이의 의미 레이어. 이 ID가 안정적이어야 커맨드와 키 양쪽이 독립적으로 변할 수 있다.

```ts
// keyboard/input-action.ts

type InputActionId =
  | 'pan.start'
  | 'pan.end'
  | 'edit.undo'
  | 'edit.redo'
  | 'selection.delete'
  | 'ui.dismiss'

type InputTrigger = 'pressed' | 'released'
```

### 4.4 Layer 3 — InputMappingContext

바인딩 테이블 전체를 하나의 직렬화 가능한 데이터 객체로 표현한다.

```ts
// keyboard/input-mapping-context.ts

type InputBinding = {
  actionId: InputActionId
  trigger: InputTrigger
  chord: KeyChord
  allowEditableTarget: boolean
  preventDefault: boolean
}

type InputMappingContext = {
  id: string
  bindings: InputBinding[]
}

// 이벤트에 매칭되는 바인딩 1개를 반환
function resolveInputBinding(
  context: InputMappingContext,
  trigger: InputTrigger,
  event: KeyEventLike
): InputBinding | null

// 내부 전용 — public API 아님
function mergeKeymapOverrides(
  base: InputMappingContext,
  overrides: Partial<Record<InputActionId, { chord: KeyChord; trigger: InputTrigger }>>
): InputMappingContext
```

### 4.5 기본 키맵 데이터

```ts
// keyboard/canvas-default-keymap.ts

const CANVAS_DEFAULT_KEYMAP: InputMappingContext = {
  id: 'canvas.default',
  bindings: [
    { actionId: 'pan.start',        trigger: 'pressed',  chord: { code: 'Space' },                       allowEditableTarget: false, preventDefault: true  },
    { actionId: 'pan.end',          trigger: 'released', chord: { code: 'Space' },                       allowEditableTarget: true,  preventDefault: false },
    { actionId: 'edit.undo',        trigger: 'pressed',  chord: { key: 'z', mod: true },                 allowEditableTarget: false, preventDefault: true  },
    { actionId: 'edit.redo',        trigger: 'pressed',  chord: { key: 'z', mod: true, shift: true },    allowEditableTarget: false, preventDefault: true  },
    { actionId: 'edit.redo',        trigger: 'pressed',  chord: { key: 'y', mod: true },                 allowEditableTarget: false, preventDefault: true  },
    { actionId: 'selection.delete', trigger: 'pressed',  chord: { key: 'Delete' },                       allowEditableTarget: false, preventDefault: true  },
    { actionId: 'selection.delete', trigger: 'pressed',  chord: { key: 'Backspace' },                    allowEditableTarget: false, preventDefault: true  },
    { actionId: 'ui.dismiss',       trigger: 'pressed',  chord: { key: 'Escape' },                       allowEditableTarget: true,  preventDefault: false },
  ]
}
```

### 4.6 Action → Command 연결

```ts
// app/canvas-app-keymap.ts (기존 파일 재구성)

const ACTION_TO_COMMAND: Record<InputActionId, CanvasAppCommandId> = {
  'pan.start':        'activate-pan-shortcut',
  'pan.end':          'deactivate-pan-shortcut',
  'edit.undo':        'undo',
  'edit.redo':        'redo',
  'selection.delete': 'delete-selection',
  'ui.dismiss':       'dismiss-object-context-menu',
}
```

### 4.7 단축키 레이블

`readCanvasAppShortcutLabel`은 `InputActionId` 기반으로 변경한다. 기존 `CanvasAppCommandId` 기반 레이블 함수는 내부적으로 Action ID를 통해 조회하도록 호환 유지한다.

---

## 5. 구현 계획

### Step 1 — `key-chord.ts` 신규 작성

**파일:** `packages/canvas-app/src/keyboard/key-chord.ts`

- `KeyChord` 타입 정의
- `matchesChord(event: KeyEventLike, chord: KeyChord): boolean` 구현
  - `code` 우선, `key` 폴백
  - `mod` → Mac이면 `metaKey`, 아니면 `ctrlKey`
  - `shift`, `alt`, `ctrl` 플래그 처리

### Step 2 — `input-action.ts` 신규 작성

**파일:** `packages/canvas-app/src/keyboard/input-action.ts`

- `InputActionId` 유니온 타입
- `InputTrigger` 유니온 타입 (`'pressed' | 'released'`)

### Step 3 — `input-mapping-context.ts` 신규 작성

**파일:** `packages/canvas-app/src/keyboard/input-mapping-context.ts`

- `InputBinding` 타입
- `InputMappingContext` 타입
- `resolveInputBinding()` 구현
- `mergeKeymapOverrides()` 구현 (내부 전용, export는 하되 `canvas-app` 내에서만 소비)

### Step 4 — `canvas-default-keymap.ts` 신규 작성

**파일:** `packages/canvas-app/src/keyboard/canvas-default-keymap.ts`

- 위 설계의 `CANVAS_DEFAULT_KEYMAP` 상수 구현
- Redo가 `Mod+Y`와 `Shift+Mod+Z` 두 바인딩을 가지므로 같은 `actionId`로 2개 엔트리

### Step 5 — `canvas-app-keymap.ts` 재구성

**파일:** `packages/canvas-app/src/app/canvas-app-keymap.ts`

- 기존 `CanvasAppKeyBinding[]` 배열과 matcher 함수 import 제거
- `ACTION_TO_COMMAND` 테이블 추가
- `CANVAS_DEFAULT_KEYMAP`을 import하여 사용
- `readCanvasAppKeyBinding` → `resolveCanvasAppInputBinding(trigger, event)` 로 rename
- `readCanvasAppShortcutLabel`은 `InputActionId` 기반으로 재구현하되 기존 `CanvasAppCommandId` 파라미터 시그니처 유지 (내부에서 역방향 조회)
- export: `resolveCanvasAppInputBinding`, `readCanvasAppShortcutLabel`, `ACTION_TO_COMMAND`

### Step 6 — `canvas-app.tsx` 디스패처 갱신

**파일:** `packages/canvas-app/src/app/canvas-app.tsx`

- `readCanvasAppKeyBinding` → `resolveCanvasAppInputBinding` 호출로 변경
- `binding.commandId` → `ACTION_TO_COMMAND[binding.actionId]` 로 변경
- 나머지 로직(`allowEditableTarget`, `preventDefault`, `canExecute`, `execute`) 동일 유지

### Step 7 — `key-event-matchers.ts` 제거

**파일:** `packages/canvas-app/src/keyboard/key-event-matchers.ts`

- `KeyEventLike` 타입을 `key-chord.ts`로 이동
- 파일 삭제 (import가 없어진 후)

---

## 6. 파일 변경 요약

| 파일 | 상태 |
|------|------|
| `keyboard/key-chord.ts` | 신규 |
| `keyboard/input-action.ts` | 신규 |
| `keyboard/input-mapping-context.ts` | 신규 |
| `keyboard/canvas-default-keymap.ts` | 신규 |
| `keyboard/key-event-matchers.ts` | 삭제 |
| `app/canvas-app-keymap.ts` | 재구성 |
| `app/canvas-app.tsx` | 디스패처 수정 |
| `app/canvas-app-commands.ts` | 변경 없음 |

---

## 7. 수용 기준

- Space 키로 Pan 활성화/비활성화가 기존과 동일하게 동작한다.
- `Cmd/Ctrl+Z`로 Undo, `Shift+Cmd/Ctrl+Z` 및 `Cmd/Ctrl+Y`로 Redo가 동작한다.
- `Delete` 및 `Backspace`로 선택 오브젝트 삭제가 동작한다.
- `Escape`로 오브젝트 컨텍스트 메뉴가 닫힌다.
- inline editing 중(`editingState !== 'idle'` 또는 editable target)에는 canvas 커맨드를 가로채지 않는다.
- `key-event-matchers.ts`가 제거되어 matcher 함수 import가 코드베이스에 남아 있지 않다.
- 키맵 바인딩 정의에 함수 참조가 없고 순수 데이터(`KeyChord` 구조체)만 존재한다.
- `mergeKeymapOverrides`가 `canvas-app` 패키지 밖으로 re-export되지 않는다.
