# PRD: Canvas Navigation
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-21 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

### 1.1 Problem Statement

Boardmark는 작은 예제 보드에서는 충분히 탐색 가능하지만, 실제 업무용 보드처럼 note 수와 본문량이 늘어나면 "어디에 무엇이 있는지"를 찾는 비용이 빠르게 커진다.

현재 사용자는 필요한 내용을 찾기 위해 아래를 반복하게 된다.

- pan과 zoom을 여러 번 반복하며 보드를 수동으로 훑는다.
- 현재 위치를 잃으면 다시 전체 맥락을 잡기 어렵다.
- 특정 오브젝트를 찾더라도 그 위치로 바로 점프하는 경로가 없다.
- 보드 전체 구조를 요약해서 보여주는 탐색 전용 surface가 없다.

이 상태에서는 편집 기능이 늘어나더라도, 큰 캔버스에서의 실제 사용성은 계속 탐색 마찰에 묶인다.

### 1.2 Product Goal

Boardmark에 큰 캔버스를 위한 명시적 navigation layer를 도입한다.

- 사용자는 텍스트 기반 검색으로 원하는 오브젝트를 빠르게 찾을 수 있어야 한다.
- 사용자는 검색 결과나 아웃라인 항목을 선택해 해당 위치로 즉시 점프할 수 있어야 한다.
- 사용자는 오브젝트 아웃라인과 검색 결과를 같은 탐색 패널 안에서 일관되게 다룰 수 있어야 한다.
- 사용자는 현재 위치를 잃었을 때 `Fit to canvas`와 `Fit to selection` 같은 overview 액션으로 맥락을 즉시 회복할 수 있어야 한다.
- 이 기능은 파일 포맷을 바꾸지 않고 runtime navigation surface로 제공되어야 한다.

### 1.3 Success Criteria

- 사용자는 보드 안의 제목, 본문, 오브젝트 id를 검색해 원하는 위치로 1~2 step 안에 이동할 수 있다.
- 사용자는 query가 없어도 아웃라인 패널만으로 보드의 주요 오브젝트를 훑고 선택할 수 있다.
- 검색 결과 또는 아웃라인에서 항목을 선택하면 viewport가 해당 위치로 이동하고, 대상 오브젝트가 선택되며, 사용자가 이동 결과를 즉시 인지할 수 있어야 한다.
- 사용자는 `Fit to canvas`로 전체 보드 맥락을 한 번에 복구할 수 있다.
- 사용자는 selection이 있을 때 `Fit to selection`으로 현재 작업 대상을 빠르게 확대할 수 있다.
- v1 도입으로 `.canvas.md` 포맷, object header, body contract는 변경되지 않는다.

---

## 2. Goals & Non-Goals

### Goals

- 캔버스 전용 검색 + 점프 기능 정의
- 오브젝트 아웃라인 + 검색 결과 패널 UX 정의
- `Fit to canvas`, `Fit to selection`, `Return to previous view` overview 액션 정의
- 검색 대상 범위와 결과 표현 규칙 정의
- navigation state와 file state의 분리 원칙 정의
- 기존 viewport/selection 모델과 충돌하지 않는 앱 command surface 정의

### Non-Goals

- v1에서 minimap 제공
- metadata 기반 고급 검색, 필터, 정렬
- 태그/상태/담당자 facet 검색
- 그래프 경로 탐색이나 edge traversal UX
- 저장 가능한 named view, bookmark, presentation mode
- AI 기반 자동 그룹화, 자동 줌 추천
- 모바일 전용 navigation UX

---

## 3. Core User Stories

```text
AS  큰 캔버스를 사용하는 사용자
I WANT  키워드로 note 내용을 검색하고 바로 해당 위치로 점프하며
SO THAT 보드를 이리저리 끌어다니지 않고 필요한 정보를 빨리 찾을 수 있다

AS  캔버스 사용자
I WANT  query가 없어도 아웃라인으로 보드의 주요 오브젝트를 훑고 이동하며
SO THAT 전체 구조를 텍스트 기반으로 빠르게 파악할 수 있다

AS  작업 중 길을 잃은 사용자
I WANT  전체보기와 선택 영역 보기로 맥락을 즉시 회복하고
SO THAT 탐색 도중 현재 위치를 다시 잡기 위해 수동 pan/zoom을 반복하지 않아도 된다

AS  기존 사용자
I WANT  navigation 기능이 파일 포맷이나 기존 편집 동작을 바꾸지 않고 runtime layer로 추가되며
SO THAT 기존 문서와 편집 파이프라인이 깨지지 않도록 할 수 있다
```

---

## 4. Navigation Contract

### 4.1 Navigation Surface Composition

v1 navigation은 아래 세 축으로 구성한다.

1. Search + Jump
2. Outline + Search Results Panel
3. Overview Actions

이 셋은 각각 독립 기능이 아니라 하나의 탐색 흐름으로 연결되어야 한다.

- 사용자는 검색창을 열고 query를 입력한다.
- 검색 결과는 navigation panel 안에서 리스트로 보여준다.
- 사용자는 결과를 선택해 해당 오브젝트로 점프한다.
- 필요하면 `Fit to canvas` 또는 `Fit to selection`으로 시야를 재정렬한다.

### 4.2 Searchable Targets

v1 검색 대상은 아래로 제한한다.

- node `id`
- edge `id`
- node body text
- edge body text
- node의 첫 heading 또는 첫 줄 요약 텍스트
- edge label 또는 첫 줄 요약 텍스트

v1 검색 제외:

- object-body metadata
- style/renderer 이름
- hidden internal diagnostics text
- 이미지 OCR 결과

### 4.3 Search Result Shape

각 검색 결과는 최소 아래 정보를 가져야 한다.

- object kind: `node` 또는 `edge`
- object id
- primary label: heading 또는 id fallback
- secondary snippet: query match가 드러나는 짧은 문맥
- jump target: viewport를 이동시킬 수 있는 geometry reference

### 4.4 Outline Item Shape

아웃라인은 query가 비어 있을 때 기본 탐색 리스트로 동작한다.

- 기본 정렬은 문서 source order를 따른다.
- 각 항목은 object kind, primary label, id를 보여준다.
- label이 비어 있으면 id를 primary label로 사용한다.
- edge는 node보다 시각적 우선순위를 낮게 표현해도 된다.
- v1은 계층적 graph tree를 만들지 않고, flat outline 또는 sectioned flat list로 시작한다.

### 4.5 Jump Contract

검색 결과나 아웃라인 항목에서 점프를 실행하면 아래가 함께 일어나야 한다.

- 대상 object가 selection으로 반영된다.
- viewport가 대상 object를 사용자가 인지 가능한 위치로 이동시킨다.
- 이동 직후 대상 object가 잠깐 강조되어 "어디로 이동했는지"가 즉시 보인다.

edge 점프는 edge 자체만 깜빡이게 하기보다, 해당 edge가 보이는 viewport 구도로 이동해야 한다.

---

## 5. State and Ownership Direction

### 5.1 Runtime-Only Navigation State

아래 상태는 runtime interaction state로만 관리한다.

- navigation panel open/closed
- current search query
- highlighted result index
- search results
- outline selection state
- last overview camera snapshot

v1은 이 상태를 `.canvas.md` 파일에 쓰지 않는다.

### 5.2 Derived Search Index

검색 인덱스는 persisted source of truth를 바꾸는 별도 저장 구조가 아니라, 현재 로드된 document state에서 파생된 runtime projection으로 다룬다.

- 문서가 다시 파싱되면 검색 인덱스도 함께 재계산된다.
- index source는 현재 store의 nodes/edges와 object body text다.
- 검색은 renderer 결과가 아니라 canonical document data를 기준으로 해야 한다.

### 5.3 Camera Ownership

overview와 jump는 모두 기존 viewport state를 갱신하는 앱 command 축으로 다룬다.

- navigation 기능은 현재 viewport 모델을 재사용해야 한다.
- jump와 fit-view는 새로운 file contract를 만들지 않는다.
- `viewportSize`를 기준으로 "사용자가 실제로 보는 화면" 중심 이동을 계산해야 한다.

---

## 6. App UX Requirements

### 6.1 Entry Points

v1은 아래 진입점을 제공한다.

- 상단 또는 측면의 navigation 버튼
- keyboard shortcut으로 search surface 열기
- panel 내부에서 outline/search 전환
- overview action 버튼 또는 command surface

shortcut은 editable target을 방해하지 않아야 한다.

- inline text editing 중에는 editor의 native find 동작을 우선한다.
- canvas 자체가 active일 때만 canvas navigation shortcut을 가로챈다.

### 6.2 Unified Navigation Panel

v1은 separate panel을 여러 개 만들기보다 하나의 unified navigation panel로 시작한다.

- query가 비어 있으면 outline mode를 보여준다.
- query가 있으면 search results mode를 보여준다.
- panel header에는 search input과 overview action entry가 함께 놓일 수 있다.
- panel은 dismiss 가능해야 하며, 캔버스 시야를 완전히 가리지 않아야 한다.

이렇게 하면 "아웃라인 패널"과 "검색 결과 패널"이 서로 다른 제품처럼 보이지 않고 하나의 탐색 surface로 읽힌다.

### 6.3 Search Interaction

- 사용자가 query를 입력하면 결과 리스트가 실시간으로 갱신된다.
- 방향키로 결과를 이동할 수 있어야 한다.
- `Enter`로 현재 결과에 점프할 수 있어야 한다.
- `Escape`는 query clear 또는 panel dismiss에 일관되게 사용되어야 한다.
- 결과가 없으면 명시적 empty state를 보여줘야 한다.

v1은 fuzzy ranking보다도 "예측 가능한 결과와 빠른 점프"를 우선한다.

### 6.4 Outline Interaction

- 사용자는 outline에서 항목을 클릭해 바로 점프할 수 있어야 한다.
- 현재 selection에 해당하는 object는 outline에서도 active state가 보여야 한다.
- 현재 viewport 안에 들어온 object를 약하게 표시하는 보조 상태는 허용되지만, v1 필수는 아니다.

### 6.5 Overview Actions

v1 overview는 fullscreen이 아니라 camera navigation command family로 정의한다.

- `Fit to canvas`: 현재 문서의 전체 object bounds가 보이도록 viewport를 재조정한다.
- `Fit to selection`: 현재 selection bounds가 잘 보이도록 viewport를 재조정한다.
- `Return to previous view`: 마지막 fit-view 또는 jump 이전 시야로 복귀한다.

규칙:

- selection이 없으면 `Fit to selection`은 비활성화한다.
- object가 하나도 없으면 `Fit to canvas`는 비활성화하거나 no-op 대신 명시적 disabled state를 보여준다.
- `Return to previous view`는 실제 복귀 가능한 snapshot이 있을 때만 활성화한다.

### 6.6 Explicit Exclusions

- v1은 minimap을 포함하지 않는다.
- v1은 결과를 type/tag/status로 필터링하지 않는다.
- v1은 다중 query history나 saved searches를 제공하지 않는다.
- v1은 search panel 안에서 object rename/edit를 직접 제공하지 않는다.

---

## 7. Product Rules

### 7.1 File Contract Safety

- navigation 기능은 file format 변경 없이 동작해야 한다.
- search query, active result, panel state는 저장 대상이 아니다.
- overview action은 viewport를 바꾸더라도 새로운 serialization contract를 요구하지 않는다.

### 7.2 Search Semantics

- 검색은 현재 로드된 문서 상태를 기준으로 동작해야 한다.
- inline editing 결과가 store에 반영된 상태라면 search도 그 최신 상태를 따라야 한다.
- parse issue가 있는 object가 있더라도, 나머지 정상 object 검색은 계속 동작해야 한다.

### 7.3 Predictable Jump Behavior

- jump는 항상 selection과 viewport 이동을 함께 갱신해야 한다.
- 사용자는 점프 이후 "대상이 화면 어디에 있는지"를 즉시 알아야 한다.
- jump 결과는 현재 보이는 viewport의 정중앙 또는 그에 준하는 인지 가능한 위치를 기본값으로 삼는다.

### 7.4 Scope Discipline

- v1 문제는 "찾기와 시야 회복"이다.
- minimap, graph overview, semantic filter, saved views는 후속 기능으로 분리한다.
- navigation panel이 command palette, inspector, metadata browser까지 겸하지 않도록 책임을 좁게 유지한다.

---

## 8. Acceptance Criteria

- 사용자는 node id 또는 node body text로 검색해 결과를 볼 수 있다.
- 사용자는 edge id 또는 edge body text로 검색해 결과를 볼 수 있다.
- query가 비어 있으면 unified navigation panel이 outline list를 보여준다.
- query가 있으면 같은 panel이 search results list를 보여준다.
- 검색 결과 또는 outline 항목을 선택하면 selection과 viewport가 함께 갱신된다.
- jump 이후 대상 object 위치를 시각적으로 인지할 수 있는 강조가 표시된다.
- `Fit to canvas`는 전체 object bounds를 기준으로 작동한다.
- `Fit to selection`은 현재 selection bounds를 기준으로 작동한다.
- `Return to previous view`는 jump 또는 fit-view 이전 시야로 복귀한다.
- selection이 없을 때 `Fit to selection`은 실행되지 않는다.
- object가 없을 때 `Fit to canvas`는 disabled 또는 명시적 non-action 상태로 처리된다.
- v1 도입으로 `.canvas.md` 포맷과 object schema는 바뀌지 않는다.

---

## 9. Related Documents

- `docs/vision/README.md`
- `docs/canvas-md-prd.md`
- `docs/backlog/large-canvas-performance/README.md`
- `docs/backlog/command-surface-and-quick-actions/README.md`
- `docs/features/object-commands/README.md`
