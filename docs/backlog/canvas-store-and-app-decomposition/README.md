# 백로그: Canvas Store and App Decomposition

## 문제

`CanvasStoreState`가 문서, 선택, 편집 세션, 뷰포트, 클립보드, history, image
asset, edge editing, selection toolbar까지 한 타입에 묶인 god-store다.

- `packages/canvas-app/src/store/canvas-store-types.ts` 의 `CanvasStoreState`는
  데이터 필드 30개 이상, 액션 50개 이상을 한 번에 노출한다.
- 구현 파일 `packages/canvas-app/src/store/canvas-store-slices.ts`가 3,077줄,
  테스트 `canvas-store.test.ts`가 1,729줄까지 커져 있다.
- `packages/canvas-app/src/app/canvas-app.tsx`는 `useStore(store, (state) => state.X)`
  패턴을 50회 이상 연속 호출해 한 컴포넌트가 store 거의 전체에 구독을 건다.
  그 결과 `createCanvasAppCommandContext`와 `createCanvasObjectCommandContext`의
  `useMemo` 의존성 배열도 각각 ~20개로 불어났다.
- 리프 컴포넌트(`CanvasNoteNode`, `FileMenu`, `ToolMenu`, `StatusPanels`,
  `HistoryControls`, `ZoomControls` 등)도 `store: CanvasStore`를 통째로 받아
  자기 안에서 다시 슬라이스를 고른다. 시그니처만 봐서는 무엇을 읽고 쓰는지
  드러나지 않는다.

## 제안

store를 도메인 슬라이스로 쪼개고, UI 레이어에는 좁은 selector / hook 만
노출한다.

- store 슬라이스 타입을 도메인별로 분리한다. 예: `CanvasDocumentSlice`,
  `CanvasSelectionSlice`, `CanvasEditingSlice`, `CanvasClipboardSlice`,
  `CanvasHistorySlice`, `CanvasViewportSlice`, `CanvasImageAssetSlice`.
- 각 슬라이스 파일은 자신의 상태, 액션, selector, 단위 테스트를 한 곳에
  둔다. 현재의 3,077줄 단일 파일을 슬라이스 단위로 분할한다.
- UI 레이어는 store 객체 대신 도메인 hook을 받는다.
  예: `useCanvasSelection()`, `useCanvasEditingActions()`,
  `useCanvasClipboard()`, `useCanvasHistory()`, `useCanvasViewport()`.
- `CanvasApp`은 `commandContext` 를 구성하는 로직을 hook
  (`useCanvasCommandContext()`) 으로 옮겨 컴포넌트 본문에서 50개 액션 구독이
  사라지게 한다.
- 현재 `CanvasApp`에 직접 박혀 있는 export dialog 상태 (`exportDialogOpen`,
  `exportFormat`, `exportScope`, `isExporting` 등)는 `CanvasExportController`
  컴포넌트로 밖으로 뽑는다.

## 왜 필요한가

- RULE.md "인터페이스는 1~3개 메서드", "읽기와 쓰기, 조회와 변경을 분리",
  "public surface는 작게 유지" 원칙에 직접 대응.
- AGENTS.md "Promptable Boundaries and Minimal Context". 지금은 한 버그를
  수정하려면 3,000줄짜리 store와 700줄짜리 CanvasApp을 동시에 열어야 한다.
- 이후 나올 `command-surface-and-quick-actions`, `object-command-completeness`
  백로그가 모두 store 수정을 요구하므로, 분할 없이 추가 기능을 쌓으면
  파일이 계속 부풀어 오른다.

## 관련 문서

- `README.md`
- `RULE.md`
- `docs/backlog/canvas-scene-module-split/README.md`
- `docs/backlog/command-surface-and-quick-actions/README.md`
- `docs/backlog/object-command-completeness/README.md`
