# ADR-001: Fenced Block Renderer 파이프라인 설계

| 항목 | 내용 |
|------|------|
| 문서 번호 | ADR-001 |
| 상태 | 🟢 결정됨 (Accepted) |
| 작성일 | 2026-04-02 |
| 관련 기능 | Mermaid, Sandpack, Vega-Lite, Graphviz, WaveDrom 등 |
| 관련 파일 | `packages/ui/src/components/markdown-content.tsx` |

---

## 1. 맥락

현재 `MarkdownContent`는 `react-markdown`의 `pre` 컴포넌트 override를 통해 fenced code block을 처리한다.

```
pre 렌더러
  └─ readMermaidSourceFromNode()
       ├─ language === "mermaid" → <MermaidDiagram>
       └─ 그 외 → <pre> (기본)
```

**현재 구조의 문제:**

- `mermaid` 감지 로직이 `markdown-content.tsx`에 직접 하드코딩되어 있다.
- Sandpack, Vega-Lite, Graphviz 등을 추가할 때마다 이 파일을 수정해야 한다.
- 언어 감지 / HAST 순회 / 소스 추출 로직이 단일 함수 안에 섞여 있다.
- 렌더러별 lazy import 전략을 개별 적용할 구조가 없다.

**의사결정이 필요한 시점:**
Sandpack PRD(`docs/features/sandpack/README.md`)가 확정되면 두 번째 확장 렌더러가 생긴다.
이 시점에 파이프라인 구조를 명확히 하지 않으면 세 번째, 네 번째 추가 때마다 임의 분기가 누적된다.

---

## 2. 결정 드라이버

1. **확장성** — 새 렌더러 추가 시 기존 파이프라인 파일을 수정하지 않아야 한다.
2. **지연 로딩** — 렌더러별 번들을 독립적으로 code split 해야 한다.
3. **단순성** — 파이프라인 자체를 이해하는 데 필요한 컨텍스트가 좁아야 한다.
4. **테스트 가능성** — 렌더러와 파이프라인을 독립적으로 테스트할 수 있어야 한다.
5. **타입 안전** — 렌더러 계약이 타입으로 강제되어야 한다.
6. **web / desktop 일관성** — 두 앱에서 같은 렌더러 집합을 같은 방식으로 사용해야 한다.

---

## 3. 검토한 옵션

### Option A — 현재 방식 유지: 언어별 분기 함수 확장

**구조**

```ts
// markdown-content.tsx
pre({ node }) {
  const mermaidSource = readMermaidSourceFromNode(node)
  if (mermaidSource) return <MermaidDiagram source={mermaidSource} />

  const sandpackSource = readSandpackSourceFromNode(node)
  if (sandpackSource) return <SandpackBlock source={sandpackSource} />

  const vegaSource = readVegaSourceFromNode(node)
  if (vegaSource) return <VegaLiteChart source={vegaSource} />

  return <pre>...</pre>
}
```

**장점**
- 추가 설계 없이 지금 바로 확장 가능
- 파악해야 할 파일이 하나

**단점**
- 렌더러 추가마다 `markdown-content.tsx` 수정 필요 (OCP 위반)
- lazy import를 언어별로 개별 관리하기 어려움
- 5개 이상 렌더러가 생기면 파일이 읽기 어려워짐
- 언어 감지 로직이 각 함수에 중복

**적합한 시점**: 렌더러가 2~3개 이하로 고정될 경우

---

### Option B — 언어 → 컴포넌트 정적 레지스트리 (map 기반)

**구조**

```ts
// fenced-block-registry.ts
type FencedBlockRenderer = React.ComponentType<{ source: string }>

const registry: Record<string, FencedBlockRenderer> = {
  mermaid: MermaidDiagram,
  sandpack: SandpackBlock,
  vegalite: VegaLiteChart,
}

// markdown-content.tsx
pre({ node }) {
  const { language, source } = extractFencedBlock(node) ?? {}
  const Renderer = language ? registry[language] : undefined

  if (Renderer && source) return <Renderer source={source} />
  return <pre>...</pre>
}
```

**장점**
- `pre` 렌더러 로직이 언어 중립적으로 단순해짐
- 언어 추가 시 registry 파일 한 곳만 수정
- 계약이 명확 (`{ source: string }` props)

**단점**
- registry가 정적이라 모든 렌더러를 import 시점에 로드함 → 번들 크기 문제
- lazy import를 registry 구성 방식에 직접 반영해야 함 (`React.lazy`)
- 앱 레벨에서 렌더러 집합을 다르게 구성할 수 없음 (web vs desktop)

```ts
// lazy 적용 예시
const registry: Record<string, React.LazyExoticComponent<FencedBlockRenderer>> = {
  mermaid: React.lazy(() => import('./mermaid-diagram')),
  sandpack: React.lazy(() => import('./sandpack-block')),
}
```

**적합한 시점**: 렌더러가 5개 이하이고 앱별 구성 차이가 없는 경우

---

### Option C — rehype 플러그인 체인

**구조**

```ts
// rehype-fenced-block-renderer.ts
function rehypeFencedBlockRenderer(options: { renderers: Record<string, ...> }) {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      // pre > code[language-xxx] 패턴 감지
      // 해당 언어의 렌더러 호출
      // HAST 노드를 교체
    })
  }
}

// markdown-content.tsx
<ReactMarkdown
  rehypePlugins={[
    rehypeHighlight,
    [rehypeFencedBlockRenderer, { renderers: { mermaid: ..., sandpack: ... } }]
  ]}
>
```

**장점**
- remark/rehype 생태계와 완전히 일치하는 설계
- 플러그인 단위로 조합 가능
- ReactMarkdown 바깥에서도 동작 (SSR, 정적 빌드 등)

**단점**
- HAST 조작은 React 렌더러보다 작성 난이도가 높음
- React 컴포넌트를 HAST 트리에 주입하는 방식이 비직관적 (`rehype-react` 패턴 필요)
- 디버깅이 어려움 (트리 변환 시점 추적)
- 현재 팀의 remark/rehype 플러그인 작성 경험이 쌓이지 않은 상태

**적합한 시점**: 서버사이드 렌더링, 정적 빌드, 비-React 환경이 필요한 경우

---

### Option D — React Context 레지스트리 (의존성 역전)

**구조**

```ts
// fenced-block-renderer-context.ts
type FencedBlockRegistry = Record<string, React.ComponentType<{ source: string }>>

const FencedBlockRendererContext = createContext<FencedBlockRegistry>({})

// 사용 측 (apps/web, apps/desktop)
<FencedBlockRendererProvider
  renderers={{
    mermaid: MermaidDiagram,
    sandpack: React.lazy(() => import('./sandpack-block')),
  }}
>
  <MarkdownContent content={...} />
</FencedBlockRendererProvider>

// markdown-content.tsx — 레지스트리를 직접 알지 못함
pre({ node }) {
  const registry = useContext(FencedBlockRendererContext)
  const { language, source } = extractFencedBlock(node) ?? {}
  const Renderer = language ? registry[language] : undefined

  if (Renderer && source) return <Renderer source={source} />
  return <pre>...</pre>
}
```

**장점**
- `MarkdownContent`가 어떤 렌더러가 있는지 모름 → 완전한 OCP 달성
- web / desktop이 서로 다른 렌더러 집합을 독립적으로 구성 가능
- lazy import를 앱 레벨에서 자유롭게 제어
- 렌더러를 테스트할 때 context를 교체하면 됨

**단점**
- Provider를 앱 진입점에 추가해야 함 → 설정이 분산
- Context 없이 `MarkdownContent`만 쓰면 어떤 렌더러도 동작하지 않음 → 기본값 설계 필요
- 렌더러 등록을 까먹었을 때 조용히 code block으로 fallback → 발견이 늦을 수 있음

**적합한 시점**: 앱별로 렌더러 집합이 달라야 하거나, 테스트 격리가 중요한 경우

---

### Option E — 타입드 디스크립터 레지스트리

**구조**

```ts
// fenced-block-renderer.ts
type FencedBlockDescriptor<TOptions = unknown> = {
  language: string
  component: React.LazyExoticComponent<React.ComponentType<{
    source: string
    options?: TOptions
  }>>
  parseOptions?: (source: string) => TOptions  // JSON/YAML 파싱 등
  validate?: (source: string) => boolean
}

// registry
const renderers: FencedBlockDescriptor[] = [
  {
    language: 'mermaid',
    component: React.lazy(() => import('./mermaid-diagram')),
  },
  {
    language: 'sandpack',
    component: React.lazy(() => import('./sandpack-block')),
    parseOptions: (src) => JSON.parse(src),
    validate: (src) => { try { JSON.parse(src); return true } catch { return false } },
  },
]
```

**장점**
- 렌더러별 메타데이터(파싱 방식, 유효성 검사) 포함 가능
- 가장 확장 가능한 계약
- 향후 렌더러 목록 UI, 문서화 자동화 가능

**단점**
- 초기 설계 비용이 가장 높음
- 현재 필요한 것보다 복잡함 (YAGNI)
- 디스크립터 타입 변경 시 모든 렌더러를 함께 수정해야 함

**적합한 시점**: 렌더러가 10개 이상이거나, 서드파티 플러그인 생태계가 필요한 경우

---

## 4. 트레이드오프 비교표

| 기준 | A (분기 확장) | B (정적 레지스트리) | C (rehype 플러그인) | D (Context 레지스트리) | E (타입드 디스크립터) |
|---|:---:|:---:|:---:|:---:|:---:|
| 확장 시 기존 파일 수정 | 항상 | registry만 | 플러그인만 | Provider만 | registry만 |
| 렌더러별 lazy import | 어려움 | 가능 | 어려움 | 자유 | 자유 |
| 파이프라인 이해 난이도 | 낮음 | 낮음 | 높음 | 중간 | 높음 |
| 앱별 렌더러 집합 구분 | 불가 | 불가 | 가능 | 자유 | 자유 |
| 렌더러 단위 테스트 | 중간 | 중간 | 어려움 | 쉬움 | 쉬움 |
| 초기 구현 비용 | 없음 | 낮음 | 높음 | 중간 | 높음 |
| 렌더러 5~10개 시 유지보수 | 나쁨 | 보통 | 좋음 | 좋음 | 좋음 |
| 현재 코드베이스와 친화성 | 높음 | 높음 | 중간 | 높음 | 중간 |

---

## 5. 논의가 필요한 질문들

아래 질문들에 대한 답이 최종 방향을 결정한다.

### Q1. web과 desktop의 렌더러 집합이 달라질 가능성이 있는가?

예를 들어 desktop에서만 로컬 실행 렌더러를 지원하거나, web에서만 sandpack CDN을 허용하는 경우.

- **그렇다** → Option D 또는 E가 필요
- **아니다** → Option B로 충분

### Q2. 렌더러 수가 앞으로 얼마나 늘어날 것으로 예상하는가?

- **5개 이하로 고정** → Option B
- **5~10개** → Option B + D 조합 또는 Option D 단독
- **플러그인 생태계 목표** → Option E

### Q3. 렌더러별 lazy import가 번들 크기에 실질적으로 영향을 주는가?

Mermaid, Sandpack은 모두 무거운 패키지다. 두 패키지가 동시에 로드되는 문서가 드물다면 lazy import 제어권이 중요해진다.

- **중요하다** → Option D (앱 레벨에서 lazy 제어)
- **지금은 중요하지 않다** → Option B (나중에 D로 마이그레이션 가능)

### Q4. `MarkdownContent` 바깥에서도 같은 렌더러를 쓸 필요가 생기는가?

예를 들어 edge label, export renderer, AI 미리보기 등에서 동일한 fenced block 렌더링이 필요해지는 경우.

- **그렇다** → Context(D) 또는 전역 레지스트리 접근이 유리
- **아니다** → 단순 map(B)으로 충분

---

## 6. 결정

**1단계 (현재): Option B — 정적 레지스트리 도입**
**최종 목표: Option D — React Context 레지스트리로 전환**

### 1단계: Option B 구현

**이유:**

- 현재 `readMermaidSourceFromNode`에 있는 HAST 순회 / 언어 추출 / source trim 로직을 언어 중립적인 `extractFencedBlock(node)` 하나로 통합한다.
- `pre` 렌더러가 언어를 모르는 구조가 되어 Sandpack 추가 시 `markdown-content.tsx`를 수정하지 않아도 된다.
- `React.lazy`로 각 렌더러를 감싸면 lazy import도 자연스럽게 해결된다.
- 설계 비용이 낮고 현재 코드베이스와 친화적이다.

**구현 구조:**

```
packages/ui/src/
  components/
    markdown-content.tsx          ← pre 렌더러에서 registry 참조만 함
    fenced-block/
      registry.ts                 ← language → LazyComponent 맵
      extract.ts                  ← extractFencedBlock() (HAST 유틸)
      mermaid-diagram.tsx         ← 기존 컴포넌트 이동
```

### 2단계: Option D 전환 (최종 목표)

Option B의 `registry.ts`를 Context의 defaultValue로 올리면 점진적으로 전환 가능하다.

```
1단계 (B): registry.ts 정적 맵
  ↓
2단계 (D): FencedBlockRendererContext (기본값 = registry.ts)
            + Provider를 apps/web, apps/desktop에 주입
```

**전환 트리거 조건 (아래 중 하나 충족 시):**
- web vs desktop의 렌더러 집합이 달라지는 요구가 생길 때
- 렌더러가 5개를 초과할 때
- 앱 레벨에서 lazy import 제어권이 필요해질 때

---

## 7. 열린 결정

| 번호 | 질문 | 현재 상태 |
|------|------|------|
| D1 | web vs desktop 렌더러 집합이 달라질 가능성 | 미결 |
| D2 | 예상 렌더러 수 (3년 시점) | 미결 |
| D3 | lazy import 제어 우선순위 | 미결 |
| D4 | `MarkdownContent` 외부 재사용 시나리오 | 미결 |
| D5 | Option B → D 마이그레이션 시점 트리거 조건 | 미결 |

---

## 8. 변경 이력

| 날짜 | 변경 내용 | 작성자 |
|------|------|------|
| 2026-04-02 | 초안 작성, 5개 옵션 트레이드오프 정리 | Codex |
| 2026-04-02 | 결정 확정: 1단계 Option B, 최종 목표 Option D | homveloper |
