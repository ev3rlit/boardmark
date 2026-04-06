# React `LazyExoticComponent` Reference

## 1. 목적

이 문서는 React의 `LazyExoticComponent`가 무엇인지, 왜 존재하는지, 그리고 Boardmark에서 fenced block registry 같은 곳에서 왜 보이는지를 설명하는 학습용 참고 문서다.

특히 아래 세 가지를 빠르게 이해하는 것이 목표다.

1. `LazyExoticComponent`가 정확히 무엇인지 안다.
2. `React.lazy(...)`와 어떤 관계인지 안다.
3. 이 타입을 코드에서 언제 직접 다루고, 언제 감추는 편이 좋은지 안다.

## 2. 한 줄 정의

`LazyExoticComponent<T>`는 **지금 바로 렌더러 구현을 들고 있지 않고, 나중에 import해서 렌더할 React 컴포넌트 타입**이다.

보통 직접 생성하지 않고, `React.lazy(...)`가 반환한다.

```ts
const MermaidDiagram = React.lazy(() => import('./mermaid-diagram'))
```

위 `MermaidDiagram` 변수의 타입이 대략 `LazyExoticComponent<...>`다.

## 3. 왜 이름이 이렇게 생겼나

이 이름은 React 타입 시스템 관점 이름이다.

- `Lazy`: 지연 로딩된다
- `Component`: 최종적으로는 React 컴포넌트처럼 렌더된다
- `Exotic`: 일반 함수 컴포넌트와는 다른 특별 취급 wrapper 타입이다

여기서 `exotic`은 "이상하다"는 뜻보다 "React가 특별히 감싸는 컴포넌트 타입" 정도로 이해하면 충분하다.

대표적으로 아래가 모두 React 타입 시스템에서 exotic component 계열이다.

- `memo(...)`
- `forwardRef(...)`
- `lazy(...)`

즉 일반 함수 컴포넌트와 완전히 같은 타입은 아니다.

## 4. 일반 컴포넌트와 무엇이 다른가

일반 컴포넌트는 이미 메모리에 구현이 있다.

```ts
function MermaidDiagram(props: MermaidDiagramProps) {
  return <figure />
}
```

반면 lazy 컴포넌트는 "이 모듈을 나중에 불러오면 이 컴포넌트가 생긴다"는 예약된 참조에 가깝다.

```ts
const MermaidDiagram = React.lazy(() =>
  import('./mermaid-diagram').then((m) => ({ default: m.MermaidDiagram }))
)
```

그래서 lazy 컴포넌트는 그대로 렌더할 수는 있지만, 실제 사용 시 `Suspense` 경계가 필요하다.

```tsx
<Suspense fallback={null}>
  <MermaidDiagram source={source} />
</Suspense>
```

Boardmark의 [`packages/ui/src/components/markdown-content.tsx`](/Users/danghamo/Documents/gituhb/boardmark/packages/ui/src/components/markdown-content.tsx) 도 이 패턴을 사용한다.

## 5. Boardmark에서 왜 쓰이나

현재 Boardmark는 fenced block 언어별 렌더러를 registry에서 lazy import한다.

예:

```ts
const registry = {
  mermaid: lazy(() =>
    import('../mermaid-diagram').then((m) => ({ default: m.MermaidDiagram }))
  ),
  sandpack: lazy(() =>
    import('../sandpack-block').then((m) => ({ default: m.SandpackBlock }))
  ),
}
```

이 구조의 목적은 단순하다.

- `mermaid` block이 없으면 Mermaid 번들을 당장 로드하지 않는다
- `sandpack` block이 없으면 Sandpack 번들을 당장 로드하지 않는다
- 공용 markdown renderer는 언어만 보고 필요한 렌더러를 나중에 불러온다

즉 `LazyExoticComponent`는 "레지스트리에서 컴포넌트를 보관하지만, 실제 구현은 나중에 로드한다"는 요구와 잘 맞는다.

## 6. 왜 `ComponentType`가 아니라 `LazyExoticComponent`가 되나

`ComponentType<{ source: string }>`는 이미 준비된 일반 컴포넌트 타입을 말한다.

하지만 `lazy(...)`의 반환값은 그보다 더 구체적인 wrapper 타입이다.

즉 아래 둘은 비슷해 보이지만 다르다.

```ts
type FencedBlockRenderer = React.ComponentType<{ source: string }>
```

```ts
const MermaidDiagram = React.lazy(...)
```

앞은 "렌더 가능한 컴포넌트의 계약"이고, 뒤는 "lazy wrapper가 감싼 컴포넌트 값"이다.

그래서 registry 값을 정확하게 적으려면 `LazyExoticComponent<...>`가 나타난다.

## 7. 코드에서 꼭 이 타입을 직접 써야 하나

대부분은 아니다.

실무에서는 보통 아래 세 층을 구분하면 충분하다.

### 7.1 컴포넌트 계약

```ts
type FencedBlockRenderer = React.ComponentType<{ source: string }>
```

이 타입은 "이 렌더러가 어떤 props를 받는가"를 설명한다.

### 7.2 lazy 값

```ts
const MermaidRenderer = lazy(...)
```

이 값의 실제 타입은 `LazyExoticComponent<...>`다.

### 7.3 registry surface

registry를 외부에 노출할 때는 꼭 `LazyExoticComponent`를 API 표면에 드러낼 필요가 없다.

예를 들어 아래 둘 다 가능하다.

```ts
type FencedBlockLazyRenderer = React.LazyExoticComponent<FencedBlockRenderer>
```
```ts
type FencedBlockLazyRenderer = ReturnType<typeof lazy<FencedBlockRenderer>>
```

Boardmark는 현재 두 번째에 가까운 형태를 사용한다. 이 방식은 import 타입 이름을 직접 늘리지 않아도 된다는 장점이 있다.

## 8. 언제 직접 알면 좋고, 언제 감추는 게 좋나

직접 알아야 할 때:

- registry가 lazy 컴포넌트를 보관할 때
- `Suspense` 경계를 왜 두는지 이해해야 할 때
- code splitting 문제를 디버깅할 때

감추는 게 좋은 때:

- 대부분의 feature 컴포넌트 props 계약을 설명할 때
- public API surface를 단순하게 유지하고 싶을 때
- "이건 lazy인지 아닌지"보다 "이 컴포넌트가 무엇을 받는지"가 더 중요할 때

즉 학습용으로는 알아두는 편이 좋지만, 도메인 계약에 불필요하게 퍼뜨릴 필요는 없다.

## 9. 흔한 오해

### 오해 1. lazy 컴포넌트는 일반 컴포넌트와 완전히 같다

렌더 사용감은 비슷하지만 타입과 로딩 타이밍은 다르다. `Suspense` 없이 안전하게 쓰는 일반 컴포넌트와는 성격이 다르다.

### 오해 2. `LazyExoticComponent`를 보면 복잡한 추상화가 필요하다

그렇지 않다. 대부분은 `lazy(...)`를 registry 한 군데에서만 쓰고, 나머지 코드는 그냥 컴포넌트를 렌더하면 된다.

### 오해 3. public interface도 lazy 타입이어야 한다

꼭 그렇지 않다. public surface는 `ComponentType`나 더 좁은 도메인 계약으로 감추고, 내부 구현에서만 lazy 타입을 다루는 편이 더 단순할 때가 많다.

## 10. Boardmark에서의 실전 해석

현재 [`packages/ui/src/components/fenced-block/registry.ts`](/Users/danghamo/Documents/gituhb/boardmark/packages/ui/src/components/fenced-block/registry.ts) 를 보면 registry 값이 lazy renderer다.

이 코드를 읽을 때 핵심 해석은 아래면 충분하다.

- registry는 컴포넌트 구현체를 바로 import하지 않는다
- 필요한 fenced block이 나타날 때만 해당 renderer chunk를 읽는다
- 그래서 registry 값 타입이 일반 컴포넌트보다 한 단계 감싼 `LazyExoticComponent`가 된다

즉 이 타입은 "추상화 설계의 중심"이라기보다, "지연 로딩된 React 컴포넌트 값"이라는 구현 디테일을 설명하는 이름에 가깝다.

## 11. 추천 실무 규칙

Boardmark 같은 코드베이스에서는 아래 정도가 실용적이다.

1. 렌더러 props 계약은 `ComponentType<Props>` 수준에서 생각한다.
2. lazy import가 필요한 registry 내부에서만 `LazyExoticComponent`를 의식한다.
3. `Suspense` 경계는 lazy renderer를 소비하는 공통 surface에 둔다.
4. 도메인 계약과 제품 설계 문서에서는 가능하면 "lazy 타입"보다 "renderer contract"를 먼저 설명한다.

## 12. 한 줄 결론

`LazyExoticComponent`는 React가 `lazy(...)`로 만든 지연 로딩 컴포넌트의 타입이다. Boardmark에서는 fenced block renderer registry의 code splitting을 위해 자연스럽게 등장하지만, 대부분의 설계 논의에서는 이것 자체보다 "renderer contract와 loading boundary를 어디 둘 것인가"가 더 중요하다.
