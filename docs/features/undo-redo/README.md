# Boardmark Undo/Redo PRD

## 1. 목적

이 문서는 Boardmark canvas editor에 **문서 변경 전용 Undo/Redo**를 추가하기 위한 제품 요구사항을 정의한다.

이번 단계의 목표는 web/desktop 공용 `@boardmark/canvas-app`에서 사용자가 방금 수행한 문서 편집을 안정적으로 되돌리고 다시 적용할 수 있게 만드는 것이다.

핵심은 “모든 UI 상태를 되감는 것”이 아니라, 현재 source-of-truth 구조를 유지한 채 **성공적으로 커밋된 `.canvas.md` 변경**만 history로 관리하는 것이다.

---

## 2. 사용자 가치

사용자는 아래 상황에서 즉시 되돌리기를 기대한다.

- 노드를 잘못 이동하거나 리사이즈했을 때
- 노트/엣지를 실수로 삭제했을 때
- 이미지 메타데이터나 본문을 잘못 수정했을 때
- 연결 대상을 잘못 바꿨을 때

Undo/Redo는 이 실수를 빠르게 복구해야 하며, 저장 방식이나 host 환경 차이와 무관하게 같은 방식으로 동작해야 한다.

---

## 3. 제품 요구사항

### 3.1 범위

첫 버전에서 history 대상은 아래처럼 **문서 source를 바꾸는 commit**으로 고정한다.

- note / shape / image 생성
- node 이동
- node 리사이즈
- edge 생성
- edge reconnect
- note / shape body commit
- edge body commit
- image source / alt / title / aspect-ratio lock 변경
- selection 삭제를 포함한 node / edge 삭제

### 3.2 비범위

아래는 첫 버전 history 대상에서 제외한다.

- selection만 바뀌는 경우
- pan / zoom / viewport 이동
- tool mode 변경
- drag / resize preview 중간 상태
- inline editor 내부의 타이핑 중간 단계
- 저장 자체

### 3.3 편집 단위

- body 편집은 `textarea` 내부 타이핑 전체를 세밀하게 기록하지 않는다.
- blur / Enter 등 현재 구조의 **commit 시점** 1회를 history entry 1개로 기록한다.
- 드래그/리사이즈도 preview 동안은 기록하지 않고 end commit만 기록한다.

### 3.4 Undo/Redo 규칙

- Undo는 가장 최근의 성공한 문서 변경 1개를 되돌린다.
- Redo는 Undo로 되돌린 마지막 변경 1개를 다시 적용한다.
- Undo 후 새로운 문서 편집이 발생하면 redo stack은 비워진다.
- 사용자 action 1회는 history entry 1개를 만든다.
- 다중 삭제는 여러 object를 지워도 **undo 1회**로 복구돼야 한다.

### 3.5 단축키와 UI

- global shortcut
  - `Mod+Z`: Undo
  - `Shift+Mod+Z`: Redo
  - `Mod+Y`: Redo
- shared shell에 Undo/Redo 버튼을 추가한다.
- 버튼은 zoom controls와 같은 control cluster에 배치한다.

### 3.6 편집 중 우선순위

- `editingState !== 'idle'` 이거나 target이 editable이면 canvas-level Undo/Redo를 가로채지 않는다.
- 이 경우 브라우저/textarea 기본 Undo/Redo가 먼저 동작한다.

### 3.7 충돌/오류 상태

- conflict 상태에서는 Undo/Redo를 막고 기존 status/error surface를 사용한다.
- invalid draft 상태에서도 Undo/Redo를 막고 기존 invalid 메시지를 재사용한다.
- history restore 결과 source가 다시 파싱되지 않으면 실패를 숨기지 않고 에러를 표시한다.

---

## 4. 성공 기준

- 사용자가 수행한 최근 문서 편집을 keyboard 또는 control button으로 안정적으로 되돌릴 수 있다.
- save/autosave가 history stack을 훼손하지 않는다.
- open/reset/reload-from-disk 같은 session 교체 시 history는 초기화된다.
- web/desktop 모두 같은 `@boardmark/canvas-app` 구현을 사용한다.

---

## 5. 수용 기준

- 단일 edit commit 후 undo 가능 상태가 된다.
- undo 후 redo 가능 상태가 된다.
- undo 뒤 새 edit를 하면 redo는 비워진다.
- multi-delete는 undo 1회로 전체 복구된다.
- inline editing 중 `Mod+Z`는 canvas undo를 호출하지 않는다.
- conflict 또는 invalid 상태에서는 undo/redo가 차단되고 에러가 드러난다.
