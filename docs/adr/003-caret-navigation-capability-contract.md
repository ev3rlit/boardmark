# ADR-003: Caret Navigation Capability Contract 설계

| 항목 | 내용 |
|------|------|
| 문서 번호 | ADR-003 |
| 상태 | 🟢 결정됨 (Accepted) |
| 작성일 | 2026-04-07 |
| 관련 기능 | WYSIWYG caret navigation, fenced block editing, preview-continuous editing |
| 관련 문서 | `docs/features/caret-navigation-model/README.md` |
| 관련 파일 | `packages/canvas-app/src/components/editor/caret-navigation/editor-navigation-plugin.ts`, `packages/canvas-app/src/components/editor/views/raw-block-editor.tsx`, `packages/canvas-app/src/components/editor/views/code-block-node-view.tsx`, `packages/canvas-app/src/components/editor/views/special-fenced-block-view.tsx`, `packages/canvas-app/src/components/editor/views/html-fallback-block-view.tsx` |

---

## 1. 맥락

현재 caret navigation 구현은 spec을 맞추기 위해 빠르게 확장되었지만, 여전히 구조적으로 불안정한 지점이 있다.

- 전역 navigation layer는 존재하지만, 일부 판단이 여전히 node type 이름이나 특정 진입 방향에 의존한다.
- fenced code block, special fenced block, html fallback은 공통 raw editor shell을 공유하지만, 진입/탈출 정책은 plugin과 view 사이에 나뉘어 있다.
- nested blockquote/list/table 같은 구조가 들어오면 "top-level block 기준" 사고방식이 쉽게 다시 스며든다.
- preview/edit 전환은 결국 "caret가 실제로 어디에 있느냐"가 본질인데, 구현 중간에 임시 meta나 block-specific branching이 누적되기 쉽다.

즉 지금 필요한 것은 또 하나의 예외 처리가 아니라,
**각 markdown syntax가 제공해야 하는 caret capability를 계약으로 고정하고, 전역 coordinator가 그 계약만 사용하도록 정리하는 것**이다.

이 ADR은 "문법마다 navigation을 다르게 가져가고 싶을 때 어떤 구조가 가장 안전한가"를 결정한다.

---

## 2. 결정 드라이버

1. **Caret-first model 유지** — preview/edit 상태보다 실제 caret 위치가 source of truth여야 한다.
2. **Nested structure 대응** — paragraph, list, blockquote, table, fenced block이 섞여도 같은 모델로 작동해야 한다.
3. **문법별 차이 수용** — table, raw code block, text flow처럼 문법마다 다른 내부 규칙을 표현할 수 있어야 한다.
4. **전역 정책 일관성** — `ArrowUp/Down`, `Escape`, `Enter`의 의미는 editor-wide layer에서 유지돼야 한다.
5. **구현 분산 방지** — node view마다 ad-hoc keydown이 다시 늘어나면 안 된다.
6. **RULE.md 정합성** — 숨겨진 상태를 줄이고, 작고 명시적인 계약으로 구성해야 한다.

---

## 3. 문제 정의

현재 구조에서 반복적으로 드러나는 문제는 아래다.

### 3.1 전역 정책과 문법별 정책이 섞인다

- 어떤 문법은 전역 plugin이 처리하고
- 어떤 문법은 node view가 직접 처리하고
- 어떤 문법은 두 레이어가 같은 일을 나눠서 처리한다.

이 상태에서는 새 문법을 추가할 때마다 "이건 어느 레이어에서 처리하지?"를 다시 결정해야 한다.

### 3.2 현재 분기는 node type 이름에 과도하게 의존한다

`wysiwygCodeBlock`, `wysiwygSpecialFencedBlock`, `wysiwygHtmlFallbackBlock` 같은 이름 분기는 당장 단순하지만,

- table처럼 더 다른 caret model이 들어오면 조건문이 늘어나고
- 같은 caret model을 가지는 문법끼리도 구현이 분리되며
- 결국 문법별 if/switch가 navigation policy를 삼키게 된다.

### 3.3 preview/edit는 상태 이름보다 caret 보유 여부가 본질이다

사용자 관점에서 중요한 것은 다음뿐이다.

- 지금 prose text caret가 있는가
- 지금 raw block caret가 있는가
- 지금 block가 선택만 되었는가
- 지금 caret가 없는 preview인가

따라서 문법별 UI를 따로 설계해도,
navigation과 host/store 정렬은 결국 "caret capability" 계약 하나 위에서 돌아야 한다.

---

## 4. 검토한 옵션

### Option A — 현재 방식 유지: 전역 plugin + node type 분기 확대

**구조**

- 전역 plugin이 node type 이름을 보고 분기
- 각 node view는 필요한 경우 로컬 keydown 추가
- 새 문법이 생기면 plugin switch와 view handler를 같이 수정

**장점**

- 현재 코드에 가장 작은 변경
- 단기적으로는 빠르게 버그 수정 가능

**단점**

- 문법별 예외가 계속 누적된다
- nested structure가 늘수록 if/switch가 복잡해진다
- 같은 caret model을 가진 문법도 구현이 흩어진다
- root cause가 아니라 symptom fix가 반복되기 쉽다

**판단**

현재까지의 이슈 패턴을 보면 이미 한계가 드러났다. 장기 구조로는 부적절하다.

---

### Option B — 전역 plugin 내부에 문법별 하드코딩 policy 테이블 도입

**구조**

```ts
const navigationPolicies = {
  wysiwygCodeBlock: { enterFromUp: 'end', enterFromDown: 'start', ... },
  wysiwygSpecialFencedBlock: { ... },
  wysiwygHtmlFallbackBlock: { ... },
}
```

**장점**

- ad-hoc if/switch를 정리된 테이블로 모을 수 있다
- 버그 수정 위치가 한 곳으로 모인다

**단점**

- 여전히 plugin이 각 문법의 내부 규칙을 다 알아야 한다
- 문법 추가 시 plugin을 반드시 수정해야 한다
- table처럼 더 복잡한 내부 model이 들어오면 테이블 설정만으로 부족하다
- node가 가진 능력(capability)이 아니라 이름 기반 설정에 머문다

**판단**

Option A보다는 낫지만, 전역 layer가 문법 내부를 너무 많이 아는 구조라 확장성이 제한된다.

---

### Option C — 인터페이스 기반 Capability Contract + 전역 Coordinator

**구조**

- 전역 plugin은 "현재 caret target의 capability"만 읽는다
- 각 문법은 자신이 제공하는 caret model을 좁은 계약으로 노출한다
- plugin은 node type 이름 대신 capability registry를 사용한다

예시:

```ts
type CaretEntrySide = 'leading' | 'trailing'
type CaretDirection = 'up' | 'down' | 'left' | 'right'

interface BlockCaretCapability {
  kind: 'block'
  nodeName: string
  enterFrom(direction: 'up' | 'down'): CaretEntrySide
  exitAtBoundary(input: {
    direction: 'up' | 'down'
    caretOffset: number
    textLength: number
  }): boolean
}

interface TextFlowCapability {
  kind: 'text-flow'
}

type CaretCapability = BlockCaretCapability | TextFlowCapability | GridCapability
```

또는 RULE.md 정합성을 더 중시하면,
public consumer boundary에만 interface를 두고 내부 데이터는 union/type alias로 유지할 수 있다.

```ts
interface CaretCapabilityProvider {
  getCapability(nodeName: string): CaretCapability | null
}
```

**장점**

- 전역 plugin은 policy coordinator 역할만 유지한다
- 문법별 차이는 capability 구현으로 국소화된다
- raw code block와 special fenced block처럼 같은 caret model을 공유하는 문법을 재사용하기 쉽다
- nested blockquote/list/table도 "adjacent editable target + capability" 조합으로 설명 가능하다
- 이후 table/grid model 도입 시도 자연스럽다

**단점**

- 현재 코드보다 한 단계 추상화가 들어간다
- capability registry와 target resolver 경계를 새로 잡아야 한다
- interface를 과도하게 키우면 오히려 복잡해질 수 있다

**판단**

가장 균형이 좋다.
단, RULE.md에 맞게 **interface를 최소 public boundary에만 두고**, 내부는 구체 타입/union으로 유지하는 방식이 적절하다.

---

### Option D — 완전한 Cursor Graph 모델

**구조**

- 문서를 "caret node graph"로 모델링
- prose text position, block-local textarea position, table cell position을 모두 graph node로 표현
- navigation은 graph edge traversal로 처리

**장점**

- 가장 일반적이고 이론적으로 강력하다
- 모든 문법을 하나의 추상 모델로 통합 가능

**단점**

- 현재 필요보다 훨씬 복잡하다
- prose selection과 PM transaction 위에 별도 caret graph를 두면 source of truth가 분산될 위험이 있다
- 구현/디버깅 비용이 매우 높다

**판단**

장기 연구 과제로는 의미가 있지만, 현재 저장소와 요구 범위에는 과하다.

---

## 5. 결정

**채택안은 Option C — 인터페이스 기반 Capability Contract + 전역 Coordinator** 다.

단, 여기서 말하는 "인터페이스 기반"은 다음 원칙을 따른다.

1. interface는 **plugin이 의존하는 좁은 소비자 경계**에만 둔다.
2. 실제 capability 데이터는 discriminated union/type alias로 유지한다.
3. plugin은 node type 이름으로 분기하지 않고 capability provider를 통해 동작한다.
4. 각 문법은 "내부 caret model"만 제공하고, 문서 전체 navigation policy는 여전히 전역 coordinator가 가진다.

즉 "모든 것을 interface로 감싼다"가 아니라,
**전역 navigation layer가 의존할 최소한의 능력만 interface로 표현한다**는 결정이다.

추가로 아래 사항도 함께 확정한다.

1. **Block capability interface의 역할**
   - 각 markdown 문법이 "caret를 어떻게 받아들이고, 어떻게 내보내는지"를 전역 navigation layer에 알려주는 최소 계약이다.
2. **Global coordinator interface의 역할**
   - 현재 caret unit와 다음 caret unit를 어떻게 연결할지 결정하는 계약이다.
3. **navigation unit의 범위**
   - fenced code block, special fenced block, html fallback 같은 markdown block뿐 아니라
   - object body editor, edge label editor, host-level object selection도 더 큰 navigation unit 계층으로 해석한다.
4. **모델의 본질**
   - 구분은 `전역/로컬` 또는 `object block/markdown block`이 아니라,
   - "지금 caret를 소유할 수 있는 unit가 무엇인가"와
   - "그 unit가 caret를 어디로 넘길 수 있는가"다.

이 결정이 현재 저장소에 가장 맞는 이유는 아래와 같다.

- caret source of truth를 editor selection/focus에 두는 기존 spec과 충돌하지 않는다
- raw block 계열과 text flow 계열을 같은 모델 안에서 구분 가능하다
- table 같은 후속 문법도 같은 확장 포인트에 붙일 수 있다
- node view마다 keydown이 다시 늘어나는 것을 막는다
- RULE.md가 요구하는 "작고 명시적인 계약"과 가장 잘 맞는다

---

## 6. 제안 구조

### 6.1 권장 모듈 구성

```text
packages/canvas-app/src/components/editor/caret-navigation/
  editor-navigation-plugin.ts      # 전역 coordinator
  editable-target-resolver.ts      # selection ancestry 기반 target 순서 계산
  caret-capabilities.ts            # capability union + provider interface
  block-caret-capabilities.ts      # raw-block/grid/text-flow capability 구현
  selection-state.ts               # source-of-truth 파생 helper
```

### 6.2 추천 계약

```ts
type CaretDirection = 'up' | 'down'
type EntryPlacement = 'leading' | 'trailing'

type CaretCapability =
  | { kind: 'text-flow' }
  | {
      kind: 'raw-block'
      entryPlacement: (direction: CaretDirection) => EntryPlacement
      exitsAtBoundary: (input: {
        direction: CaretDirection
        selectionEnd: number
        selectionStart: number
        valueLength: number
      }) => boolean
    }
  | {
      kind: 'grid'
      // table traversal용 후속 확장
    }

interface CaretCapabilityProvider {
  getForNodeName(nodeName: string): CaretCapability | null
}
```

여기에 더해 전역 coordinator 경계도 아래처럼 표현할 수 있다.

```ts
interface NavigationCoordinator {
  moveVertical(input: {
    direction: 'up' | 'down'
    currentUnit: NavigationUnit
  }): boolean
}

type NavigationUnit =
  | { kind: 'host-selection' }
  | { kind: 'editor-surface' }
  | { kind: 'text-flow' }
  | { kind: 'raw-block' }
  | { kind: 'grid' }
```

즉 block capability는 "자기 안의 caret 규칙"을 설명하고,
global coordinator는 "unit 사이의 연결 규칙"을 설명한다.

### 6.3 개념 계층

권장하는 개념 계층은 아래와 같다.

- **Leaf unit**
  - paragraph
  - blockquote 내부 paragraph
  - fenced code block
  - special fenced block
  - html fallback
  - table cell / grid
- **Composite unit**
  - blockquote
  - list
  - object body editor
  - edge label editor
- **Root coordinator**
  - canvas host
  - object selection
  - editor host

이 계층은 "모든 것이 block"이라는 의미가 아니라,
"모든 것이 caret ownership을 가질 수 있는 navigation unit"이라는 의미다.

### 6.4 역할 분리

**전역 plugin**

- 현재 selection이 어느 editable target 위에 있는지 판단
- 이전/다음 target을 resolver로 계산
- target의 capability를 읽고 entry/exit를 조정
- `Escape`, `Enter`, `ArrowUp/Down`의 editor-wide semantics 유지

**target resolver**

- top-level block 기준이 아니라 문서 전체 descendant 기준으로 editable target 순서를 계산
- paragraph, blockquote 내부 paragraph, list item paragraph, fenced block, html fallback, table cell 같은 leaf target을 모두 나열

**block view**

- raw editor DOM과 local caret boundary만 제공
- global navigation policy는 직접 가지지 않음

**host / editor coordinator**

- markdown 내부 navigation과 object-level selection 복귀를 같은 모델 위에서 연결
- `Escape`가 왜 host selection으로 올라가는지 같은 vocabulary로 설명
- source of truth는 여전히 editor selection/focus이며, coordinator는 이를 해석만 함

---

## 7. 구현 시 주의사항

### 7.1 interface를 크게 만들지 말 것

피해야 할 형태:

```ts
interface MegaNavigationHandler {
  onArrowUp(...)
  onArrowDown(...)
  onArrowLeft(...)
  onArrowRight(...)
  onEscape(...)
  onEnter(...)
  onTab(...)
  onClick(...)
}
```

이건 capability contract가 아니라 mini framework다.

### 7.2 provider는 좁게, 데이터는 구체적으로

권장:

- provider interface는 `getForNodeName()` 또는 `resolveCapability()` 한 메서드만 가진다
- 반환값은 concrete union이다

이 방식이 RULE.md의 "입력은 좁은 인터페이스, 출력은 구체 타입" 원칙과 맞는다.

### 7.3 source of truth를 늘리지 말 것

capability contract를 도입해도 아래는 유지한다.

- editor selection/focus가 source of truth
- store는 파생값만 가진다
- capability는 selection/focus를 해석하는 도구이지, 별도 caret state를 저장하는 계층이 아니다

### 7.4 추상화 순서

개념은 하나지만 구현은 아래에서 위로 올린다.

1. markdown block capability contract를 먼저 고정
2. editor host를 composite navigation unit로 승격
3. 마지막에 canvas object selection을 같은 coordinator contract로 연결

이 순서를 지키면 과도한 선행 추상화를 피하면서도,
최종적으로는 object-level navigation까지 같은 모델에 포함시킬 수 있다.

---

## 8. 단계적 도입 계획

### Phase 1 — Resolver 분리

- 현재 `editor-navigation-plugin.ts` 안의 editable target 탐색을 `editable-target-resolver.ts` 로 분리
- top-level block 가정 제거

### Phase 2 — Capability provider 도입

- `isNavigableBlockNodeName()` 기반 분기를 provider lookup으로 교체
- code/special/html는 공통 `raw-block` capability를 사용

### Phase 3 — table/grid capability 추가

- table navigation을 후속 범위로 붙일 수 있도록 `grid` slot 추가
- 이번 단계에서는 구현하지 않고 계약만 확보 가능

### Phase 4 — 테스트 정렬

- 테스트를 node type 중심이 아니라 behavior 중심으로 재구성
- 예:
  - "text-flow -> raw-block 진입"
  - "raw-block trailing boundary -> text-flow 탈출"
  - "nested blockquote text-flow -> raw-block 진입"

---

## 9. 결과와 기대 효과

이 ADR을 따르면 다음 효과를 기대할 수 있다.

- 문법마다 다른 navigation을 지원하면서도 전역 semantics는 유지된다
- fenced/special/html의 공통점이 코드 구조에 직접 반영된다
- table/list/blockquote 확장 시 다시 top-level 특수 처리로 돌아가지 않는다
- 버그 수정이 "문법별 예외 추가"가 아니라 "resolver 또는 capability 수정"으로 귀결된다

반대로 이 ADR을 따르지 않으면,
bug fix가 계속 node type 조건문과 view-local keydown으로 쌓일 가능성이 높다.

---

## 10. 참고

- caret navigation source of truth: `docs/features/caret-navigation-model/README.md`
- WYSIWYG editor 선택 배경: `docs/adr/002-wysiwyg-editor-framework-selection.md`
- 프로젝트 TypeScript 규칙: `RULE.md`
