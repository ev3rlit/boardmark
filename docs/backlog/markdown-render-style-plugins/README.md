# 백로그: 마크다운 렌더 스타일 플러그인

## 문제

현재 공용 마크다운 렌더링은 `react-markdown` 기반 엔진과 스타일 규칙이 사실상 함께 묶여 있다.

- 엔진은 `packages/ui/src/components/markdown-content.tsx`
- 기본 시각 스타일은 `packages/canvas-app/src/styles/canvas-app.css`

이 구조에서는:

- 기본 스타일 하나를 제품 기본값으로 유지하기는 쉽지만
- GitHub 문서풍, editorial, notebook, dense compact 같은 스타일을 갈아끼우기 어렵고
- style만 바꾸고 싶은 요구가 renderer 코드 수정으로 번지기 쉽다
- code block, table, blockquote, image 같은 하위 요소 스타일을 일관되게 교체하기 어렵다

## 아이디어

마크다운 엔진과 렌더 스타일을 분리한다.

- 엔진은 markdown 파싱, GFM 지원, fenced block 처리, 이미지 해석을 담당한다
- 스타일 플러그인은 class 이름, 요소별 component override, code theme, CSS variable 세트를 담당한다
- 앱은 built-in 기본 플러그인 하나를 항상 번들한다
- 문서 또는 노드 단위로 다른 스타일 플러그인을 선택해 덮어쓸 수 있게 한다

## 제안 구조

예상 계약은 아래 정도의 좁은 surface가 적절하다.

```ts
type MarkdownRenderStylePlugin = {
  key: string
  className: string
  codeTheme?: CodeThemeId
  components?: Partial<Components>
}
```

적용 방식:

- `MarkdownContent`는 style plugin을 주입받아 공용 기본 component와 병합한다
- 기본 선택 우선순위는 `node override -> document default -> app default` 로 고정한다
- fenced block registry, image resolver, remark plugin 체인은 공용 엔진이 계속 소유한다

## 왜 이 방향이 맞는가

- 현재 `react-markdown`는 `components` prop으로 요소별 렌더러 교체를 직접 지원한다
- 이미 fenced block path는 registry 기반 확장 구조를 갖고 있어 스타일 플러그인과도 결이 맞다
- 스타일 플러그인을 renderer 코드 전체 교체가 아니라 "의도적으로 좁은 override surface"로 제한할 수 있다
- 이후 post-viewer pack system의 namespace 기반 registry와 연결하기 쉽다

## 후보 라이브러리 조사

### 1. `github-markdown-css`

링크:

- [github-markdown-css repository](https://github.com/sindresorhus/github-markdown-css)

확인한 점:

- `markdown-body` 클래스 기반으로 GitHub 스타일 markdown formatting을 적용한다
- light, dark, dimmed, high contrast, colorblind 계열까지 여러 CSS 파일을 제공한다
- CSS만 가져오면 되므로 "기본 스타일 플러그인"이나 "GitHub 스타일 플러그인" 후보로 가장 단순하다

Boardmark 적합도:

- 높음
- 별도 엔진 교체 없이 class 기반 플러그인으로 바로 붙이기 쉽다
- 다만 Boardmark note/card 내부 밀도에 맞는 spacing 재조정은 추가로 필요할 가능성이 크다

### 2. `@primer/css`

링크:

- [Primer React getting started](https://primer.style/product/getting-started/react/)

확인한 점:

- Primer 문서에서 markdown content에 `markdown-body` 클래스를 감싸 GitHub-style markdown formatting을 적용하라고 안내한다
- base HTML element styling까지 같이 가져올 수 있다

Boardmark 적합도:

- 중상
- GitHub 계열 스타일을 더 체계적으로 가져오고 싶을 때 좋다
- 하지만 `github-markdown-css`보다 범위가 넓어, 현재 note surface에는 다소 무거울 수 있다

### 3. `@tailwindcss/typography`

링크:

- [tailwindlabs/tailwindcss-typography](https://github.com/tailwindlabs/tailwindcss-typography)

확인한 점:

- Tailwind 팀의 공식 typography plugin이다
- markdown 같은 "직접 제어하지 않는 HTML"에 `prose` 클래스로 typographic defaults를 준다
- grayscale modifier, size modifier, dark mode용 `prose-invert`를 제공한다

Boardmark 적합도:

- 중간
- web shell에서 빠르게 스타일 variant를 만드는 데는 유리하다
- 하지만 현재 공용 markdown surface와 canvas note 스타일은 handcrafted CSS 비중이 높아서, core renderer 기본값으로 들이기보다 web 전용 style plugin 후보에 가깝다

### 4. `Shiki`

링크:

- [Shiki dual themes guide](https://shiki.style/guide/dual-themes)
- [Shiki themes](https://shiki.style/themes)

확인한 점:

- light/dark dual theme 뿐 아니라 arbitrary multi-theme 구성을 지원한다
- token 색을 CSS 변수로 출력해 theme 전환과 잘 맞는다

Boardmark 적합도:

- 높음, 단 code block 영역에 한정
- markdown 전체 스타일 라이브러리는 아니지만, 스타일 플러그인마다 `codeTheme`를 바꾸는 계약을 만들 때 가장 자연스럽다
- 현재 code highlight 경로와도 이어지기 쉽다

## 해석

위 조사 기준으로 보면, "마크다운 스타일을 다양하게 바꾸는" 문제는 한 개의 만능 라이브러리보다 아래 조합이 더 현실적이다.

- 전체 markdown body 스타일: `github-markdown-css` 또는 `@primer/css`
- utility 기반 variant 제작: `@tailwindcss/typography`
- code block theme 교체: `Shiki`
- 공용 엔진/override surface: 현재 `react-markdown` 유지

즉, 엔진을 바꾸는 것보다 현재 엔진 위에 style plugin contract를 두고, 플러그인 구현이 위 라이브러리 중 일부를 선택적으로 사용하게 하는 편이 구조적으로 안전하다.

## 추천 초안

1. 1차 구현은 built-in `default` 스타일 플러그인과 `github` 스타일 플러그인만 둔다
2. 플러그인 계약은 `className`, `components`, `codeTheme` 정도로 좁게 시작한다
3. `github` 플러그인은 `github-markdown-css` 또는 Primer 계열 wrapper를 검토한다
4. code block은 Shiki theme 전환을 style plugin 계약에 포함한다
5. remote/local pack 로딩은 나중 단계로 미루고, 먼저 local registry로만 시작한다

## 비고

- `react-markdown` 자체는 스타일 라이브러리는 아니지만, 요소별 override surface를 제공하므로 이 아이디어의 핵심 기반이다
- markdown engine 교체(`markdown-it`, `marked` 등)는 이 backlog의 핵심 문제가 아니다. 현재 문제는 파싱보다 "렌더 스타일 교체"에 가깝다
