# Boardmark WYSIWYG Editing Surface

## 1. 목적

이 문서는 Boardmark 안에서 note / edge 내용을 시각적으로 편집하기 위한 WYSIWYG feature의 별도 작업 문서다.

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

---

## 3. 이 문서에서 나중에 다룰 핵심 주제

- Tiptap을 note body / edge label body에 어떻게 embedding할지
- semantic markdown subset을 어떤 node / mark로 지원할지
- Tiptap document state를 어떻게 markdown fragment로 serialize 할지
- renderer 결과와 편집 상태의 시각적 차이를 얼마나 줄일지
- inline editor / floating editor / inspector 중 어떤 editing shell을 쓸지

---

## 4. 현재 비목표

- Tiptap integration 구현
- editor extension 설계 확정
- markdown round-trip rule 확정
- toolbar / keyboard shortcut UX 확정

이 문서는 지금은 placeholder 수준이며,  
실제 구현은 `bi-editing`의 patch pipeline foundation 이후에 진행한다.
