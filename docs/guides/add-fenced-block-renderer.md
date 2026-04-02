# 새 Fenced Block 렌더러 추가 가이드

Boardmark의 fenced block 렌더 파이프라인(ADR-001 Option B)에 새 렌더러를 추가하는 절차입니다.

---

## 개요

```
```언어이름
...source...
```
```

위 형식의 fenced code block을 감지해 커스텀 React 컴포넌트로 렌더링할 수 있습니다.
파이프라인은 `markdown-content.tsx`를 건드리지 않고 두 단계만으로 확장됩니다.

```
1. 렌더러 컴포넌트 작성
2. registry.ts 에 한 줄 등록
```

---

## Step 1. 렌더러 컴포넌트 작성

`packages/ui/src/components/` 아래에 컴포넌트 파일을 만듭니다.

**계약: props는 반드시 `{ source: string }` 을 포함해야 합니다.**

```tsx
// packages/ui/src/components/my-renderer.tsx

export type MyRendererProps = {
  source: string
}

export function MyRenderer({ source }: MyRendererProps) {
  // source = fenced block 안의 텍스트 그대로 전달됨
  return <div>{source}</div>
}
```

### source 형식이 JSON인 경우

Sandpack처럼 source가 JSON 페이로드라면 컴포넌트 안에서 직접 파싱합니다.
파싱 실패는 fallback UI로 처리하고 에러를 throw 하지 않습니다.

```tsx
export function MyRenderer({ source }: MyRendererProps) {
  let config: MyConfig

  try {
    config = JSON.parse(source)
  } catch {
    return <MyRendererError source={source} message="JSON 파싱 실패" />
  }

  return <MyRendererView config={config} />
}
```

### 실패 상태 처리

렌더 실패 시 note 전체를 깨뜨리지 않도록 컴포넌트 안에서 복구합니다.
최소한 아래 정보를 보여주어야 합니다.

- 렌더 실패 사실
- 에러 메시지 (가능한 경우)
- 원본 source

---

## Step 2. registry.ts 에 등록

`packages/ui/src/components/fenced-block/registry.ts` 를 열고 한 줄을 추가합니다.

```ts
const registry = {
  mermaid: lazy(() =>
    import('../mermaid-diagram').then((m) => ({ default: m.MermaidDiagram }))
  ),

  // 추가: 언어 이름을 키로, lazy import를 값으로
  my-lang: lazy(() =>
    import('../my-renderer').then((m) => ({ default: m.MyRenderer }))
  ),
}
```

키는 fenced block의 언어 이름과 정확히 일치해야 합니다 (소문자, 대소문자 구분).

---

## 완성 예시

사용자가 아래처럼 작성하면:

````md
```my-lang
{ "hello": "world" }
```
````

`MyRenderer`가 `source = '{ "hello": "world" }'` 를 받아 렌더링됩니다.

---

## 체크리스트

- [ ] 컴포넌트 props가 `{ source: string }` 계약을 따른다
- [ ] 렌더 실패 시 에러를 throw 하지 않고 fallback UI를 반환한다
- [ ] `registry.ts` 에 `React.lazy` 로 등록했다
- [ ] `markdown-content.tsx` 는 수정하지 않았다

---

## 참고

- 파이프라인 설계 결정: [`docs/adr/001-fenced-block-renderer-pipeline.md`](../adr/001-fenced-block-renderer-pipeline.md)
- 기존 구현 예시: [`packages/ui/src/components/mermaid-diagram.tsx`](../../packages/ui/src/components/mermaid-diagram.tsx)
- 레지스트리: [`packages/ui/src/components/fenced-block/registry.ts`](../../packages/ui/src/components/fenced-block/registry.ts)
