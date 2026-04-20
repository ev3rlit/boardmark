# 백로그: Design System Drift Cleanup

## 문제

`DESIGN.md`가 "primary 레퍼런스"로 선언돼 있지만, 앱 구현이 여러 지점에서
자체 규칙을 어기고 있고, 토큰 시스템이 raw rgba 상수와 공존한다.

- **1px 실선 경계 금지** 규칙이 사실상 지켜지지 않는다.
  `viewer-control-group`, `viewer-context-menu`, file menu trigger, status
  panel card, unsaved-changes dialog 모두
  `outline outline-1 outline-[var(--color-outline-ghost)]` 로 1px 실선
  테두리를 그린다. DESIGN.md가 fallback 으로만 허용한 "Ghost Border 15%
  opacity"와 실제 토큰 투명도가 일치하는지도 검증돼 있지 않다.
- **primary 는 사건이어야 한다** 는 규칙에 반해, primary 보라가 ambient
  color로 쓰인다. tool-menu의 활성 버튼 배경, 모든 노트 `NodeResizer`
  (`rgba(96, 66, 214, 0.72)`), 모든 edge stroke, 캔버스 배경 dot/line
  패턴 radial, body radial gradient, fullscreen radial gradient 전부 primary
  계열이다.
- **busy 레이아웃 금지** 규칙에 반해, 캔버스 배경에 body radial + flow
  radial + `Dots` grid (24px) + `Lines` grid (120px) 이 동시에 깔린다.
- **asymmetric editorial layout** 지향에 반해, 앱 chrome 은 좌상 FileMenu /
  우상 StatusPanels / 하단 중앙 ToolMenu / 우하 Zoom+History 의 정확한
  4코너 레이아웃이다. DESIGN 이 피하라고 한 "template look".
- 토큰 우회 하드코딩이 다수다. 같은 색을 `var(--color-primary)` 와
  `rgba(96, 66, 214, ...)` 두 방식으로 동시에 쓰고 있어, 토큰을 바꿔도
  반쪽만 따라온다. `rgba(43, 52, 55, 0.09)` 류의 `on-surface` 그림자도 수십
  곳에 raw 로 박혀 있다.

## 제안

DESIGN.md 와 실제 스타일 사이의 차이를 한 번에 정리한다.

- 규칙 현실화 선택: DESIGN.md를 코드에 맞게 완화하거나, 코드가 DESIGN.md에
  맞게 수정한다. 이 결정을 먼저 문서로 합의한다.
- "outline 1px == no-line rule 위반" 판정을 먼저 결론짓는다. 위반으로
  판정하면 floating chrome 을 `surface-container-lowest` on `surface`
  계열 배경 대비로 재구성한다.
- primary 사용 위치를 목록화하고 "event-level" 만 남긴다. 최소한 edge
  stroke, resize handle 보더, 캔버스 배경 radial 은 primary 에서 뺀다.
- 캔버스 배경 그리드를 하나만 남긴다 (Dots OR Lines). body gradient 와
  flow gradient 중 하나도 제거한다.
- 공통 floating card 스타일(`rounded-[1.45rem] bg-... shadow-... outline-...`
  반복)을 `<FloatingPanel>` / `<FloatingCard>` 프리미티브로 추출해서
  현재 컴포넌트마다 다른 `rounded-[1.3rem]` / `1.45rem` / `1.6rem` 불일치를
  제거한다.
- `rgba(96, 66, 214, ...)`, `rgba(43, 52, 55, ...)` 하드코딩을 전수조사해
  토큰 또는 `color-mix(in oklab, var(--color-primary) X%, transparent)`
  로 바꾼다. 그림자 전용 토큰(`--shadow-elevated-low`,
  `--shadow-elevated-high`) 을 신설하는 편이 유지보수에 유리하다.

## 왜 필요한가

- DESIGN.md 가 primary 레퍼런스임을 AGENTS.md 가 선언한 이상, 문서와 코드의
  불일치는 "enforceable constraint" 위반이다.
- 이후 다크모드, 테마 변경, 스타일 플러그인 (`markdown-render-style-plugins`)
  작업은 토큰이 단일 진실 원천일 때만 안전하다.
- `file-menu-and-destructive-action-ux` 를 포함한 다른 UX 개선들이 공통
  floating card 컴포넌트를 전제로 한다.

## 관련 문서

- `DESIGN.md`
- `AGENTS.md`
- `docs/backlog/markdown-render-style-plugins/README.md`
- `docs/backlog/file-menu-and-destructive-action-ux/README.md`
