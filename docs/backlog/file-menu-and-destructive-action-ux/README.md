# 백로그: File Menu and Destructive Action UX

## 문제

파일 관련 액션이 시각적으로 덜 강조되고, 파괴적 액션이 정상 액션과 같은
톤을 가지고 있다.

- `packages/canvas-app/src/components/controls/file-menu.tsx` 의 트리거
  버튼이 `CircleEllipsis` (말줄임표) 아이콘 + `sr-only "Open menu"` 라벨
  이다. 좌상단의 여러 floating chrome 중 하나로 보여 "이게 파일 메뉴"
  라는 사실이 클릭 전에는 드러나지 않는다.
- 메뉴 항목(New / Open / Save)이 단축키를 전혀 표시하지 않는다.
  `@canvas-app/keyboard` 에 단축키 매핑이 분명히 있으므로 가시화만 하면 된다.
- Unsaved-changes dialog 에서 `Cancel` (ghost), `Don't save` (secondary),
  `Save and continue` (primary) 가 한 줄에 같은 폭으로 놓여 있다.
  "Don't save" 는 변경 유실을 일으키는 파괴적 액션인데, 정상 톤(secondary)
  이라 시각적 경계가 없다.
- `status-panels.tsx` 는 우상단에 conflict / parse / messages 카드를
  최대 3개까지 동시에 쌓을 수 있다. drop overlay(`z-10`) 와 chrome(`z-20`)
  사이의 위치가 겹치고, dismiss 수단이 제한적이다. 상태 카드들이 보드
  우상단을 덮는 시간이 길어질 수 있다.

## 제안

파일 흐름을 제품의 1차 액션으로 승격하고, 파괴적 액션 톤을 분리한다.

- FileMenu 트리거를 명시적 파일 아이콘 + 파일명(또는 "Untitled") 조합으로
  교체한다. 파일명을 표시하면 상단에 문서 컨텍스트도 같이 전달된다.
- 메뉴 항목에 단축키 표기를 붙인다. 현재 트리거에 `aria-label` 만 있고
  메뉴 자체에 `role="menu"` 가 있으므로, 각 항목에 `⌘N`, `⌘O`, `⌘S` 를
  우측 정렬로 표기한다.
- 파괴적 액션용 톤을 디자인 시스템에 추가한다.
  `emphasis="destructive"` 또는 `tone="warning"` 을 `Button` 프리미티브에
  확장해 `--color-state-warning` 계열을 사용하게 한다.
- Unsaved-changes dialog 에서 "Don't save" 를 destructive 톤으로 바꾸고,
  "Save and continue" 와 물리적으로 떨어뜨린다 (primary 버튼을 우측
  끝으로, destructive 를 좌측 secondary 그룹 가까이 등).
- StatusPanels 에 dismiss 버튼(그리고 키보드 Esc) 을 추가하고, 3개 동시
  표시 시 stacking 이 아니라 accordion/collapse 로 높이를 제한한다.
- drop overlay 위치(`top-24 inset-x-8`) 와 status panels 의 z-index / 좌표
  영역이 겹치지 않도록 레이아웃을 한 번 정리한다.

## 왜 필요한가

- 파일 저장/열기는 로컬-파일-네이티브 제품의 1차 기능이다. 시각적으로
  가장 약한 요소여선 안 된다.
- "Don't save" 같은 파괴적 액션의 실수 클릭은 곧 사용자 데이터 유실이다.
  톤 구분은 시스템 차원에서 제공해야 반복 구현을 막을 수 있다.
- 이 작업은 `design-system-drift-cleanup` 에서 만들 `<FloatingCard>` 와
  destructive 버튼 톤을 전제로 한다.

## 관련 문서

- `DESIGN.md`
- `docs/backlog/design-system-drift-cleanup/README.md`
- `docs/backlog/save-session-reliability/README.md`
- `docs/backlog/external-edit-conflict-ux/README.md`
- `docs/backlog/command-surface-and-quick-actions/README.md`
