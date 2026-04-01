# Boardmark Viewer 이후 MVP 구현 계획

## 1. 목적

이 문서는 `docs/canvas-md-prd.md`의 원래 MVP 범위에서, 이미 구현된 viewer MVP를 제외하고 아직 남아 있는 항목만 정리한다.

현재 기준으로 Boardmark는 Electron 기반 단일 viewer foundation과 `.canvas.md` 파서, 템플릿 문서 진입, note/edge 렌더링, pan/zoom, 기본 UI chrome까지 갖추고 있다.

현재 제품 우선순위는 VS Code extension-first지만, 구현 순서는 web에서 계속 실행하고 검증할 수 있도록 web viewer와 pack system을 먼저 마무리하는 것으로 둔다.

남은 MVP의 핵심은 다음 두 가지다.

- 웹과 데스크톱에서 같은 `.canvas.md`를 같은 계약으로 렌더링하는 것
- frontmatter의 `style`, `components`, `preset`을 실제 런타임 동작으로 연결하는 것
- 여러 pack을 배열로 조합하고, namespace 기반으로 안전하게 소비하는 것
- style pack을 semantic token foundation collection용 JSON Schema로 고정하는 것

---

## 2. 남은 범위 고정

### 포함

- 웹 viewer 앱 셸 추가
- 웹/데스크톱 공용 viewer 조립 경로 정리
- URL 기반 style pack 로딩
- style pack 배열 로딩과 병합
- `style` / `preset` 기반 CSS variable 주입
- URL 기반 component pack 로딩
- component pack 배열 로딩과 namespace registry 해석
- `components` / `preset` 기반 노드 렌더 컴포넌트 해석
- frontmatter global default와 node-level override 선택 규칙
- 기본 내장 style / component pack 제공
- remote URL과 local file 기반 pack 접근
- pack metadata의 로컬 캐시
- 오프라인 fallback 정책
- 다중 선택 상태와 최소 상호작용

### 제외

- 양방향 편집
- 노드 드래그 기반 파일 수정
- CodeMirror
- MagicString
- 이미지/임베드/그룹 노드
- 협업, AI 자동 레이아웃
- 테마 레지스트리 서버
- E2E 테스트

---

## 3. 남은 산출물

- 웹 viewer 앱 엔트리
- 공용 viewer composition 계층
- style pack loader
- component pack loader
- preset 해석기
- style pack JSON Schema
- component pack JSON Schema
- namespace registry 해석기
- frontmatter default selector 해석기
- built-in default style pack
- built-in default component pack
- local cache / offline fallback 유틸
- 다중 선택 상태 확장
- 관련 Vitest 단위 테스트와 fixture

---

## 4. 기능 정의

### 4.1 웹 viewer

- `apps/web` 또는 동등한 웹 엔트리를 추가해 `.canvas.md` 문자열을 viewer로 렌더링한다.
- 웹과 데스크톱은 같은 parser, 같은 renderer adapter, 같은 UI 컴포넌트를 공유한다.
- 데스크톱 전용 문서 열기/저장 액션은 web shell에서 제외하거나 no-op wrapper로 분리한다.
- 웹에서는 번들된 샘플 `.canvas.md` 또는 query/file input 기반 진입 중 하나로 최소 viewer 확인 경로를 제공한다.

완료 기준:
- 같은 샘플 `.canvas.md`를 web/desktop에서 열었을 때 note, edge, markdown 렌더 결과가 눈에 띄게 다르지 않다.

### 4.2 Style Pack 로딩

- frontmatter의 `style`은 단일 값뿐 아니라 배열도 허용한다.
- frontmatter의 `style`은 "사용 가능한 style pack source 목록"으로 본다.
- style source는 `https://...` 같은 remote URL과 로컬 파일 경로 둘 다 허용한다.
- 여러 style pack이 들어오면 선언 순서대로 병합하고, 뒤의 pack이 같은 CSS variable을 override한다.
- style pack payload는 JSON Schema로 검증한다.
- style pack은 자유형 CSS가 아니라 semantic token foundation collection을 제공한다.
- 각 style pack은 하나 이상의 foundation과 `defaultFoundation`을 가진다.
- style pack은 특정 컴포넌트 구조를 알지 않는다.
- component pack이 semantic token을 조합해 renderer별 시각 규칙을 만든다.
- `color.object.*`는 오브젝트용 색 계열 팔레트이고, 같은 팔레트 안에서의 강도/분위기 선택은 renderer data의 `tone`이 맡는다.
- metadata에서 semantic token 집합을 읽어 viewer 루트 또는 문서 범위의 CSS variable로 변환해 주입한다.
- `preset`이 존재하면 `style`보다 먼저 preset을 해석해 style source 목록을 얻는다.
- frontmatter는 optional `defaultStyle`을 지정할 수 있다.
- 앱은 항상 기본 내장 style pack 하나를 번들하고, pack이 없거나 모두 실패하면 그 기본 테마로 fallback한다.
- style pack 실패는 viewer 전체 실패로 보지 않고, 기본 번들 테마 또는 직전 성공 cache로 fallback하되 상태에 명시한다.

고정 token 범위:

- `color.*`
- `font.*`
- `space.*`
- `radius.*`
- `shadow.*`
- `color.object.*`
- `color.state.*`

완료 기준:
- `.canvas.md`의 style source 하나 또는 여러 개를 바꾸면 런타임 색상/폰트/간격 토큰이 바뀐다.
- 로컬 파일 기반 style pack도 같은 병합 규칙으로 적용된다.
- style pack이 schema에 맞지 않으면 적용하지 않고 fallback으로 안전하게 열린다.
- 하나의 style pack 안에서 foundation variant를 바꿔도 theme가 바뀐다.
- node-level `styleRef`가 있으면 frontmatter `defaultStyle`보다 우선한다.

### 4.3 Component Pack 로딩

- frontmatter의 `components`는 단일 값뿐 아니라 배열도 허용한다.
- frontmatter의 `components`는 "사용 가능한 component pack source 목록"으로 본다.
- component source는 remote URL과 로컬 파일 경로 둘 다 허용한다.
- component pack payload는 JSON Schema로 검증한다.
- 각 component pack은 namespace를 가진 registry manifest를 제공한다.
- namespace는 `d3.chart`, `company.analytics.chart.bar`처럼 `.` 구분자로 여러 단계 중첩을 허용한다.
- 여러 component pack이 로드되면 namespace 기준으로 registry를 병합하되, 동일 namespace 충돌 규칙은 마지막 선언 우선으로 고정한다.
- 이번 MVP에서는 원격 arbitrary code 실행이 아니라, 검증된 manifest와 로컬 번들 컴포넌트 registry key를 연결하는 방식으로 제한한다.
- `preset`이 존재하면 components source 목록도 같이 해석한다.
- frontmatter는 optional `defaultComponent`를 지정할 수 있다.
- 앱은 항상 기본 내장 component pack 하나를 번들하고, pack이 없거나 실패하면 그 기본 컴포넌트들로 fallback한다.
- 현재 note-only renderer를 유지하되, note renderer는 `namespace` 기반으로 교체 가능한 contract로 바꾼다.
- built-in renderer는 `variant + palette + tone` 조합으로 표현 의도를 넘기고, 실제 색상 값은 style pack token에서 읽는다.
- node가 특정 renderer namespace를 요구할 때, 예를 들어 `d3.chart` 같은 key를 통해 최종 note renderer를 선택할 수 있어야 한다.

완료 기준:
- 같은 note AST라도 component pack/namespace 선택에 따라 렌더 컴포넌트가 바뀐다.
- 로컬 파일 기반 component pack도 같은 namespace 규칙으로 해석된다.
- node-level `renderer`가 있으면 frontmatter `defaultComponent`보다 우선한다.

### 4.4 Pack Source / Namespace 계약

- `style`, `components`, `preset` frontmatter는 string 또는 string array 형태를 허용한다.
- `defaultStyle`, `defaultComponent`는 optional string selector다.
- remote source는 URL로, local source는 절대 경로 또는 앱이 허용한 파일 경로 규칙으로 읽는다.
- pack loader는 source 종류를 `remote` / `local`로 구분해 로드하되, renderer와 store에는 통일된 resolved pack 결과만 전달한다.
- namespace key는 `.`로 분리된 path로 다루고, string 그대로 식별자로 저장한다.
- namespace 탐색은 prefix tree까지는 필요 없고, MVP에서는 flat string registry로 유지한다.
- style/component/preset 모두 schema version을 포함한 JSON document로 다룬다.
- built-in default pack은 고정 namespace를 가진다.
  - style: `boardmark.default`
  - components: `boardmark.default.note`
- style 선택의 최종 식별자는 `packNamespace.foundationKey` 형태를 허용한다.
- 선택 우선순위는 `node override` → `frontmatter global default` → built-in default로 고정한다.

완료 기준:
- pack source가 remote/local 여부와 무관하게 같은 결과 계약으로 해석된다.
- namespace string 하나로 컴포넌트를 충돌 없이 식별할 수 있다.

### 4.5 Cache / Offline Fallback

- style/component/preset fetch 결과를 `localStorage`에 캐시한다.
- 캐시는 source 문자열 기준 key를 사용하고, 마지막 성공 payload와 버전을 저장한다.
- remote source 실패 시 cache가 있으면 그것을 사용하고, 없으면 기본 번들 fallback을 사용한다.
- local file source는 네트워크 fallback 대상이 아니며, 읽기 실패 시 기본 번들 fallback으로 바로 떨어진다.
- fallback 사용 여부는 UI 상태에 노출 가능한 load result로 남긴다.

완료 기준:
- 한 번 성공적으로 불러온 remote pack은 네트워크가 끊겨도 다시 열 수 있다.
- local file pack 경로가 잘못되면 기본 built-in pack으로 계속 열린다.

### 4.6 선택 상태 확장

- 현재 단일 `selectedNodeId`를 `selectedNodeIds` 또는 동등한 집합 상태로 확장한다.
- 기본 동작은 단일 선택 유지, modifier key가 있을 때만 다중 선택을 허용한다.
- React Flow selection과 store selection은 동일한 source of truth를 유지한다.
- 이번 단계에서는 다중 선택의 시각적 하이라이트와 상태 보존까지만 다루고, 그룹 이동/편집은 제외한다.

완료 기준:
- 최소 2개 note를 선택 상태로 유지할 수 있고, highlight가 일관되게 보인다.

---

## 5. 구현 순서

### Phase 1. 공용 viewer 조립 분리

- desktop 의존 UI와 공용 viewer shell을 분리한다.
- parser/store/renderer를 web/desktop 양쪽에서 재사용 가능한 composition으로 정리한다.

완료 기준:
- shell만 바꿔도 같은 viewer core를 두 환경에서 재사용할 수 있다.

### Phase 2. Web Viewer 추가

- 웹 엔트리와 최소 실행 경로를 추가한다.
- 샘플 문서와 viewer 상태 표시를 web에서도 확인 가능하게 한다.

완료 기준:
- 웹 브라우저에서 sample board가 viewer로 열린다.

### Phase 3. Style / Preset Loader

- style pack JSON Schema 정의
- style pack metadata와 foundation 선택 계약 정의
- frontmatter `defaultStyle` 해석 규칙 정의
- style array 병합 규칙 정의
- preset 해석
- CSS variable 주입
- built-in default style pack 연결
- remote/local source loader 추가
- 실패/로딩/캐시 상태 처리

완료 기준:
- 문서 frontmatter만으로 style theme가 바뀌고, 배열 style도 선언 순서대로 병합된다.

### Phase 4. Component Loader

- component pack JSON Schema 정의
- component pack metadata 계약 정의
- frontmatter `defaultComponent` 해석 규칙 정의
- component array 병합 규칙 정의
- namespace registry 계약 정의
- note renderer registry 도입
- preset과 components URL 연결
- built-in default component pack 연결
- remote/local source loader 추가

완료 기준:
- note renderer가 pack과 namespace에 따라 교체된다.

### Phase 5. Cache / Offline

- localStorage cache 추가
- stale/success/fallback 상태 구분
- offline fallback 노출

완료 기준:
- 네트워크 실패 시에도 마지막 성공 pack으로 viewer가 열린다.

### Phase 6. 다중 선택

- store selection 구조 변경
- React Flow selection sync 보강
- 하이라이트/해제 동작 정리

완료 기준:
- 다중 선택이 단위 테스트와 UI 상태에서 안정적으로 동작한다.

### Phase 7. VS Code Extension Shell

- VS Code extension 단계는 별도 feature 문서로 분리한다.
- 이 문서에서는 extension shell 자체를 구현하지 않고, extension이 재사용할 공용 viewer/pack system 기반까지만 다룬다.
- 세부 계획은 `docs/features/extension/vscode-extension-implementation-plan.md`를 따른다.

---

## 6. 테스트 계획

### Vitest

- web viewer shell이 sample `.canvas.md`를 렌더링하는지 확인
- desktop / web이 같은 AST를 같은 node/edge adapter로 소비하는지 확인
- style pack schema 검증 성공 / 실패
- style pack 단일 로드 / 배열 병합 / 실패 / fallback
- `defaultStyle` 적용 / 미적용 / node override 확인
- component pack이 semantic token을 조합해 built-in note renderer 스타일을 만드는지 확인
- preset이 style / components를 올바르게 해석하는지 확인
- component pack schema 검증 성공 / 실패
- component pack 단일 로드 / 배열 병합 / namespace 충돌 처리 확인
- `d3.chart` 같은 namespace가 올바른 renderer로 해석되는지 확인
- `defaultComponent` 적용 / 미적용 / node renderer override 확인
- local file style/component pack 로드 성공 / 실패 확인
- localStorage cache hit / miss / offline fallback
- 다중 선택 상태 추가 / 해제 / 단일 선택 fallback

---

## 7. 리스크와 대응

### 원격 pack 실행 범위

- MVP에서는 arbitrary remote JS 실행을 허용하지 않는다.
- URL은 metadata 해석용으로만 쓰고, 실제 컴포넌트는 로컬 registry key에 매핑한다.

### namespace 충돌

- 여러 component pack이 같은 namespace를 제공하면 마지막 선언 우선으로 고정한다.
- 충돌 결과는 디버깅 가능한 issue/log로 남긴다.

### local file 접근

- local file source는 Electron과 web의 권한 경계가 다르므로 loader를 shell별로 분리한다.
- desktop은 직접 파일 읽기, web은 허용된 입력 경로 또는 제한된 브라우저 파일 핸들 방식으로 범위를 좁힌다.

### web / desktop parity 드리프트

- shell 차이는 분리하되 parser, renderer adapter, markdown renderer, tokens는 공용으로 유지한다.
- parity 검증용 sample fixture를 하나로 고정한다.

### cache 오염

- cache key는 URL과 version 기준으로 분리한다.
- parse 불가능한 payload는 cache에 승격하지 않는다.

### schema 경직성

- token key를 너무 일찍 과도하게 늘리면 pack 제작 비용이 커진다.
- MVP에서는 최소 semantic token 집합만 고정하고, 확장은 schema version으로 관리한다.

### selection 복잡도 증가

- 다중 선택은 highlight와 상태 저장까지만 다루고, 그룹 변형이나 일괄 편집은 다음 단계로 미룬다.

---

## 8. 완료 기준

- 웹과 데스크톱에서 같은 `.canvas.md`가 viewer로 열린다.
- `style`, `components`, `preset` frontmatter가 string과 배열 모두에서 실제 런타임 동작으로 연결된다.
- `defaultStyle`, `defaultComponent`는 optional global default로만 동작한다.
- remote/local source와 built-in default pack이 같은 계약으로 동작한다.
- style/component pack이 JSON Schema로 검증된다.
- namespace 기반 component 선택이 동작한다.
- style/component fetch 실패 시 기본 fallback 또는 cache로 viewer가 계속 열린다.
- 다중 선택이 최소 기능 수준으로 동작한다.
- 남은 MVP 핵심 경로가 Vitest 단위 테스트로 검증된다.
