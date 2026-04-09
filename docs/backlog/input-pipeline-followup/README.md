# Boardmark Input Pipeline Follow-up Backlog

| 항목 | 내용 |
| --- | --- |
| 작성일 | 2026-04-09 |
| 상태 | Backlog |
| 선행 문서 | `docs/features/input-pipeline-improvement/README.md` |
| 관련 ADR | `docs/adr/004-input-intent-pipeline.md` |

## 1. 목적

이 문서는 input pipeline V1 이후 의도적으로 남겨 둔 후속 작업을 backlog로 관리하기 위한 문서다.

현재 V1에서 이미 닫힌 범위는 다음과 같다.

- keyboard / wheel / gesture zoom의 공통 intent-resolver-dispatch path
- `temporary pan`의 `inactive | active | deferred` 상태 분리
- `selection-box`, `node-drag`, `edge-reconnect`, `pane-pan` lifecycle의 explicit pointer interaction state
- `Space` mid-drag 시 현재 interaction 유지, 다음 pointer start에서만 pan 반영 정책

이번 backlog는 "지금 기능이 깨져 있으니 즉시 막아야 하는 버그"가 아니라,
입력 충돌을 더 줄이고 hybrid pipeline을 다음 단계로 밀기 위해 남겨 둔 구조적 후속 작업만 다룬다.

## 2. Backlog Items

### 2.1 Connect-Line Lifecycle를 Pointer Machine에 편입

현재 connect preview / connect start / connect end lifecycle은 이번 라운드 범위 밖이다.
즉 edge reconnect는 machine에 포함됐지만, 새 edge를 만드는 connect-line interaction은 아직 같은 상태 표 위에 있지 않다.

왜 필요한가:

- `Space temporary pan deferred transition`이 connect-line 중에도 같은 규칙으로 동작해야 한다.
- connect preview, cancellation, drop target resolution이 다른 pointer interaction과 같은 vocabulary로 설명돼야 한다.
- 향후 pointer conflict를 분석할 때 "reconnect는 machine 안에 있는데 connect는 바깥"인 비대칭 상태를 줄여야 한다.

후속 구현 기준:

- `onConnectStart` / `onConnectEnd`를 explicit lifecycle intent로 올린다.
- connect preview state와 connect commit state를 분리한다.
- `temporary-pan:start/end`, `blur`, `editing-start`가 connect-line 중에 들어왔을 때의 전이를 표로 고정한다.
- reconnect와 connect가 서로 다른 React Flow callback을 쓰더라도 resolver vocabulary는 대칭적으로 유지한다.

완료 기준:

- connect-line interaction도 selection-box / node-drag / edge-reconnect / pane-pan과 같은 pointer machine에서 해석된다.
- connect-line 중 `Space`를 눌렀을 때 현재 interaction 유지와 deferred pan 소비 규칙이 테스트로 고정된다.

### 2.2 Full Pointer Capture / Ownership Graph로 승격

현재 상태 머신은 제품에 필요한 핵심 lifecycle을 명시적으로 다루지만,
아직 전체 pointer capture ownership을 graph 수준으로 모델링한 것은 아니다.

예를 들면 현재는 다음을 전부 한 곳에서 완전히 모델링하지 않는다.

- pointer down 이후 어느 surface가 capture ownership을 가졌는가
- programmatic viewport move와 pointer-driven pane pan을 어떻게 구분할 것인가
- connect preview, resize preview, drag preview, selection preview가 같은 capture graph에서 어떻게 경쟁하는가
- cancel / blur / pointer cancel / capture lost가 같은 종료 규칙을 갖는가

왜 필요한가:

- interaction 종류가 더 늘어나면 reducer 분기가 늘어나면서 지역 규칙이 다시 흩어질 수 있다.
- pointer capture ownership을 명시하지 않으면 "왜 이 drag는 pan으로 소비되고 저 drag는 selection으로 갔는가"를 설명하기 어려워진다.
- 향후 connect-line, touch, stylus, richer gesture를 붙일 때 현재 구조만으로는 상태 충돌 분석 비용이 커진다.

후속 구현 기준:

- pointer lifecycle을 상태 노드와 전이 표로 명시한다.
- 최소한 `idle`, `pre-drag`, `selection-box`, `node-drag`, `node-resize`, `edge-reconnect`, `connect-line`, `pane-pan`, `cancelled` 수준의 ownership 모델을 검토한다.
- pointer source, capture owner, completion reason, cancellation reason을 전이 입력으로 분리한다.
- React Flow callback 이름이 아니라 Boardmark pointer semantics를 기준으로 graph를 정의한다.

완료 기준:

- pointer interaction arbitration이 capability boolean 모음이 아니라 explicit ownership graph로 설명된다.
- blur, cancel, temporary pan deferral, connect/reconnect, pane pan이 같은 종료 규칙 집합으로 수렴한다.

## 3. 우선순위

1. `connect-line lifecycle` 편입
2. full pointer capture / ownership graph

우선순위를 이렇게 두는 이유는 명확하다.

- connect-line은 현재 machine 바깥에 남아 있는 가장 큰 제품 표면이라 일관성 측면에서 먼저 닫아야 한다.
- full graph는 구조적 가치가 크지만 비용도 커서, connect-line을 포함한 실제 충돌 면이 더 분명해진 뒤 진행하는 편이 안전하다.

## 4. 현재 판단

- 두 항목 모두 V1 완료 조건에는 포함되지 않는다.
- 다만 입력 시스템을 장기적으로 안정화하려면 둘 다 결국 필요하다.
- 특히 `connect-line lifecycle`은 미룰 수는 있지만 오래 방치하면 다시 scene-local policy가 자라나는 종류의 후속 작업으로 본다.
