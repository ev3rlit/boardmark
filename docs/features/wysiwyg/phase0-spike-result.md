# WYSIWYG Phase 0 Spike Result

작성일: 2026-04-06

## Worked

- Tiptap은 paragraph, heading, bullet list, ordered list, blockquote, inline code, bold, italic, link를 markdown canonical source와 함께 유지할 수 있었다.
- isolated web spike를 `?spike=wysiwyg-phase0` 로 분리해 production canvas 경로를 건드리지 않고 실험 surface를 운영할 수 있었다.
- 일반 fenced code block은 custom atom node view + markdown bridge로 다시 직렬화할 수 있었다.
  - fenced output 유지
  - textarea 기반 입력
  - `Tab` indentation
  - `Enter` new line
  - line number gutter
  - existing code highlight reuse
- table은 Tiptap table extension으로 cell text editing, row/column insertion, alignment attr, header toggle command까지 연결할 수 있었다.
- `mermaid` / `sandpack` fenced block은 custom markdown handler + node view로 preview/source toggle을 block-local로 유지할 수 있었다.
- HTML block은 block-local fallback node로 격리 가능했고 raw HTML source를 그대로 serialize back 할 수 있었다.

## Awkward Workarounds

- Tiptap markdown extension만으로는 `mermaid`, `sandpack`, HTML fallback을 바로 다룰 수 없어서 custom `markdownTokenName` handler와 custom node view가 필요했다.
- 일반 code block은 rich text node 대신 atom + textarea shell로 구현했다.
  - editing feasibility는 증명됐지만 최종 Phase 1에서는 selection polish, IME, copy/paste fidelity를 더 확인해야 한다.
- table markdown serializer는 semantic round-trip은 가능하지만 diff-stable exact round-trip은 아니다.
  - alignment marker spacing이 재작성된다.
  - header toggle과 column insertion 조합 시 empty header row/blank column 같은 재구성이 생긴다.
- inline mark serialization은 selection 범위에 따라 punctuation을 mark 내부로 끌어들이는 경향이 있었다.
  - 예: `bold,` 전체가 `**bold,**`

## Unknowns

- 실제 browser에서 code block 내부 selection highlight, IME composition, clipboard edge case가 충분히 자연스러운지는 더 긴 수동 검증이 필요하다.
- canvas gesture arbitration, editor-local undo/redo 우선순위, save debounce 연결은 아직 Phase 0 범위 밖이라 확인하지 않았다.
- special fenced block source editing에서 preview renderer lifecycle cost와 large document performance는 아직 측정하지 않았다.
- table header semantics를 existing repository diff expectations에 맞게 얼마나 안정적으로 고정할 수 있는지는 추가 serializer policy가 필요하다.

## Phase 1 Foundation Verdict

- Tiptap은 Phase 1 foundation으로 계속 유효하다.
- 단, 전제는 명확하다.
  - canonical source는 계속 markdown이어야 한다.
  - custom markdown bridge는 필수다.
  - `mermaid`, `sandpack`, HTML fallback, general code block은 block-local custom node view로 다뤄야 한다.
  - table markdown exactness는 “semantic round-trip 우선”으로 보고 별도 normalization policy를 두는 편이 안전하다.
