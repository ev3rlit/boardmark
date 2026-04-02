# Code Highlight PRD

## 1. 목적

이 문서는 Boardmark의 markdown code block 렌더링을 현재의 기본 하이라이트 수준에서, **다양한 언어와 여러 내장 테마를 안정적으로 지원하는 제품 기능**으로 끌어올리기 위한 요구사항을 정리한다.

이번 문서에서 확정하려는 핵심 방향은 아래와 같다.

- fenced code block은 더 넓은 언어 집합을 안정적으로 지원해야 한다.
- 프로그래밍 언어뿐 아니라 `json`, `yaml`, `bash`, `shell`, `console`, `terminal`, `diff`, `sql` 같은 문서형/도구형 언어도 지원해야 한다.
- 코드 하이라이트 테마는 note body 안의 일부 스타일이 아니라, **명시적인 viewer 기능**으로 다뤄야 한다.
- 첫 버전은 **내장 테마 세트**를 제공하고, 기본값은 `VSCode Dark Modern`으로 둔다.
- web / desktop에서 같은 markdown source를 주면 code highlight 결과가 실질적으로 같아야 한다.

이 기능의 목표는 “코드 색칠이 대충 되는 것”이 아니다.  
목표는 **Boardmark 안에서 코드 예제, 설정 파일, 터미널 출력, 데이터 스니펫을 일관된 품질로 읽고 공유할 수 있게 만드는 것**이다.

---

## 2. 현재 상태

현재 Boardmark의 markdown renderer는 `react-markdown + remark-gfm + rehype-highlight` 조합으로 동작한다.

- syntax highlight 엔진은 `rehype-highlight` 기반이다.
- theme CSS는 `highlight.js/styles/github.css`를 전역 import 한다.
- 코드블럭 컨테이너의 배경, radius, padding은 app CSS에서 별도로 덮어쓴다.
- 편집 모드에서는 `textarea`를 사용하므로 preview 상태에서만 syntax highlight가 보인다.
- 즉 편집 진입 시 rendered markdown surface 자체가 사라진다.

이 구조는 간단하고 동작하지만, 아래 한계가 있다.

- 지원 언어 범위와 alias 정책이 제품 수준에서 명시돼 있지 않다.
- theme가 사실상 `github.css`에 고정되어 있다.
- code token 색상과 block container 스타일의 책임이 분리돼 있어 theme 전환 모델이 없다.
- web / desktop / future shell에서 동일한 theme contract를 공유한다는 보장이 약하다.
- rendered code block 위에서 직접 선택, 복사, drag interaction을 다룰 수 없다.

---

## 3. 문제 정의

Boardmark는 markdown-native canvas system을 지향한다.  
따라서 note body 안의 code block은 단순 부가 요소가 아니라, 문서 전달력에 직접 영향을 주는 핵심 surface다.

현재 상태로는 아래 요구를 충분히 만족하지 못한다.

- 사용자가 여러 프로그래밍 언어 예제를 같은 보드에서 읽고 비교하고 싶다.
- 사용자가 `json`, `yaml`, `toml`, `bash`, `terminal`, `diff` 같은 운영 문맥의 블럭도 자연스럽게 보길 원한다.
- 사용자가 다크/라이트 계열 code theme를 문서나 viewer 취향에 맞춰 바꾸고 싶다.
- 제품이 “코드 예제를 보기 좋은 도구”라는 인상을 주려면 VSCode 계열의 익숙한 테마 품질이 필요하다.

즉 이번 기능은 단순 CSS 교체가 아니라, **코드블럭 렌더링 계약을 제품 기능으로 승격하는 작업**이다.

또한 code block interaction을 진짜 제품 경험으로 만들려면, 현재의 preview/edit 분리 UI를 유지한 채로는 충분하지 않다.  
심리스한 markdown editing surface 없이 code block drag, copy, selection과 canvas pan 충돌을 제대로 해결하기 어렵다.

---

## 4. 제품 목표

### 4.1 핵심 목표

- Boardmark는 fenced code block에 대해 더 넓은 언어 집합을 지원해야 한다.
- Boardmark는 기본 내장 code highlight theme를 여러 개 제공해야 한다.
- 기본 theme는 `VSCode Dark Modern`이어야 한다.
- 사용자는 web / desktop에서 같은 문서에 대해 일관된 하이라이트 결과를 봐야 한다.
- theme 선택은 현재 전역 CSS import 한 줄에 숨지 않고, 명시적인 renderer 설정으로 관리돼야 한다.

### 4.2 UX 목표

- 대부분의 코드블럭은 info string만으로 예상 가능한 highlighting을 얻어야 한다.
- 언어가 지정되지 않은 code block도 읽기 가능한 fallback style을 유지해야 한다.
- 긴 코드블럭, 터미널 출력, 설정 파일, diff block이 note 안에서 과도하게 튀지 않아야 한다.
- edge label처럼 좁은 surface에서는 code block이 레이아웃을 깨지 않도록 동작해야 한다.
- code theme는 문서의 다른 style 선택과 독립적으로 동작해야 한다.

### 4.3 호환성 목표

- 기존 markdown 문법과 GFM 렌더링은 유지해야 한다.
- 기존 `.canvas.md` source는 migration 없이 계속 열려야 한다.
- code highlight 기능 추가가 parser contract나 body raw text 보존 규칙을 바꾸면 안 된다.

---

## 5. 비목표

- 이번 단계에서 in-editor rich code editing을 도입하는 것
- note별 custom theme picker UI를 바로 추가하는 것
- arbitrary remote theme CSS를 markdown body 안에서 허용하는 것
- raw HTML 기반 임의 코드 렌더러를 note body에 주입하는 것
- line number, code folding, execution, copy button까지 한 번에 넣는 것

즉 이번 문서는 **preview surface의 code highlight 품질과 설정 모델**에 집중한다.

단, code block 상호작용 UX는 별개로 미뤄둘 수 있는 부가 항목이 아니라 WYSIWYG editing surface와 직접 연결된 문제다.  
따라서 이 문서는 visual highlight 요구사항을 다루고, seamless editing requirement는 `docs/features/wysiwyg/README.md`를 선행 문서로 둔다.

---

## 6. 사용자 시나리오

### 6.1 개발 문서 노트

사용자는 하나의 보드 안에 TypeScript, SQL, Bash 예제를 함께 적고, 각 블럭이 언어에 맞는 syntax color를 보여주길 원한다.

### 6.2 설정 파일 비교

사용자는 `json`, `yaml`, `toml` 설정 예제를 note에 넣고, 키/값/문자열/숫자가 구분되어 읽히길 원한다.

### 6.3 터미널 출력 공유

사용자는 설치 명령, REPL 예시, 로그 스니펫을 `bash`, `shell`, `terminal`, `console` block으로 적고 싶다.

### 6.4 디자인/리서치 보드

사용자는 다크 보드에서 `VSCode Dark Modern` 같은 익숙한 코드 테마를 보고, 밝은 문서 surface에서는 `One Light` 또는 `VSCode Light` 계열을 선택하고 싶다.

---

## 7. 제품 요구사항

### 7.1 언어 지원

첫 버전은 아래 범주의 언어를 지원해야 한다.

- 프로그래밍 언어: `ts`, `tsx`, `js`, `jsx`, `python`, `go`, `rust`, `java`, `kotlin`, `swift`, `c`, `cpp`
- 웹/마크업 언어: `html`, `css`, `scss`, `md`, `xml`
- 설정/데이터 언어: `json`, `jsonc`, `yaml`, `yml`, `toml`, `ini`
- 쉘/도구 언어: `bash`, `sh`, `zsh`, `shell`, `console`, `terminal`, `powershell`
- 문서/변경 표현: `diff`, `patch`, `sql`, `graphql`, `dockerfile`

첫 버전의 정책은 아래와 같다.

- 제품은 “지원 언어 canonical list”를 코드로 가져야 한다.
- alias는 renderer 내부에서 canonical language id로 정규화해야 한다.
- 미지원 언어가 들어오면 에러를 숨기지 말고, **plain code fallback**으로 렌더해야 한다.
- 언어 미지정 fenced block도 plain code block으로 안정적으로 렌더해야 한다.

### 7.2 내장 theme 지원

첫 버전 내장 theme 세트는 아래를 포함해야 한다.

- `vscode-dark-modern` 기본값
- `vscode-light`
- `one-dark`
- `one-light`
- `github-dark`

제품 요구사항은 아래와 같다.

- theme는 문자열 id로 명시할 수 있어야 한다.
- 기본 theme는 app startup 시 명확히 결정되어야 한다.
- web / desktop은 같은 theme id에 대해 같은 시각 결과를 가져야 한다.
- theme 변경이 block container와 token color를 함께 바꿀 수 있어야 한다.

### 7.3 theme 적용 범위

첫 버전에서 theme 적용 범위는 아래 우선순위를 따른다.

1. document frontmatter 전역 code theme
2. app-level default code theme
3. note-level per-block theme override는 비포함

이 결정은 code theme를 문서 source에 저장하고, 같은 `.md` 파일을 다시 열었을 때도 같은 결과를 재현하기 위함이다.

### 7.4 persistence

- code theme 선택 결과는 `.md` 문서의 frontmatter에 저장되어야 한다.
- 사용자가 문서를 다시 열면 마지막으로 저장된 theme가 그대로 복원되어야 한다.
- app-level default theme는 frontmatter에 code theme가 없을 때만 fallback으로 사용한다.

초기 문서 계약 예시:

```yaml
codeTheme: vscode-dark-modern
```

### 7.5 렌더링 일관성

- note markdown preview와 edge markdown preview는 같은 code highlight renderer를 사용해야 한다.
- desktop shell과 web shell은 같은 theme asset과 같은 language mapping을 사용해야 한다.
- screenshot 비교 시 코드 토큰 분류와 block 배경이 눈에 띄게 다르지 않아야 한다.

### 7.6 편집 surface 의존성

- code block drag selection, copy, caret interaction 같은 편집 상호작용은 현재 `textarea` 교체형 편집 UI 위에서 완결할 수 없다고 본다.
- 이 상호작용 요구사항은 seamless WYSIWYG editing surface를 선행 조건으로 둔다.
- 따라서 첫 단계의 code highlight 구현은 preview 품질과 theme/language contract를 우선하고, interaction UX는 WYSIWYG surface 확정 이후 같은 surface에서 다뤄야 한다.

### 7.7 코드블럭 레이아웃

- 코드블럭 최대 높이 제한은 두지 않는다.
- 가로 스크롤은 지원해야 한다.
- 줄바꿈과 내용 표시 방식은 현재 오브젝트 크기 기반 동작을 유지한다.
- 사용자가 의도한 object size 안에서 현재 preview 규칙대로 코드가 보여야 한다.

### 7.8 언어 fallback 정책

- 미지원 언어 또는 오타는 언어 미지정 코드블럭과 동일하게 취급한다.
- 즉 하이라이트 실패를 에러 UI로 노출하지 않고 plain code block fallback으로 렌더한다.

### 7.9 inline code 정책

- inline code는 code theme를 적용하지 않는다.
- inline code는 현재의 문서 typography 규칙 안에서만 스타일링한다.

### 7.10 terminal 계열 정책

- `bash`, `shell`, `console`, `terminal` 계열은 첫 버전에서 같은 스타일 계열로 취급한다.
- terminal 전용 prompt decoration이나 output/command 구분은 첫 버전 범위에 포함하지 않는다.

### 7.11 성능

- 일반 note preview 렌더링에서 code highlight가 눈에 띄는 입력 지연을 만들면 안 된다.
- 같은 문서에서 반복되는 언어/테마 조합은 불필요하게 다시 초기화하지 않아야 한다.
- 큰 보드에서 code block이 많아져도 스크롤과 pan/zoom 체감이 과도하게 나빠지면 안 된다.

### 7.12 접근성과 가독성

- 모든 내장 theme는 일반 텍스트와 키 토큰 간 명도 대비를 확보해야 한다.
- inline code와 fenced block은 서로 다른 역할이 분명해야 한다.
- 선택 상태, 포커스 상태, 스크롤 영역, 링크 텍스트와 code token이 시각적으로 충돌하지 않아야 한다.

---

## 8. 기술 방향

### 8.1 현재 엔진 한계

현재 `rehype-highlight + highlight.js` 조합은 빠르게 붙이기에는 적합하지만, 이번 요구사항에는 아래 한계가 있다.

- theme가 CSS 파일 import 중심이라 제품 수준의 theme registry를 만들기 불편하다.
- VSCode Dark Modern 같은 theme를 1급 개념으로 다루기 어렵다.
- language alias와 theme asset 관리가 renderer contract에 잘 드러나지 않는다.

### 8.2 제안 방향

첫 구현은 **theme와 language를 명시적으로 로드할 수 있는 하이라이트 엔진**으로 정리하는 편이 맞다.

현재 요구사항 기준의 권장안:

- `shiki` 계열 엔진을 검토한다.
- renderer는 `language id`, `theme id`, `highlighted html/token result`를 명시적으로 다룬다.
- `MarkdownContent` 내부에 하이라이트 엔진을 직접 숨기기보다, 공용 `code-highlight` 경계 모듈을 둔다.

이 방향을 택하는 이유는 아래와 같다.

- VSCode 계열 theme와 언어 정의를 더 자연스럽게 다룰 수 있다.
- theme registry, language registry, fallback policy를 제품 계약으로 드러낼 수 있다.
- 이후 document-level theme override나 custom pack 확장으로 갈 때 구조가 덜 막힌다.

### 8.3 권장 모듈 경계

초기 구조 예시는 아래와 같다.

- `packages/ui` 또는 별도 공용 모듈에 code highlight adapter를 둔다.
- adapter는 아래 책임만 가진다.
  - theme id 정규화
  - language id 정규화
  - fallback policy
  - highlighted output 생성
- `MarkdownContent`는 markdown tree에서 fenced code block 렌더 시 adapter 결과를 소비한다.
- app CSS는 theme별 token 색상 정의를 직접 들지 않고, block spacing / radius / overflow 같은 shell 스타일만 담당한다.

핵심은 **theme token과 block chrome 책임을 분리하되, theme 선택은 한 군데서 결정**하는 것이다.

---

## 9. 설정 모델 제안

### 9.1 Theme ID

첫 버전은 아래 theme id를 canonical id로 사용한다.

- `vscode-dark-modern`
- `vscode-light`
- `one-dark`
- `one-light`
- `github-dark`

### 9.2 기본 설정

앱 기본값:

- `defaultCodeTheme = vscode-dark-modern`

향후 확장 가능성:

- app preference 저장
- style pack과의 연결

단, 첫 버전에서는 document frontmatter가 우선이고, app-level default는 fallback 역할만 가진다.

### 9.3 Language Alias 예시

- `ts` -> `typescript`
- `tsx` -> `tsx`
- `js` -> `javascript`
- `sh` -> `bash`
- `shell` -> `bash`
- `terminal` -> `shellsession` 또는 제품이 정한 terminal canonical id
- `yml` -> `yaml`

중요한 점은 alias를 문서 곳곳에서 암묵 처리하지 않고, 한 registry에서 관리하는 것이다.

---

## 10. 구현 단계

### Phase 1. Renderer Contract 정리

- 현재 code block 렌더링 경로를 공용 경계로 분리한다.
- language registry와 theme registry를 정의한다.
- fallback 정책을 테스트 가능한 형태로 고정한다.
- frontmatter의 `codeTheme`를 읽고 적용하는 경로를 정의한다.
- 현재 구현 범위가 preview surface임을 문서와 코드 경계에 명확히 남긴다.

완료 기준:

- code block highlight가 단일 adapter 경계 뒤로 숨는다.
- 문서 frontmatter와 app default의 우선순위가 고정된다.

### Phase 2. Theme 세트 도입

- `VSCode Dark Modern`을 기본 theme로 도입한다.
- `vscode-light`, `one-dark`, `one-light`, `github-dark`를 함께 번들한다.
- web / desktop에서 동일 asset 경로로 로드되게 정리한다.

완료 기준:

- theme id만 바꿔 preview 결과가 즉시 달라진다.
- 기존 GitHub 스타일 hard-code import를 제거하거나 축소할 수 있다.

### Phase 3. Language Coverage 확장

- 지원 언어 canonical list를 구현한다.
- alias 정규화와 plain fallback을 테스트로 고정한다.
- `json`, `yaml`, `bash`, `terminal`, `diff` 등 주요 비프로그래밍 언어까지 검증한다.

완료 기준:

- 주요 문서형/도구형 code block이 예상 가능한 highlight를 제공한다.

### Phase 4. Verification

- markdown preview snapshot 또는 DOM test를 추가한다.
- web / desktop 시각 일치성을 확인한다.
- 큰 보드에서 성능 회귀가 없는지 확인한다.

완료 기준:

- 기능이 renderer regression 없이 안정적으로 유지된다.

---

## 11. 수용 기준

- 사용자가 TypeScript, JSON, YAML, Bash, Diff code block을 note에 넣으면 적절한 syntax color가 적용된다.
- 사용자가 언어를 지정하지 않은 fenced block을 넣어도 block style은 유지되고 내용이 읽힌다.
- 사용자가 미지원 언어나 오타가 있는 info string을 넣어도 언어 미지정 block과 같은 방식으로 렌더된다.
- 기본 theme는 `VSCode Dark Modern`으로 보인다.
- 문서 frontmatter에 저장된 theme가 있으면 그 값을 우선 사용한다.
- 문서 frontmatter에 theme가 없을 때만 앱 기본값 또는 fallback 기본 theme를 사용한다.
- 사용자가 `vscode-light`, `one-dark`, `one-light`, `github-dark`를 선택하고 저장하면 같은 `.md` 문서를 다음 실행에서도 같은 테마로 연다.
- note와 edge label의 markdown preview가 같은 code highlight 결과를 사용한다.
- web과 desktop에서 같은 샘플 문서를 열었을 때 code block의 시각 차이가 크지 않다.
- 코드블럭은 최대 높이 제한 없이 렌더되고, 가로 스크롤을 지원한다.
- inline code는 code theme를 따르지 않는다.

---

## 12. 테스트 요구사항

- `MarkdownContent` 수준 테스트
  - fenced code block이 언어별 class 또는 렌더 결과를 가진다
  - 미지정 언어 fallback이 동작한다
  - 미지원 alias 입력이 plain fallback으로 내려간다
- registry 테스트
  - theme id 정규화
  - language alias 정규화
- frontmatter 설정 테스트
  - 문서에 `codeTheme`가 있으면 해당 theme가 우선 적용된다
  - 문서에 `codeTheme`가 없으면 app default가 적용된다
- integration 테스트
  - note preview와 edge preview가 같은 renderer를 사용한다
  - web shell / desktop shell이 같은 기본 theme를 사용한다

---

## 13. 오픈 이슈

- `terminal` 계열 블럭을 어떤 canonical language id로 고정할지 정해야 한다.
- SSR이 도입되는 future shell에서도 같은 highlighter 초기화 모델이 유지되는지 검토가 필요하다.
- style pack 시스템과 code theme를 장기적으로 연결할지, 별도 viewer preference로 유지할지 결정이 필요하다.
- seamless WYSIWYG surface 위에서 code block selection과 canvas pan 입력 우선순위를 어떻게 정의할지 별도 결정이 필요하다.

---

## 14. 결론

Code Highlight 기능은 단순 CSS 교체 작업이 아니다.  
Boardmark가 markdown-native canvas로서 코드, 설정, 터미널, 데이터 스니펫을 신뢰 가능하게 보여주기 위한 핵심 렌더링 계약이다.

첫 단계에서는 아래를 확정하면 된다.

- 기본 theme는 `VSCode Dark Modern`
- 내장 theme 세트는 `vscode-dark-modern`, `vscode-light`, `one-dark`, `one-light`, `github-dark`
- language registry와 theme registry를 제품 계약으로 둔다
- preview renderer는 명시적인 code highlight adapter 위에 재구성한다

이 기준으로 구현하면 현재의 단순 `highlight.js` theme import 구조를 넘어, Boardmark의 code reading 경험을 제품 수준으로 끌어올릴 수 있다.
