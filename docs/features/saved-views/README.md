# PRD: Saved Views
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-23 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

`Canvas Navigation` PRD는 v1에서 search, outline, fit-to-canvas를 정의했고, saved view와 bookmark는 후속 범위로 남겼다.

큰 보드에서는 사용자가 반복적으로 같은 영역을 오간다.

- 전체 구조
- 현재 작업 중인 cluster
- 발표용 흐름
- 검토용 hotspot

### Product Goal

사용자가 현재 viewport와 selection context를 named view로 저장하고, 이후 한 번에 다시 열 수 있어야 한다.

---

## 2. Goals & Non-Goals

### Goals

- named view 저장
- named view 목록 / 점프
- navigation과 자연스럽게 연결되는 camera bookmark layer 정의

### Non-Goals

- full presentation mode
- collaborative follow-me
- branch-like alternate board states

---

## 3. Product Rules

- saved view는 object geometry를 복제하지 않는다.
- 핵심 payload는 viewport와 optional focus metadata다.
- view 이름은 사용자 지정 가능해야 한다.
- v1은 runtime-only 또는 file-persisted 중 하나를 명확히 선택해야 한다.

권장 방향:

- v1은 runtime-only가 아니라 persisted metadata가 더 가치가 크다.
- 단, canvas body/object 포맷과 충돌하지 않는 별도 frontmatter extension 또는 sidecar 전략을 신중히 검토해야 한다.

---

## 4. Functional Requirements

### 4.1 Save Current View

- 현재 viewport를 이름과 함께 저장할 수 있어야 한다.

### 4.2 Open Saved View

- 저장된 view를 클릭하면 viewport가 해당 위치로 이동해야 한다.

### 4.3 Update / Delete

- 기존 view를 이름 변경, 덮어쓰기, 삭제할 수 있어야 한다.

### 4.4 Navigation Integration

- navigation panel 안에서 saved views section으로 노출하는 것이 자연스럽다.

---

## 5. Recommended Rollout

### Phase 1

- runtime-only saved view spike
- navigation panel integration

### Phase 2

- persisted named views
- keyboard shortcuts

### Phase 3

- selection-linked views
- shareable presentation flow handoff

