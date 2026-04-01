# Boardmark Viewer MVP 구현 계획

## 1. 목적

이번 MVP의 목표는 `.canvas.md` 파일을 읽고 파싱한 뒤, 캔버스 viewer로 안정적으로 렌더링하는 것이다.

이번 단계에서는 편집 기능이 아니라 읽기와 렌더링에 집중한다. 구현 범위는 최소 기능의 viewer이며, 노드 타입은 `sticky note` 하나만 지원한다.

## 2. 범위 고정

### 포함

- Electron 앱 실행 시 기본 템플릿 캔버스를 즉시 표시
- 시작 화면에서 `새 파일 만들기`와 `파일 열기` 액션 제공
- `새 파일 만들기` 시 템플릿 기반 `.canvas.md` 파일 생성 후 바로 로드
- 기존 `.canvas.md` 파일 열기
- 파일 문자열을 `unified + remark-parse + remark-directive`로 파싱
- frontmatter를 읽어 viewport 초기값 적용
- `note` directive를 `CanvasNode`로 변환
- `edge` directive를 `CanvasEdge`로 변환
- 노드를 HTML/React 레이어에 absolute position으로 렌더링
- 엣지를 SVG overlay에 렌더링
- 노드와 엣지 라벨의 마크다운 렌더링
- 하단 중앙 floating tool menu에 `선택` / `Pan` 도구 제공
- 우측 하단에 zoom in / zoom out 컨트롤 배치
- 좌측 상단에 `파일 열기` / `저장` 메뉴 배치
- pan / zoom viewer
- 최소 선택 상태와 로드 에러 상태 표시
- 기본 내장 스타일 1종
- Vitest 단위 테스트

### 제외

- 양방향 편집
- 노드 드래그 및 파일 수정
- CodeMirror
- MagicString
- 커스텀 스타일 팩 로딩
- 커스텀 컴포넌트 팩 로딩
- 다중 노드 타입
- 협업, 레이아웃 자동화, 이미지/임베드

## 3. 구현 원칙

- Viewer MVP는 파서와 렌더러의 경계를 명확히 분리한다.
- 파서는 외부 입력 문자열을 부분 성공이 가능한 `CanvasAST`와 진단 정보로 바꾼다.
- 렌더러는 검증된 `CanvasAST`만 소비한다.
- 노드는 DOM/React로 렌더링하고, 엣지는 SVG로 렌더링한다.
- 기본 테마와 기본 스티키 노트 컴포넌트는 앱 내부에 번들한다.
- 파서, 파일 IO, IPC 같은 경계는 `neverthrow` 기반의 명시적 결과 타입으로 다룬다.
- recoverable error는 `Result`/`ResultAsync`로 반환하고 UI 상태에서 명시적으로 처리한다.
- 잘못된 노드나 엣지는 앱 전체를 실패시키지 않고 개별 오브젝트만 제외한다.
- 제외된 오브젝트와 실패 이유는 진단 정보와 UI 상태로 명시적으로 드러낸다.

## 4. 산출물

- Electron 기반 viewer 앱
- 시작 화면과 기본 템플릿 캔버스
- `.canvas.md` 파서 모듈
- `CanvasAST`, `CanvasNode`, `CanvasEdge`, `CanvasParseIssue` 타입
- `neverthrow` 기반 parse/file result 계약
- sticky note 노드 컴포넌트
- edge SVG 렌더러
- viewport pan / zoom 상태 관리
- canvas overlay UI 컴포넌트
- 신규 생성용 템플릿 `.canvas.md` 파일
- 샘플 `.canvas.md` 파일
- 단위 테스트

## 5. 기능 정의

### 5.1 앱 시작 및 문서 진입

- 앱 실행 시 renderer는 번들된 기본 템플릿을 즉시 로드해 캔버스를 보여준다.
- 시작 UI에는 `새 파일 만들기`와 `파일 열기` 액션이 항상 보인다.
- `새 파일 만들기`는 save dialog를 열고 템플릿 `.canvas.md`를 새 경로에 저장한 뒤 바로 로드한다.
- `파일 열기`는 기존 `.canvas.md`를 선택해 로드한다.
- `저장`은 현재 문서를 경로에 저장한다. 템플릿 상태로 시작한 경우 첫 저장 시 save dialog를 연다.
- preload/IPC를 통해 renderer에 파일 생성/열기 결과를 전달한다.
- renderer는 전달받은 문자열을 파싱하고 결과를 store에 반영한다.

### 5.2 파서

- frontmatter에서 `type`, `version`, `viewport`를 읽는다.
- `::: note` 블록을 읽어 노드 배열로 변환한다.
- `::: edge` 블록을 읽어 엣지 배열로 변환한다.
- 노드와 엣지의 필수 속성이 누락되면 해당 오브젝트만 제외하고 parse issue를 기록한다.
- 잘못된 `from` / `to` 참조를 가진 edge는 제외하고 parse issue를 기록한다.
- 이번 MVP에서는 `note` 외 다른 노드 타입은 해당 오브젝트만 제외하고 미지원 issue로 기록한다.
- frontmatter 자체가 치명적으로 깨진 경우에만 문서 전체 로드를 실패 상태로 처리한다.

### 5.3 캔버스 렌더링

- 노드는 `x`, `y`, `w`를 기준으로 absolute position으로 배치한다.
- 노드 본문은 `react-markdown + rehype-highlight`로 렌더링한다.
- 엣지는 `from`, `to` 노드 좌표를 이용해 SVG path로 렌더링한다.
- 엣지 라벨은 edge content를 마크다운으로 렌더링한다.
- viewport는 translate/scale 기반으로 적용한다.
- 하단 중앙 floating tool menu는 `선택`과 `Pan` 두 가지 모드만 제공한다.
- 우측 하단 zoom control은 `+`, `-` 버튼으로 배치한다.
- 좌측 상단 file menu는 `파일 열기`, `저장` 액션을 제공한다.

### 5.4 상태 관리

- store는 `document`, `nodes`, `edges`, `viewport`, `selection`, `loadState`, `error`, `entryState`, `parseIssues`를 가진다.
- 현재 문서 경로, 템플릿에서 시작했는지 여부, 파일 생성/로드/저장 상태를 가진다.
- 현재 tool mode(`select` | `pan`)와 zoom control 상태를 가진다.
- 제외된 오브젝트 목록과 파싱 경고를 UI에 노출할 수 있어야 한다.
- 렌더링 계산에 필요한 selector는 store 밖 유틸로 분리할 수 있다.

## 6. 제안 구조

```text
apps/
  desktop/
    src/
      main/
      preload/
      renderer/
        app/
        features/canvas/
        features/startup/
        features/document-entry/
        features/canvas-controls/
packages/
  canvas-domain/
  canvas-parser/
  canvas-renderer/
  ui/
```

### 구조 의도

- `canvas-domain`: 타입과 순수 데이터 계약
- `canvas-parser`: markdown 문자열을 `CanvasAST`로 변환
- `canvas-renderer`: 노드/엣지 좌표 계산과 viewer 레이어 구성
- `ui`: sticky note, 상태 표시 등 공용 React 컴포넌트
- `apps/desktop`: Electron 진입점과 실제 앱 조립

## 7. 단계별 구현 계획

### Phase 1. 도메인 타입 고정

- `CanvasFrontmatter`, `CanvasNode`, `CanvasEdge`, `CanvasAST`, `CanvasParseIssue` 정의
- `neverthrow` 기반 parse result와 file operation result 형태 정의
- viewer에서 필요한 최소 색상 토큰 정의

완료 기준:
- 파서와 렌더러가 같은 타입 계약을 공유한다.

### Phase 2. 파서 구현

- frontmatter 파싱
- directive 순회
- `note` 블록 매핑
- `edge` 블록 매핑
- 오브젝트 단위 입력 검증과 issue 수집
- 치명적 에러와 부분 실패를 구분하는 규칙 정리

완료 기준:
- 샘플 `.canvas.md`가 부분 실패가 있어도 `CanvasAST`와 issue 목록으로 안정적으로 변환된다.

### Phase 3. 앱 시작 흐름과 문서 진입

- 앱 시작 시 기본 템플릿 로드
- main process에서 새 파일 저장 다이얼로그
- main process에서 파일 열기 다이얼로그
- main process에서 저장 액션 처리
- preload로 안전한 IPC surface 제공
- renderer에서 새 파일/파일 열기/저장 액션과 load state 연결

완료 기준:
- 앱 실행 직후 캔버스가 보이고, 파일 메뉴 액션이 동작한다.

### Phase 4. Viewer Store

- 파일 로드 결과를 store에 적재
- viewport 초기화
- selection, error, loading, parse issue 상태 정의

완료 기준:
- 파일 로드 성공/실패, 현재 문서 상태, 제외된 오브젝트 진단이 store로 추적된다.

### Phase 5. Canvas Renderer

- viewport 컨테이너
- node layer
- edge layer
- sticky note 컴포넌트
- edge path와 label 렌더링

완료 기준:
- note와 edge가 같은 좌표계에서 올바르게 보인다.

### Phase 6. 상호작용

- 하단 floating tool menu
- pan
- zoom
- 노드 선택 하이라이트
- 우측 하단 zoom control
- 좌측 상단 file menu

완료 기준:
- 큰 캔버스를 끊김 없이 탐색할 수 있고 기본 컨트롤 위치가 고정되어 있다.

### Phase 7. 테스트와 샘플 문서

- parser unit test
- renderer unit test
- controls unit test
- document-entry unit test
- 템플릿과 샘플 fixture 문서 추가

완료 기준:
- 핵심 흐름이 자동 검증된다.

## 8. 테스트 계획

### Vitest

- frontmatter 파싱 성공/실패
- note 파싱
- edge 파싱
- 잘못된 `from` / `to` 참조 검출
- 잘못된 note 오브젝트만 제외되는지 확인
- 잘못된 edge 오브젝트만 제외되는지 확인
- 미지원 노드 타입이 issue로 기록되는지 확인
- 코드블록이 포함된 note content 보존
- viewport 기본값 계산
- edge 좌표 계산 유틸
- 기본 tool mode 전환
- zoom in / zoom out control 동작
- 좌측 상단 file menu 액션 상태
- 템플릿 시작 상태와 첫 저장 동작

## 9. 리스크와 대응

### directive 파싱 모호성

- fenced code block 안의 백틱과 directive 종료 토큰이 충돌하지 않는 fixture를 먼저 만든다.

### 부분 파싱 실패 정책

- 잘못된 오브젝트를 무시하되 조용히 삼키지 않도록 issue 수집과 UI 노출을 같이 설계한다.
- frontmatter와 문서 루트 수준의 치명적 실패만 전체 실패로 본다.

### edge 좌표 계산

- MVP에서는 노드 중심점 또는 좌우 중간점 기준으로 단순하게 계산한다.
- 라우팅 알고리즘은 도입하지 않는다.

### 마크다운 렌더 성능

- 노드 수가 적은 viewer MVP를 전제로 한다.
- 초기에는 가상화나 memoization보다 구조 단순성을 우선한다.

### Electron 보안 경계

- preload를 통해 필요한 새 파일 생성/파일 열기/저장 API만 노출한다.
- 원격 코드 실행이나 동적 팩 로딩은 이번 단계에서 제외한다.

## 10. 완료 기준

- 앱 실행 직후 템플릿 기반 캔버스가 표시된다.
- `새 파일 만들기`로 템플릿 `.canvas.md`를 생성하고 바로 열 수 있다.
- 기존 `.canvas.md` 파일 하나를 열 수 있다.
- 좌측 상단에 `파일 열기` / `저장` 메뉴가 보인다.
- 하단 중앙에 `선택` / `Pan` floating tool menu가 보인다.
- 우측 하단에 zoom control이 보인다.
- 파서가 note와 edge를 `CanvasAST`로 변환한다.
- 잘못된 노드나 엣지가 있어도 유효한 나머지 오브젝트는 계속 렌더링된다.
- 제외된 오브젝트와 이유가 parse issue로 남는다.
- sticky note 노드가 마크다운과 코드블럭을 포함해 렌더링된다.
- edge가 SVG로 렌더링되고 라벨이 보인다.
- pan / zoom이 동작한다.
- 커스텀 스타일 팩과 컴포넌트 팩 없이 기본 내장 UI만으로 viewer가 동작한다.
- 핵심 경로가 Vitest 단위 테스트로 검증된다.

## 11. 이후 단계

- 노드 드래그
- 파일 patch writer
- 내장 텍스트 에디터
- 스타일 팩 로딩
- 컴포넌트 팩 로딩
