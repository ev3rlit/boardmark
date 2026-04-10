# WYSIWYG와 Preview 간 줄간격 불일치 문제

## 요약

WYSIWYG 편집 모드와 Preview(노트 렌더링) 모드에서 동일한 마크다운 콘텐츠를 표시할 때 줄간격, 내부 여백, 요소 위치가 달라 보이는 구조적 문제입니다. 인용문(`blockquote`)이 대표적인 증상이지만, 단락, 리스트, 코드 블록 등 모든 블록 요소에서 잠재적으로 동일한 불일치가 발생할 수 있습니다.

---

## 증상

### 인용문(blockquote) 줄간격 차이

같은 마크다운:

```md
> 이것은 인용문입니다.
> 두 번째 줄입니다.
```

- **WYSIWYG**: `blockquote` 내부 하단 여백이 더 큼
- **Preview**: `blockquote` 내부 하단 여백이 더 작음

시각적으로 WYSIWYG에서는 인용문 하단이 더 넓고, Preview에서는 더 조밀하게 렌더링됩니다.

---

## 근본 원인 분석

### 1. `:last-child` 범위 비대칭 (즉각적 원인)

가장 직접적인 원인입니다. WYSIWYG와 Preview가 블록 요소의 마지막 `margin-bottom`을 제거하는 방식이 다릅니다.

**Preview** (`canvas-app.css:753–761`):
```css
.note-markdown :where(p:last-child),
.note-markdown :where(blockquote:last-child) { ... }
  margin-bottom: 0;
}
```
→ `:where(p:last-child)`는 **어떤 깊이든** 마지막 `<p>`에 적용됩니다. `blockquote` 내부의 마지막 `<p>`도 포함됩니다.

**WYSIWYG** (`canvas-app.css:1168–1170`):
```css
.canvas-wysiwyg-surface__content > :last-child {
  margin-bottom: 0;
}
```
→ `>` 직계 자식 선택자이므로 `blockquote` 내부의 `<p>`에는 **적용되지 않습니다**.

**결과적 여백 계산**:

| 위치 | 공식 | 결과 |
|---|---|---|
| Preview: `blockquote` 하단 내부 | padding `0.8rem` + `<p>` margin `0rem` (제거됨) | `0.8rem` |
| WYSIWYG: `blockquote` 하단 내부 | padding `0.8rem` + `<p>` margin `0.75rem` (제거 안 됨) | `1.55rem` |

`blockquote` 안의 `<p>` margin (`0 0 0.75rem`, `canvas-app.css:343`)이 Preview에서는 제거되고 WYSIWYG에서는 남아 있어, **0.75rem 차이**가 발생합니다.

---

### 2. 렌더러 이원성 (구조적 원인)

WYSIWYG와 Preview는 완전히 다른 렌더링 엔진을 사용합니다.

| | WYSIWYG | Preview |
|---|---|---|
| 엔진 | TipTap 3 / ProseMirror | react-markdown 9 + remark |
| 방식 | ProseMirror 노드 트리 → contenteditable DOM | 마크다운 AST → React 컴포넌트 트리 |
| 줄바꿈 | soft break를 hard break로 업그레이드 | `remarkBreaks`가 `\n`을 `<br>`로 변환 |
| 파싱 진입점 | `normalizeSoftLineBreaksInContent(manager.parse(...))` | `ReactMarkdown` + `remarkPlugins` |

두 엔진이 생성하는 **HTML DOM 구조가 미묘하게 다를 수 있으며**, 같은 CSS 선택자라도 서로 다른 요소에 적용될 수 있습니다.

---

### 3. `remarkBreaks` 플러그인 비대칭

Preview에서만 `remarkBreaks`가 활성화됩니다 (`markdown-content.tsx:86`):

```tsx
remarkPlugins={[remarkGfm, remarkBreaks]}
```

`remarkBreaks`는 단일 줄바꿈 `\n`을 `<br>` 요소로 변환합니다. WYSIWYG에서는 동일한 줄바꿈이 소프트 브레이크로 처리되거나 하드 브레이크로 업그레이드됩니다 (`wysiwyg-markdown-bridge.tsx:282–286`). 이로 인해 특히 `blockquote` 내부의 멀티라인 텍스트에서 렌더링 차이가 발생합니다.

---

### 4. CSS modifier 클래스 역할 불균형

두 모드는 `.markdown-content` 기본 클래스를 공유하지만, 수정자(modifier) 클래스가 다릅니다.

| 모드 | 적용 클래스 | 역할 |
|---|---|---|
| WYSIWYG | `markdown-content canvas-wysiwyg-surface__content` | 직계 마지막 자식 margin 제거 |
| Preview (노트) | `markdown-content note-markdown` | 명시적 요소 타입별 깊이 무관 margin 제거 |

`note-markdown`은 `p:last-child`, `blockquote:last-child`, `pre:last-child` 등을 **타입별로 명시**하여 중첩 깊이에 무관하게 처리합니다. 반면 `canvas-wysiwyg-surface__content`는 `> :last-child` 하나로만 처리하여, 중첩 블록 내부의 last-child에는 도달하지 못합니다.

---

## 영향 범위

이 구조적 불일치는 아래 요소 전반에 잠재합니다:

- `blockquote` — 내부 `<p>` bottom margin 처리 (현재 확인된 증상)
- `ul`, `ol` — 내부 마지막 `<li>` 또는 `<p>` margin
- `pre` / 코드 블록 — 렌더러별 wrapper 구조 차이
- 단락 연속 줄바꿈 — `remarkBreaks` 유무에 따른 `<br>` 렌더링 차이

---

## 관련 파일

| 파일 | 관련 내용 |
|---|---|
| `packages/canvas-app/src/styles/canvas-app.css:342–385` | `.markdown-content` blockquote / 단락 스타일 |
| `packages/canvas-app/src/styles/canvas-app.css:753–761` | `.note-markdown :where(*:last-child)` Preview last-child 처리 |
| `packages/canvas-app/src/styles/canvas-app.css:1164–1170` | `.canvas-wysiwyg-surface__content > :last-child` WYSIWYG last-child 처리 |
| `packages/ui/src/components/markdown-content.tsx:86` | Preview의 `remarkBreaks` 플러그인 등록 |
| `packages/canvas-app/src/components/editor/wysiwyg-markdown-bridge.tsx:69–87` | WYSIWYG 파싱·직렬화 파이프라인 |
| `packages/canvas-app/src/components/editor/wysiwyg-editor-surface.tsx:49` | 에디터 클래스 적용 위치 |

---

## 해결 방향

이 문제는 CSS 패치 하나로 완전히 해결되지 않습니다. 두 가지 접근이 있습니다.

### 단기: WYSIWYG last-child 처리를 Preview와 일치시키기

`canvas-wysiwyg-surface__content`의 last-child 제거 규칙을 `note-markdown`과 동일한 방식으로 확장합니다:

```css
/* 현재 */
.canvas-wysiwyg-surface__content > :last-child {
  margin-bottom: 0;
}

/* 변경 후 */
.canvas-wysiwyg-surface__content :where(p:last-child),
.canvas-wysiwyg-surface__content :where(pre:last-child),
.canvas-wysiwyg-surface__content :where(blockquote:last-child) {
  margin-bottom: 0;
}
```

단, 이 변경은 `blockquote:last-child`의 외부 margin을 제거하는 것이지, **내부 `<p>` margin을 제거하지는 않습니다**. `blockquote` 내부 `<p>`의 margin을 억제하는 규칙도 별도로 필요합니다:

```css
.markdown-content :where(blockquote) :where(p:last-child) {
  margin-bottom: 0;
}
```

### 장기: 렌더러 정규화

두 렌더러가 동일한 마크다운에서 동일한 DOM 구조를 생성하도록 보장하는 것이 근본적인 해결책입니다. 다음을 고려해야 합니다:

1. `remarkBreaks` 동작을 WYSIWYG 줄바꿈 처리와 일치시키거나, Preview에서 제거하고 WYSIWYG에서도 동일하게 처리하기
2. CSS 수정자 클래스(`note-markdown`, `canvas-wysiwyg-surface__content`)의 역할을 명확히 분리하여, 공통 간격 규칙은 `.markdown-content` 하나에만 정의하기
3. WYSIWYG와 Preview가 동일한 컴포넌트 트리를 사용하는 단일 렌더러로 통합하는 것을 장기 목표로 고려하기
