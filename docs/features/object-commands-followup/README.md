# Boardmark Object Commands Follow-up PRD & 구현 계획

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v0.1 |
| 작성일 | 2026-04-04 |
| 상태 | Draft |
| 범위 | object command 후속 작업 |

## 1. 문서 목적

이 문서는 `docs/features/object-commands/README.md`에서 이미 구현을 시작한 오브젝트 커맨드 기반 위에, 남은 작업만 별도 feature 단위로 분리해 관리하기 위한 문서다.

현재까지 구현된 범위는 다음과 같다.

- `select-all`
- `duplicate-selection`
- `nudge-selection`
- keyboard zoom in / zoom out
- group / clipboard foundation
- group click 1차 selection / drill-down foundation
- object command registry와 keyboard/context-menu wiring 분리

이제 남은 작업은 "기반을 만든다"가 아니라, 제품 요구사항을 닫는 후속 슬라이스들이다. 따라서 기존 문서에 계속 누적하지 않고, 별도 feature 문서로 분리해 범위와 우선순위를 더 명확히 관리한다.

## 2. 후속 작업 요약

이번 follow-up 문서는 아래 네 축을 다룬다.

1. `Arrange`
   - `bring forward`
   - `send backward`
   - `bring to front`
   - `send to back`
2. `Lock`
   - `lock selection`
   - `unlock selection`
   - group lock enforcement
3. `Layout`
   - align 6종
   - horizontal / vertical distribute
4. `Selection Surface Polish`
   - desktop multi-select parity
   - group selection / drill-down UX 마감
   - selection toolbar / context menu enablement 정리

## 3. 현재 기준선

2026-04-04 기준 object command의 현재 상태는 다음과 같다.

- 도메인과 parser는 `z`, `locked`, `group` 구조를 받을 수 있다.
- store는 `selectedGroupIds`, `groupSelectionState`, `clipboardState`를 가진다.
- `copy`, `cut`, `paste`, `paste-in-place`, `group`, `ungroup`의 기본 write path가 있다.
- group member 첫 클릭은 상위 group selection으로 승격되고, 두 번째 클릭은 drill-down으로 전환된다.
- 아직 `arrange`, `align`, `distribute`, `lock/unlock`은 제품 표면과 write path가 닫혀 있지 않다.
- lock semantics는 일부 타입 필드만 있고, 실제 mutation 차단과 UI enablement가 완성되지 않았다.
- 데스크톱 다중 선택 parity와 selection toolbar는 아직 문서 수준 요구사항만 존재한다.

## 4. 제품 목표

### 4.1 목표

- 사용자는 top-level object 기준으로 selection, 정렬, arrange, 보호 작업을 일관되게 수행할 수 있어야 한다.
- 웹과 데스크톱에서 핵심 object command가 가능한 한 동일하게 동작해야 한다.
- 모든 명령은 source patch와 reparsed document를 통해 추적 가능해야 한다.
- lock과 group 같은 구조적 상태는 문서 모델에 직렬화 가능해야 한다.

### 4.2 비목표

- 회전 / 뒤집기
- selection toolbar의 시각 디자인 고도화
- 시스템 clipboard 동기화
- frame / section 고급 selection 정책

## 5. PRD

### 5.1 Arrange Commands

- z-order는 계속 명시적 `z` 필드로 관리한다.
- 신규 node와 신규 group의 기본 `z`는 `currentMaxZ + 1`이다.
- `bring to front`는 `currentMaxZ + 1`, `send to back`는 `currentMinZ - 1` 규칙을 사용한다.
- `bring forward / send backward`는 전체 재번호 매기기보다 인접 slot 이동을 우선한다.
- arrange는 top-level object 기준으로 동작한다. group이 선택되면 group object의 `z`를 조정한다.
- lock된 object와 edge는 arrange 대상에서 제외한다.
- arrange 결과는 렌더링 순서와 hit-test 순서에 함께 반영돼야 한다.

### 5.2 Lock Commands

- 사용자는 node, edge, group object를 lock / unlock 할 수 있어야 한다.
- lock된 object와 edge는 선택 가능하지만 수정할 수 없어야 한다.
- lock된 node는 move, resize, body edit, connector creation, align, distribute, arrange의 대상에서 제외한다.
- lock된 edge는 reconnect, label edit, delete, arrange 대상에서 제외한다.
- group lock은 group object에만 기록한다.
- group lock은 멤버 node에 `locked` 값을 전파하지 않지만, 런타임에서는 상위 group lock 때문에 멤버 수정이 차단돼야 한다.

### 5.3 Layout Commands

- `align / distribute / nudge`는 P0 규칙을 유지해 node-only로 동작한다.
- align은 `left`, `center`, `right`, `top`, `middle`, `bottom` 6종을 제공한다.
- distribute는 horizontal / vertical 2종을 제공한다.
- direct edge selection은 layout 대상에 포함하지 않는다.
- selected group은 layout 시 group bounding box 기준이 아니라, 이번 슬라이스에서는 비대상으로 유지한다.
- layout 실행 조건과 disabled state는 command layer에서 일관되게 계산돼야 한다.

### 5.4 Selection Surface Polish

- 데스크톱도 웹과 동일하게 shift-click과 box selection 기반 다중 선택을 지원해야 한다.
- group member 첫 클릭은 상위 group selection, 같은 group 두 번째 클릭은 drill-down을 유지한다.
- `Shift+Click`은 기존 selection을 유지한 채 top-level object selection을 확장한다.
- `Select all`과 box selection은 top-level object 기준으로 normalize한다.
- selection toolbar를 추가하더라도 command enablement는 keyboard/context menu와 동일한 registry를 재사용해야 한다.

## 6. 구현 계획

### Step 1. Arrange + Lock write path를 먼저 닫는다

대상 파일:

- `packages/canvas-app/src/services/edit-service.ts`
- `packages/canvas-app/src/store/canvas-store-slices.ts`
- `packages/canvas-app/src/app/commands/canvas-object-commands.ts`
- `packages/canvas-app/src/components/context-menu/object-context-menu.tsx`

작업 내용:

- `arrange-objects` intent 추가
- `set-objects-locked` intent 추가
- store에 `arrangeSelection(mode)` 추가
- store에 `setSelectionLocked(locked)` 추가
- command registry에 arrange/lock command 추가
- context menu enablement와 disabled reason 정리

검증:

- arrange가 `z` patch만으로 reparsed document를 유지하는지 확인
- lock된 object가 mutation path에서 제외되는지 store test로 확인

### Step 2. Align / Distribute를 node-only로 구현한다

대상 파일:

- `packages/canvas-app/src/services/edit-service.ts`
- `packages/canvas-app/src/store/canvas-store-slices.ts`
- `packages/canvas-app/src/app/commands/canvas-object-commands.ts`

작업 내용:

- `align-objects` intent 추가
- `distribute-objects` intent 추가
- store에 `alignSelection(mode)` 추가
- store에 `distributeSelection(axis)` 추가
- direct edge selection과 locked node를 제외한 geometry patch 계산

검증:

- 여러 node header를 한 번에 patch해도 source가 안정적으로 reparsed 되는지 확인
- 2개 미만 selection에서는 distribute가 disabled인지 확인

### Step 3. Selection surface를 마감한다

대상 파일:

- `packages/canvas-app/src/components/scene/canvas-scene.tsx`
- `packages/canvas-app/src/components/scene/flow/flow-selection-changes.ts`
- `packages/canvas-app/src/app/canvas-app.tsx`

작업 내용:

- 데스크톱 multi-select parity 확인 및 미지원 경로 제거
- group drill-down 상태에서 context menu / delete / clipboard enablement 보정
- selection toolbar 도입 여부를 결정하고, 도입 시 command registry 기반으로 wiring

검증:

- 웹/데스크톱에서 selection normalization 결과가 같은지 확인
- group-selected와 drilldown 상태 전이가 scene test에서 재현되는지 확인

## 7. 테스트 계획

### 7.1 `packages/canvas-app/src/services/edit-service.test.ts`

- `arrange-objects`가 `z` patch와 reparse를 안정적으로 유지하는지 검증
- `set-objects-locked`가 node, edge, group object를 정확히 갱신하는지 검증
- `align-objects`와 `distribute-objects`가 geometry patch를 올바르게 계산하는지 검증

### 7.2 `packages/canvas-app/src/store/canvas-store.test.ts`

- lock된 selection이 move / nudge / duplicate / delete / arrange에서 제외되는지 검증
- group lock이 멤버 `locked` 값 없이도 mutation을 차단하는지 검증
- arrange와 layout command가 selection 타입에 따라 enable / disable 되는지 검증

### 7.3 `packages/canvas-app/src/app/canvas-app.test.tsx`

- keyboard shortcut이 editable target에서는 가로채지 않는지 검증
- context menu와 selection toolbar가 같은 enablement 규칙을 쓰는지 검증

### 7.4 `packages/canvas-app/src/components/scene/canvas-scene.test.tsx`

- box selection normalization이 top-level object 기준을 유지하는지 검증
- group drill-down 전이와 desktop multi-select parity를 검증

## 8. 권장 구현 순서

가장 보수적인 순서는 아래와 같다.

1. `arrange + lock`
2. `align + distribute`
3. `selection surface polish`

이 순서를 권장하는 이유는 다음과 같다.

- `arrange`와 `lock`은 현재 이미 존재하는 `z` / `locked` 토대 위에 닫을 수 있다.
- `align`과 `distribute`는 geometry 계산 문제지만, selection / group UX 변화 없이 독립적으로 구현 가능하다.
- selection surface polish는 가장 UI 결합도가 높으므로 마지막에 붙이는 편이 안전하다.

## 9. 관련 문서

- 현재 구현 기반 문서: `docs/features/object-commands/README.md`
- canvas domain 규칙: `RULE.md`
