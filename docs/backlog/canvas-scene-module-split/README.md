# 백로그: Canvas Scene Module Split

## 문제

`packages/canvas-app/src/components/scene/canvas-scene.tsx` 가 1,190줄 한
파일에 너무 많은 책임을 모아 놓았다.

- `CanvasScene` (ReactFlow 호스트, gesture/wheel pipeline, 각종 선택·드래그
  이벤트 디스패치)
- `CanvasNoteNode` (노트용 커스텀 노드)
- `CanvasComponentNode` (일반 컴포넌트용 커스텀 노드)
- `CanvasMarkdownEdge` (edge 라벨 편집 포함)
- `FallbackComponentNode`
- `shouldDispatchPointerPanePanLifecycle`, `shouldKeepCanvasWheelEventLocal`,
  `shouldPreserveAutoHeightResize`, `readInternalNodeBounds`,
  `handleConnection`, `readBuiltInRenderer`
- 마지막 블록에서 `flow/*` 모듈의 헬퍼를 다시 re-export (`applyFlowNodeGeometryDrafts`,
  `mergeFlowNodes`, `readFlowNodes`, `applyNodeChangesToStore`)

결과:

- 노드/엣지 렌더 변경, 드래그 파이프라인 변경, 편집 hook 변경이 모두 같은
  파일을 건드리게 되어 diff 충돌과 리뷰 비용이 크다.
- re-export 가 파일 끝에 숨어 있어 외부 소비자가 이 파일에 의존하는지
  추적이 어렵다.
- 1,190줄짜리 파일이 AGENTS.md §4 "Promptable Boundaries and Minimal
  Context" 의 전형적인 반례가 된다.

## 제안

책임 단위로 파일을 쪼갠다.

- `scene/canvas-scene.tsx` 는 ReactFlow 호스트 + 이벤트 dispatch 만 남긴다.
- `scene/nodes/canvas-note-node.tsx`, `scene/nodes/canvas-component-node.tsx`,
  `scene/nodes/fallback-component-node.tsx` 로 분리.
- `scene/edges/canvas-markdown-edge.tsx` 로 분리 (이미 폴더 존재).
- wheel/gesture/pan 관련 local helper (`shouldDispatchPointerPanePanLifecycle`,
  `shouldKeepCanvasWheelEventLocal`) 는 기존 `input/` 레이어로 이동 가능성
  검토. 이동 못 하면 `scene/canvas-scene-event-helpers.ts`.
- 마지막의 flow 모듈 re-export 블록은 소비자가 원 모듈을 직접 import
  하도록 바꾸고 제거한다. 어떤 외부 파일이 `canvas-scene.tsx` 에서 이를
  import 하고 있는지 먼저 grep 해서 교체한다.
- `readBuiltInRenderer`, `readInternalNodeBounds`, `handleConnection` 은
  각자 쓰임새에 맞춰 이동 (`scene/flow/*` 또는 nodes 파일).

## 왜 필요한가

- `canvas-store-and-app-decomposition` 과 함께, 자주 수정되는 두 축(store
  + scene) 모두에서 컨텍스트 비용을 줄인다.
- 향후 `large-canvas-performance`, `input-pipeline-followup`, selection toolbar
  개선 등이 scene 을 계속 건드리게 돼 있다.

## 관련 문서

- `AGENTS.md`
- `docs/backlog/large-canvas-performance/README.md`
- `docs/backlog/input-pipeline-followup/README.md`
- `docs/backlog/canvas-store-and-app-decomposition/README.md`
