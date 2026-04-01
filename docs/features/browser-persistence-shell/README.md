# Boardmark Post Web Shell PRD & Implementation Plan

## 1. 목적

이 문서는 `docs/features/web-shell/README.md` 다음 단계에서 진행할 작업을, PRD와 구현 계획을 한 파일에 함께 정리한 문서다.

web shell 단계의 목표는 browser에서도 공용 viewer shell과 `CanvasDocumentRepository` 경계를 검증하는 것이었다.  
그 다음 단계의 목표는 browser를 실제 작업 가능한 shell로 확장하고, 이후 편집과 shell 통합까지 자연스럽게 이어질 수 있는 기반을 만드는 것이다.

이 문서는 아래 세 가지를 하나의 연속된 구현 로드맵으로 다룬다.

1. Browser Persistence
2. Web Interaction
3. Editing & Shell Integration

---

## 2. 제품 요구사항

### 2.1 Browser Persistence

사용자는 browser에서도 `.canvas.md` 문서를 단순히 열어보는 것에 그치지 않고, 같은 문서를 다시 저장할 수 있어야 한다.

핵심 요구사항:

- browser에서 로컬 `.canvas.md` 파일을 열고 다시 같은 위치에 저장할 수 있어야 한다.
- browser shell은 upload-only viewer가 아니라 persisted document session을 가질 수 있어야 한다.
- persistence는 runtime state와 분리되어야 한다.
- repository 경계는 유지되어야 하며, shell은 parser를 직접 알면 안 된다.
- browser 환경이 persistence API를 지원하지 않는 경우 fallback이 필요하다.

### 2.2 Web Interaction

web shell은 viewer verification 수준을 넘어서 실제 탐색/작업 shell에 가까운 상호작용을 제공해야 한다.

핵심 요구사항:

- drag-and-drop으로 `.canvas.md`를 열 수 있어야 한다.
- multi-select를 지원해야 한다.
- dirty state를 명확히 드러내야 한다.
- load/save/error 상태가 browser 작업 흐름에 맞게 더 분명히 보여야 한다.
- 기존 desktop/web 공용 viewer shell 구조를 깨지 않고 확장되어야 한다.

### 2.3 Editing & Shell Integration

이 단계에서는 viewer-only 구조를, 저장 정책과 shell 통합이 가능한 editor-capable 구조로 확장할 준비를 한다.

핵심 요구사항:

- 저장 정책은 즉시 저장, 명시적 저장, debounce 저장, 다른 변경과 묶음 저장으로 분리 가능한 구조여야 한다.
- single-writer save coordinator를 도입해 파일 write 실행 경로를 한곳으로 일원화해야 한다.
- VS Code extension shell이 재사용할 수 있는 browser/webview 기반 shell contract를 유지해야 한다.
- 이후 양방향 편집이 붙더라도 현재 경계를 다시 뒤집지 않아야 한다.

---

## 3. 범위

### 이번 문서에 포함

- browser persistence shell
- File System Access API 기반 open/save 전략
- browser fallback open/save 전략
- drag-and-drop import
- multi-select
- dirty state / save UX
- save coordinator 경계
- extension-ready shell integration 방향

### 이번 문서에서 제외

- CodeMirror
- MagicString
- fully bidirectional editing 구현
- component pack runtime 구현 자체
- style pack runtime 구현 자체
- 협업/동기화
- E2E 테스트

pack system은 별도 feature로 유지하되, 이 문서의 저장/interaction 구조와 충돌하지 않아야 한다.

---

## 4. 구현 원칙

### 4.1 Repository 경계를 유지한다

- shell, store, UI는 parser를 직접 호출하지 않는다.
- 모든 문서 입력은 `CanvasDocumentRepository`를 거쳐 `CanvasDocumentRecord`로 정규화된다.
- browser persistence가 추가되어도 repository는 문서 경계만 담당하고, 저장 정책은 coordinator가 담당한다.

### 4.2 Single Writer를 강제한다

- 실제 persisted write는 항상 한 경로에서만 수행한다.
- browser shell에서도 저장 요청은 coordinator를 거쳐 직렬화된다.
- 이후 extension host 단계에서는 이 coordinator를 host 쪽 single writer로 치환하거나 확장할 수 있어야 한다.

### 4.3 Capability 기반 shell을 유지한다

- desktop / web / future extension의 차이는 bridge와 capability에서만 표현한다.
- shell UI 컴포넌트를 환경마다 갈아엎지 않는다.
- persistence 가능 여부, drag-and-drop 가능 여부, save policy는 capability로 주입한다.

### 4.4 Runtime State와 Persisted State를 분리한다

- viewport, selection, drag-hover, dirty draft 같은 값은 runtime state다.
- 파일에 기록되는 값은 persisted snapshot이다.
- autosave나 묶음 저장이 붙더라도 이 두 층을 섞지 않는다.

---

## 5. 기능 설계

### 5.1 Browser Persistence

#### 목표

browser에서도 persisted document session을 가질 수 있게 한다.

#### 구현 방향

- browser bridge에 persistence capability를 추가한다.
- 지원 브라우저에서는 File System Access API를 우선 사용한다.
- 저장된 파일 handle은 browser-local state에 유지한다.
- open/save는 아래 단계로 나눈다.
  1. file handle 획득
  2. source read/write
  3. repository 정규화
  4. save coordinator 경유 persist

#### open 경로

- `Open File`
  - 우선 `showOpenFilePicker`
  - fallback은 hidden file input
- fallback 경로로 열린 파일은 persisted handle이 없으므로 read-only session처럼 다룬다.

#### save 경로

- handle이 있는 document
  - `Save` 시 같은 handle에 overwrite
- handle이 없는 document
  - `Save` 시 `showSaveFilePicker`
  - 사용자가 위치를 정한 뒤 persisted document로 승격

#### locator / handle 정책

- repository 외부에서 browser file handle을 직접 흘리지 않는다.
- shell/coordinator가 handle을 소유한다.
- repository에는 정규화된 locator와 source snapshot만 전달한다.

#### 완료 기준

- browser에서 열린 `.canvas.md`를 같은 위치에 다시 저장할 수 있다.
- fallback open으로 불러온 문서는 최초 save 시 위치 선택 후 persisted session이 된다.
- 저장 성공 후 dirty state가 clear 된다.

### 5.2 Web Interaction

#### 목표

browser shell을 실제 작업용 탐색 shell에 가깝게 만든다.

#### drag-and-drop import

- `.canvas.md` 파일 drop 시 open flow와 같은 정규화 경로를 사용한다.
- drop zone은 canvas 전체가 아니라 shell 최상위에서 처리하되, 내부 interaction과 충돌하지 않게 한다.

#### multi-select

- store selection을 단일 `selectedNodeId`에서 집합 기반 상태로 확장한다.
- 기본 클릭은 단일 선택 유지
- modifier key 사용 시 multi-select 허용
- React Flow selection과 store selection은 같은 source of truth를 사용한다.

#### dirty state / save UX

- persisted document와 runtime source snapshot이 달라지면 dirty state를 표시한다.
- web shell 상태 패널과 file menu에서 dirty/save 상태를 명확히 보여준다.
- unsupported save가 아니라 실제 save 가능 여부와 pending 상태를 표현한다.

#### 완료 기준

- drag-and-drop으로 문서를 열 수 있다.
- 2개 이상의 노드를 선택 상태로 유지할 수 있다.
- 문서가 dirty면 UI에 명확히 표시된다.

### 5.3 Editing & Shell Integration

#### 목표

저장 정책과 shell 간 통합을 위한 중앙 실행 경로를 만든다.

#### save coordinator

- 새 계층으로 `CanvasDocumentSaveCoordinator` 또는 동등한 모듈을 둔다.
- 입력:
  - current document session
  - persisted snapshot source
  - save mode
- 책임:
  - write 직렬화
  - pending save dedupe
  - dirty state clear timing
  - save failure surface

#### save modes

- `explicit`
  - 사용자가 Save를 눌렀을 때만 저장
- `debounced`
  - 일정 시간 idle 후 저장
- `batched`
  - 다른 변경과 함께 저장

이번 단계에서는 `explicit`을 구현하고, `debounced` / `batched`를 위한 인터페이스만 고정한다.

#### extension-ready shell integration

- web shell의 browser bridge와 save coordinator 구조는 future extension host bridge와 치환 가능해야 한다.
- extension에서는 host가 single writer가 되고, webview는 save intent만 보낸다.
- 따라서 현재 browser shell도 “UI -> coordinator -> persistence bridge” 구조를 유지해야 한다.

#### 완료 기준

- 저장은 shell UI에서 직접 write하지 않고 coordinator를 거친다.
- 동시에 여러 save 요청이 와도 write 순서가 깨지지 않는다.
- extension host로 옮겨도 shell/store 계약을 크게 바꾸지 않아도 된다.

---

## 6. 구현 순서

### Phase 1. Browser Persistence Shell

- browser persistence bridge 추가
- File System Access API open/save 연결
- fallback hidden input open 유지
- persisted handle 세션 상태 추가

완료 기준:

- browser에서 같은 파일에 다시 저장 가능

### Phase 2. Dirty State & Save UX

- document session과 persisted snapshot 비교
- dirty state 추가
- status panel / file menu에 dirty / saving / saved / error 표시

완료 기준:

- 사용자가 현재 문서가 저장되지 않았는지 바로 알 수 있음

### Phase 3. Drag-and-Drop + Multi-select

- drag-and-drop import 추가
- selection state 집합화
- React Flow selection sync 보강

완료 기준:

- drop import와 multi-select가 동작

### Phase 4. Save Coordinator

- explicit save coordinator 도입
- save 직렬화
- pending write dedupe
- browser persistence bridge와 결합

완료 기준:

- 저장 경로가 한곳으로 일원화됨

### Phase 5. Extension-ready Refinement

- shell capability 정리
- bridge/coordinator 계약 정리
- extension host가 재사용할 수 있도록 shell 경계 안정화

완료 기준:

- web shell이 extension shell의 전 단계 구조로 사용 가능

---

## 7. Public Interfaces / Contracts

### browser persistence bridge

필요한 새 계약:

- browser document session
  - locator
  - optional file handle
  - persisted 여부
  - dirty 여부
- shell capability
  - `canOpen`
  - `canSave`
  - `canPersist`
  - `canDropImport`
  - `supportsMultiSelect`

### save coordinator

필요한 계약:

- `save(documentSession, mode)`
- `flush()`
- current save state 조회

### store

필요한 확장:

- `selectedNodeIds`
- dirty state
- current persisted snapshot metadata
- current document session metadata

---

## 8. 테스트 계획

### Browser Persistence

- File System Access API 지원 환경에서 open/save flow 검증
- fallback input open 후 첫 save에서 picker가 뜨는지 검증
- save 후 dirty state clear 검증

### Web Interaction

- drag-and-drop import 후 문서 교체 검증
- multi-select state 유지 검증
- dirty indicator 표시 검증

### Save Coordinator

- 동시에 여러 save 요청이 와도 write 순서가 보장되는지 검증
- save 실패 시 state와 error surface 검증
- explicit save 경로가 direct write 없이 coordinator만 타는지 검증

### Shell Parity

- desktop / web / future extension shell이 같은 viewer core 계약을 유지하는지 검증
- repository 직접 호출 경로가 shell/store 내부에 새로 생기지 않는지 검증

---

## 9. 수용 기준

- browser shell이 실제 persisted open/save를 지원한다.
- web shell은 dirty state와 save state를 명확히 보여준다.
- drag-and-drop import와 multi-select가 동작한다.
- 저장 실행 경로가 save coordinator 한 곳으로 일원화된다.
- 이후 extension host single-writer 구조로 확장 가능한 shell 경계가 유지된다.

---

## 10. 현재 우선순위

이 문서의 실제 구현 우선순위는 다음과 같다.

1. Browser Persistence Shell
2. Dirty State / Save UX
3. Drag-and-Drop + Multi-select
4. Save Coordinator
5. Extension-ready Refinement

즉, post web shell 단계의 첫 핵심은 “browser에서도 실제 문서를 다시 저장할 수 있게 만드는 것”이다.  
그 다음에 interaction을 보강하고, 마지막으로 저장 정책과 extension-ready shell integration을 고정한다.
