# 백로그: Note Markdown Readability Guard

## 문제

노트 내부 마크다운이 노트 크기에 비례해 자동 스케일되는데, 읽을 수 없을
만큼 작게 줄어들 수 있다.

- `packages/canvas-app/src/components/markdown-layout-style.ts` 의
  `NOTE_CONTENT_SCALE_FLOOR = 0.4` 가 하한이다.
- baseline 이 `0.95rem` (~15.2px) 이므로 하한에서 본문이 ~6px 까지 축소된다.
  `h1` 은 `1.4rem * 0.4 ≈ 8.5px`. WCAG 가독성 기준을 한참 밑돈다.
- `--markdown-scale` 에 상한은 `Math.min(scale, 1)` 로만 걸려 있어 큰
  노트에서 과도하게 커지는 문제는 없지만, 작은 노트에서는 가드가 전혀 없다.
- 보드에 작은 노트 다수가 있는 경우(FigJam-style 스티키 벽), 실질 가독성이
  손상된다.

## 제안

최소 가독 폰트 사이즈를 기준으로 한 정책을 도입한다.

- 목표 하한을 정의한다. 예: 본문 11px, 헤더 최소 12px.
- scale 을 `max(MIN_READABLE_SCALE, computed)` 로 바꾸고, 그 결과 content
  가 body 박스를 넘으면 넘치는 부분을 fade-out 또는 truncate 처리한다.
- 선택 옵션으로 "작은 노트에서는 본문을 숨기고 제목만 표시" 같은 LOD
  (level-of-detail) 표시 모드를 검토한다. 보드가 더 멀리 zoom-out 된
  상황에서는 viewport zoom 과도 연결되므로, zoom 기반 LOD 와 함께 설계한다.
- `note-height-auto` 백로그 와 동일 지점에서 함께 다뤄야 한다. auto-height
  가 켜진 노트는 본문을 잘라서는 안 되고, 고정 높이 노트에서만 LOD 가
  적용된다.

## 왜 필요한가

- 작은 노트에서 본문이 읽히지 않으면 "텍스트 중심 에디터" 라는 제품
  정체성이 훼손된다.
- 접근성 관점에서 최소 가독 사이즈는 규제가 아니라 기본값이어야 한다.
- Preview ↔ edit 진입 순간의 layout 점프를 줄이는 `preview-continuous-editing`
  작업과 충돌하지 않도록 정책을 미리 정하는 편이 좋다.

## 관련 문서

- `DESIGN.md`
- `docs/backlog/note-height-auto/README.md`
- `docs/backlog/preview-continuous-editing/README.md`
- `docs/backlog/large-canvas-performance/README.md`
