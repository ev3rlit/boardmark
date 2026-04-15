# WYSIWYG 의미 기반 콘텐츠 동기화

## 배경

현재 `wysiwyg-editor-surface.tsx`의 `useEffect`는 markdown 문자열을 직접 비교하여 편집기 콘텐츠를 동기화합니다.

```tsx
useEffect(() => {
  if (!editor) return
  if (editor.getMarkdown() !== markdown) {
    editor.commands.setContent(bridge.fromMarkdown(markdown))
  }
}, [bridge, editor, markdown])
```

이 비교 방식은 의미상 동일한 콘텐츠도 문자열 표현이 다르면 `setContent`를 호출합니다.  
그 결과 편집기를 처음 열 때 불필요한 `setContent` → `onUpdate` → `onMarkdownChange` 루프가 발생하고, 파일 내용이 편집기의 안정 직렬화 형태로 일회 변환됩니다.

관련 이슈: [WYSIWYG 빈 단락 `&nbsp;` 누적 버그](../../issues/wysiwyg-empty-paragraph-nbsp-accumulation/README.md)

## 목표

`useEffect`의 동기화 판단 기준을 markdown 문자열 비교에서 **ProseMirror document 구조 비교**로 변경합니다.

- 의미상 동일한 콘텐츠는 `setContent`를 호출하지 않습니다.
- 파일에 저장된 markdown 표현이 편집기를 여닫는 것만으로 변경되지 않습니다.
- 외부에서 실제로 콘텐츠가 바뀌었을 때만 편집기를 업데이트합니다.

## 해결 방향

### 핵심 아이디어

markdown 문자열 대신, markdown을 파싱한 ProseMirror JSON document를 비교합니다.

```tsx
useEffect(() => {
  if (!editor) return

  const incomingDoc = bridge.fromMarkdown(markdown)
  const currentDoc = editor.getJSON()

  if (!isDocEqual(incomingDoc, currentDoc)) {
    editor.commands.setContent(incomingDoc)
  }
}, [bridge, editor, markdown])
```

`isDocEqual`은 두 ProseMirror JSON document를 깊이 비교합니다.

### 구현 방법

#### 1. `isDocEqual` 구현

ProseMirror JSON document는 `{ type, content, attrs, marks, text }` 형태의 중첩 객체입니다.  
깊은 동등 비교는 `JSON.stringify` 정렬 또는 재귀 비교로 구현합니다.

```ts
function isDocEqual(a: JSONContent, b: JSONContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
```

ProseMirror `Node.eq()`를 사용할 수도 있습니다. 단, TipTap `editor.getJSON()`이 반환하는 plain object와 `bridge.fromMarkdown()`이 반환하는 타입이 일치하는지 확인이 필요합니다.

#### 2. `bridge.fromMarkdown` 반환 타입 확인

현재 `WysiwygMarkdownBridge.fromMarkdown()`이 TipTap `setContent`에 전달 가능한 `JSONContent`를 반환하는지 확인합니다.  
반환 타입이 `Content` (string | JSONContent | null)라면 문자열 경로를 제거하고 `JSONContent`만 반환하도록 좁혀줍니다.

#### 3. 비교 비용

`fromMarkdown`은 매 렌더마다 호출됩니다. 파싱 비용이 문제가 된다면 `useMemo`로 memoize합니다.

```tsx
const incomingDoc = useMemo(
  () => bridge.fromMarkdown(markdown),
  [bridge, markdown]
)

useEffect(() => {
  if (!editor) return
  if (!isDocEqual(incomingDoc, editor.getJSON())) {
    editor.commands.setContent(incomingDoc)
  }
}, [bridge, editor, incomingDoc])
```

## 변경 대상 파일

| 파일 | 변경 내용 |
|---|---|
| `packages/canvas-app/src/components/editor/wysiwyg-editor-surface.tsx` | `useEffect` 비교 로직을 문자열 비교에서 document JSON 비교로 교체 |
| `packages/canvas-app/src/components/editor/wysiwyg-markdown-bridge.tsx` | `fromMarkdown` 반환 타입을 `JSONContent`로 좁힐 수 있는지 검토 |

## 검증

- `notes/vm.md`의 note-17 (`&nbsp;\n\n&nbsp;` 패턴)을 열고 blur해도 파일이 변경되지 않는다.
- 다른 note에서 실제 편집 후 blur하면 변경 내용이 정상적으로 저장된다.
- 외부에서 markdown prop이 변경될 때 (예: undo/redo, 다른 클라이언트 변경) 편집기가 정상적으로 업데이트된다.
- `wysiwyg-markdown-bridge.test.tsx`의 기존 round-trip 테스트가 모두 통과한다.

## Non-Goals

- `@tiptap/extension-paragraph`의 `&nbsp;` 직렬화 동작 변경
- `WysiwygCodeBlock`의 trailing `\n` 제거
- `serializeBodyFragment`의 trailing newline 처리 변경
- 기존 파일에 이미 저장된 안정 형태를 원본으로 되돌리는 마이그레이션
