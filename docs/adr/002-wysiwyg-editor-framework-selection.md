# ADR-002: WYSIWYG Editor Framework 선택

| 항목 | 내용 |
|------|------|
| 문서 번호 | ADR-002 |
| 상태 | 🟢 결정됨 (Accepted) |
| 작성일 | 2026-04-06 |
| 관련 기능 | Seamless Markdown WYSIWYG |
| 관련 문서 | `docs/features/wysiwyg/README.md`, `docs/features/bi-editing/README.md` |

---

## 1. 맥락

Boardmark의 현재 markdown body 편집은 preview surface와 editing surface가 분리되어 있다.

- note body와 edge label은 평소 `MarkdownContent` preview로 보인다.
- 편집 진입 시 같은 surface를 유지하지 않고 `textarea` 기반 별도 UI로 교체된다.
- 이 구조는 preview-continuous editing, code block 직접 편집, text interaction과 canvas interaction 경계 정리를 어렵게 만든다.

`docs/features/wysiwyg/README.md` PRD는 이 문제를 다음 요구사항으로 고정했다.

1. preview 상태를 떠나지 않는 seamless editing surface
2. code block 안의 선택, 복사, caret 이동, 수정
3. markdown source patch pipeline과의 round-trip 유지
4. 특정 object type에 종속되지 않는 공용 editor host contract
5. canvas pan/drag와 editor interaction의 예측 가능한 arbitration

이 시점의 핵심 의사결정은 "어떤 editor framework가 위 요구사항을 가장 낮은 위험으로 만족시키는가"다.

---

## 2. 결정 드라이버

1. **Preview continuity** — preview와 edit의 시각적 단절을 최소화할 수 있어야 한다.
2. **Markdown fidelity** — markdown를 canonical truth로 유지하고, round-trip을 제어할 수 있어야 한다.
3. **Custom syntax extensibility** — Boardmark directive, fenced block, custom block을 수용할 여지가 있어야 한다.
4. **Canvas integration** — selection, drag, pan, shortcut 우선순위를 세밀하게 통제할 수 있어야 한다.
5. **Delivery speed** — 첫 note/edge v1을 과도한 기반 공사 없이 낼 수 있어야 한다.
6. **Escape hatch** — 필요 시 더 낮은 레벨로 내려가도 전체 투자가 버려지지 않아야 한다.

---

## 3. 검토한 옵션

### Option A — Tiptap

Tiptap은 ProseMirror 위에 올라간 headless framework다. 공식 문서는 custom editor를 자유롭게 만들 수 있다고 설명하고, markdown parsing/serialization extension도 제공한다. 또한 유료 템플릿으로 Notion-like editor를 제공한다.

### Option B — Lexical

Lexical은 Meta가 만든 lean text editor framework다. 공식 사이트는 Notion-like block editor demo를 전면에 두고 있고, block-first interaction과 plugin 기반 확장을 강조한다.

### Option C — ProseMirror 직접 사용

ProseMirror는 rich-text editor를 위한 toolkit이다. 공식 문서는 구조화된 문서, schema, transaction, plugin을 직접 통제하는 방향을 강조하며, custom structure 편집에 매우 유연하다.

### Option D — Milkdown

Milkdown은 ProseMirror와 Remark 위에서 동작하는 plugin-driven WYSIWYG markdown editor framework다. markdown-first positioning이 분명하고, headless하게 UI를 구성할 수 있다.

---

## 4. 비교 테이블

| 기준 | Tiptap | Lexical | ProseMirror | Milkdown |
|------|--------|---------|-------------|----------|
| **Preview-continuous UX 적합성** | 높음. headless라 preview-like surface를 직접 만들기 쉽다. 다만 기본 제공이 아니라 설계가 필요하다. | 높음. block-first UX와 Notion-like demo가 강점이다. | 높음. 가장 자유롭지만 모든 상호작용을 직접 설계해야 한다. | 중상. markdown editor 감각은 좋지만 Notion류 block UX 기본값은 약하다. |
| **Markdown canonical truth 적합성** | 중상. 공식 Markdown extension이 있으나 현재 Beta다. custom tokenizer/serializer 확장이 가능하다. | 중하. markdown는 plugin/helper 영역이고 first-class source model은 아니다. | 중상. 직접 parser/serializer를 설계할 수 있어 fidelity 제어 폭이 가장 크다. | 높음. framework 자체가 WYSIWYG markdown editor를 지향한다. |
| **Custom syntax / directive 확장성** | 높음. extension model이 강하고 ProseMirror 기반이라 custom node/mark 설계가 가능하다. | 중상. custom node와 plugin 확장은 강하지만 markdown 측을 별도로 메워야 한다. | 매우 높음. schema, transaction, plugin을 가장 낮은 수준에서 통제할 수 있다. | 중상. plugin 기반 확장이 가능하지만 생태계와 사례가 상대적으로 좁다. |
| **Canvas interaction 통제력** | 높음. editor props와 ProseMirror plugin을 통해 이벤트 경계를 조정할 수 있다. | 높음. 낮은 레벨 control이 좋고 custom interaction을 설계하기 쉽다. | 매우 높음. selection, transaction, event handling을 가장 직접 통제한다. | 중상. 기반은 ProseMirror지만 Milkdown의 추상화 안에서 움직여야 한다. |
| **code block 편집/선택 UX** | 높음. custom node view와 extension으로 제어 가능하다. | 높음. custom block interaction에 유리하다. | 매우 높음. 직접 원하는 semantics를 설계할 수 있다. | 중상. markdown-first 흐름엔 맞지만 block-specific UX 최적화는 별도 작업이 든다. |
| **초기 구현 속도** | 높음. 확장과 React 통합이 잘 정리되어 있다. | 중상. block UX는 좋지만 markdown/source 모델을 메우는 비용이 있다. | 낮음. 가장 많은 기반 작업이 필요하다. | 중상. markdown-first 시작은 빠를 수 있으나 ecosystem 탐색 비용이 있다. |
| **장기 escape hatch** | 높음. ProseMirror 기반이라 필요 시 하위 레벨로 내려갈 수 있다. | 중간. 독자 모델이라 전환 비용이 상대적으로 크다. | 매우 높음. 이미 최하위 선택이다. | 중상. ProseMirror 기반이지만 Milkdown 계층에 일부 종속된다. |
| **Boardmark 적합성 총평** | 가장 균형이 좋다. v1 delivery와 custom control 사이 타협점이다. | UX는 매력적이지만 markdown fidelity 리스크가 크다. | 기술적으로 가장 강력하지만 v1 착수 비용이 크다. | markdown-first 장점은 크지만 생태계/사례 측면에서 불확실성이 있다. |

---

## 5. 옵션별 평가

### Option A — Tiptap

**장점**

- headless라 preview와 비슷한 편집 surface를 만들 수 있다.
- ProseMirror 위라 schema/extension/plugin 자산을 활용할 수 있다.
- markdown parsing/serialization 경로가 공식적으로 존재한다.
- React 통합과 확장 문서가 풍부해 v1 delivery 속도가 좋다.
- 필요 시 ProseMirror 레벨 customization으로 내려갈 수 있다.

**단점**

- 노션 같은 UX는 기본 제공이 아니라 직접 설계해야 한다.
- 공식 Markdown extension이 아직 Beta라 source fidelity를 별도 검증해야 한다.
- Notion-like template는 유료 플랜 의존성이 있다. Boardmark의 코어 의존성으로 삼기엔 부적절하다.

**Boardmark 관점 판단**

가장 현실적인 1차 선택지다. UX를 빠르게 구현할 수 있고, markdown/custom syntax 문제가 커지면 ProseMirror 레벨로 확장할 수 있다.

### Option B — Lexical

**장점**

- block-first interaction과 Notion-like UX 감각이 강하다.
- 성능과 custom interaction 설계에 유리하다.
- contenteditable 기반 상호작용을 세밀하게 통제하기 좋다.

**단점**

- markdown는 core model이 아니라 plugin/helper 성격이라 source fidelity 책임이 커진다.
- Boardmark custom markdown syntax를 안정적으로 round-trip 하려면 별도 계층이 많이 필요하다.
- 기존 markdown-first 제품 구조와 자연스럽게 맞물리는 편은 아니다.

**Boardmark 관점 판단**

UX만 보면 매우 강력하지만, Boardmark의 canonical markdown 요구사항과는 긴장이 크다.

### Option C — ProseMirror 직접 사용

**장점**

- 문서 구조, selection, transaction, plugin을 가장 강하게 통제할 수 있다.
- custom markdown model, directive bridge, canvas interaction boundary를 직접 설계하기 좋다.
- 장기적으로 가장 제한이 적다.

**단점**

- v1에 필요한 모든 편의 계층을 직접 조립해야 한다.
- 학습 비용과 초기 생산성 비용이 가장 높다.
- 첫 delivery 속도가 느려질 가능성이 크다.

**Boardmark 관점 판단**

장기 최적해가 될 수는 있지만, 현재 단계에서는 공사 범위가 너무 넓다. markdown fidelity spike에서 Tiptap이 막힐 때의 2차 선택지로 보는 편이 합리적이다.

### Option D — Milkdown

**장점**

- markdown-first positioning이 분명하다.
- ProseMirror와 Remark 기반이라 markdown ecosystem과 연결성이 좋다.
- headless라 디자인 통합 여지는 충분하다.

**단점**

- 생태계와 실전 사례가 Tiptap보다 좁다.
- Boardmark가 원하는 canvas-integrated editing 사례를 찾기 어렵다.
- Notion류 interaction을 그대로 끌어오기보다 markdown editor 성향이 더 강하다.

**Boardmark 관점 판단**

markdown 중심 제품에는 매력적이지만, 현재 우리 요구사항은 단순 markdown editor가 아니라 canvas 위 seamless object editor다. 이 지점에서 Tiptap보다 우위가 명확하지 않다.

---

## 6. 결정

**1차 채택안은 Tiptap이다.**

단, 채택 범위는 아래처럼 제한한다.

1. Tiptap의 **OSS headless core**를 기반으로 한다.
2. Tiptap의 **유료 Notion-like template는 참고 자료로만 보고 코어 의존성으로 채택하지 않는다**.
3. markdown fidelity는 공식 Markdown extension을 출발점으로 보되, **Boardmark custom syntax와 round-trip loss 여부를 별도 spike로 검증**한다.
4. 만약 markdown fidelity 또는 transaction control이 Tiptap 계층에서 구조적으로 막히면, **하위 fallback은 ProseMirror 직접 사용**으로 둔다.

이 결정을 내린 이유는 다음과 같다.

- Lexical은 UX 잠재력은 크지만 markdown canonical truth 요구사항과 거리가 있다.
- ProseMirror 직접 사용은 가장 강력하지만, 지금 v1 delivery에는 기반 비용이 너무 크다.
- Milkdown은 markdown-first 장점이 있지만 canvas-integrated seamless editing 관점의 우위가 충분히 분명하지 않다.
- Tiptap은 현재 시점에서 **delivery speed, customization, escape hatch**의 균형이 가장 좋다.

---

## 7. 결과와 후속 조치

### 기대 효과

- note body와 edge label에 대한 v1 seamless editing 착수 속도가 빨라진다.
- editor host contract를 먼저 만들고, 상호작용 설계를 점진적으로 얹을 수 있다.
- 향후 더 낮은 레벨 제어가 필요해도 ProseMirror 기반 자산을 재사용할 수 있다.

### 수용한 리스크

- Markdown extension Beta 상태로 인한 round-trip edge case
- Boardmark directive/custom block 처리 시 tokenizer/serializer 보강 필요
- 노션 같은 UX를 템플릿 없이 직접 설계해야 하는 비용

### 즉시 필요한 검증

1. note/edge body에 필요한 markdown subset이 Tiptap Markdown extension에서 loss 없이 round-trip 되는지 검증
2. fenced code block 편집 중 selection/caret/IME/copy-paste가 canvas gesture와 충돌 없이 동작하는지 검증
3. Boardmark directive 또는 fenced custom block을 custom extension으로 수용 가능한지 검증
4. `textarea` 교체 없이 preview-like styling과 editing surface 일치를 어느 정도까지 유지할 수 있는지 검증

---

## 8. 참고 자료

- Tiptap overview: [https://tiptap.dev/docs/editor/getting-started/overview](https://tiptap.dev/docs/editor/getting-started/overview)
- Tiptap Markdown docs: [https://tiptap.dev/docs/editor/markdown](https://tiptap.dev/docs/editor/markdown)
- Tiptap Notion-like template: [https://tiptap.dev/docs/ui-components/templates/notion-like-editor](https://tiptap.dev/docs/ui-components/templates/notion-like-editor)
- Lexical: [https://lexical.dev/](https://lexical.dev/)
- ProseMirror: [https://prosemirror.net/](https://prosemirror.net/)
- Milkdown: [https://milkdown.dev/core](https://milkdown.dev/core)
