# Canvas Interaction Performance PRD & 구현 계획

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v0.1 |
| 작성일 | 2026-04-06 |
| 상태 | Proposed |
| 범위 | canvas interaction performance / commit boundary |

## 1. 문서 목적

이 문서는 canvas 오브젝트 상호작용 중 남아 있는 두 성능/의미론 문제를 하나의 개선 작업으로 묶어 정리한다.

- resize preview가 아직 global store 기반으로 동작해 frame-by-frame 전체 scene 재계산 경로를 남기고 있는 문제
- multi-select drag가 UI preview와 최종 commit/history 의미론이 완전히 일치하지 않는 문제

기존 drag preview 개선으로 단일/일반 drag tick에서의 store write는 제거했지만, interaction boundary 전체가 정리된 것은 아니다. 이번 문서의 목표는 남은 두 작업에 대해 제품 요구사항과 구현 결정을 한 파일에서 닫아, 구현자가 추가 설계 결정을 하지 않고 바로 작업할 수 있게 만드는 것이다.

## 2. 개선 작업 요약

이번 개선은 아래 두 축을 함께 다룬다.

1. `Resize Preview Local-State`
   - resize tick 동안 store write를 제거한다.
   - preview source-of-truth를 scene-local geometry draft로 이동한다.
2. `Multi-Select Drag Commit Semantics`
   - multi-select drag 1회를 commit 1회, history 1회 의미론으로 정리한다.
   - ReactFlow preview 결과와 store/document commit 결과가 어긋나지 않게 만든다.

이 둘은 별개의 최적화처럼 보이지만 실제로는 같은 문제다. 현재 canvas scene은 preview와 commit의 경계가 interaction 종류별로 다르게 흩어져 있고, 그 때문에 어떤 gesture는 local state만 쓰고 어떤 gesture는 store를 매 tick 갱신한다. 이번 작업은 이 경계를 `preview는 local`, `commit은 store/document pipeline`으로 통일한다.

## 3. 현재 기준선

2026-04-06 기준 관련 상태는 다음과 같다.

- drag preview는 `CanvasScene`의 local `flowNodes`에서 처리되고, drag tick마다 store `previewNodeMove`를 호출하지 않는다.
- resize preview는 여전히 `NodeResizer.onResize -> previewNodeResize -> interactionOverrides` 경로를 사용한다.
- `CanvasScene`는 `interactionOverrides`를 구독하고, 값이 바뀌면 `readFlowNodes(...)`를 다시 계산한다.
- `readFlowNodes(...)`는 전체 node 목록에 대해 `sort + map + toFlowNode(...)`를 수행한다.
- 현재 `move-node` intent와 `resize-node` intent는 모두 단일 `nodeId` 계약이다.
- 현재 `onNodeDragStop`는 ReactFlow callback의 `nodes[]`를 사용하지 않고 `node` 하나만 commit 입력으로 사용한다.
- group selection은 `group-selected`와 `drilldown` 상태를 별도로 가지며, top-level normalize 규칙을 이미 사용한다.

즉 drag preview는 일부 경량화되었지만, resize preview와 multi-select drop commit은 아직 interaction boundary가 정리되지 않았다.

## 4. 문제 정의

### 4.1 Resize Preview 병목

현재 resize preview 병목 경로는 아래와 같다.

1. `NodeResizer.onResize`가 매 tick마다 `previewNodeResize(...)`를 호출한다.
2. `previewNodeResize(...)`는 `interactionOverrides` 전체 객체를 새로 만들어 store에 쓴다.
3. `CanvasScene`는 `interactionOverrides`를 구독하고 있으므로 scene이 다시 계산된다.
4. `readFlowNodes(...)`가 전체 node 배열을 다시 변환한다.
5. 결과적으로 한 노드 resize 중에도 scene 전체가 연쇄 재계산된다.

이 구조는 단일 노드 resize에서도 불필요하고, 이후 selection/resize handle surface가 복잡해질수록 비용이 더 커진다.

### 4.2 Multi-Select Drag Commit 의미론 불일치

현재 multi-select drag/drop 경계는 아래 점이 불명확하다.

1. ReactFlow drag preview는 여러 노드를 함께 이동시킬 수 있다.
2. 하지만 현재 commit 계층은 `move-node` 단일 intent와 `commitNodeMove(nodeId, x, y)` 단일 action만 가진다.
3. 따라서 drop 시점에 dragged `nodes[]` 전체를 commit하지 않으면 일부 노드는 preview만 움직이고 실제 문서 commit에는 반영되지 않을 수 있다.
4. 각 노드를 개별 `move-node`로 연속 commit하면, gesture 1회를 history 여러 step으로 쪼갤 위험이 있다.

이번 작업은 이 의미론을 명시적으로 고정한다. multi-select drag 1회는 문서/히스토리 기준으로도 1회여야 한다.

### 4.3 유지해야 하는 제약

- 문서 source string이 최종 truth라는 원칙을 유지한다.
- transaction / commit / history semantics를 깨지 않는다.
- commit 실패 시 silent fallback 없이 local preview를 store snapshot 기준으로 되돌린다.
- top-level selection / group-selected / drilldown 규칙을 유지한다.

## 5. 제품 목표

- drag/resize preview 동안 frame-by-frame store churn을 최소화한다.
- preview는 ReactFlow/scene-local state에서만 처리한다.
- drop / resize end 시 최종 commit은 1 gesture = 1 document transaction = 1 history entry로 정리한다.
- group / drilldown / locked object 규칙을 유지한 채, preview와 commit의 적용 대상이 일치해야 한다.

## 6. 비목표

- unrelated scene or store refactor
- ReactFlow renderer 교체
- canvas 문서 모델 전체 재설계
- lock/group semantics 자체 변경
- selection toolbar 신규 도입

## 7. PRD

### 7.1 Resize Preview

- resize preview의 source-of-truth는 store가 아니라 scene-local geometry draft다.
- resize tick 동안 `previewNodeResize(...)`는 호출하지 않는다.
- resize draft는 `nodeId -> { x, y, width, height }` 형태의 local state 또는 동등한 scene-local 구조로 유지한다.
- local resize draft는 현재 `flowNodes`에 병합되어 즉시 렌더링된다.
- resize end에서만 `commitNodeResize(...)`를 호출한다.
- commit 성공 후에는 store snapshot을 다시 읽어 local flow state를 재동기화한다.
- commit 실패 또는 blocked/invalid 결과에서도 local draft는 남기지 않고 store snapshot 기준으로 롤백한다.
- resize preview 중 selection/edge/other nodes에는 store write가 발생하지 않아야 한다.

### 7.2 Multi-Select Drag Commit

- drop 시 ReactFlow `onNodeDragStop(event, node, nodes)`의 `nodes[]`를 최종 commit 입력으로 사용한다.
- 최종 commit 계약은 단일 `move-node` 유지가 아니라, 신규 batch intent `move-nodes`를 추가하는 방향으로 고정한다.
- `move-nodes` intent는 여러 top-level node의 최종 좌표를 하나의 transaction으로 적용한다.
- 단일 node drag도 내부적으로는 같은 경로를 사용할 수 있지만, 외부 동작은 기존과 동일해야 한다.
- multi-select drag 1회는 history entry 1개만 남긴다.
- dragged `nodes[]`는 commit 전에 top-level selection 규칙으로 normalize한다.
- `group-selected` 상태에서는 group member 개별 좌표를 임의 commit하지 않는다.
- `drilldown` 상태에서 실제로 dragged 대상이 member node라면, 해당 top-level mutation 허용 규칙에 따라 commit 대상을 계산한다.
- locked node와 lock된 group에 속한 node는 drag preview 또는 commit 대상에서 제외되거나 즉시 차단되어야 하며, preview와 commit 결과가 일치해야 한다.

### 7.3 Shared Interaction Boundary

- 모든 gesture는 아래 경계를 따른다.
  - preview: local scene state
  - commit: store action
  - persistence/history: document edit pipeline
- commit 직후 scene-local state는 항상 store snapshot으로 다시 맞춘다.
- local preview draft는 commit 성공 여부와 관계없이 commit 종료 후 비워진다.
- preview와 commit 대상 계산 로직은 가능한 한 같은 normalization helper를 재사용한다.

## 8. 구현 계획

### Step 1. Resize preview local draft 도입

대상:

- `packages/canvas-app/src/components/scene/canvas-scene.tsx`
- 필요 시 scene 내부 전용 helper

작업:

- `CanvasScene`에 resize preview draft state를 추가한다.
- draft는 `flowNodes`에 병합 가능한 geometry map 형태로 유지한다.
- `NodeResizer.onResize`는 store action 대신 local draft만 갱신한다.
- 기존 `interactionOverrides` 구독은 drag/resize preview source로 쓰지 않도록 정리한다.
- resize preview 병합은 changed node만 반영하고, 전체 node regenerate를 유발하지 않는 경로를 사용한다.

결정:

- resize 전용 local draft는 drag preview와 같은 `flowNodes` controlled state 위에서 적용한다.
- store `interactionOverrides`는 resize preview 경로에서는 더 이상 쓰지 않는다.

### Step 2. Resize commit 경계 정리

대상:

- `packages/canvas-app/src/components/scene/canvas-scene.tsx`
- `packages/canvas-app/src/store/canvas-store-slices.ts`

작업:

- `NodeResizer.onResizeEnd`에서만 `commitNodeResize(...)`를 호출한다.
- commit 이후에는 store snapshot을 읽어 `flowNodes`를 재동기화한다.
- commit 실패/blocked/invalid 시에도 local resize draft가 남지 않게 한다.
- `previewNodeResize(...)`는 더 이상 scene resize path에서 사용하지 않으므로 제거하거나, 다른 호출부가 없다면 정리한다.

결정:

- resize commit intent는 기존 `resize-node`를 유지한다.
- resize는 batch intent를 도입하지 않는다.

### Step 3. Multi-select drag batch commit 도입

대상:

- `packages/canvas-app/src/components/scene/canvas-scene.tsx`
- `packages/canvas-app/src/store/canvas-store-types.ts`
- `packages/canvas-app/src/store/canvas-store-slices.ts`
- `packages/canvas-app/src/services/edit-intents.ts`
- `packages/canvas-app/src/services/edit-object-compilers.ts`
- 필요한 compiler/transaction test 파일

작업:

- 신규 intent `move-nodes`를 추가한다.
- payload는 `moves: Array<{ nodeId: string; x: number; y: number }>`로 고정한다.
- store에 batch commit action을 추가한다.
  - 이름은 `commitNodeMoves(moves)`로 고정한다.
- `onNodeDragStop`는 callback의 `nodes[]`를 읽고, 최종 dragged node 목록을 batch action으로 넘긴다.
- 단일 node drag도 동일 action을 사용할 수 있도록 허용한다.
- compiler는 `move-nodes`를 단일 transaction 안의 여러 node metadata patch로 컴파일한다.
- resolver/apply 단계는 이미 multi-edit transaction을 처리할 수 있으므로, 성공 시 history 1회만 쌓이게 유지한다.

결정:

- 단일 node move 전용 `move-node`는 즉시 제거하지 않는다.
- 신규 multi-select drag path는 `move-nodes`를 사용하고, 기존 `move-node`는 다른 단일 이동 경로와 호환을 위해 유지한다.
- 새 store action은 `commitNodeMove`를 대체하지 않고 보완한다.

### Step 4. Selection normalization 연결

대상:

- `packages/canvas-app/src/components/scene/flow/flow-selection-changes.ts`
- `packages/canvas-app/src/store/canvas-store-slices.ts`
- 필요 시 scene 내부 helper

작업:

- drop commit 전에 dragged `nodes[]`를 top-level mutation 대상으로 normalize하는 helper를 둔다.
- normalize 규칙은 기존 selection semantics와 충돌하지 않게 한다.
- `group-selected` 상태의 member drag는 batch commit 대상으로 직접 내리지 않는다.
- `drilldown` 상태에서 허용된 member drag만 실제 commit 대상으로 포함한다.
- lock된 group / lock된 node / non-top-level member 처리 규칙을 helper에서 명시적으로 반영한다.

결정:

- normalize helper는 scene/store 경계에서 재사용 가능한 순수 함수로 둔다.
- commit 대상 계산은 ReactFlow가 넘긴 `nodes[]`만 믿지 않고 store selection state와 함께 검증한다.

### Step 5. 테스트 추가

대상:

- `packages/canvas-app/src/components/scene/canvas-scene.test.tsx`
- `packages/canvas-app/src/store/canvas-store.test.ts`
- `packages/canvas-app/src/services/edit-intents.test.ts`
- `packages/canvas-app/src/services/edit-intent-compilers.test.ts`
- 필요 시 transaction resolver 또는 edit service 테스트

작업:

- resize preview 중 store write가 발생하지 않는지 검증한다.
- resize end commit 실패 시 local preview가 store-backed geometry로 롤백되는지 검증한다.
- `move-nodes` intent label과 compiler registration을 검증한다.
- multi-select drag 1회가 history 1회만 남기는지 검증한다.
- multi-select drag가 dragged node 전체 좌표를 한 transaction으로 반영하는지 검증한다.
- locked node / group-selected / drilldown 조합에서 commit 대상 normalization이 맞는지 검증한다.

## 9. 검증 계획

최소 검증:

- `pnpm -C packages/canvas-app exec tsc --noEmit`
- 관련 `vitest`

필수 테스트 범주:

- scene test
  - local resize preview merge
  - drag/resize commit 후 재동기화
- store test
  - batch move history 1회
  - locked selection 차단
- service / transaction test
  - `move-nodes` intent compile
  - multi-edit transaction reparse 안정성

## 10. 공개 인터페이스 / 타입 변경

이번 개선에서 외부적으로 추가되는 계약은 아래와 같다.

- 신규 edit intent
  - `move-nodes`
- 신규 store action
  - `commitNodeMoves(moves: Array<{ nodeId: string; x: number; y: number }>)`

기존 계약 유지:

- `move-node` intent 유지
- `resize-node` intent 유지
- `commitNodeMove(...)` 유지
- `commitNodeResize(...)` 유지

정책:

- multi-select drag는 새 `move-nodes` 경로를 사용한다.
- 단일 node drag는 기존 `commitNodeMove(...)` 또는 새 batch path 중 하나로 구현할 수 있지만, 외부 동작은 동일해야 한다.
- resize는 local preview만 새로 도입하고 commit API는 바꾸지 않는다.

## 11. 테스트 시나리오

### 11.1 단일 node drag

- preview는 local only
- drop 시 document commit 1회
- history 1회

### 11.2 단일 node resize

- resize tick 동안 store write 없음
- resize end에서만 commit
- commit 실패 시 local preview 롤백

### 11.3 multi-select drag

- dragged nodes 전체가 함께 commit됨
- history 1회만 쌓임
- commit 실패 시 전체가 store 기준으로 롤백됨

### 11.4 grouped selection / drilldown

- top-level normalize 후 commit 대상이 예측 가능함
- group-selected와 drilldown이 서로 다른 commit 대상을 갖더라도 규칙이 문서화된 대로 일관됨

### 11.5 locked object 포함 selection

- locked 대상은 preview/commit에서 제외되거나 즉시 차단됨
- preview와 commit 결과가 다르게 보이지 않음

## 12. 남은 리스크 / 후속 작업

- ReactFlow drag callback의 `nodes[]`와 group/drilldown selection state가 완전히 일치하지 않는 경우의 edge case
- `move-nodes` batch intent 도입 시 transaction resolver가 더 많은 multi-edit path를 다루게 되는 점
- resize draft와 drag draft를 장기적으로 shared abstraction으로 묶을지 여부

이번 작업에서는 위 리스크를 인지하되, 구현 우선순위는 `resize preview local-state화`와 `multi-select drag 1 gesture = 1 history`를 먼저 닫는 데 둔다.
