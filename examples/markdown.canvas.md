---
type: canvas
version: 2
defaultStyle: boardmark.editorial.soft
viewport:
  x: -160
  y: -120
  zoom: 0.74
---

::: note { id: intro, at: { x: -458, y: -100, w: 360, h: 260 } }

# Markdown Syntax Demo

이 보드는 Boardmark 안에서 마크다운이 어디까지 렌더되는지 한 번에 검토하기 위한 샘플입니다.

- CommonMark 기본 문법
- GFM 확장 문법
- 현재 지원 범위 검토 메모

:::

::: note { id: basics, at: { x: 25, y: -486, w: 430, h: 350 } }
## 기본 블록

### 제목

일반 문단에 **굵게**, *기울임*, `인라인 코드`를 섞을 수 있습니다.

> 인용문은 별도 블록으로 렌더되고, 노트 안에서도 읽기 흐름을 분리합니다.



마지막 줄은 thematic break 아래에 이어지는 일반 문단입니다.
:::

::: note { id: headings, at: { x: 642, y: -849, w: 470, h: 420 } }

## 헤더 레벨

# H1 Heading

## H2 Heading

### H3 Heading

#### H4 Heading

##### H5 Heading

###### H6 Heading

같은 노트 안에서 h1부터 h6까지 모두 렌더되는지 확인하는 영역입니다.

:::

::: note { id: inline, at: { x: 1199, y: -500, w: 430, h: 330 } }
## 인라인 문법과 링크

- 자동 링크: [https://boardmark.dev](https://boardmark.dev)
- 일반 링크: [Boardmark 문서](https://github.com/)
- 참조 링크: [마크다운 가이드](https://www.markdownguide.org/basic-syntax/)
- 이스케이프: `\*literal asterisk\*`
- 줄바꿈 테스트  
같은 문단 안의 hard break
:::

::: note { id: lists, at: { x: -8, y: 93, w: 420, h: 441 } }

## 목록

- 순서 없는 목록
  - 중첩 항목
  - 또 다른 항목
- 순서 있는 목록

1. 첫 번째 단계
2. 두 번째 단계
3. 세 번째 단계

- 정의형 문법은 기본 CommonMark/GFM 범위 밖이라 이 샘플에서는 제외합니다.

:::

::: note { id: code, at: { x: 571, y: 96, w: 432, h: 702 } }
## 코드 블록

```ts
type SupportLevel = "basic" | "gfm";

const syntaxSupport: Record<SupportLevel, string[]> = {
  basic: ["heading", "list", "blockquote"],
  gfm: ["table", "task-list", "footnote"],
};
```




```json
{
  "renderer": "react-markdown",
  "highlight": "rehype-highlight"
}
```
:::

::: note { id: gfm, at: { x: 1183, y: -107, w: 604, h: 718 } }

## GFM 확장과 검토 결과

| 문법       | 예시            | 상태           |
| ---------- | --------------- | -------------- |
| 취소선     | `~~done~~`      | ~~done~~       |
| 체크리스트 | `- [x] shipped` | 아래 목록 참고 |
| 각주       | `문장[^1]`      | 아래 각주 참고 |

- [x] 테이블 렌더링
- [x] 태스크 리스트 렌더링
- [x] 취소선 렌더링
- [x] 자동 링크 렌더링
- [x] 각주 렌더링[^support]
- [ ] raw HTML 렌더링 활성화

raw HTML은 현재 의도적으로 켜지지 않았습니다. `rehype-raw`가 없어서 HTML 태그를 신뢰 실행하지 않습니다.

[^support]: 이번 변경으로 `remark-gfm`을 연결해 GFM 계열 확장을 명시적으로 지원합니다.

:::

::: edge { id: intro-basics, from: intro, to: basics }
기본 문법
:::

::: edge { id: basics-inline, from: basics, to: inline }
인라인 요소
:::

::: edge { id: basics-headings, from: basics, to: headings }
헤더 1-6
:::

::: edge { id: headings-inline, from: headings, to: inline }
링크
:::

::: edge { id: intro-lists, from: intro, to: lists }
목록
:::

::: edge { id: lists-code, from: lists, to: code }
코드
:::

::: edge { id: code-gfm, from: code, to: gfm }
확장 문법
:::
