# Sandboxed HTML PRD

## 1. 목적

이 문서는 Boardmark에서 자유로운 HTML을 지원하되, 현재 앱 DOM에 직접 주입하지 않고 **격리된 샌드박스 surface** 안에서 렌더하는 기능 요구사항을 정리한다.

이번 문서에서 확정하려는 핵심 방향은 아래와 같다.

- 임의 HTML은 현재 markdown renderer에 직접 섞지 않는다.
- 자유 HTML은 별도 `iframe sandbox` surface에서만 렌더한다.
- Boardmark 본체와 HTML surface 사이의 통신은 최소한의 message contract로 제한한다.
- markdown note의 raw HTML 허용 대신, 별도 HTML 오브젝트를 도입한다.
- sanitizer 기반 allowlist는 보조 수단일 뿐, 주 방어선으로 삼지 않는다.

이 기능의 목표는 “제한 HTML 몇 개 허용”이 아니다.  
목표는 **사용자가 HTML/CSS/JS를 상대적으로 자유롭게 작성하더라도, Boardmark 본체의 안전성과 안정성을 유지하는 것**이다.

---

## 2. 문제 정의

현재 Boardmark의 markdown 렌더링은 `react-markdown` 기반이고, raw HTML은 활성화하지 않는다.

이 상태는 안전하지만 아래 요구를 만족하지 못한다.

- 사용자가 HTML 자체를 실험용 surface로 쓰고 싶다.
- 문서 안에서 임베드 위젯, 커스텀 UI, 작은 프로토타입을 만들고 싶다.
- 태그 제한 없이 HTML/CSS/JS를 다루고 싶다.

여기서 raw HTML을 곧바로 앱 DOM에 넣는 방식은 아래 문제를 만든다.

- 앱 layout이 문서에 의해 깨질 수 있다.
- 외부 리소스와 링크가 앱 맥락에서 바로 실행될 수 있다.
- sanitizer 정책이 계속 늘어나며 유지 비용이 커진다.
- “어디까지 허용할 것인가”가 제품 정책보다 예외처리 싸움이 되기 쉽다.

따라서 이 기능은 markdown 확장 기능이라기보다, **격리된 실행 surface를 갖는 새 오브젝트 타입**으로 다루는 편이 맞다.

---

## 3. 제품 목표

### 3.1 핵심 목표

- 사용자는 Boardmark 안에서 자유 HTML 오브젝트를 만들 수 있어야 한다.
- HTML 오브젝트는 HTML/CSS/JS를 body에 담아 렌더할 수 있어야 한다.
- HTML 오브젝트는 Boardmark 본체와 격리된 샌드박스 안에서 실행되어야 한다.
- HTML 오브젝트 하나가 깨지거나 무거워도 Boardmark 전체가 같이 망가지지 않아야 한다.
- HTML 오브젝트는 note, shape, edge와 같은 canvas object로 다뤄져야 한다.

### 3.2 보안 목표

- 사용자 HTML은 본체 DOM에 직접 접근할 수 없어야 한다.
- 사용자 HTML은 Boardmark의 local bridge, persistence bridge, preload API에 직접 접근할 수 없어야 한다.
- 사용자 HTML은 부모 창 navigation, popup, form submit 같은 권한을 기본적으로 가지지 않아야 한다.
- 사용자 HTML이 부모 앱 상태를 임의로 읽거나 수정하지 못해야 한다.

### 3.3 저작 목표

- 사용자는 HTML body를 텍스트 파일로 직접 수정할 수 있어야 한다.
- AI 에이전트도 구조를 이해하고 생성하기 쉬운 문서 형태여야 한다.
- 포맷은 `.canvas.md`의 “텍스트 파일이 곧 캔버스” 원칙을 유지해야 한다.

---

## 4. 비목표

- markdown note 안에서 raw HTML을 직접 활성화하는 것
- arbitrary remote site embed를 unrestricted하게 허용하는 것
- 협업용 multi-user sandbox synchronization
- production-grade browser devtools replacement
- HTML surface 내부 state의 영속 저장 API
- 외부 npm 패키지 로더

즉 이번 기능은 “브라우저 전체를 넣는 것”이 아니라, **문서 내 샌드박스 실행면**을 제공하는 것이다.

---

## 5. 사용자 시나리오

### 5.1 프로토타입 카드

사용자는 보드 위에 HTML 오브젝트를 하나 만들고, body에 HTML/CSS/JS를 넣어 작은 interactive prototype을 만든다.

예:

- 미니 차트
- 상태 토글 카드
- 애니메이션 데모
- 커스텀 레이아웃 목업

### 5.2 문서형 데모

사용자는 note 여러 개 사이에 HTML 오브젝트를 끼워 넣어, 설명 note와 실제 실행 예제를 함께 둔다.

### 5.3 AI 생성 워크플로우

에이전트는 `.canvas.md` 안에 HTML 오브젝트를 생성하고, 사용자는 VS Code에서 body를 직접 다듬는다.

---

## 6. 제품 요구사항

### 6.1 새 오브젝트 타입

Boardmark는 HTML surface용 새 오브젝트 타입을 지원해야 한다.

초기 제안:

- directive name: `boardmark.html`

예시:

```md
::: boardmark.html { id: demo, at: { x: 120, y: 80, w: 520, h: 360 } }

```html
<!doctype html>
<html>
  <head>
    <style>
      body {
        margin: 0;
        font-family: sans-serif;
      }
    </style>
  </head>
  <body>
    <button id="toggle">toggle</button>
    <script>
      const button = document.getElementById('toggle')
      button?.addEventListener('click', () => {
        document.body.style.background = '#f4f1ff'
      })
    </script>
  </body>
</html>
```

:::
```

핵심은 body를 markdown prose로 해석하지 않고, **HTML payload text**로 보존하는 것이다.

### 6.2 렌더링 격리

`boardmark.html` 오브젝트는 본체 DOM 안에 직접 HTML을 넣지 않는다.

반드시 아래 규칙을 따른다.

- 내부 렌더링은 `iframe sandbox` 기반이다.
- 부모 앱과 iframe은 다른 실행 경계로 취급한다.
- HTML payload는 iframe의 `srcdoc` 또는 동등한 격리된 document source로 주입한다.

### 6.3 샌드박스 권한

기본 정책은 “최소 권한”이다.

초기 기본안:

- 허용: `allow-scripts`
- 비허용: `allow-same-origin`
- 비허용: `allow-top-navigation`
- 비허용: `allow-popups`
- 비허용: `allow-forms`
- 비허용: `allow-modals`

이 문서의 기본 가정은 아래다.

- 자유 HTML을 지원하려면 script는 필요하다.
- 하지만 부모 앱과 same-origin 관계를 열어주면 경계가 급격히 약해진다.
- 따라서 첫 버전은 `allow-scripts`는 허용하되 `allow-same-origin`은 막는다.

### 6.4 부모-자식 통신

HTML surface가 Boardmark 본체와 통신해야 할 경우, 아래처럼 매우 좁은 브리지만 허용한다.

초기 범위:

- iframe height resize 요청
- 포커스/선택 상태 알림
- 선택적 “open external link” 요청

부모 앱은 iframe 내부 DOM을 직접 읽지 않는다.

### 6.5 저장과 소스 모델

HTML 오브젝트의 body는 기존 `.canvas.md` body와 같은 규칙으로 저장되어야 한다.

- source-of-truth는 계속 `.canvas.md`
- HTML payload도 source patch를 통해 수정
- 저장 경로는 기존 repository / save service를 그대로 사용

즉 HTML surface가 별도 파일이나 별도 DB를 만들면 안 된다.

### 6.6 편집 UX

초기 편집 UX는 VS Code raw editing을 우선한다.

- Boardmark 내부 full HTML editor는 첫 단계에서 필수가 아니다.
- Boardmark 내부에서는 “보기”와 “새로고침” 위주로 시작할 수 있다.
- body 자체 수정은 VS Code 또는 기존 raw source 편집 경로를 전제로 한다.

이 결정은 기능 범위를 좁히기 위함이다.

---

## 7. 포맷 제안

### 7.1 컴포넌트 키

초기 컴포넌트 키:

- `boardmark.html`

### 7.2 body 규칙

body는 fenced `html` block 하나를 권장한다.

예:

```md
::: boardmark.html { id: widget, at: { x: 80, y: 80, w: 480, h: 320 } }

```html
<div id="app"></div>
<script>
  document.getElementById('app').textContent = 'hello'
</script>
```

:::
```

첫 버전 규칙:

- `html` fenced block 하나를 canonical payload로 본다.
- block 바깥의 다른 prose는 허용하지 않거나, 허용하더라도 renderer는 무시한다.
- parser는 body를 raw text로 보존하고, renderer가 fenced block 추출을 담당한다.

이 방식의 장점:

- 사람이 body 타입을 바로 이해할 수 있다.
- AI도 payload 구조를 쉽게 생성할 수 있다.
- 향후 `css`, `js`, `assets` block 분리 확장도 가능하다.

### 7.3 미래 확장

향후에는 아래처럼 multi-block 구조를 지원할 수 있다.

```md
::: boardmark.html { id: widget, at: { x: 80, y: 80, w: 480, h: 320 } }

```html markup
<div id="app"></div>
```

```css styles
body { margin: 0; }
```

```js behavior
document.getElementById('app').textContent = 'hello'
```

:::
```

하지만 첫 단계는 단일 `html` block이 더 단순하다.

---

## 8. 아키텍처 요구사항

### 8.1 렌더 경계

현재 markdown renderer는 `react-markdown` 기반 note body 렌더에만 사용한다.

HTML 오브젝트는 이 경로를 타지 않는다.

즉:

- `note` body: 기존 markdown renderer
- `boardmark.html` body: sandbox iframe renderer

이 경계는 명확해야 한다.

### 8.2 iframe document 생성

renderer는 HTML payload를 iframe 내부 document source로 변환해야 한다.

핵심 요구사항:

- payload 주입은 deterministic해야 한다.
- 부모 앱이 iframe 내부 HTML을 문자열 조합으로 추가 오염시키지 않아야 한다.
- 필요 시 wrapper shell은 최소한으로만 붙인다.

예를 들면:

- viewport normalize
- default margin reset
- CSP meta 주입

이 정도만 허용한다.

### 8.3 CSP

iframe 내부 document는 자체 CSP를 가져야 한다.

초기 제안:

- inline script/style 허용 여부는 정책적으로 명시
- network fetch는 기본 차단 또는 매우 제한
- navigation 관련 정책은 기본 차단

중요한 점은 “샌드박스가 있으니 CSP는 불필요”가 아니라는 것이다.  
샌드박스와 CSP는 서로 다른 층위의 방어다.

### 8.4 resize contract

HTML surface는 content height에 따라 자신의 렌더 높이를 바꾸고 싶을 수 있다.

초기 요구사항:

- iframe 내부는 자신의 preferred height를 postMessage로 부모에게 보낼 수 있다.
- 부모는 해당 메시지를 검증한 뒤 노드 frame 안에서 viewport clipping 또는 resize hint로 반영한다.
- 부모가 무조건 document geometry를 바꾸지는 않는다.

첫 단계에서는 **고정 크기 + 내부 스크롤 허용**이 더 단순하다.
auto-resize는 후속 단계로 미룰 수 있다.

### 8.5 link handling

iframe 내부 링크 클릭은 앱 정책에 따라 처리해야 한다.

초기 정책:

- 기본적으로 top navigation은 막는다.
- 외부 링크를 열고 싶다면 부모에게 “external link open request”를 보낸다.
- 부모는 프로토콜 검증 후 shell-specific 방식으로 연다.

---

## 9. 보안 요구사항

### 9.1 절대 금지

아래는 첫 단계에서 금지한다.

- 본체 DOM 직접 주입
- preload API 직접 노출
- same-origin 상태에서 임의 script 실행
- parent window 직접 접근
- unrestricted popup / navigation / form submit

### 9.2 신뢰 모델

이 기능은 “문서를 신뢰할 수도, 신뢰하지 않을 수도 있다”는 전제를 둔다.

즉:

- 사용자가 직접 만든 문서만 열지 않는다.
- 외부에서 받은 `.canvas.md`도 열 수 있다.
- 따라서 HTML payload는 항상 잠재적으로 hostile하다고 가정해야 한다.

### 9.3 sanitizer의 역할

이 설계에서 sanitizer는 주 방어선이 아니다.

원칙:

- 주 방어선: sandbox iframe + restricted permissions + CSP
- 보조 수단: URL 검증, message validation, optional payload normalization

즉 sanitizer allowlist로 문제를 풀려고 하지 않는다.

---

## 10. UX 요구사항

### 10.1 오브젝트 표시

HTML 오브젝트는 일반 note와 시각적으로 구분되어야 한다.

예:

- 상단 label에 `HTML`
- 실행 surface라는 점이 보이는 프레임
- 로딩 / 실행 실패 상태 메시지

### 10.2 실패 상태

아래 실패는 명시적으로 보여야 한다.

- payload 없음
- `html` fenced block 없음
- iframe 로딩 실패
- sandbox 정책 위반
- renderer timeout

### 10.3 새로고침

사용자는 HTML surface를 재실행할 수 있어야 한다.

최소 UX:

- object context menu 또는 object chrome에 `Reload` 액션 제공

### 10.4 편집 진입

초기 단계에서는 아래 정도면 충분하다.

- 더블클릭: source 편집 진입 대신 “HTML object는 raw source에서 수정” 안내 또는 향후 편집 hook
- context menu: `Reload`, `Open source location` 같은 액션 고려

---

## 11. 구현 범위

### 이번 단계에 포함

- `boardmark.html` 오브젝트 계약 정의
- iframe sandbox renderer 도입
- 기본 권한 정책 정의
- 최소 parent/child message contract 정의
- 에러/로딩 UI
- `.canvas.md` source 저장 경로와 연결

### 이번 단계에서 제외

- full in-app HTML editor
- external asset package management
- npm dependency loader
- multi-file project model
- same-origin sandbox variant
- snapshot testing / export pipeline

---

## 12. 성공 기준

아래가 되면 첫 단계는 성공이다.

1. 사용자가 `boardmark.html` 오브젝트를 문서에 작성할 수 있다.
2. HTML/CSS/JS가 Boardmark 본체와 분리된 surface에서 렌더된다.
3. HTML surface가 실패해도 Boardmark 전체는 계속 동작한다.
4. dirty/save/open 흐름은 기존 `.canvas.md` 기반 경로를 그대로 사용한다.
5. 외부 문서를 열어도 본체 DOM 직접 주입은 일어나지 않는다.

---

## 13. 열린 질문

### 13.1 `allow-same-origin`이 정말 필요한가

첫 버전은 없이 가는 것이 안전하다.
다만 특정 라이브러리나 richer API가 필요해질 경우 다시 검토할 수 있다.

### 13.2 network access 정책

HTML surface 내부 fetch를 기본 차단할지, 일부 허용할지 정책 결정이 필요하다.

### 13.3 inline script 허용 여부

자유 HTML의 가치 때문에 허용 요구가 강할 수 있다.
허용하되 sandbox + CSP로 경계를 유지하는 쪽이 유력하다.

### 13.4 note 내부 HTML과의 관계

초기 정책은 명확하다.

- note markdown renderer에는 raw HTML을 넣지 않는다.
- 자유 HTML은 `boardmark.html` 오브젝트로만 다룬다.

이 경계가 제품 이해와 보안 모두에 유리하다.

---

## 14. 제안 결론

자유 HTML 지원은 markdown 확장으로 푸는 문제보다, **격리된 HTML 오브젝트를 도입하는 문제**로 정의하는 것이 맞다.

즉 첫 구현 단위는 아래로 고정한다.

- `boardmark.html` 오브젝트 도입
- `iframe sandbox` 기반 renderer
- 최소 권한 정책
- 좁은 message bridge
- 기존 source/save pipeline 재사용

이 방향이 Boardmark의 텍스트 기반 문서 모델을 유지하면서도, 자유 HTML의 도입 의미를 가장 잘 살린다.
