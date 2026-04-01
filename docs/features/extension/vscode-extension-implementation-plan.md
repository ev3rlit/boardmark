# Boardmark VS Code Extension 구현 계획

## 1. 목적

이 문서는 Boardmark의 최우선 제품 형태인 VS Code extension을 구현하기 위한 별도 계획 문서다.

Boardmark의 장기 목표는 사용자가 VS Code 안에서 workspace 파일을 직접 다루고, AI도 같은 파일에 접근해 편집하며, extension이 그 결과를 canvas로 시각화하는 것이다.

이 단계의 핵심은 다음 세 가지다.

- VS Code extension host와 webview panel 구조를 도입한다.
- 기존 공용 parser / renderer / pack system을 webview 안에서 재사용한다.
- 파일 읽기/쓰기/감시와 저장 정책을 extension host 한 곳으로 일원화한다.

---

## 2. 범위 고정

### 포함

- VS Code extension scaffold
- `.canvas.md`용 명령 또는 editor entrypoint
- webview panel에서 Boardmark viewer 렌더링
- extension host ↔ webview message bridge
- workspace file read / write / watch
- single-writer 저장 파이프라인
- 저장 정책 분리
  - 즉시 반영 상태
  - 저장 시 스냅샷 반영 상태
  - 주기 저장 또는 묶음 저장을 확장 가능한 구조로 분리
- parse issue / load state / save state를 extension 환경에서도 노출

### 제외

- 양방향 편집 전체 완성
- CodeMirror
- MagicString
- 협업
- E2E 테스트

---

## 3. 산출물

- VS Code extension package
- extension host entrypoint
- webview app shell
- host/webview message protocol
- file watch / save coordinator
- extension 환경용 unit test

---

## 4. 기능 정의

### 4.1 Extension Host

- `extension.ts`에서 Boardmark 명령과 webview panel을 등록한다.
- `.canvas.md` 파일을 열거나 명령 실행 시 Boardmark panel을 표시한다.
- extension host는 workspace 파일 읽기/쓰기/감시를 담당한다.
- extension host는 webview에 현재 문서 source와 상태를 전달한다.

완료 기준:
- VS Code에서 `.canvas.md`를 대상으로 Boardmark panel을 띄울 수 있다.

### 4.2 Webview Viewer

- webview는 기존 공용 parser/store/renderer를 재사용한다.
- webview는 runtime interaction과 UI 렌더링만 담당한다.
- webview는 직접 파일 시스템에 접근하지 않는다.

완료 기준:
- desktop/web viewer와 같은 렌더 결과를 webview에서도 확인할 수 있다.

### 4.3 Message Bridge

- host → webview
  - document loaded
  - document changed on disk
  - save result
  - pack load result
- webview → host
  - open document
  - save request
  - save policy에 따라 persisted snapshot 요청
  - local pack read 요청

완료 기준:
- file read/write/watch와 webview 상태가 메시지 계약 하나로 연결된다.

### 4.4 Single Writer 저장 파이프라인

- 실제 파일 write는 extension host만 수행한다.
- webview는 save intent 또는 state snapshot만 전달한다.
- host는 저장 큐를 통해 write를 직렬화한다.
- 동시에 여러 save request가 와도 host가 마지막 쓰기 순서를 보장한다.

완료 기준:
- 파일 동시성 편집과 중복 write가 extension host 한 곳에서 제어된다.

### 4.5 저장 정책 분리

- runtime state와 persisted file state를 분리한다.
- 예:
  - runtime viewport
  - dirty viewport snapshot
  - persisted viewport
- 저장 정책은 최소 아래 수준으로 분리 가능한 구조를 가진다.
  - 즉시 저장 대상
  - 명시적 Save 시 반영 대상
  - debounce / interval 저장 대상
  - 다른 변경과 묶어서 저장할 대상

완료 기준:
- viewport 같은 interaction state는 매 이벤트마다 파일에 쓰지 않는다.
- 저장 시점과 write 실행 경로가 분리되어 있다.

### 4.6 File Watch

- extension host는 현재 열린 `.canvas.md`와 관련 pack/local file을 감시할 수 있어야 한다.
- 외부 변경이 발생하면 host가 파일을 다시 읽고 webview에 갱신을 전달한다.
- dirty 상태일 때 외부 변경이 오면 충돌 정책을 명시한다.

완료 기준:
- 사용자가 다른 에디터나 AI로 파일을 수정해도 panel이 재로딩 가능하다.

---

## 5. 구현 순서

### Phase 1. Extension Scaffold

- extension package와 명령 등록
- webview panel 기본 구조

### Phase 2. Shared Viewer 재사용

- 공용 renderer/store를 webview app으로 연결
- 문서 로드 메시지 반영

### Phase 3. File Access / Watch

- workspace file read
- workspace file write
- file watch

### Phase 4. Single Writer Save Coordinator

- save queue
- write serialization
- 저장 정책 분리

### Phase 5. Host/Webview State Refinement

- load/save/error/parse issue 표시
- 충돌 상태와 재로딩 UX

---

## 6. 테스트 계획

- extension host가 `.canvas.md` 파일을 읽어 webview에 전달하는지 확인
- webview가 전달받은 문자열을 기존 parser/renderer로 렌더링하는지 확인
- 저장 요청이 host single-writer 경로로만 들어가는지 확인
- 외부 파일 변경 감지 후 reload 메시지가 전달되는지 확인
- runtime state와 persisted snapshot이 분리되어 있는지 확인

---

## 7. 완료 기준

- VS Code 안에서 `.canvas.md`를 Boardmark panel로 열 수 있다.
- webview는 기존 viewer core를 재사용한다.
- 파일 읽기/쓰기/감시는 extension host에서만 수행된다.
- 저장 정책 분리와 single-writer 원칙이 적용된다.
