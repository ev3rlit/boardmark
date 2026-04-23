# 백로그: standalone reader library 책임 경계

## 문제

Boardmark를 별도 라이브러리로 꺼내 블로그나 문서 사이트에 붙일 수 있게 하려면, 어디까지를 라이브러리 책임으로 보고 어디부터를 host 앱 책임으로 둘지 먼저 고정해야 한다.

이 경계가 흐리면 라이브러리는 곧 아래 성격이 한데 섞인다.

- markdown parser
- blog article renderer
- fenced block runtime
- canvas explainer renderer
- file open/save bridge
- editor shell

이렇게 되면 재사용성이 오히려 떨어진다. 블로그에서는 너무 무겁고, Boardmark 앱 입장에서는 host-specific 요구가 공용 패키지 안으로 다시 새어 들어온다.

## 목표

Boardmark 라이브러리를 "새 문서 플랫폼"이 아니라 "문서에 붙는 시각 설명 레이어"로 정의한다.

핵심 문장은 아래 정도로 좁히는 편이 맞다.

- source of truth는 계속 markdown 문서다
- Boardmark 라이브러리는 그 문서를 canvas로 투영해 이해를 돕는다
- host 앱은 블로그 본문, 라우팅, SEO, 저장, 제품 chrome을 계속 소유한다

## 권장 책임 범위

라이브러리가 직접 책임질 범위는 여기까지로 제한한다.

### 1. Boardmark 문법 해석 또는 그에 준하는 입력 계약

- Boardmark source string을 받아 parse할 수 있거나
- 이미 parse된 AST/document contract를 입력으로 받을 수 있어야 한다
- 어떤 방식을 택하든 public contract는 좁고 명시적이어야 한다

즉, parser를 반드시 렌더러에 강제 결합할 필요는 없지만, 최소한 "무슨 입력을 받는가"는 라이브러리 계약 안에 있어야 한다.

### 2. 읽기 전용 canvas projection

- node, edge, viewport를 읽기 전용으로 렌더링한다
- note body markdown을 node 내부에서 렌더링한다
- hover, select, focus, scroll-to-anchor 같은 읽기 경험용 상호작용만 제공한다
- 편집기 수준의 drag/resize/transaction/save는 포함하지 않는다

### 3. 본문과 canvas 사이의 연결 정보

- 특정 note가 어떤 section을 설명하는지
- 어떤 note를 먼저 강조할지
- 본문 스크롤과 canvas highlight를 어떻게 동기화할지

이 연결 정보는 "시각 설명 레이어"의 핵심이므로 라이브러리 계약 안에 들어가는 편이 맞다.

### 4. fenced block 확장 포인트

- Mermaid, code, Sandpack 같은 fenced block을 note body 안에서 읽기 전용으로 렌더링할 수 있어야 한다
- 다만 모든 runtime과 툴링을 라이브러리가 내장할 필요는 없다
- registry, lazy loading contract, fallback contract 정도까지만 공용 책임으로 둔다

## 라이브러리가 책임지지 말아야 할 것

아래는 host 앱 또는 제품 shell이 책임져야 한다.

- 블로그 전체 markdown 렌더링 정책
- 페이지 레이아웃, header, sidebar, CTA, comments
- CMS 모델링, MDX 파이프라인, SEO
- 파일 열기/저장, asset import, 파일 권한 UX
- WYSIWYG 편집기, source editor, command system
- analytics, auth, deployment, product theming

특히 "article 전체를 Boardmark가 대신 렌더링한다"는 방향은 피하는 편이 낫다. 그 순간 라이브러리는 explainer layer가 아니라 blog engine으로 커진다.

## 제품 형태 제안

가장 안전한 공개 surface는 아래 3단계다.

### 1. Canvas-only mode

host가 article markdown를 렌더링하고, Boardmark는 별도 패널이나 inline slot에 canvas만 그린다.

- 장점: 책임 경계가 가장 선명하다
- 장점: 기존 블로그/문서 시스템에 붙이기 쉽다
- 장점: SEO, markdown theme, TOC 같은 기존 host 기능을 건드리지 않는다

### 2. Synced article + canvas mode

라이브러리가 설명용 article surface와 canvas surface를 함께 제공한다.

단, 이 article surface는 "full blog renderer"가 아니라 "Boardmark 설명용 읽기 surface"여야 한다.

- note 클릭 -> article section highlight
- article scroll -> note focus
- explainer overlay / side-by-side layout

이 모드는 가능하지만, 여기가 라이브러리 최대 책임 범위에 가깝다.

### 3. Embedded block mode

블로그 본문 안의 특정 block 하나를 `boardmark` explainer로 렌더링한다.

- 가장 쉽게 도입 가능하다
- 본문 전체를 장악하지 않는다
- "이 단락의 시각 설명 보기" 같은 용도와 잘 맞는다

## 필요한 메타데이터 후보

블로그 설명 보조 장치로 쓰려면 좌표만으로는 부족하다. 최소한 아래 정도의 읽기 메타데이터를 backlog 후보로 본다.

```yaml
anchor: section-message-queue
intent: summary
priority: 10
presentation: sidecar
```

의미는 아래 정도로 제한한다.

- `anchor`: 연결할 본문 section id
- `intent`: summary, flow, warning, comparison 같은 설명 의도
- `priority`: 초기 진입 시 어떤 note를 먼저 강조할지
- `presentation`: inline, sidecar, fullscreen 같은 추천 표현 방식

이 메타는 editor를 위한 것이 아니라 reader experience를 위한 계약이다.

## 패키지 경계 초안

이 백로그를 실제로 진행한다면 아래처럼 나누는 편이 안전하다.

### `@boardmark/core`

- domain type
- parse/validate
- projection contract
- article-anchor metadata contract

### `@boardmark/react`

- React용 읽기 전용 viewer
- canvas-only mode
- synced article + canvas mode
- interaction event surface

### `@boardmark/fenced-blocks`

- fenced block registry interface
- built-in 최소 renderer
- lazy/fallback contract

핵심은 `@boardmark/react`가 `@boardmark/canvas-app`의 편집기 책임을 가져오지 않는 것이다.

## 현재 코드베이스와의 연결

현재 저장소에는 이미 재사용 가능한 조각이 있다.

- `packages/canvas-parser`
- `packages/canvas-repository`
- `packages/canvas-renderer`
- `packages/ui`

반대로 아래는 라이브러리 공개 surface에 그대로 노출하기보다 분리해야 할 가능성이 높다.

- `packages/canvas-app`
- browser/desktop file bridge
- app shell CSS와 command surface

즉, 새 라이브러리는 "없는 것을 새로 만든다"보다 "지금 있는 읽기 경계를 편집기 shell에서 분리한다"에 가깝다.

## 진행 순서 제안

### P0. 책임 경계 고정

- Canvas-only mode를 기본 공개 형태로 고정한다
- synced mode는 optional package surface로 둔다
- full blog renderer는 scope 밖으로 명시한다

### P1. 읽기 전용 viewer 조립

- parser/domain/renderer/ui의 읽기 경로만 모아 최소 viewer를 만든다
- file I/O 없이 `source` 또는 parsed document만 받아 렌더한다

### P2. article-anchor 계약 추가

- note와 article section을 연결하는 metadata를 정의한다
- scroll/focus/highlight event contract를 좁게 고정한다

### P3. fenced block registry 정리

- built-in fenced block renderer와 host-supplied renderer 경계를 정리한다
- lazy loading/fallback을 공용 contract로 올린다

## 열어둘 질문

- parser를 core에 포함할지, optional package로 둘지
- article surface를 정말 라이브러리가 제공할지, host adapter만 둘지
- fenced block renderer를 어디까지 built-in으로 제공할지
- style/theming을 라이브러리가 얼마나 소유할지

## 결론

이 backlog의 방향은 "Boardmark를 독립 제품으로 다시 만드는 것"이 아니다.

대신 아래 방향을 고정해두는 것이 맞다.

- Boardmark 라이브러리는 markdown-native visual explanation layer다
- host 앱은 문서 플랫폼과 제품 경험을 계속 소유한다
- 라이브러리는 읽기 전용 canvas projection과 article-canvas 연결까지만 책임진다
