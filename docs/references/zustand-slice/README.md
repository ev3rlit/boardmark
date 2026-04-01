# Zustand Slice Pattern Reference

## 1. 목적

이 문서는 Zustand의 `slice pattern`이 정확히 무엇인지, 왜 쓰는지, 어떤 한계가 있는지, 그리고 이 저장소의 `canvas-store.ts` 같은 큰 store에 어떻게 적용할 수 있는지를 설명하는 학습용 참고 문서다.

이 문서의 목표는 세 가지다.

1. slice pattern의 정확한 의미를 오해 없이 이해한다.
2. "파일을 나누는 것"과 "store를 나누는 것"을 구분한다.
3. Boardmark에서 실제로 쓸 만한 구조를 결정할 수 있게 한다.

---

## 2. 한 줄 정의

Zustand의 slice pattern은 **하나의 큰 store를 여러 개의 책임 단위 함수로 나눠 조립하는 패턴**이다.

중요한 점:

- slice pattern은 보통 **store를 여러 개 만드는 패턴이 아니다.**
- slice pattern은 보통 **한 store를 여러 모듈이 함께 만드는 패턴**이다.
- 따라서 "전역 상태를 분산"하는 것보다, **구현 책임을 분리**하는 데 더 가깝다.

즉, slice는 "독립 store"라기보다 **root store를 구성하는 부분 모듈**이라고 이해하는 편이 맞다.

---

## 3. 왜 slice pattern이 생겼나

Zustand는 매우 자유롭다.  
그 자유 때문에 store 파일이 쉽게 아래처럼 커진다.

- 상태 필드가 계속 늘어난다.
- 액션이 계속 늘어난다.
- 비동기 workflow가 store 안으로 들어온다.
- UI 상태, 서버/파일 IO, 도메인 명령, 파생 로직이 한 파일에 섞인다.

처음에는 단순하다.

```ts
const useStore = create((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 }))
}))
```

하지만 실제 앱에서는 금방 아래처럼 바뀐다.

- selection
- viewport
- editing
- persistence
- loading/error
- optimistic update
- external subscription

이때 모든 것을 한 파일에 계속 넣으면 다음 문제가 생긴다.

- 파일이 너무 커진다.
- 서로 다른 책임이 섞여 읽기 어려워진다.
- 어떤 상태가 어떤 액션과 강하게 연결되는지 보이지 않는다.
- 변경 범위를 파악하기 어렵다.
- 테스트 경계가 모호해진다.

slice pattern은 이 문제를 해결하기 위해 등장했다.

---

## 4. 핵심 아이디어

핵심은 단순하다.

- root state 타입은 하나로 유지한다.
- slice 함수는 root store의 일부 상태와 액션만 만든다.
- 마지막에 `create()`에서 이 slice들을 합쳐 하나의 store를 만든다.

개념적으로는 아래와 같다.

```ts
type AppStore = BearSlice & FishSlice & SharedActions

const createBearSlice = (set, get) => ({
  bears: 0,
  addBear: () => set((state) => ({ bears: state.bears + 1 }))
})

const createFishSlice = (set, get) => ({
  fish: 0,
  addFish: () => set((state) => ({ fish: state.fish + 1 }))
})

export const useAppStore = create<AppStore>()((...args) => ({
  ...createBearSlice(...args),
  ...createFishSlice(...args)
}))
```

여기서 중요한 구조적 특징은 다음과 같다.

- slice 함수는 독립 파일로 분리할 수 있다.
- slice는 같은 `set`, `get`, `api`를 공유한다.
- 그래서 서로 다른 slice라도 같은 root state를 읽고 갱신할 수 있다.
- 최종적으로는 여전히 **하나의 Zustand store**다.

---

## 5. slice pattern이 해결하는 것

### 5.1 파일 크기와 책임 분리

가장 직접적인 장점이다.

- selection 관련 코드는 selection slice에 모은다.
- viewport 관련 코드는 viewport slice에 모은다.
- document open/save 관련 코드는 document slice에 모은다.

이렇게 하면 변경할 때 필요한 문맥이 줄어든다.

### 5.2 읽기 쉬운 경계

좋은 slice는 "기능 단위"보다 **책임 단위**를 드러낸다.

예:

- `selection`
- `viewport`
- `editing-session`
- `document-lifecycle`

이렇게 나누면 "무슨 코드가 어디 있어야 하는지"가 예측 가능해진다.

### 5.3 테스트 단위 분리

slice 파일이 작아지면 테스트 초점도 분명해진다.

- selection 액션 테스트
- viewport clamp 테스트
- editing workflow 테스트

### 5.4 root store API 유지

구현은 나누되, 외부 사용 방식은 그대로 유지할 수 있다.

```ts
const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
const clearSelection = useStore(store, (state) => state.clearSelection)
```

컴포넌트 입장에서는 store 내부가 slice로 나뉘었는지 몰라도 된다.

---

## 6. slice pattern이 해결하지 못하는 것

이 부분이 중요하다.

slice pattern은 만능이 아니다.

### 6.1 설계가 나쁘면 파일만 나뉜다

문제의 원인이 "zustand 파일이 커서"가 아니라 "책임이 뒤섞여서"라면, slice로 파일만 나누어도 본질은 남는다.

예를 들어 아래 두 가지는 다르다.

1. selection, viewport, editing처럼 자연스러운 경계를 나누는 것
2. 거대한 workflow를 억지로 세 파일에 나눠 붙이는 것

두 번째는 단지 큰 파일을 여러 개의 큰 파일로 바꾼 것에 불과하다.

### 6.2 비동기 orchestration 복잡성은 그대로일 수 있다

`openDocument`, `saveCurrentDocument`, `reloadFromDisk`, `subscribeExternalChanges` 같은 workflow는 상태 필드보다 더 복잡하다.

이 경우 slice만으로는 부족할 수 있다.

- store 밖의 service가 더 적합할 수 있다.
- store 안에는 action entrypoint만 남기는 편이 나을 수 있다.

### 6.3 store coupling을 없애지 않는다

모든 slice가 같은 `set/get`를 공유하기 때문에, 아무 경계 없이 서로의 상태를 직접 만지기 시작하면 다시 결합이 커진다.

즉 slice pattern은 **분리의 기회**를 주지만, **분리를 강제하지는 않는다.**

---

## 7. Zustand slice pattern의 전형적인 형태

실무에서 흔히 보는 형태는 아래와 같다.

```ts
import type { StateCreator } from 'zustand'

type SelectionSlice = {
  selectedIds: string[]
  replaceSelectedIds: (ids: string[]) => void
  clearSelection: () => void
}

type ViewportSlice = {
  zoom: number
  setZoom: (zoom: number) => void
}

type AppStore = SelectionSlice & ViewportSlice

const createSelectionSlice: StateCreator<
  AppStore,
  [],
  [],
  SelectionSlice
> = (set) => ({
  selectedIds: [],
  replaceSelectedIds: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] })
})

const createViewportSlice: StateCreator<
  AppStore,
  [],
  [],
  ViewportSlice
> = (set) => ({
  zoom: 1,
  setZoom: (zoom) => set({ zoom })
})

export const useAppStore = create<AppStore>()((...args) => ({
  ...createSelectionSlice(...args),
  ...createViewportSlice(...args)
}))
```

이것이 문서나 예제에서 흔히 말하는 Zustand slice pattern이다.

---

## 8. 그런데 왜 slice pattern이 어렵게 느껴지나

TypeScript와 결합되면 다음 지점에서 복잡해진다.

### 8.1 root state를 미리 알아야 한다

각 slice는 자신만의 타입만 쓰는 것 같지만, 실제로는 종종 root state의 다른 필드에도 접근한다.

즉:

- slice A가 slice B 상태를 읽을 수 있다.
- 그러면 타입은 결국 root store 전체를 알아야 한다.

이 때문에 generic이 길어지고 진입 장벽이 생긴다.

### 8.2 middleware와 같이 쓰면 타입이 더 무거워진다

`persist`, `devtools`, `subscribeWithSelector`, `immer` 등을 섞으면 `StateCreator` 타입이 더 복잡해진다.

그래서 팀에 따라서는 공식적인 slice typing을 끝까지 밀기보다, 더 단순한 팩토리 함수 스타일을 선택한다.

---

## 9. 더 단순한 변형: "typed slice"보다 "modular store builder"

이 저장소의 `RULE.md` 기준에서는, Zustand의 전형적인 `StateCreator` slice typing이 과하다고 느껴질 수 있다.

그래서 아래 같은 더 단순한 변형이 자주 더 잘 맞는다.

```ts
type CanvasStoreState = {
  selectedNodeIds: string[]
  replaceSelectedNodes: (ids: string[]) => void
  viewport: CanvasViewport
  setViewport: (viewport: CanvasViewport) => void
}

function createSelectionModule(
  set: StoreApi<CanvasStoreState>['setState'],
  get: StoreApi<CanvasStoreState>['getState']
) {
  return {
    selectedNodeIds: [],
    replaceSelectedNodes(nodeIds: string[]) {
      set({ selectedNodeIds: [...new Set(nodeIds)] })
    }
  }
}

function createViewportModule(
  set: StoreApi<CanvasStoreState>['setState'],
  get: StoreApi<CanvasStoreState>['getState']
) {
  return {
    viewport: DEFAULT_CANVAS_VIEWPORT,
    setViewport(viewport: CanvasViewport) {
      set({ viewport })
    }
  }
}

export function createCanvasStore() {
  return create<CanvasStoreState>((set, get) => ({
    ...createSelectionModule(set, get),
    ...createViewportModule(set, get)
  }))
}
```

이 방식은 본질적으로 slice pattern과 같은 생각이지만:

- 타입이 더 단순하고
- `StateCreator` generic이 줄고
- 코드 읽기가 쉽다

즉, **slice pattern의 의도는 유지하되 구현 문법은 단순화한 형태**다.

이 저장소에서는 이 방식이 더 잘 맞을 가능성이 높다.

---

## 10. 무엇을 기준으로 slice를 나누나

좋은 기준과 나쁜 기준이 있다.

### 좋은 기준

- 같은 invariants를 공유하는 상태와 액션
- 함께 변경되는 코드
- 같은 실패 경로를 갖는 workflow
- 같은 종류의 입력/출력을 다루는 로직

예:

- selection
- viewport
- editing session
- document lifecycle
- persistence workflow

### 나쁜 기준

- 파일 길이를 반으로 자르기 위한 임의 분할
- 컴포넌트 이름 기준 분리
- "일단 두 개로 나누자" 식 분리
- 상태와 액션을 따로 떼어 멀리 두는 분리

가장 좋은 질문은 이것이다.

> 이 상태와 이 액션은 같은 이유로 바뀌는가?

같은 이유로 바뀐다면 같이 두는 편이 낫다.

---

## 11. Boardmark의 `canvas-store.ts`에 적용하면

현재 `packages/canvas-app/src/canvas-store.ts`는 Zustand가 문제라기보다, 아래 책임이 한 파일에 같이 들어 있어서 커졌다.

- document open/save/reset/drop
- document session 관리
- external change subscription
- selection
- viewport / tool mode
- interaction preview
- inline editing
- invalid source 복구
- parsed document를 runtime state로 투영하는 로직

이 경우에는 "상태 이름 기준 slice"보다 아래처럼 **레이어 / 책임 기준 모듈화**가 더 적합하다.

### 권장 구조

1. `ui-state`
   - `toolMode`
   - `dropState`
   - `editingState`
   - `operationError`

2. `selection-and-viewport`
   - `selectedNodeIds`
   - `selectedEdgeIds`
   - `viewport`
   - `interactionOverrides`

3. `document-workflow`
   - `hydrateTemplate`
   - `openDocument`
   - `openDroppedDocument`
   - `saveCurrentDocument`
   - `reloadFromDisk`
   - external change subscribe/reconcile

4. `editing-commands`
   - `commitNodeMove`
   - `commitNodeResize`
   - `createEdgeFromConnection`
   - `deleteSelection`
   - `commitInlineEditing`

5. `document-projection`
   - `applyDocumentRecord`
   - `applyInvalidSource`
   - document/session -> store snapshot 반영

이렇게 나누면 slice pattern의 장점을 얻으면서도, 단순한 "필드 쪼개기"를 피할 수 있다.

---

## 12. 이 케이스에서 slice pattern만으로 충분한가

항상 그렇지는 않다.

특히 아래는 slice 내부에만 두면 다시 비대해질 수 있다.

- save queue orchestration
- repository read/write
- edit apply + reparse
- external change reconciliation

그래서 이 저장소에서는 보통 아래 조합이 더 좋다.

- store: runtime state와 action entrypoint
- service: 문서 편집/저장 workflow
- helper/projection: 파싱 결과를 store state로 반영

즉:

- slice pattern은 사용 가능하다.
- 하지만 **slice pattern만으로 해결하려고 하지 말고**, service와 projection도 같이 써야 한다.

---

## 13. 언제 slice pattern을 쓰는 것이 좋은가

아래 조건이면 효과가 좋다.

- 하나의 root store는 유지하고 싶다.
- 외부 API는 유지하고 싶다.
- 내부 구현만 책임별로 나누고 싶다.
- 여러 화면이 같은 store를 공유한다.
- 상태 간 결합은 있지만, 파일 단위로는 분리하고 싶다.

대표 예:

- 캔버스 에디터
- 복합 폼 빌더
- 드래그 가능한 대시보드
- 필터/정렬/선택/네트워크 상태가 함께 있는 화면

---

## 14. 언제 slice pattern을 쓰지 않는 것이 좋은가

아래 경우에는 다른 선택이 더 나을 수 있다.

### 14.1 진짜로 독립적인 상태라면 store 자체를 나누는 편이 낫다

예를 들어 auth store와 canvas interaction store가 서로 거의 관련이 없다면, 한 store 안에서 slice로 묶기보다 store를 분리하는 편이 더 단순하다.

### 14.2 복잡성의 중심이 상태가 아니라 workflow라면 service가 더 중요하다

예:

- 저장 재시도 정책
- 충돌 해결
- background sync
- queueing

이런 것은 slice보다 service가 주도하는 편이 맞다.

### 14.3 팀이 TypeScript generic-heavy 패턴을 싫어한다면 억지로 공식 slice typing을 쓰지 말아야 한다

패턴보다 읽기 쉬움이 더 중요하다.

---

## 15. 흔한 오해

### 오해 1. slice pattern이면 재렌더링이 자동으로 최적화된다

아니다.  
재렌더링 최적화는 주로 **selector 사용 방식**과 관련 있다.

예를 들어 아래 코드는 좋지 않다.

```ts
const state = useStore(store)
```

이렇게 하면 store의 많은 변경에 반응할 수 있다.

반대로 아래처럼 필요한 값만 고르면 더 낫다.

```ts
const isDirty = useStore(store, (state) => state.isDirty)
const saveCurrentDocument = useStore(store, (state) => state.saveCurrentDocument)
```

즉 slice pattern은 파일 구조 개선이고, selector 최적화는 구독 구조 개선이다.

### 오해 2. slice는 서로 완전히 독립적이어야 한다

현실적으로는 아니다.

한 slice가 다른 slice 상태를 읽을 수 있다.  
다만 그 접근을 최소화해야 경계가 유지된다.

### 오해 3. slice pattern을 쓰면 아키텍처가 자동으로 좋아진다

그렇지 않다.

좋은 분할 기준이 먼저고, slice pattern은 그 분할을 코드에 반영하는 수단일 뿐이다.

---

## 16. 추천 규칙

Boardmark 같은 코드베이스에서는 아래 규칙을 추천한다.

1. root store는 하나로 유지해도 된다.
2. slice는 "상태 조각"보다 "책임 조각"으로 나눈다.
3. IO와 queueing은 store에 다 넣지 말고 service로 뺀다.
4. parse 결과를 store에 반영하는 코드는 projection/helper로 분리한다.
5. 컴포넌트에서는 전체 store 구독보다 selector를 우선한다.
6. `StateCreator` generic이 과해지면 단순한 module builder 스타일로 낮춘다.

---

## 17. 결론

Zustand slice pattern은 "큰 store를 작은 store 여러 개로 바꾸는 기술"이 아니다.  
정확히는 **하나의 store를 여러 책임 단위로 조립하는 구조화 패턴**이다.

이 패턴은 다음 상황에서 가장 유용하다.

- root store API는 유지하고 싶고
- 내부 구현은 나누고 싶고
- 상태는 서로 연결되어 있지만 파일은 더 작아져야 할 때

하지만 slice pattern만으로는 충분하지 않을 수 있다.  
특히 Boardmark의 canvas/viewer 계열 코드는 **slice + service + projection + selector**를 함께 써야 가장 안정적으로 정리된다.

즉, 여기서의 올바른 질문은 이것이다.

> "zustand slice를 쓸까?"  
> 보다  
> "이 store의 책임 경계를 어떻게 나눌까?"

slice pattern은 그 경계를 코드에 반영하는 한 가지 방법이다.

---

## 18. 구현 시 체크리스트

실제로 도입할 때는 아래를 확인한다.

- root store 외부 API를 유지할지
- slice 기준이 상태가 아니라 책임인지
- 각 slice가 가진 상태/액션의 invariant가 명확한지
- service로 뺄 workflow가 무엇인지
- selector 정리도 함께 할지
- 테스트가 slice 경계에 맞게 나뉘는지

이 체크리스트를 통과하지 못하면, slice pattern을 도입해도 파일만 나뉘고 구조는 그대로일 가능성이 높다.
