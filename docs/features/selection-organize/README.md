# PRD: Selection Organize
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-23 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

Boardmark는 오브젝트를 만들고 선택하고 이동하는 수준까지는 와 있지만, 여러 note를 선택한 뒤 그 내용을 **정리된 결과물**로 바꾸는 흐름은 아직 약하다.

특히 아이디어가 많은 보드에서는 다음 수요가 높다.

- 여러 note를 묶어 요약하기
- 비슷한 note를 theme별로 정리하기
- 선택한 내용을 action item이나 checklist로 바꾸기
- 선택 영역을 section 또는 frame으로 감싸 구조화하기

FigJam과 Miro의 실제 킬러 구간도 이 "생성" 자체보다 **선택한 생각을 정리해서 다음 단계로 바꾸는 흐름**에 있다.

### Product Goal

사용자가 여러 오브젝트를 선택했을 때, selection toolbar 또는 context menu에서 선택 결과를 요약/구조화/전환하는 organize command family를 실행할 수 있어야 한다.

---

## 2. Goals & Non-Goals

### Goals

- multi-selection 기반 organize action 정의
- summary, cluster, checklist, sectionize 같은 high-value 결과 정의
- markdown source에 자연스럽게 반영되는 output contract 정의

### Non-Goals

- 자유형 AI agent 전체 탑재
- semantic perfection 보장
- 협업 voting/timer 기능

---

## 3. Core User Stories

```text
AS  사용자
I WANT  여러 note를 선택하고 요약을 생성해
SO THAT 흩어진 논의를 바로 다음 단계 문서로 바꿀 수 있다

AS  사용자
I WANT  선택한 note들을 주제별로 재배치하거나 section으로 감싸고
SO THAT 큰 보드를 손으로 일일이 정리하는 비용을 줄일 수 있다
```

---

## 4. V1 Command Family

v1은 아래 4개를 우선 정의한다.

- `Summarize selection`
- `Cluster by theme`
- `Turn into checklist`
- `Wrap in section`

각 결과는 "캔버스 위 새 오브젝트 생성" 또는 "선택 오브젝트 재배치 + section 생성" 형태로 귀결된다.

---

## 5. Product Rules

### 5.1 Selection Scope

- 기본 대상은 node selection이다.
- edge는 v1 organize 대상에서 제외한다.
- 최소 2개 이상 note가 선택되어야 `Summarize selection`과 `Cluster by theme`가 활성화된다.

### 5.2 Output Rule

- organize 결과는 runtime-only overlay가 아니라 실제 canvas object로 생성되어야 한다.
- 사용자는 생성된 결과를 일반 note처럼 다시 편집할 수 있어야 한다.

### 5.3 Trust Rule

- AI 보조가 들어가더라도 원본 selection은 보존한다.
- 요약/분류 결과는 항상 선택 오브젝트의 복사 또는 별도 결과물로 생성한다.
- 원본 note를 조용히 덮어쓰지 않는다.

### 5.4 Layout Rule

- organize 결과는 selection bounding box 근처에 생성해야 한다.
- `Cluster by theme`는 새 섹션/열 구조를 만들고 원본을 복제해서 재배치하는 쪽이 안전하다.

---

## 6. Functional Requirements

### 6.1 Summarize Selection

- 선택한 note들의 body를 읽어 요약 note 하나를 생성한다.
- 결과 note는 제목, 핵심 요약, 다음 액션 같은 기본 구조를 가진다.

### 6.2 Cluster by Theme

- 선택한 note를 주제별 그룹으로 분류한다.
- 각 그룹은 section heading 또는 frame label을 가진다.
- 원본은 유지하고 정리된 복사본을 새 레이아웃으로 제공하는 방식이 안전하다.

### 6.3 Turn into Checklist

- 선택한 note 내용을 checklist note 또는 action list note로 변환한다.
- brainstorming 결과를 execution artifact로 바꾸는 것이 목적이다.

### 6.4 Wrap in Section

- 선택 bounding box를 기준으로 section/frame shape를 생성한다.
- 선택 오브젝트를 묶어 구조를 시각적으로 드러낸다.

---

## 7. Recommended Rollout

### Phase 1

- `Wrap in section`
- `Summarize selection`

### Phase 2

- `Turn into checklist`
- `Cluster by theme`

### Phase 3

- source-linked summary
- organize presets by meeting type

