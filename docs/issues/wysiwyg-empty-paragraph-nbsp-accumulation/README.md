# WYSIWYG 빈 단락 `&nbsp;` 누적 버그

## 요약

WYSIWYG 편집기에서 `&nbsp;` 구분자로 이루어진 빈 단락 패턴(`&nbsp;\n\n&nbsp;`)을 포함한 note를 열고 편집 후 blur하면, 파일에 `&nbsp;` 문자가 추가 삽입되는 일회성 변환이 발생합니다.

이 변환은 파일을 새로 열었을 때는 재발하지 않습니다. 즉, 불안정한 round-trip을 가진 markdown 표현이 존재하며, WYSIWYG 편집기를 거치는 순간 그 표현이 안정 형태로 단 한 번 치환됩니다.

## 재현 방법

1. `&nbsp;\n\n&nbsp;` 패턴이 fenced code block 직후에 오는 note를 엽니다.

   예시 (`notes/vm.md`의 note-17):
   ```md
   ```bash
   # 명령어
   ```
   
   &nbsp;
   
   &nbsp;
   
   다음 단락...
   ```

2. 해당 note의 WYSIWYG 편집기에 진입합니다 (클릭).
3. 아무것도 수정하지 않고 클릭 아웃 (blur)합니다.

실제 결과:

- 파일 내 `&nbsp;\n\n&nbsp;` 구간이 `\n\n\n\n&nbsp;` 형태로 변환됩니다.
- 구체적으로 첫 번째 `&nbsp;` 줄이 빈 줄 2개로 교체됩니다.
- 이후 다시 열고 blur해도 추가 변환은 발생하지 않습니다 (일회성).

## 근거

### 1. 변환 경로

`@tiptap/extension-paragraph`의 `renderMarkdown`은 연속된 빈 단락을 아래 규칙으로 직렬화합니다.

```js
// node_modules/@tiptap/extension-paragraph/dist/...
if (content.length === 0) {
  const previousNodeIsEmptyParagraph =
    ctx?.previousNode?.type === "paragraph" && previousContent.length === 0
  return previousNodeIsEmptyParagraph ? "&nbsp;" : ""
}
```

즉, 연속된 두 빈 단락은 `["", "&nbsp;"]`로 직렬화되고, `@tiptap/extension-document`가 블록을 `"\n\n"`로 이어 붙이면 결과는 `"" + "\n\n" + "&nbsp;"` = `"\n\n&nbsp;"`가 됩니다.

### 2. Fenced code block 뒤 직렬화 불일치

`WysiwygCodeBlock.renderMarkdown()`은 fenced block 끝에 trailing `\n`을 붙입니다.

```ts
return buildRawFencedMarkdown(...) + '\n'
```

document serializer가 이 뒤에 `"\n\n"`를 추가로 붙이면, fenced block과 첫 번째 빈 단락 사이에 `"\n\n\n"` (빈 줄 3개)가 생깁니다.

원본 파일의 `&nbsp;\n\n&nbsp;`는 파싱 시 `[para(), para()]` 두 개의 빈 단락으로 해석됩니다.
직렬화 후 결과는 다음과 같습니다.

```
원본:   ```bash\n...\n```\n\n&nbsp;\n\n&nbsp;
직렬화: ```bash\n...\n```\n\n\n\n&nbsp;
```

첫 번째 빈 단락은 `""` (이전 노드가 빈 단락이 아니므로)로, 두 번째는 `"&nbsp;"`로 직렬화됩니다.  
code block trailing `\n` + document separator `\n\n` + `""` + `\n\n` + `"&nbsp;"` 조합이 원본 표현과 달라집니다.

### 3. `useEffect` 동기화 루프

`wysiwyg-editor-surface.tsx`의 `useEffect`는 markdown 문자열을 직접 비교합니다.

```tsx
useEffect(() => {
  if (!editor) return
  if (editor.getMarkdown() !== markdown) {
    editor.commands.setContent(bridge.fromMarkdown(markdown))
  }
}, [bridge, editor, markdown])
```

편집기가 처음 마운트되면 `editor.getMarkdown()`은 직렬화된 안정 형태를 반환하고, `markdown` prop은 원본 파일 문자열을 가집니다. 두 문자열이 다르므로 `setContent`가 호출됩니다.

`setContent` 호출은 `onUpdate`를 트리거하고, `onMarkdownChange`로 안정 형태의 markdown이 내려갑니다.

### 4. blur 시 파일 저장

`serializeBodyFragment`가 trailing newline을 제거하고 note body를 파일에 씁니다.

```ts
const normalized = markdown.replace(/\r\n/g, '\n').replace(/\n+$/g, '')
```

결국 편집기 오픈 → `setContent` → `onUpdate` → 안정 형태 전파 → blur → 파일 저장 순서로 변환이 일어납니다.

### 5. 일회성인 이유

한 번 파일에 안정 형태가 저장되면, 이후 다시 열었을 때 `editor.getMarkdown() === markdown`이 성립하여 `setContent`가 호출되지 않습니다. 따라서 추가 변환은 발생하지 않습니다.

## 영향 범위

- 영향을 받는 패턴: fenced code block 직후 `&nbsp;\n\n&nbsp;` 형태의 빈 단락 구분자
- 현재 `notes/vm.md`의 note-17에 이 패턴이 7개 포함되어 있습니다
- 다른 형태의 note(일반 단락, 리스트, mermaid 등)는 영향받지 않습니다
- 변환은 일회성이며 이후 note의 의미 있는 콘텐츠는 손실되지 않습니다

## 관련 컴포넌트

| 컴포넌트 | 경로 |
|---|---|
| WYSIWYG editor surface | `packages/canvas-app/src/components/editor/wysiwyg-editor-surface.tsx` |
| Markdown bridge | `packages/canvas-app/src/components/editor/wysiwyg-markdown-bridge.tsx` |
| Body serializer | `packages/canvas-app/src/services/edit-compiler-helpers.ts` |
| Paragraph extension | `node_modules/@tiptap/extension-paragraph` |
