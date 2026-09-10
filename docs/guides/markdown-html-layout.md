# 포스트잇 안에 HTML로 가로 배치하기

포스트잇 본문은 마크다운과 HTML을 함께 렌더링합니다. 아래 HTML을 본문에
직접 넣으세요. 코드펜스로 감싸면 배치가 아니라 코드 예시로 표시됩니다.

## 코드 두 개를 나란히 배치

```html
<div style="display: flex; gap: 16px;">
  <div style="flex: 1; min-width: 0;">
    <pre><code>const left = 1 &lt; 2;</code></pre>
  </div>
  <div style="flex: 1; min-width: 0;">
    <pre><code>const right = 2;</code></pre>
  </div>
</div>
```

HTML 코드 안에서는 `<`를 `&lt;`, `&`를 `&amp;`로 작성합니다.
복사 버튼은 원래 코드 문자를 복사합니다. 구문 강조가 필요하면
`<code class="language-typescript">`처럼 언어를 지정할 수 있습니다.

## 이미지 두 개를 나란히 배치

```html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
  <img src="https://example.com/first.png" alt="첫 번째" style="width: 100%; object-fit: contain;">
  <img src="https://example.com/second.png" alt="두 번째" style="width: 100%; object-fit: contain;">
</div>
```

`src`는 실제 이미지 주소나 Boardmark의 `asset:` 참조로 바꾸세요.

## 지원 범위

- 일반적인 본문 HTML 태그와 flex/grid 배치, 간격, 크기, 여백, 정렬 스타일을 지원합니다.
- `grid-template-columns: 1fr 1fr 1fr`로 3열도 작성할 수 있습니다.
- 인라인 스타일은 허용된 레이아웃 속성과 단순 값만 지원합니다. `repeat()`,
  `calc()`, `var()`, `url()`, 위치 지정, 사용자 CSS 클래스 및 `<style>`은 지원하지 않습니다.
  허용되지 않은 선언이 포함되면 해당 `style` 속성 전체가 제거됩니다.
- 스크립트, 이벤트 속성, iframe은 렌더링하지 않습니다.
- HTML 블럭은 편집기에서 HTML 원문으로 수정하며, 편집을 마친 포스트잇에서 배치를 확인합니다.
- HTML 내부의 마크다운 해석은 빈 줄과 태그에 영향을 받으므로, 위 예시처럼
  HTML 태그 안에서는 `<pre><code>`와 `<img>`를 사용하세요.
- 다른 마크다운 뷰어의 HTML·스타일 지원 여부에 따라 표시가 달라질 수 있습니다.

렌더링은 [rehype-raw](https://github.com/rehypejs/rehype-raw)와
[rehype-sanitize](https://github.com/rehypejs/rehype-sanitize)를 사용합니다.
