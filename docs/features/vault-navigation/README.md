# PRD: Vault Navigation

**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-22 |
| 상태 | 초안 |
| 작성자 | Claude |

---

## 1. Overview

### 1.1 Problem Statement

Boardmark의 사용자는 학습과 지식 확장을 주 활용 용도로 삼고 있다. 그러나 노트가 누적되면서 다음과 같은 마찰이 빠르게 커지고 있다.

- 같은 개념이 여러 노트에 걸쳐 등장하는데, 한 노트를 열었을 때 그 개념이 어디서 또 다뤄졌는지 알 수 있는 길이 없다.
- 과거에 정리한 노트를 다시 활용하려면 파일 트리를 수동으로 훑거나 OS 검색에 의존해야 한다.
- 주제별로 흩어진 노트(`k8s-*`, `container-*` 등)를 한 축으로 모아 보는 메커니즘이 없어, 한 학습 흐름이 끝난 뒤 그 흐름이 다시 단절된다.
- 결과적으로 노트는 "쓴 직후"에만 가치가 있고, 누적될수록 재발견이 어려워지면서 학습 자산화에 실패한다.

이 상태에서는 캔버스 편집 기능이 늘어나더라도, 보드 단위를 넘는 **vault 단위의 지식 활용**은 정체된다.

### 1.2 Product Goal

Boardmark에 노트와 캔버스 vault 전체를 가로지르는 **navigation layer**를 도입한다.

- 사용자는 한 노트에서 다른 노트로 명시적 링크를 걸 수 있고, 그 링크의 역방향(어떤 노트가 나를 참조하는지)을 자동으로 볼 수 있어야 한다.
- 사용자는 vault 전체를 대상으로 텍스트 검색을 수행하고, 결과에서 해당 노트와 노드로 즉시 점프할 수 있어야 한다.
- 사용자는 노트와 노드에 태그를 부여하고, 태그 패싯으로 vault를 분류·필터링하며 흐름을 재구성할 수 있어야 한다.
- 이 기능은 `.canvas.md`와 관련 파일이 source of truth라는 vision 원칙을 깨지 않고, runtime에서 파생된 index 위에서 동작해야 한다.

### 1.3 Success Criteria

- 사용자는 한 노트를 열었을 때 그 노트를 참조하는 다른 노트 목록을 1 step 안에 확인할 수 있다.
- 사용자는 vault 어디에서나 키워드를 입력해 노트·노드 단위 결과로 점프할 수 있다.
- 사용자는 임의의 태그를 골라 그 태그가 붙은 노트와 노드만 추려 볼 수 있다.
- 백링크·검색·태그 기능 도입으로 `.canvas.md` 파일 포맷의 기존 contract는 깨지지 않으며, 추가되는 메타데이터는 명시 contract로 정의된다.
- 사용자는 vault navigation surface와 canvas navigation surface를 혼동 없이 구분할 수 있다.

---

## 2. Goals & Non-Goals

### Goals

- vault 전반 백링크 contract와 UI surface 정의
- vault 전반 텍스트 검색 contract와 UI surface 정의
- 태그 syntax, 적용 대상, 패싯 UX 정의
- 위 세 기능이 공유하는 derived index 모델 정의
- canvas-navigation(보드 안 검색)과의 surface·shortcut 분리 원칙 정의

### Non-Goals

- v1에서 그래프 뷰(노드-엣지 시각화) 제공
- 자동 태그 추천 또는 AI 기반 토픽 클러스터링
- 노트 본문에 대한 임베딩 기반 의미 검색(RAG)
- 외부 vault(원격 저장소, 다른 워크스페이스)와의 통합
- 태그 계층(부모-자식 nested tag) 모델
- 노트 자동 요약, 자동 링크 추천
- 모바일 전용 vault navigation UX

---

## 3. Core User Stories

```text
AS  여러 주제의 노트를 누적해온 학습자
I WANT  열려 있는 노트를 참조하는 다른 노트 목록을 자동으로 보고
SO THAT 잊고 있던 관련 노트를 다시 발견하고 학습 맥락을 이어갈 수 있다

AS  vault에 수십 개의 노트를 보유한 사용자
I WANT  파일 트리를 뒤지지 않고 키워드로 vault 전체를 검색하며
SO THAT 과거에 정리한 내용을 즉시 재활용할 수 있다

AS  여러 주제를 병행 학습 중인 사용자
I WANT  태그로 노트를 분류하고 같은 태그가 붙은 노트만 추려 보며
SO THAT 한 학습 주제의 흐름을 vault 안에서 재구성할 수 있다

AS  파일 자체를 소유하고 싶은 사용자
I WANT  링크와 태그가 별도 DB가 아니라 노트 파일 안에 명시적으로 기록되며
SO THAT 다른 도구로 옮기거나 git diff로 변화를 추적할 수 있다
```

---

## 4. Vault Navigation Contract

### 4.1 Surface Composition

v1 vault navigation은 아래 세 축으로 구성한다.

1. Backlinks panel — 현재 열린 노트를 참조하는 노트·노드 목록
2. Vault search — vault 전체에 대한 키워드 검색과 점프
3. Tag facets — 태그로 vault를 좁히고 묶어서 보기

세 축은 독립 surface가 아니라 하나의 **vault navigation panel** 안에서 모드 전환으로 묶는다. 사용자는 같은 surface 안에서 search → backlinks → tag facet을 흐름으로 다룰 수 있어야 한다.

### 4.2 Link Syntax

v1 백링크 추적 대상은 아래로 제한한다.

- 표준 markdown 링크: `[label](path/to/note.md)` 또는 `[label](path/to/board.canvas.md)`
- 노드 단위 deep link: `[label](path/to/board.canvas.md#node-id)`
- vault 내부 상대 경로만 추적한다. 외부 URL은 백링크 대상에서 제외한다.

`[[wiki-link]]` 형태의 위키 스타일 링크는 v1 contract에 포함하지 않는다. 표준 markdown 링크만으로 시작하는 이유는, vision의 "파일이 source of truth"와 "다른 도구에서도 그대로 읽힌다"는 원칙을 깨지 않기 위함이다.

### 4.3 Tag Syntax

v1 태그는 아래 두 곳에서만 인식한다.

- 노트 frontmatter의 `tags` 필드:
  ```yaml
  ---
  type: canvas
  version: 2
  tags: [k8s, network]
  ---
  ```
- canvas object header의 `tags` 필드:
  ```text
  ::: note {"id":"...", "tags":["k8s","network"]}
  ```

본문 안의 `#tag` 인라인 표기는 v1 인식 대상에서 제외한다. 본문에는 `#nameserver 8.8.8.8`처럼 코드·설정·해시 표기가 자주 등장하기 때문에, 인라인 해시 파싱은 false positive 위험이 크다.

태그 값 규칙:
- 소문자 영문, 숫자, 한글, 하이픈만 허용한다.
- 공백과 `/` 등 계층 구분자는 v1에서 의미 없는 일반 문자로 다룬다(태그 계층은 non-goal).

### 4.4 Searchable Targets

v1 vault 검색 대상은 아래로 제한한다.

- 노트 파일명과 frontmatter 텍스트
- `.md` 노트 본문 텍스트
- `.canvas.md` 노드의 body text와 첫 heading
- `.canvas.md` edge label

v1 검색 제외:

- 이미지 OCR 결과
- 자동 생성 캐시 파일
- `.gitignore`에 의해 무시되는 파일
- 바이너리 자산

### 4.5 Backlink Result Shape

각 백링크 결과는 최소 아래 정보를 가져야 한다.

- source kind: `note` 또는 `node`
- source path와 source id (node인 경우)
- primary label: 노트 제목 또는 노드 heading
- snippet: 링크 주변 짧은 문맥
- jump target: 해당 위치로 이동할 수 있는 reference

### 4.6 Vault Search Result Shape

각 검색 결과는 최소 아래 정보를 가져야 한다.

- match kind: `note` 또는 `node`
- file path
- node id (node인 경우)
- primary label
- snippet: query match가 드러나는 짧은 문맥
- jump target

### 4.7 Tag Facet Shape

태그 패싯은 아래를 보여준다.

- vault 안에서 사용 중인 태그 목록과 각 태그가 부착된 노트·노드 수
- 사용자는 하나 이상의 태그를 선택할 수 있다.
- 다중 선택 의미는 v1에서 **AND**로 고정한다(선택한 태그를 모두 가진 항목만 노출).
- 선택된 태그 조합에 매칭되는 노트·노드 목록을 검색 결과와 동일한 result shape으로 보여준다.

---

## 5. State and Ownership Direction

### 5.1 Derived Vault Index

vault navigation의 모든 동작은 단일 derived index 위에서 이루어져야 한다.

- index source는 vault 안의 노트와 캔버스 파일 본문, 그리고 거기서 추출한 link·tag 메타데이터다.
- index는 파일이 추가·수정·삭제될 때 점진적으로 갱신되어야 한다.
- index는 persisted source of truth가 아니다. 캐시는 허용하지만, 캐시가 없어도 vault만 있으면 동일한 결과가 재계산되어야 한다.
- 검색·백링크·태그 패싯은 모두 같은 index에서 파생되며, 별도의 평행 저장소를 만들지 않는다.

### 5.2 Runtime-Only Surface State

아래는 file에 저장하지 않는다.

- vault navigation panel open/closed
- 현재 search query
- 선택된 tag facet 조합
- backlinks panel scroll position

저장되는 것은 사용자가 명시적으로 노트 파일에 작성한 link와 tag뿐이다.

### 5.3 Ownership Boundary vs. Canvas Navigation

`canvas-navigation`은 **하나의 캔버스 안**에서의 검색·outline·fit-view를 책임진다.
`vault-navigation`은 **vault 전체**에서의 백링크·검색·태그 facet을 책임진다.

두 surface는 다음 원칙으로 분리한다.

- shortcut과 entry point가 분리되어 있어야 한다.
- 검색 결과 표현 방식은 일관되어야 하지만, 결과 범위는 명확히 다르다.
- 한 surface가 다른 surface의 책임을 흡수하지 않는다.

---

## 6. App UX Requirements

### 6.1 Entry Points

v1은 아래 진입점을 제공한다.

- 측면의 vault navigation 버튼
- keyboard shortcut으로 vault search 열기 (canvas navigation shortcut과 충돌하지 않아야 한다)
- 현재 노트의 사이드 영역 또는 footer에 backlinks summary 진입점
- 태그 패싯 진입은 vault navigation panel 안의 mode tab으로 제공한다

shortcut은 inline editing과 canvas-navigation을 가로채지 않아야 한다.

### 6.2 Unified Vault Navigation Panel

v1은 backlinks·search·tag facet을 한 panel 안의 mode tab으로 묶는다.

- query가 있으면 search mode를 우선으로 보여준다.
- query가 없고 현재 열린 노트가 있으면 backlinks mode를 기본으로 보여준다.
- 사용자는 상단 tab으로 mode를 명시 전환할 수 있다.
- panel은 dismiss 가능해야 하며, canvas 시야를 완전히 가리지 않아야 한다.

### 6.3 Backlinks Interaction

- 현재 열린 노트가 바뀌면 backlinks 목록도 함께 갱신된다.
- 항목 클릭은 source 노트(또는 노드)로 점프시킨다.
- backlink가 노드 단위라면 점프 결과는 해당 노드를 selection으로 반영해야 한다.
- 결과가 0건이면 명시적 empty state를 보여주어야 한다.

### 6.4 Vault Search Interaction

- query 입력 시 결과 리스트가 실시간으로 갱신된다.
- 결과는 (a) 같은 노트/캔버스 안의 여러 매치를 묶어서 보여주거나, (b) flat list로 보여주는 두 가지 중 하나로 일관되게 처리해야 한다. v1은 후자(flat list)로 시작한다.
- 방향키로 결과를 이동, `Enter`로 점프, `Escape`로 query clear 또는 panel dismiss가 일관되어야 한다.
- 결과가 없으면 명시적 empty state를 보여주어야 한다.

### 6.5 Tag Facet Interaction

- 태그 목록은 사용 빈도 내림차순을 기본 정렬로 한다.
- 각 태그 옆에는 매칭 항목 수를 함께 보여준다.
- 사용자가 태그를 선택·해제하면 결과 영역이 즉시 갱신된다.
- 선택된 태그 조합은 panel 상단에 chip 형태로 항상 보이며, 한 번에 모두 해제할 수 있어야 한다.

### 6.6 Explicit Exclusions

- v1은 그래프 뷰를 포함하지 않는다.
- v1은 검색 결과에 대한 정렬 옵션 UI를 제공하지 않는다(고정 정렬).
- v1은 saved searches·search history를 제공하지 않는다.
- v1은 panel 안에서 노트·태그 rename을 직접 제공하지 않는다.
- v1은 자동 링크 추천이나 자동 태그 부여를 제공하지 않는다.

---

## 7. Product Rules

### 7.1 File Contract Safety

- 백링크·검색·태그 기능은 기존 `.canvas.md` 포맷의 의미를 변경하지 않는다.
- frontmatter `tags`와 canvas object header의 `tags`는 추가 필드이며, 부재 시에도 기존 동작은 그대로여야 한다.
- 백링크 자체는 파일에 저장하지 않는다. 사용자가 본문에 작성한 markdown 링크에서 derive해야 한다.
- 태그 정규화 규칙은 명시되어야 하며, 알 수 없는 형태의 태그는 무시 또는 명시 경고로 처리한다.

### 7.2 Index Semantics

- 검색·백링크·태그는 같은 derived index를 공유해야 한다.
- 노트 파일이 외부에서 수정되어도 index는 일관성을 유지해야 한다.
- 한 파일의 parse 실패가 vault 전체 index를 깨뜨려서는 안 된다(부분 실패는 부분 누락으로 격리).

### 7.3 Predictable Jump Behavior

- jump는 항상 selection과 viewport 이동을 함께 갱신해야 한다(canvas-navigation의 Jump Contract와 동일 의미).
- 노드 단위 결과로 점프하면 해당 노드가 selection으로 반영되어야 한다.
- 노트 단위 결과로 점프하면 해당 노트가 활성 문서로 열려야 한다.

### 7.4 Scope Discipline

- v1 문제는 "vault 안의 재발견과 연결"이다.
- 그래프 뷰, 의미 검색, 자동 추천은 후속 기능으로 분리한다.
- vault navigation panel이 file explorer·command palette·메타데이터 inspector까지 겸하지 않도록 책임을 좁게 유지한다.

---

## 8. Acceptance Criteria

- 사용자는 한 노트를 열었을 때 해당 노트로 향하는 vault 내부 markdown 링크 목록을 backlinks panel에서 확인할 수 있다.
- 노드 deep link(`...canvas.md#node-id`)도 backlink 결과에 포함되며, 점프 시 해당 노드가 selection으로 반영된다.
- 사용자는 vault search query를 입력해 노트 본문, 캔버스 노드 body, edge label을 가로지르는 결과를 받을 수 있다.
- 사용자는 frontmatter 또는 canvas object header에 `tags`를 정의할 수 있고, 태그 패싯에 그 값이 누적되어 표시된다.
- 다중 태그 선택은 AND 의미로 동작한다.
- 검색·백링크·태그 결과 항목 선택 시 selection과 viewport(또는 활성 문서)가 함께 갱신된다.
- 한 파일의 parse 오류가 vault 전체 index를 무력화시키지 않는다.
- vault navigation surface는 canvas navigation surface와 별도 entry point·shortcut을 가진다.
- v1 도입으로 `.canvas.md` 기존 필드의 의미는 변경되지 않으며, 추가되는 `tags` 필드는 부재 시 기존 동작과 동일하다.

---

## 9. Open Questions

PRD 확정 전에 합의가 필요한 항목.

- vault root 정의: 현재 워크스페이스 전체인가, 특정 디렉터리(`notes/`)인가, 사용자가 지정 가능한가?
- 동일 노트로 향하는 링크가 한 source 안에 여러 개 있을 때 backlinks 결과를 1건으로 묶을지, N건으로 펼칠지.
- canvas object header의 `tags` 필드를 v1에서 정말 도입할지, 아니면 노트 frontmatter `tags`만 우선 지원하고 노드 태그는 후속으로 미룰지.
- vault search index의 캐시 위치: `.boardmark/` 같은 별도 디렉터리에 둘지, 메모리 only로 시작할지.
- 백링크가 깨진 링크(존재하지 않는 path)를 어떻게 표시할지.

---

## 10. Related Documents

- `docs/vision/README.md`
- `docs/canvas-md-prd.md`
- `docs/features/canvas-navigation/README.md`
- `docs/backlog/large-canvas-performance/README.md`
- `docs/backlog/onboarding-templates-and-empty-states/README.md`
