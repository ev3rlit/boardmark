# 백로그: Preview-Continuous Editing

## 문제

현재 Boardmark의 body 편집은 preview surface에서 자연스럽게 이어지지 않는다.

- note, edge label, body-bearing object가 편집 진입 시 별도 `textarea` shell로 교체된다
- 사용자는 "보고 있는 결과를 바로 고친다"가 아니라 "보기 UI와 편집 UI를 왕복한다"는 느낌을 받는다
- 텍스트 선택, caret, drag, shortcut 우선순위가 surface마다 달라 학습 비용이 커진다
- code block, table, special fenced block 같은 복합 본문은 같은 모델로 다루기 어렵다

이 상태로는 Boardmark가 문서 기반 캔버스라는 강점을 갖고 있어도, 손으로 내용을 다듬는 마지막 20%에서 완성도가 급격히 떨어진다.

## 제안

preview와 edit를 다른 UI로 분리하지 말고, 같은 surface에서 interaction mode만 전환하는 편집 모델로 바꾼다.

- note, edge, 향후 body-bearing object가 같은 editor host contract를 사용한다
- click, double click, drag, text selection, `Escape`, `Enter`의 우선순위를 공통 규칙으로 고정한다
- paragraph, list, blockquote, table, fenced code block까지 끊김 없는 편집을 목표로 한다
- `mermaid`, `sandpack` 같은 special fenced block은 block-local editing 규칙으로 수용한다

## 왜 필요한가

- FigJam 수준의 제품 감각은 기능 수보다 "클릭한 자리에서 바로 고쳐지는가"에서 크게 갈린다
- Boardmark는 markdown source가 canonical truth이므로, WYSIWYG 감각과 source round-trip을 동시에 확보해야 한다
- 이후 toolbar, quick actions, object commands를 붙여도 본문 편집 감각이 어색하면 전체 제품 레벨이 올라가지 않는다

## 관련 문서

- `docs/features/wysiwyg/README.md`
- `docs/features/caret-navigation-model/README.md`
- `docs/features/caret-navigation-capability-refactor/README.md`
