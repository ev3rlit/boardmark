# VS Code Webview 코드 하이라이팅과 인라인 코드 색상 불일치

## 요약

VS Code extension에서 Boardmark 문서를 `Open as Canvas`로 열었을 때, fenced code block의 syntax highlighting이 적용되지 않고 plain text처럼 보였습니다. 또한 인라인 코드(`code`) 텍스트 색상이 일반 본문 색과 다르게 보이는 문제가 있었습니다.

이 문제는 VS Code webview의 CSP(Content Security Policy) 환경과 Shiki highlighter의 WASM 기반 runtime 선택, 그리고 인라인 코드 CSS 색상 상속이 겹쳐 발생했습니다.

현재 수정은 적용된 상태입니다.

---

## 증상

### 1. Fenced code block syntax highlighting 미적용

아래와 같은 코드블럭이 VS Code extension webview에서는 색상 토큰 없이 렌더링되었습니다.

```md
```ts
const answer = 42
```
```

예상:

- `const`, identifier, number 등에 Shiki token color가 적용됨
- 기존 web/desktop preview와 유사한 코드블럭 시각 표현

실제:

- 코드블럭 wrapper와 dark background는 보임
- 내부 code text는 거의 단색 plain text로 표시됨

### 2. 인라인 코드 텍스트 색상 불일치

본문 안의 인라인 코드가 VS Code webview에서 주변 본문과 다른 톤으로 보였습니다.

```md
본문 중간의 `inline code` 예시
```

예상:

- 인라인 코드는 배경 pill만 다르고 텍스트는 본문 색 계열을 유지

실제:

- `code` 태그의 텍스트 색이 명시되지 않아 host/webview별 상속 차이가 드러남

---

## 근본 원인 분석

### 1. Shiki highlighter가 WASM 기반 Oniguruma engine을 사용

기존 highlighter는 `createOnigurumaEngine(() => import('shiki/wasm'))`를 사용했습니다.

관련 파일:

- `packages/ui/src/code-highlight/highlighter.ts`

```ts
createHighlighter({
  engine: createOnigurumaEngine(() => import('shiki/wasm')),
  langs: SHIKI_LANGUAGE_IDS,
  themes: SHIKI_THEME_IDS
})
```

이 방식은 Shiki의 TextMate grammar tokenizer가 Oniguruma WASM runtime에 의존합니다. 일반 web/desktop shell에서는 동작할 수 있지만, VS Code webview는 strict CSP를 적용합니다.

VS Code webview에서는 다음 제약이 특히 중요합니다.

- script 실행은 명시적으로 허용된 source/nonce에 제한됨
- 동적 import chunk도 CSP 영향을 받음
- WASM 초기화는 webview CSP와 런타임 정책에 의해 실패할 수 있음

결과적으로 Shiki 초기화 또는 tokenization이 실패하면 `MarkdownContent`는 catch 경로에서 plain result로 fallback합니다.

관련 경로:

- `packages/ui/src/components/markdown-content.tsx`
- `packages/ui/src/code-highlight/adapter.ts`

### 2. VS Code webview CSP가 initial bundle만 허용

기존 CSP는 `script-src 'nonce-...'` 형태였습니다.

관련 파일:

- `apps/vscode/src/extension/webview-html.ts`

이 설정은 HTML에서 직접 로드하는 `assets/index.js`에는 nonce를 붙일 수 있지만, Vite가 만든 dynamic import chunk에는 동일한 nonce가 붙지 않습니다. Shiki language/theme chunk처럼 런타임에 추가 로드되는 script는 webview resource source도 허용해야 합니다.

즉 CSP가 너무 좁으면 highlighter runtime 또는 language/theme chunk 로드가 실패할 수 있습니다.

### 3. 인라인 `code` 색상이 명시되지 않음

기존 CSS는 인라인 `code`의 배경과 padding은 정의했지만 텍스트 색은 정의하지 않았습니다.

관련 파일:

- `packages/canvas-app/src/styles/canvas-app.css`

```css
.markdown-content :where(code) {
  border-radius: var(--markdown-radius-sm);
  background: rgba(43, 52, 55, 0.07);
  padding: var(--markdown-space-2xs) var(--markdown-space-sm);
  font-size: 0.88em;
}
```

이 때문에 VS Code webview 내부에서 주변 스타일이나 host-level cascade에 따라 인라인 코드 텍스트 색이 다르게 보일 수 있었습니다.

---

## 수정 내용

### 1. Shiki engine을 JavaScript regex engine으로 변경

`packages/ui/src/code-highlight/highlighter.ts`

```ts
import { createHighlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

export function getCodeHighlighter(): Promise<CodeHighlighter> {
  highlighterPromise ??= createHighlighter({
    engine: createJavaScriptRegexEngine(),
    langs: SHIKI_LANGUAGE_IDS,
    themes: SHIKI_THEME_IDS
  })

  return highlighterPromise
}
```

이 변경으로 highlighter가 Oniguruma WASM 초기화에 의존하지 않습니다. VS Code webview CSP에서 WASM 권한을 넓히지 않고도 token color를 생성할 수 있습니다.

검증 중 아래 최소 실행으로 JavaScript regex engine이 TypeScript token color를 정상 생성하는 것을 확인했습니다.

```bash
node --input-type=module -e "import { createHighlighter } from 'shiki'; import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'; const h=await createHighlighter({engine:createJavaScriptRegexEngine(), langs:['typescript'], themes:['dark-plus']}); const lines=h.codeToTokensBase('const answer = 42',{lang:'typescript',theme:'dark-plus'}); console.log(lines[0].map(t=>[t.content,t.color]).filter(([c])=>c.trim()).slice(0,4));"
```

결과는 `const`, `answer`, `42` 등에 색상 값이 붙는 형태였습니다.

### 2. VS Code webview CSP에서 dynamic import chunk 허용

`apps/vscode/src/extension/webview-html.ts`

```ts
`script-src ${webview.cspSource} 'nonce-${nonce}'`
```

기존:

```ts
`script-src 'nonce-${nonce}'`
```

변경 후:

- entry bundle은 기존처럼 nonce로 허용
- Vite dynamic import chunk는 `${webview.cspSource}`를 통해 extension resource로 허용

Shiki language/theme chunk 및 다른 lazy chunk가 webview 안에서 로드될 수 있게 됩니다.

### 3. 인라인 code 텍스트 색상 고정

`packages/canvas-app/src/styles/canvas-app.css`

```css
.markdown-content :where(code) {
  border-radius: var(--markdown-radius-sm);
  background: rgba(43, 52, 55, 0.07);
  color: var(--color-on-surface);
  padding: var(--markdown-space-2xs) var(--markdown-space-sm);
  font-size: 0.88em;
}
```

이제 인라인 코드는 host별 상속에 의존하지 않고 Boardmark 본문 색 토큰을 사용합니다.

`pre code`는 아래 규칙으로 계속 코드블럭의 foreground를 상속합니다.

```css
.markdown-content :where(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
}
```

따라서 인라인 코드 수정이 fenced code block 색상 토큰을 덮지 않습니다.

---

## 영향 범위

| 영역 | 영향 |
|---|---|
| `packages/ui/src/code-highlight/highlighter.ts` | 모든 host의 Shiki highlighter engine 변경 |
| `apps/vscode/src/extension/webview-html.ts` | VS Code webview CSP에서 extension resource script chunk 허용 |
| `packages/canvas-app/src/styles/canvas-app.css` | 모든 host의 markdown inline code 텍스트 색상 명시 |

이 변경은 VS Code extension 문제를 해결하기 위한 것이지만, highlighter engine 변경은 shared UI package에 적용됩니다. 따라서 web/desktop에서도 같은 JavaScript regex engine을 사용합니다.

---

## 검증

실행한 검증:

```bash
pnpm vitest run packages/ui/src/code-highlight/adapter.test.ts packages/ui/src/components/markdown-content.test.tsx
pnpm --filter @boardmark/vscode build
```

결과:

- `packages/ui/src/code-highlight/adapter.test.ts`: 통과
- `packages/ui/src/components/markdown-content.test.tsx`: 통과
- `@boardmark/vscode` build: 통과

추가로 이전 extension 관련 테스트도 통과 확인했습니다.

```bash
pnpm vitest run apps/vscode/src/extension/boardmark-document-validation.test.ts apps/vscode/src/shared/protocol.test.ts
```

---

## 수동 확인 방법

반복 테스트 시 watcher를 켭니다.

```bash
pnpm --filter @boardmark/vscode watch
```

Extension Development Host를 열거나 reload합니다.

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --extensionDevelopmentPath="$(pwd)/apps/vscode" \
  /tmp/boardmark-vscode-smoke/smoke.md
```

확인할 markdown 예시:

````md
---
type: canvas
version: 2
---

::: note {"id":"code-test","at":{"x":0,"y":0,"w":520,"h":360}}
본문의 `inline code` 색상 확인.

```ts
const answer = 42
function greet(name: string) {
  return `hello ${name}`
}
```
:::
````

확인 포인트:

- `inline code` 텍스트가 본문 색 계열로 보이는지
- TypeScript fenced block에서 keyword, identifier, number, string 색상이 분리되는지
- webview console에 Shiki initialization 또는 CSP script violation 에러가 없는지

---

## 남은 리스크

### JavaScript regex engine의 grammar 호환성

JavaScript regex engine은 WASM Oniguruma보다 CSP 친화적입니다. 다만 일부 복잡한 TextMate grammar에서 Oniguruma와 완전히 동일하게 동작하지 않을 수 있습니다.

현재 Boardmark가 지원하는 주요 언어(`typescript`, `javascript`, `python`, `go`, `rust`, `json`, `yaml`, `bash` 등) 기준으로는 code highlight adapter 테스트가 유지됩니다.

### VS Code webview 실기기 확인

자동 테스트와 build는 통과했지만, 최종 UX 확인은 Extension Development Host에서 직접 봐야 합니다. 특히 실패 시 webview developer tools console에서 아래를 확인해야 합니다.

- CSP violation
- dynamic import 실패
- Shiki language/theme load 실패
- `MarkdownContent failed to highlight a fenced code block.` 로그

---

## 관련 파일

| 파일 | 역할 |
|---|---|
| `packages/ui/src/code-highlight/highlighter.ts` | Shiki highlighter engine 선택 |
| `packages/ui/src/code-highlight/adapter.ts` | code block highlight 결과 생성 |
| `packages/ui/src/components/markdown-content.tsx` | fenced code block 렌더링 및 plain fallback 처리 |
| `apps/vscode/src/extension/webview-html.ts` | VS Code webview HTML shell 및 CSP |
| `packages/canvas-app/src/styles/canvas-app.css` | markdown code / pre / code block 스타일 |
