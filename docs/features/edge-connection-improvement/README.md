# Boardmark Edge Connection Improvement PRD & 구현 계획

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v0.1 |
| 작성일 | 2026-04-08 |
| 상태 | Draft |
| 범위 | handleless edge 렌더링과 자동 외곽 접점(anchor) |

## 1. 문서 목적

이 문서는 현재 Boardmark의 edge 연결 모델이 가진 고정 좌/우 handle 기반 제약을 정리하고, 이를 handleless edge 렌더링과 자동 외곽 접점 계산 방식으로 개선하기 위한 제품 요구사항과 구현 계획을 정의한다.

이번 문서의 핵심 목표는 다음 두 가지다.

1. 사용자가 더 이상 "왼쪽/오른쪽 handle"을 보지 않아도 되는 edge 표현으로 전환한다.
2. edge가 항상 object 외곽의 자연스러운 지점에서 시작/종료되도록 자동 anchor 계산으로 전환한다.

이번 범위는 사용자 GUI 기반 edge 생성 / reconnect interaction을 포함하지 않는다. 해당 interaction 개선은 후속 feature로 분리한다.

이 문서는 단순한 시각 polish가 아니라, **edge geometry 해석 기준과 렌더링 정책을 바꾸는 feature 문서**다.

## 2. 문제 정의

현재 구현은 React Flow의 고정 handle 모델을 거의 그대로 사용한다.

- 모든 node는 왼쪽 `target`, 오른쪽 `source` handle을 렌더한다.
- edge는 source node의 오른쪽에서 시작하고 target node의 왼쪽에서 끝난다.
- edge 데이터 모델은 `from`, `to`만 가지며, handle 선택이나 anchor 전략은 별도로 표현하지 않는다.

이 구조는 구현은 단순하지만, 실제 사용 경험에서는 아래 문제가 생긴다.

- 두 object의 상대 위치와 무관하게 edge가 항상 `오른쪽 -> 왼쪽`으로 고정되어 보인다.
- 위/아래/대각선 배치에서 선이 부자연스럽게 꺾이거나 object를 관통하는 느낌이 난다.
- 사용자는 시각적으로 보이는 object를 연결 대상으로 이해하지만, 현재 edge 표현은 좌/우 handle 규칙에 묶여 보인다.
- note, shape, image처럼 서로 다른 형태의 object가 동일한 좌/우 handle 규칙을 강제로 공유하게 된다.
- Boardmark가 지향하는 editorial/lightweight canvas UX에 비해 연결 표면이 너무 툴 중심적으로 느껴진다.

결과적으로 현재 모델은 "edge가 object를 연결한다"기보다 "고정된 두 point를 연결한다"에 가깝다.

## 3. 현재 구현 기준선

2026-04-08 기준 현재 edge 연결 경로는 아래와 같다.

- scene node renderer는 note/component 모두 왼쪽 `target`, 오른쪽 `source` handle을 렌더한다.
- scene edge renderer는 React Flow가 계산한 `sourceX`, `sourceY`, `targetX`, `targetY`를 그대로 사용한다.
- renderer/domain 계층의 edge 모델은 `from`, `to` 외에 handle 정보나 anchor 정보가 없다.
- reconnect/create는 React Flow의 connection payload를 그대로 store command로 전달한다.

즉 현재 연결 모델의 실질적 규칙은 아래와 같다.

- source side: 항상 node right
- target side: 항상 node left
- anchor selection: 없음
- edge routing 기준: handle 좌표

## 4. 제품 목표

### 4.1 목표

- 화면에서 explicit handle 없이도 edge가 object 자체에 붙어 있는 것처럼 보여야 한다.
- edge는 object 중심이 아니라 object 외곽의 자연스러운 접점에서 시작/종료돼야 한다.
- 두 object의 상대 위치가 바뀌면 anchor side도 자동으로 바뀌어야 한다.
- note, shape, image 등 대부분의 일반 node가 같은 연결 규칙을 공유해야 한다.
- 현재 문서 모델의 단순함을 유지하면서도 geometry 해석 품질을 높여야 한다.

### 4.2 비목표

- edge path의 수동 bend point 편집
- object별 custom anchor preset
- orthogonal router나 obstacle avoidance 같은 고급 라우팅 엔진
- edge별 anchor override 문법 추가
- 그룹 border/frame border에 붙는 특수 anchor 정책
- 사용자 GUI 기반 edge create / reconnect interaction 변경

## 5. 핵심 결정

### 5.1 handleless UX를 기본으로 한다

- UI에서 좌/우/상/하 handle affordance를 노출하지 않는다.
- edge는 시각적으로 object 외곽에 직접 붙는 것처럼 보여야 한다.
- connection interaction 자체는 이번 문서 범위에 포함하지 않는다.

### 5.2 중심점 직접 연결이 아니라 외곽 자동 접점을 사용한다

- edge는 object 중심 좌표끼리 직접 연결하지 않는다.
- 먼저 source/target object의 대표 기준점으로 중심을 잡는다.
- 두 중심을 잇는 방향 벡터를 기준으로 각 object 외곽과 만나는 접점을 계산한다.
- 실제 path는 그 외곽 접점 사이를 연결한다.

이 방식은 "중심 기반 해석"을 내부 계산에 사용하되, 사용자에게 보이는 결과는 외곽 부착처럼 보이게 만든다.

### 5.3 문서 모델은 당분간 유지한다

- `CanvasEdge`는 계속 `from`, `to`만 유지한다.
- edge source에 `sourceHandle`, `targetHandle`, `anchorStrategy` 같은 필드를 추가하지 않는다.
- anchor 계산은 source-of-truth 문법이 아니라 runtime geometry policy로 해석한다.

이 결정으로 얻는 이점은 다음과 같다.

- 기존 `.canvas.md` 문법을 깨지 않는다.
- parser / repository / patch 경계에 새 필드 도입이 필요 없다.
- edge endpoint patch는 계속 `from`, `to` 수정만으로 닫힌다.

## 6. 제품 요구사항

### 6.1 Edge Rendering

- edge는 더 이상 고정 좌/우 handle 좌표를 기준으로 렌더링되면 안 된다.
- source object와 target object의 현재 geometry를 기준으로 자동 anchor를 계산해야 한다.
- anchor는 object bounding box 외곽 위의 한 점이어야 한다.
- source object가 target object의 왼쪽에 있으면 대체로 source 오른쪽 외곽, target 왼쪽 외곽이 선택된다.
- source object가 target object의 위에 있으면 대체로 source 아래 외곽, target 위 외곽이 선택된다.
- 대각선 배치에서는 중심 방향 벡터와 외곽 교점을 기반으로 접점을 선택해야 한다.
- edge label 위치는 기존처럼 edge path 기준 중간점 계열을 유지할 수 있다.

### 6.2 Object Shape Semantics

- 기본 정책은 모든 object를 axis-aligned bounding box로 간주한다.
- note, image, rect, roundRect, fallback component는 bounding box 외곽 접점을 사용한다.
- ellipse, circle, triangle도 P0에서는 bounding box 외곽 접점으로 시작할 수 있다.
- 추후 shape-aware anchor가 필요해도 현재 문서 모델을 깨지 않는 방식으로 확장 가능해야 한다.

### 6.3 Editing and Source Patch

- edge create는 계속 `create-edge` intent로 `from`, `to`를 기록한다.
- edge reconnect는 계속 `update-edge-endpoints` intent로 `from`, `to`만 patch한다.
- anchor 계산 결과는 source에 저장하지 않는다.
- 같은 문서를 다시 열어도 동일 geometry면 동일 anchor가 다시 계산돼야 한다.

### 6.4 Visual Feedback

- 기본 상태에서 point handle은 보이지 않아야 한다.
- edge가 선택되지 않은 상태에서도 외곽 접점 기준 연결이 읽혀야 한다.
- 후속 interaction feature가 추가되더라도, 기본 렌더 정책은 point handle 노출 없이 유지돼야 한다.

## 7. 설계 원칙

### 7.1 모델 단순성을 유지한다

- edge 문서 모델은 `from`, `to`만 유지한다.
- handle identity를 source에 직렬화하지 않는다.
- geometry 해석은 renderer/scene policy가 소유한다.

### 7.2 연결점은 정책이며 저장 데이터가 아니다

- anchor는 현재 화면 geometry에서 유도되는 파생값이다.
- object 이동/리사이즈 후 anchor가 바뀌는 것은 정상 동작이다.
- 이 변화는 별도 문서 patch를 요구하지 않는다.

### 7.3 UX는 object-first여야 한다

- 사용자가 인식하는 주체는 handle이 아니라 object다.
- edge는 object 외곽에 자연스럽게 부착된 것처럼 읽혀야 한다.
- GUI gesture 설계는 후속 feature에서 다룬다.

## 8. 구현 전략

구현은 이번 문서 범위에서 한 단계로 고정한다.

### Step 1. Edge geometry를 handleless anchor policy로 전환한다

목표:

- edge가 더 이상 고정 좌/우 handle에서 시작/종료되지 않도록 렌더링 기준을 바꾼다.

작업 내용:

- edge path 계산에서 React Flow가 준 fixed handle 좌표 의존을 줄인다.
- source/target node geometry를 기반으로 외곽 접점을 계산하는 helper를 추가한다.
- `CanvasMarkdownEdge`는 자동 anchor helper가 반환한 접점으로 path를 만든다.
- edge label 위치는 새 path 기준으로 다시 계산한다.

이 단계에서 기대하는 효과:

- 문서 모델 변경 없이 시각적 연결 품질이 개선된다.
- 현재 `오른쪽 -> 왼쪽` 고정 문제를 렌더 레벨에서 먼저 제거할 수 있다.
- 사용자 GUI 기반 create / reconnect 개선은 다음 feature 문서에서 별도로 다룬다.

## 9. 영향 범위

주요 영향 파일은 아래와 같다.

- `packages/canvas-app/src/components/scene/canvas-scene.tsx`
- `packages/canvas-app/src/components/scene/flow/flow-node-adapters.ts`
- `packages/canvas-renderer/src/index.ts`
- `packages/canvas-domain/src/index.ts`
- `packages/canvas-app/src/styles/canvas-app.css`

잠재적으로 추가될 수 있는 파일은 아래와 같다.

- `packages/canvas-app/src/components/scene/edges/edge-anchor-geometry.ts`

## 10. 테스트 계획

### 10.1 Geometry Unit Tests

- source가 target의 좌/우/상/하에 있을 때 외곽 접점이 기대 면에서 선택되는지 검증
- 대각선 배치에서 접점이 bounding box 바깥으로 벗어나지 않는지 검증
- 이동/리사이즈 후 같은 edge가 새 geometry로 다시 계산되는지 검증

### 10.2 Scene Integration Tests

- edge가 더 이상 고정 우측 source / 좌측 target만 쓰지 않는지 검증
- 기존 edge create/reconnect 결과가 새 anchor policy에서도 안정적으로 렌더링되는지 검증

### 10.3 Regression Tests

- 기존 edge label editing이 유지되는지 검증
- 기존 selection, delete, undo/redo와의 충돌이 없는지 검증
- note/image/shape 혼합 문서에서 edge path가 여전히 안정적으로 렌더링되는지 검증

## 11. 리스크와 대응

### 리스크 1. React Flow handle abstraction과의 충돌

- 현재 scene은 React Flow의 node/edge/connection 모델 위에 올라가 있다.
- handleless 렌더링을 도입해도 내부적으로는 React Flow handle 모델이 남아 있을 수 있다.

대응:

- geometry helper를 분리해, edge path 계산이 React Flow의 고정 좌/우 handle 해석에 직접 묶이지 않게 만든다.

### 리스크 2. Shape별 기대 anchor와 bounding box anchor의 차이

- ellipse나 triangle은 bounding box 기준 anchor가 시각적으로 덜 자연스러울 수 있다.

대응:

- P0는 bounding box 정책으로 통일하고, 실제 품질 이슈가 큰 shape만 후속 슬라이스로 분리한다.

## 12. 오픈 질문

- ellipse/circle/triangle에 shape-aware anchor를 P0에 포함할지, 후속 범위로 미룰지 확정해야 한다.
- 내부적으로 React Flow `Handle`을 완전히 제거할지, 보이지 않는 호환 레이어로 남길지 구현 시점에 결정해야 한다.

## 13. 완료 기준

- 기본 렌더링에서 좌/우 handle이 드러나지 않는다.
- edge는 고정된 우측 source / 좌측 target이 아니라 object 상대 위치에 따라 자연스러운 외곽 접점에서 연결된다.
- `.canvas.md` 문법 변경 없이 기존 edge create/reconnect patch pipeline이 유지된다.
- 관련 회귀 테스트가 추가돼 note, shape, image 혼합 캔버스에서도 연결 품질이 안정적으로 유지된다.
