# Boardmark Object Commands Follow-up PRD & 구현 계획

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v0.2 |
| 작성일 | 2026-04-04 |
| 상태 | Active |
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
- 빈 캔버스 context menu surface
- multi-selection context menu 유지
- `cut -> paste` clipboard 회귀 수정
- paste 이후 신규 object selection 유지

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
   - desktop multi-select parity 잔여분
   - group selection / drill-down UX 마감
   - selection toolbar / context menu enablement 정리

## 3. 현재 기준선

2026-04-04 기준 object command의 현재 상태는 다음과 같다.

- 도메인과 parser는 `z`, `locked`, `group` 구조를 받을 수 있다.
- store는 `selectedGroupIds`, `groupSelectionState`, `clipboardState`를 가진다.
- `copy`, `cut`, `paste`, `paste-in-place`, `group`, `ungroup`의 기본 write path가 있다.
- group member 첫 클릭은 상위 group selection으로 승격되고, 두 번째 클릭은 drill-down으로 전환된다.
- 빈 캔버스에서도 context menu가 열리며, `Paste`, `Paste in place`, `Select all`이 노출된다.
- 이미 선택된 object 위에서 context menu를 열면 selection이 단일 object로 축소되지 않는다.
- paste와 paste-in-place 이후 새로 생성된 object selection은 store 기준으로 유지된다.
- 아직 `arrange`, `align`, `distribute`, `lock/unlock`은 제품 표면과 write path가 닫혀 있지 않다.
- lock semantics는 일부 타입 필드만 있고, 실제 mutation 차단과 UI enablement가 완성되지 않았다.
- 데스크톱 multi-select parity는 부분적으로 닫혔지만, box selection parity와 group drill-down 하위 enablement는 아직 남아 있다.
- context menu는 두 surface로 분리되어 있다.
  - canvas context menu: `Paste`, `Paste in place`, `Select all`
  - selection context menu: copy/cut/delete/group/ungroup와 placeholder `Align`, `Arrange`, `Lock`

### 3.1 이번 업데이트로 닫힌 항목

- 빈 캔버스 우클릭시 context menu 부재
- 다중 선택 상태에서 우클릭시 selection이 깨져 context menu 검증이 어려운 문제
- 잘라내기 이후 붙여넣기 surface가 없어 잘라내기가 삭제처럼 보이던 문제
- 복사/붙여넣기 이후 신규 object selection이 유지되지 않는 회귀

### 3.2 이번 문서에서 남은 핵심 범위

- `Align`, `Arrange`, `Lock` command를 placeholder가 아닌 실제 command로 닫기
- lock 상태가 delete, move, resize, reconnect, layout, arrange에서 일관되게 mutation 차단되도록 만들기
- desktop과 web의 box selection / shift-click / group drill-down parity를 끝까지 맞추기
- selection toolbar를 도입할지 결정하고, 도입 시 keyboard/context menu와 동일 registry를 재사용하기

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
- 빈 캔버스 context menu와 selection context menu는 같은 command registry enablement를 재사용해야 한다.
- selection toolbar를 추가하더라도 command enablement는 keyboard/context menu와 동일한 registry를 재사용해야 한다.

## 6. 구현 계획

현재 코드베이스 기준 구현 순서는 아래 세 단계로 고정한다. 이 문서의 Step은 "아직 남은 작업"만 다룬다.

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
- selection context menu의 placeholder `Arrange`, `Lock`을 실제 command wiring으로 교체
- canvas / selection context menu가 공통 command enablement를 사용하도록 정리
- lock된 group / node / edge가 delete, duplicate, nudge, arrange에서 제외되는지 store path를 점검

검증:

- arrange가 `z` patch만으로 reparsed document를 유지하는지 확인
- lock된 object가 mutation path에서 제외되는지 store test로 확인
- context menu의 disabled state가 keyboard command의 canExecute와 일치하는지 app test로 확인

### Step 2. Align / Distribute를 node-only로 구현한다

대상 파일:

- `packages/canvas-app/src/services/edit-service.ts`
- `packages/canvas-app/src/store/canvas-store-slices.ts`
- `packages/canvas-app/src/app/commands/canvas-object-commands.ts`
- `packages/canvas-app/src/components/context-menu/object-context-menu.tsx`

작업 내용:

- `align-objects` intent 추가
- `distribute-objects` intent 추가
- store에 `alignSelection(mode)` 추가
- store에 `distributeSelection(axis)` 추가
- direct edge selection과 locked node를 제외한 geometry patch 계산
- selection context menu의 placeholder `Align`을 submenu 또는 개별 command entry로 교체
- 다중 선택 상태에서 align/distribute disabled reason을 명확히 드러내기

검증:

- 여러 node header를 한 번에 patch해도 source가 안정적으로 reparsed 되는지 확인
- 2개 미만 selection에서는 distribute가 disabled인지 확인
- group selection과 edge selection이 layout 대상에서 제외되는지 command test로 확인

### Step 3. Selection surface를 마감한다

대상 파일:

- `packages/canvas-app/src/components/scene/canvas-scene.tsx`
- `packages/canvas-app/src/components/scene/flow/flow-selection-changes.ts`
- `packages/canvas-app/src/app/canvas-app.tsx`
- `packages/canvas-app/src/components/context-menu/object-context-menu.tsx`

작업 내용:

- desktop box selection parity 확인 및 미지원 경로 제거
- group drill-down 상태에서 context menu / delete / clipboard / arrange / layout enablement 보정
- 선택된 group member 우클릭, group-selected, drilldown 사이의 상태 전이를 명시적으로 정리
- selection toolbar 도입 여부를 결정하고, 도입 시 command registry 기반으로 wiring
- 이미 완료된 canvas context menu / selection 유지 동작은 회귀 테스트로 고정하고 유지

검증:

- 웹/데스크톱에서 selection normalization 결과가 같은지 확인
- group-selected와 drilldown 상태 전이가 scene test에서 재현되는지 확인
- 빈 캔버스 / 단일 선택 / 다중 선택 / group-selected 네 상태에서 context menu 항목이 일관되게 노출되는지 app test로 확인

## 7. 테스트 계획

### 7.1 `packages/canvas-app/src/services/edit-service.test.ts`

- `arrange-objects`가 `z` patch와 reparse를 안정적으로 유지하는지 검증
- `set-objects-locked`가 node, edge, group object를 정확히 갱신하는지 검증
- `align-objects`와 `distribute-objects`가 geometry patch를 올바르게 계산하는지 검증

### 7.2 `packages/canvas-app/src/store/canvas-store.test.ts`

- lock된 selection이 move / nudge / duplicate / delete / arrange에서 제외되는지 검증
- group lock이 멤버 `locked` 값 없이도 mutation을 차단하는지 검증
- arrange와 layout command가 selection 타입에 따라 enable / disable 되는지 검증
- `cut -> paste` 이후 selection 복원과 regenerated id remap이 유지되는지 검증

### 7.3 `packages/canvas-app/src/app/canvas-app.test.tsx`

- keyboard shortcut이 editable target에서는 가로채지 않는지 검증
- context menu와 selection toolbar가 같은 enablement 규칙을 쓰는지 검증
- 빈 캔버스 context menu가 paste surface를 제공하는지 검증
- 다중 선택 상태에서 object context menu를 열어도 selection이 축소되지 않는지 검증

### 7.4 `packages/canvas-app/src/components/scene/canvas-scene.test.tsx`

- box selection normalization이 top-level object 기준을 유지하는지 검증
- group drill-down 전이와 desktop multi-select parity를 검증

## 8. 권장 구현 순서

가장 보수적인 순서는 아래와 같다.

1. `arrange + lock`
2. `align + distribute`
3. `selection surface polish`

이 순서를 권장하는 이유는 다음과 같다.

- selection surface의 가장 큰 사용성 회귀는 이미 닫혔으므로, 이제 남은 blocker는 placeholder command를 실제 command로 교체하는 일이다.
- `arrange`와 `lock`은 현재 이미 존재하는 `z` / `locked` 토대 위에 닫을 수 있다.
- `align`과 `distribute`는 geometry 계산 문제지만, selection / group UX 변화 없이 독립적으로 구현 가능하다.
- selection surface polish의 잔여분은 가장 UI 결합도가 높으므로 마지막에 붙이는 편이 안전하다.

## 9. 관련 문서

- 현재 구현 기반 문서: `docs/features/object-commands/README.md`
- canvas domain 규칙: `RULE.md`
