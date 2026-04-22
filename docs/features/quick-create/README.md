# PRD: Quick Create
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-23 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

Boardmark는 note, frame, shape, image를 만들 수 있지만, 여전히 "무엇을 만들지"를 선택하고 메뉴를 거쳐야 한다. Excalidraw가 강한 이유 중 하나는 생각을 올리는 마찰이 매우 낮다는 점이다.

### Product Goal

사용자가 keyboard-first 또는 pointer-light 흐름으로 note, shape, diagram scaffold를 빠르게 생성할 수 있는 quick create surface를 도입한다.

---

## 2. V1 Scope

v1 quick create는 아래 두 형태 중 하나 또는 둘 다를 목표로 한다.

- command palette style quick create
- slash-like quick create popover

기본 preset:

- `note`
- `sticky`
- `rect`
- `frame`
- `image`
- `mindmap root`
- `flow step`
- `decision`
- `mermaid block note`

---

## 3. Product Rules

- quick create는 existing create commands를 우회하는 별도 저장 경로가 아니다.
- 결과는 기존 create note / create shape / create frame command를 재사용한다.
- 사용자는 생성 직후 바로 text editing으로 들어갈 수 있어야 한다.
- 빠른 생성은 "더 많은 도구 추가"가 아니라 "가장 흔한 시작 형태를 적은 마찰로 생성"하는 데 집중한다.

---

## 4. Functional Requirements

### 4.1 Searchable Create Menu

- 사용자는 이름으로 preset을 검색할 수 있어야 한다.
- fuzzy match로 `fr`, `rect`, `mind` 정도 입력해도 후보가 보여야 한다.

### 4.2 Create-and-Focus

- 새 오브젝트를 만들고 즉시 선택한다.
- text-bearing preset은 곧바로 편집 상태로 전환할 수 있어야 한다.

### 4.3 Preset Contract

- preset은 단순 object type이 아니라 초기 body/template를 가질 수 있다.
- 예: `decision`은 `Yes / No` 구조 초안을 포함할 수 있다.

---

## 5. Recommended Rollout

### Phase 1

- command palette style quick create
- note / rect / frame / image

### Phase 2

- template-bearing preset
- immediate edit handoff

### Phase 3

- context-aware preset ordering
- AI-assisted quick create prompt

