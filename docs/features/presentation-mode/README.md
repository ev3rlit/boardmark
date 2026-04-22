# PRD: Presentation Mode
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-23 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

Boardmark는 문서 기반 canvas라서 "보드를 만든다"보다 "보드를 설명한다"는 흐름과 잘 맞는다. 하지만 현재는 발표나 walkthrough를 위한 전용 surface가 없다.

### Product Goal

사용자가 canvas를 review, demo, architecture walkthrough 용도로 순서 있게 보여줄 수 있는 lightweight presentation mode를 도입한다.

---

## 2. Product Principles

- presentation mode는 새 포맷이 아니라 기존 canvas를 읽는 방식의 변화다.
- 편집기 전체를 감추고 content reading에 집중한다.
- 발표 흐름은 named view 또는 object sequence와 연결될 수 있다.

---

## 3. Core User Stories

```text
AS  사용자
I WANT  현재 보드를 발표 모드로 전환하고 주요 영역을 순서대로 보여주며
SO THAT architecture review나 팀 설명을 더 쉽게 진행할 수 있다
```

---

## 4. Functional Requirements

### 4.1 Enter Presentation Mode

- chrome를 줄이고 canvas content 중심 layout로 전환한다.

### 4.2 Next / Previous Step

- 발표자는 미리 정한 순서 또는 named view 목록을 따라 이동할 수 있어야 한다.

### 4.3 Presenter-Friendly Camera

- viewport 이동은 부드럽지만 과하지 않아야 한다.
- 현재 step의 focus object 또는 focus region이 명확해야 한다.

### 4.4 Safe Exit

- 언제든 기존 편집 상태로 돌아올 수 있어야 한다.
- presentation mode 자체가 source를 변경하지 않는다.

---

## 5. Relationship to Other Features

- `Canvas Navigation`의 jump/view logic를 재사용한다.
- `Saved Views`가 있으면 presentation step source로 삼기 쉽다.
- `Object Inspect`와는 반대 방향의 surface다.
  - inspect는 정확성 확인
  - presentation은 전달력 강화

---

## 6. Recommended Rollout

### Phase 1

- chrome-reduced read mode
- next / previous camera jump

### Phase 2

- saved view driven presentation sequence
- shareable read-only launch

### Phase 3

- presenter notes
- follow-me / audience sync
