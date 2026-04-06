# React `act(...)` Warning Reference

## 1. 목적

이 문서는 React 테스트에서 보이는 `Warning: An update to ... inside a test was not wrapped in act(...)`가 정확히 무엇을 의미하는지 설명하는 학습용 참고 문서다.

특히 Boardmark처럼 다음 요소가 함께 있는 UI에서 왜 자주 보이는지에 초점을 둔다.

- React state update
- effect 기반 비동기 후속 처리
- 외부 라이브러리 내부 상태 변화
- pointer / keyboard / animation frame / observer 기반 상호작용
- React Flow 같은 복합 렌더러

이 문서의 목표는 네 가지다.

1. `act(...)` warning이 "테스트 실패"와 같은 의미는 아니라는 점을 이해한다.
2. 하지만 왜 무시하면 위험한지 이해한다.
3. 어떤 종류의 상태 변화가 warning을 만드는지 이해한다.
4. Boardmark 코드에서 언제 고쳐야 하고, 언제 우선순위를 낮춰도 되는지 판단할 수 있게 한다.

---

## 2. 한 줄 정의

`act(...)`는 **테스트가 React 업데이트와 그에 따른 렌더/이펙트/후속 상태 변화를 모두 처리한 뒤에 검증하도록 만드는 경계**다.

경고의 뜻은 단순하다.

- 테스트가 어떤 상호작용을 발생시켰다.
- 그 상호작용 때문에 React state update가 일어났다.
- 그런데 그 update가 테스트가 기다리던 범위 밖에서 뒤늦게 발생했다.
- 그래서 React가 "지금 검증하는 화면이 아직 완전히 안정된 상태가 아닐 수 있다"고 알려주는 것이다.

즉, 이 warning은 "렌더링이 아직 끝나지 않았을 수 있다"는 경고다.

---

## 3. `act(...)`가 필요한 이유

React 테스트에서 우리가 실제로 검증하고 싶은 것은 보통 아래 둘 중 하나다.

1. 사용자의 액션 직후 화면이 어떻게 바뀌는가
2. 그 액션이 만든 후속 effect까지 반영되면 최종 상태가 무엇인가

문제는 React 업데이트가 항상 즉시 한 번에 끝나지 않는다는 점이다.

- 이벤트 핸들러 안에서 state가 바뀐다.
- render가 다시 돈다.
- `useEffect`가 실행된다.
- effect 안에서 또 state가 바뀐다.
- 어떤 라이브러리가 `requestAnimationFrame`, `ResizeObserver`, timeout, subscription으로 한 번 더 업데이트한다.

이 전체를 기다리지 않고 중간에 assert를 해버리면 테스트가 아래처럼 될 수 있다.

- 지금은 우연히 통과
- 환경이 바뀌면 flaky
- 실제 사용자 관점 최종 상태와 다른 중간 상태를 검증

`act(...)`는 이 문제를 막기 위한 테스트 경계다.

---

## 4. warning이 정확히 뜻하는 것

대표적인 경고는 이런 형태다.

```text
Warning: An update to CanvasScene inside a test was not wrapped in act(...)
```

이 문장을 해석하면 아래와 같다.

- 테스트 중 `CanvasScene`이 다시 렌더되었다.
- 그 렌더를 유발한 state update가 있었다.
- 하지만 그 update는 테스트가 명시적으로 기다리던 범위 밖에서 일어났다.

중요한 점:

- 이 warning은 **반드시 버그가 있다는 뜻은 아니다.**
- 하지만 **테스트가 안정된 UI 상태를 충분히 기다리지 않았을 가능성**을 뜻한다.
- 즉 "실패는 아니지만, 검증 경계가 느슨하다"는 신호다.

---

## 5. `act(...)`가 다루는 범위

개념적으로 `act(...)`는 아래를 한 덩어리로 묶는다.

- state update
- rerender
- effect flush
- effect가 만든 후속 update

예:

```tsx
act(() => {
  fireEvent.click(button)
})
```

또는 비동기면:

```tsx
await act(async () => {
  await user.click(button)
})
```

하지만 요즘은 직접 `act`를 많이 쓰기보다 아래 패턴을 더 자주 쓴다.

- `userEvent` 사용
- `findBy...`
- `waitFor(...)`

왜냐하면 Testing Library가 많은 경우 내부적으로 `act`를 감싸주기 때문이다.

문제는 **모든 외부 update를 다 감싸주지는 못한다**는 점이다.

---

## 6. 어떤 상황에서 warning이 잘 생기나

### 6.1 effect가 늦게 도는 경우

예:

- 클릭 이벤트
- state 변경
- `useEffect`에서 DOM 측정
- effect 안에서 다시 state 변경

테스트가 첫 변경만 보고 assert하면 warning이 난다.

### 6.2 `requestAnimationFrame` / `setTimeout`

예:

- focus를 다음 frame에 맞춤
- overlay 위치 계산
- debounced flush
- animation callback

이런 작업은 이벤트 핸들러와 다른 tick에서 실행되므로 warning이 잘 생긴다.

### 6.3 외부 라이브러리 내부 업데이트

예:

- React Flow
- ProseMirror / Tiptap
- drag-and-drop 라이브러리
- observer 기반 layout 측정 라이브러리

이 경우 테스트 코드가 직접 `setState`를 안 했더라도 warning이 날 수 있다.

### 6.4 DOM 측정 / observer

예:

- `ResizeObserver`
- `MutationObserver`
- scroll / layout sync

특히 jsdom에서는 브라우저와 timing이 달라 warning이 더 쉽게 드러난다.

---

## 7. Boardmark에서 왜 자주 보이는가

Boardmark canvas 테스트는 일반 form 테스트보다 상태 변화가 더 많다.

예를 들어 `CanvasApp` 하나만 봐도 다음이 섞여 있다.

- React Flow viewport / node / edge 내부 상태
- Zustand store update
- selection 반영
- overlay / menu open/close
- keyboard shortcut dispatch
- editor focus 처리
- effect 기반 viewport sync

즉, 테스트 코드 입장에서는 "버튼 한 번 클릭"처럼 보여도 내부적으로는 아래가 한꺼번에 일어날 수 있다.

1. local component state 변경
2. store state 변경
3. React Flow internal state 변경
4. effect 기반 후속 rerender
5. pointer or focus side effect

그래서 Boardmark의 `CanvasScene`, `FileMenu`, `StatusPanels`, `ToolMenu`, `HistoryControls` 주변 테스트는 `act(...)` warning이 잘 보인다.

---

## 8. React Flow와 왜 특히 잘 엮이나

React Flow는 단순한 presentational component가 아니다.

내부적으로 다음을 많이 한다.

- viewport state 관리
- node drag / selection state 관리
- DOM 위치와 크기 추적
- pointer interaction 처리
- 내부 store 업데이트
- 후속 sync render

테스트가 `fireEvent.click(...)` 같은 한 줄만 호출해도, React Flow는 그 뒤에 자기 내부 업데이트를 추가로 실행할 수 있다.

즉 warning의 본질은:

- "React Flow가 나쁘다"가 아니다.
- "테스트가 React Flow 내부 후속 업데이트까지 기다렸는가"의 문제다.

---

## 9. warning이 위험한 경우

아래면 우선순위를 높게 봐야 한다.

### 9.1 assertion이 중간 상태를 보고 있을 가능성이 큰 경우

예:

- 메뉴가 닫히기 전에 assert
- selection이 확정되기 전에 assert
- debounced flush 전에 assert

### 9.2 테스트가 flaky한 경우

어떤 환경에서는 통과하고 어떤 환경에서는 실패한다면, warning은 거의 원인 후보다.

### 9.3 사용자가 실제로 보는 최종 상태가 중요한 경우

예:

- 편집 진입/종료
- 저장 직전 flush
- context menu 열림/닫힘
- drag 후 selection 확정

이때 warning을 무시하면 "사용자 최종 상태"가 아니라 "중간 상태"를 검증하게 된다.

---

## 10. warning이 상대적으로 덜 위험한 경우

아래면 우선순위를 낮출 수 있다.

### 10.1 테스트가 이미 최종 observable state를 기다리고 있는 경우

예:

- `await screen.findBy...`
- `await waitFor(...)`

이런 패턴으로 실제 최종 DOM을 확인하고 있고, warning이 외부 라이브러리의 추가 내부 sync 때문에만 뜬다면 즉시 기능 리스크로 연결되지는 않을 수 있다.

### 10.2 assertion 대상이 warning을 낸 후속 update와 무관한 경우

예:

- shape 메뉴 아이템이 클릭되었는지만 확인
- 내부 viewport sync는 warning이지만 검증 대상은 action dispatch

이 경우 테스트는 의미가 있을 수 있다. 다만 noise는 남는다.

---

## 11. 어떻게 줄이나

### 11.1 `userEvent`와 `await`를 우선 사용

`fireEvent`보다 `userEvent`가 더 실제 사용자 상호작용에 가깝고, 내부적으로 더 많은 비동기 처리를 반영한다.

```tsx
const user = userEvent.setup()
await user.click(button)
```

### 11.2 즉시 assert 대신 최종 상태를 기다린다

```tsx
await waitFor(() => {
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
```

### 11.3 effect/timeout/RAF가 있으면 그 경계를 테스트에서 의식한다

예:

- debounce면 fake timer 전진
- RAF면 다음 tick 대기
- blur/focus 후에는 후속 commit 완료까지 기다림

### 11.4 필요하면 명시적으로 `act(...)` 사용

Testing Library로 충분하지 않을 때는 직접 감싼다.

```tsx
await act(async () => {
  store.getState().updateEditingMarkdown('next')
})
```

### 11.5 라이브러리 내부 업데이트를 유발하는 helper를 테스트 친화적으로 만든다

예:

- autofocus를 teardown-safe하게 가드
- observer callback을 불필요하게 남기지 않기
- timeout 정리

Boardmark WYSIWYG 쪽에서 autofocus RAF를 guard한 이유도 이 범주다.

---

## 12. 무엇을 하면 안 되나

### 12.1 warning을 그냥 suppress만 하기

문제 원인을 이해하지 않고 console warning만 숨기면 flaky test는 그대로 남는다.

### 12.2 무조건 모든 이벤트를 `act`로 감싸기

불필요한 `act` 남발은 테스트를 더 읽기 어렵게 만든다.

먼저 아래를 본다.

- 이미 `userEvent` / `findBy` / `waitFor`로 충분한가
- 실제로 기다려야 할 후속 상태가 무엇인가

### 12.3 implementation detail만 기준으로 기다리기

예:

- 내부 state flag만 보고 wait
- user-visible state는 안 보고 통과

가능하면 최종 DOM이나 명시적 observable behavior를 기준으로 기다리는 편이 낫다.

---

## 13. Boardmark에서 실무적으로 어떻게 다루나

권장 우선순위는 이렇다.

### 1단계. 기능 리스크 확인

- 테스트가 flaky한가
- 중간 상태를 assert하고 있나
- debounce / blur / focus out / menu close 같은 최종 상태를 놓치고 있나

이 경우 바로 고친다.

### 2단계. noise vs correctness 분리

warning이 떠도 테스트가 이미 충분히 안정된 최종 상태를 검증하고 있다면, 당장 기능 버그는 아닐 수 있다.

이 경우 기록만 남기고 후속 정리 대상으로 둘 수 있다.

### 3단계. shared helper 개선

같은 warning이 반복되면 개별 테스트를 계속 손보지 말고 공통 helper나 component lifecycle을 개선한다.

예:

- focus helper
- menu open helper
- canvas interaction helper
- React Flow test wrapper

---

## 14. 현재 Boardmark WYSIWYG/Canvas 맥락에서의 해석

현재 canvas-app 테스트에서 보이는 warning은 주로 다음 성격이다.

- React Flow 내부 후속 업데이트
- 메뉴/패널 컴포넌트의 추가 rerender
- focus/selection에 따른 지연 업데이트

현재 상태를 이렇게 해석하는 것이 적절하다.

- 테스트 실패는 아니다.
- 타입체크와 대상 테스트는 통과한다.
- 즉시 기능 오류라고 단정할 수는 없다.
- 하지만 테스트 경계가 완전히 정리된 상태는 아니다.

따라서 "무시해도 된다"보다는 아래에 가깝다.

- **현재는 허용 가능하지만, 테스트 품질 측면에서 부채다.**

---

## 15. 다음에 정리할 때 볼 체크리스트

React Flow 기반 warning을 정리하려면 아래 순서로 본다.

1. 어떤 interaction이 warning을 발생시키는지 특정한다.
2. 그 interaction 뒤에 user-visible final state가 무엇인지 정의한다.
3. 테스트가 그 final state를 실제로 기다리는지 확인한다.
4. 필요하면 `userEvent`, `waitFor`, fake timer, explicit `act` 중 맞는 도구를 쓴다.
5. 반복되면 test helper 또는 component lifecycle을 공통 개선한다.

---

## 16. 짧은 결론

`act(...)` warning은 단순한 소음이 아니라, **테스트가 React의 비동기 업데이트 경계를 충분히 기다리지 않았을 수 있다는 신호**다.

Boardmark처럼 canvas/editor/React Flow가 섞인 UI에서는 특히 흔하다.

핵심 판단 기준은 하나다.

- 이 warning이 **실제 최종 UI 상태 검증 누락**으로 이어지는가?

이어진다면 바로 고쳐야 한다.  
아직은 아니고 단지 라이브러리 내부 후속 업데이트 때문에 noisy한 것이라면, 기능 리스크와 분리해서 후속 정리 대상으로 관리하면 된다.
