# Boardmark WYSIWYG Editing Surface

## 1. 목적

이 문서는 Boardmark 안에서 **markdown body를 가지는 모든 object content**를 시각적으로 편집하기 위한 WYSIWYG feature의 별도 작업 문서다.

이 문서는 `docs/features/bi-editing/README.md`와 역할이 다르다.

- `bi-editing`
  - source patch pipeline
  - object source map
  - content / geometry / structure patch 전략
- `wysiwyg`
  - 실제 편집 UI surface
  - editor framework 선택
  - semantic markdown editing UX

즉 WYSIWYG는 patch pipeline 위에 올라가는 다음 단계 feature다.

---

## 2. 현재 결정

현재 editor framework 후보는 **Tiptap**으로 둔다.

이 문서 단계에서의 의미:

- WYSIWYG 편집 surface의 1순위 후보를 Tiptap으로 본다.
- bi-editing 단계에서는 Tiptap을 구현하지 않는다.
- 이후 WYSIWYG feature 착수 시 Tiptap extension 설계와 markdown round-trip 규칙을 별도로 고정한다.

현재 구현은 편집 진입 시 preview surface를 유지하지 않고, markdown body를 가진 object의 content를 `textarea` 기반 별도 UI로 교체한다.

이 구조는 구현 단순성에는 유리하지만 아래 제약을 만든다.

- 렌더된 markdown 위에서 바로 편집하는 경험이 없다.
- code block, link, inline formatting과 직접 상호작용하면서 편집할 수 없다.
- code block drag selection, text copy, caret 이동 같은 상호작용과 canvas pan 규칙을 같은 surface 안에서 다룰 수 없다.

따라서 WYSIWYG는 단순 편집기 도입 문제가 아니라, **preview와 editing을 분리된 두 UI로 두는 현재 모델을 교체하는 작업**으로 정의해야 한다.

---

## 3. 우선순위 재정의

현재 Boardmark에서 code highlight 상호작용, markdown object direct manipulation, selection vs pan 충돌 처리를 제대로 풀려면 먼저 **심리스한 편집 surface**가 필요하다.

이 문서 기준의 우선순위는 아래로 둔다.

1. rendered markdown와 editing state가 크게 분리되지 않는 WYSIWYG surface 마련
2. markdown body surface 안에서 선택, caret, 복사, 드래그 같은 기본 텍스트 상호작용 복원
3. 그 위에서 code block interaction과 pan conflict 정책 설계

즉 code block interaction UX는 WYSIWYG 이후 단계가 아니라, **WYSIWYG 목표 자체에 포함되는 선행 요구사항**이다.

---

## 4. 제품 경계

WYSIWYG는 특정 object type 전용 기능이 아니어야 한다.

이 문서에서 WYSIWYG가 다루는 대상은 아래로 정의한다.

- markdown source fragment를 body로 가지는 object content
- preview와 edit를 모두 가져야 하는 body-bearing surface
- source patch pipeline으로 round-trip 가능한 text fragment

반대로 WYSIWYG core가 직접 알면 안 되는 것은 아래다.

- `note`, `edge`, `shape` 같은 구체 object type 이름
- object별 geometry, selection, connection, renderer 종류
- 특정 object만의 메뉴, 툴바, decoration 정책

즉 WYSIWYG는 “note editor”, “edge editor”, “shape editor”를 각각 만드는 작업이 아니라,  
**markdown body를 편집하는 공용 surface를 만들고 각 object가 그 surface를 host하는 구조**로 가야 한다.

### 4.1 공용 host contract

첫 구현 전 문서 수준에서 고정할 최소 계약은 아래다.

- 입력
  - 현재 markdown body string
  - read-only / editable 상태
  - focus 요청 여부
  - body surface의 layout 제약
- 출력
  - markdown body 변경 이벤트
  - commit 요청
  - cancel 요청
  - selection / interaction 상태 신호

이 contract는 object type 이름 없이 정의되어야 한다.

---

## 5. 이 문서에서 다룰 핵심 주제

- Tiptap을 공용 markdown body surface에 어떻게 embedding할지
- semantic markdown subset을 어떤 node / mark로 지원할지
- Tiptap document state를 어떻게 markdown fragment로 serialize 할지
- renderer 결과와 편집 상태의 시각적 차이를 얼마나 줄일지
- inline editor / floating editor / inspector 중 어떤 editing shell을 공용 contract 위에 둘지
- 렌더된 code block 위에서 선택, 복사, caret 이동이 가능한 surface를 어떻게 만들지
- text selection과 canvas pan/drag의 충돌을 어떤 입력 규칙으로 정리할지

### 5.1 추가 제품 요구사항

- 편집 진입 시 기존 markdown preview 전체를 `textarea`로 교체하지 않아야 한다.
- 사용자는 렌더된 markdown를 보는 surface에서 바로 편집을 시작할 수 있어야 한다.
- code block 안의 텍스트를 드래그 선택하고 복사할 수 있어야 한다.
- markdown body 내부 상호작용과 canvas pan 동작은 같은 입력 surface에서 충돌 없이 공존해야 한다.
- markdown round-trip은 계속 source patch 기반으로 유지해야 한다.
- WYSIWYG core는 특정 object type 의존성 없이 동작해야 한다.
- 새 markdown body object type이 추가되어도 editor core 수정 없이 host만 연결할 수 있어야 한다.

---

## 6. 구현 계획

### Phase 1. 공용 body surface contract 확정

- object type 이름을 제거한 공용 markdown body editor contract를 정의한다.
- editor core가 알아야 하는 입력/출력/상태를 최소 집합으로 고정한다.
- 현재 store와 patch pipeline 사이에서 body 편집이 어떤 경계로 이어지는지 정리한다.

완료 기준:

- 문서와 코드 모두에서 WYSIWYG core가 `note`, `edge`, `shape`를 직접 모르도록 경계를 설명할 수 있다.
- host layer와 editor layer의 책임이 분리된다.

### Phase 2. 현재 textarea 편집 경로 추출

- 현재 object별로 흩어진 `textarea` 교체형 편집 경로를 공용 body editor host path로 정리한다.
- object별 분기 대신 “markdown body host”를 연결하는 구조로 재배치한다.
- 현재 commit / blur / escape / focus 규칙을 공용 contract 뒤로 숨긴다.

완료 기준:

- 현재 편집 구현이 여전히 동작하되, object type별 중복 진입 경로가 줄어든다.
- 이후 WYSIWYG editor를 끼워 넣을 자리가 명확해진다.

### Phase 3. seamless editing surface 도입

- preview와 edit가 크게 분리되지 않는 rich editing surface를 넣는다.
- rendered markdown와 editing state의 시각 차이를 최소화한다.
- code block, link, inline formatting, selection을 같은 surface에서 다룬다.

완료 기준:

- 편집 진입 시 전체 body가 `textarea`로 교체되지 않는다.
- 사용자가 rendered markdown에 가까운 surface에서 바로 편집할 수 있다.

### Phase 4. interaction 규칙 정리

- text selection, drag, copy, caret 이동과 canvas pan/drag의 입력 충돌 규칙을 정의한다.
- code block 상호작용을 포함한 selection policy를 같은 surface에서 검증한다.
- 편집 중 단축키와 viewer 단축키 우선순위를 고정한다.

완료 기준:

- body 내부 상호작용과 canvas 상호작용의 경계가 사용자 관점에서 예측 가능하다.

### Phase 5. host 적용 확대

- markdown body를 가지는 모든 object surface가 같은 editor host contract를 쓰도록 연결한다.
- 특정 object type에 종속된 편집 UI를 제거하거나 최소화한다.
- 새 object type이 추가될 때 host 연결만으로 WYSIWYG를 재사용할 수 있게 한다.

완료 기준:

- WYSIWYG는 특정 object type 기능이 아니라 공용 body editing capability로 동작한다.

---

## 7. 현재 비목표

- Tiptap integration 구현
- 최종 editor extension 설계 확정
- 최종 markdown round-trip rule 확정
- toolbar / keyboard shortcut UX 확정
- 특정 object type 전용 editor fork 만들기

이 문서는 지금은 placeholder 수준이며,  
실제 구현은 `bi-editing`의 patch pipeline foundation 이후에 진행한다.
