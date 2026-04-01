# Boardmark Web Shell

## 1. 목적

이 문서는 Boardmark의 다음 구현 단계인 web shell을 구체화하기 위한 작업 문서다.

현재 Boardmark는 Electron 기반 viewer foundation과 `CanvasDocumentRepository` 경계를 이미 갖추고 있다.  
다음 단계의 목표는 이 경계를 browser 환경에서도 그대로 재사용해, desktop 전용 viewer를 web에서도 같은 계약으로 실행 가능하게 만드는 것이다.

web shell의 역할은 새 제품을 하나 더 만드는 것이 아니다.

- 공용 viewer core를 desktop 밖에서도 검증할 수 있게 한다.
- parser / repository / renderer / UI 계약이 환경에 종속되지 않음을 확인한다.
- 이후 VS Code webview shell이 재사용할 브라우저 기반 실행 경로를 먼저 안정화한다.

---

## 2. 현재 전제

현재 구현 상태는 다음과 같다.

- desktop app은 `CanvasDocumentRepository`를 통해 문서를 읽고 저장한다.
- viewer store는 parser를 직접 호출하지 않고 `CanvasDocumentRecord`를 소비한다.
- startup template는 in-memory source를 repository로 읽어 viewer에 주입된다.
- renderer는 validated AST만 소비한다.

즉, web shell이 새로 만들어야 하는 핵심은 parser 자체가 아니라 아래 두 가지다.

1. browser 환경용 bridge
2. desktop와 web이 함께 쓰는 공용 viewer shell

---

## 3. 목표 결과

web shell이 완료되면 아래가 가능해야 한다.

- `apps/web`에서 Boardmark viewer를 브라우저로 실행할 수 있다.
- 실행 직후 bundled sample `.canvas.md`가 바로 열린다.
- 브라우저에서 `.canvas.md` 파일을 선택해 로컬 파일 내용을 viewer로 로드할 수 있다.
- web과 desktop은 같은 repository contract와 같은 viewer composition을 사용한다.
- 같은 markdown source를 주면 web과 desktop의 note / edge / markdown 렌더 결과가 실질적으로 같다.

---

## 4. 구현 원칙

### 4.1 공용 viewer shell을 먼저 만든다

현재 desktop renderer app에는 아래가 한 파일/경로로 묶여 있다.

- store 생성
- startup template hydrate
- overlay UI 조립
- canvas scene 렌더

이 조립 책임을 desktop 전용 app에서 분리해 공용 shell로 올린다.

공용 shell은 아래만 안다.

- `documentPicker`
- `documentRepository`
- `templateSource`
- shell capability

공용 shell은 Electron preload, browser file input, VS Code message bridge 같은 환경 세부사항을 직접 알지 않는다.

### 4.2 web shell도 repository 경계만 사용한다

web shell에서 parser를 직접 호출하지 않는다.

- sample template 로드
- file upload 로드
- 이후 query string 또는 raw source 주입

이 모든 입력은 `documentRepository.readSource(...)`를 통해서만 viewer store로 들어간다.

### 4.3 web shell은 read-first 검증 경로로 시작한다

첫 단계의 web shell은 “viewer 검증용 shell”이다.

이번 범위에서는 아래를 우선한다.

- sample board load
- local file open
- same viewer rendering

이번 단계에서 아래는 제외한다.

- browser에서의 실제 파일 overwrite 저장
- File System Access API 의존
- autosave
- drag-and-drop import
- 양방향 편집

### 4.4 desktop와 web의 차이는 bridge와 capability로만 둔다

desktop와 web의 차이는 renderer/store가 아니라 shell capability에만 존재해야 한다.

예:

- desktop
  - `Open File` 가능
  - `Save` 가능
  - native picker 사용
- web
  - `Open File` 가능
  - `Save`는 숨기거나 disabled
  - browser file input 사용

즉, UI 컴포넌트를 두 벌 만들기보다 shell capability를 통해 같은 조립 경로를 제어한다.

---

## 5. 아키텍처

### 5.1 새 런타임 경계

web shell에는 다음 구성 요소가 필요하다.

- `apps/web`
  - Vite + React 엔트리
  - browser 실행용 shell bootstrap
- shared viewer shell
  - desktop/web이 같이 사용하는 app composition
- web document bridge
  - browser 환경에서 picker + repository gateway 역할 수행

### 5.2 browser bridge

web bridge는 아래 형태를 가진다.

- `picker.pickOpenLocator()`
  - 내부적으로 hidden file input을 띄운다.
  - 선택된 파일은 memory locator 또는 browser-local file locator로 정규화한다.
- `picker.pickSaveLocator()`
  - 이번 단계에서는 제공하지 않거나 unsupported로 돌린다.
- `repository.readSource(...)`
  - bundled template 또는 업로드된 파일 문자열을 `CanvasDocumentRecord`로 정규화한다.
- `repository.read(...)`
  - MVP web shell에서는 필수 아님
  - 제공하더라도 in-memory locator 범위에 한정한다.
- `repository.save(...)`
  - 이번 단계에서는 unsupported로 둔다.

### 5.3 locator 정책

web shell에서 필요한 locator는 아래 두 가지면 충분하다.

- `memory`
  - startup sample
  - uploaded file source
- `file`
  - 이번 web shell 단계에서는 실제 persistence locator로 쓰지 않는다.

즉 browser에서는 우선 “문자열 source를 memory locator로 정규화해서 보는 경로”를 기본으로 한다.

---

## 6. UI / UX 규칙

### 6.1 시작 상태

- 앱 시작 시 bundled sample board를 즉시 보여준다.
- sample은 desktop startup template와 같은 fixture를 사용한다.
- entry card는 계속 보이되, web shell 문맥에 맞는 copy를 사용한다.

예:

- `New File`
  - sample board로 reset
- `Open File`
  - browser file picker로 `.canvas.md` 선택
- `Save`
  - 이번 단계에서는 노출하지 않음

### 6.2 file menu

web shell의 top-left file menu는 desktop와 동일한 위치를 유지한다.  
단, 동작은 browser capability에 맞게 제한한다.

- `Open File`: 노출
- `Save`: 숨김

이 단계의 web shell은 persistence shell이 아니라 viewer verification shell이므로, 저장 동작을 억지로 browser download로 흉내내지 않는다.

### 6.3 나머지 overlay UI

아래는 desktop와 동일하게 유지한다.

- bottom-center tool menu
- bottom-right zoom controls
- parse issue/status panel

즉 shell chrome의 layout은 유지하고, document entry capability만 환경에 맞게 제한한다.

---

## 7. 구현 순서

### Phase 1. Shared Viewer Shell Extraction

- desktop renderer app에서 공용 shell 조립을 분리한다.
- 공용 shell은 다음을 props 또는 bootstrap input으로 받는다.
  - `documentPicker`
  - `documentRepository`
  - `templateSource`
  - capability flags
- desktop app은 이 공용 shell을 사용하는 host wrapper만 남긴다.

완료 기준:

- desktop app이 shared shell로 돌아간다.
- desktop 동작과 테스트 결과가 기존과 동일하다.

### Phase 2. Web App Scaffold

- `apps/web` 추가
- web 전용 Vite config와 React entrypoint 추가
- root script에 web dev/build 경로 추가

완료 기준:

- 브라우저에서 web app이 뜨고 empty shell이 아니라 sample board가 바로 보인다.

### Phase 3. Browser Bridge

- hidden file input 기반 `pickOpenLocator()` 구현
- uploaded file text를 `repository.readSource(...)`로 정규화
- sample reset용 `New File` 동작 구현
- unsupported save capability 처리

완료 기준:

- `.canvas.md` 파일을 선택하면 board가 교체된다.
- invalid document면 parse error가 shell state로 드러난다.

### Phase 4. Capability-aware Shell UI

- `FileMenu`와 `EntryActions`가 capability를 보고 버튼을 숨기거나 문구를 바꿀 수 있게 한다.
- desktop는 기존 UX 유지
- web은 `Open File`만 노출하고 `Save`는 숨긴다.

완료 기준:

- 같은 shell 컴포넌트가 desktop/web에서 capability만 바뀐 채 동작한다.

### Phase 5. Shared Verification

- sample fixture 기준 web/desktop parity 확인
- note, edge, markdown rendering이 같은지 테스트
- repository 경유 hydration이 유지되는지 테스트

완료 기준:

- shell/store가 parser 직접 의존 없이 web과 desktop에서 모두 동작한다.

---

## 8. 테스트 계획

### 단위 테스트

- shared shell이 `documentRepository.readSource(...)`를 통해 sample을 hydrate 하는지
- web bridge가 file input으로 읽은 source를 aggregate로 정규화하는지
- unsupported save capability일 때 `Save`가 노출되지 않는지
- sample reset 후 문서/viewport/parse issue state가 초기화되는지

### UI 테스트

- web shell 시작 시 sample note와 edge label이 보이는지
- `Open File` 후 새 note content가 렌더되는지
- parse issue가 있는 업로드 파일에서 issue panel이 노출되는지
- tool menu, zoom controls, status panel이 desktop와 같은 위치 구조를 유지하는지

### parity 확인

- 같은 sample source를 넣었을 때 desktop/web의 렌더 결과가 동일한지
- repository contract 사용 방식이 두 환경에서 같은지

---

## 9. 비목표

이 문서 범위에서 아래는 하지 않는다.

- browser write/save persistence
- File System Access API 통합
- style pack / component pack loader 구현
- multi-select
- VS Code extension shell

이 문서의 목적은 어디까지나 “공용 viewer shell을 browser에서도 같은 계약으로 돌리는 것”이다.

---

## 10. 완료 기준

web shell 작업이 끝나면 아래를 만족해야 한다.

- `apps/web`가 존재한다.
- web shell은 startup sample을 즉시 렌더한다.
- local `.canvas.md` upload를 viewer로 확인할 수 있다.
- desktop와 web은 같은 repository contract와 같은 shared viewer shell을 사용한다.
- shell/store는 markdown parser를 직접 호출하지 않는다.
