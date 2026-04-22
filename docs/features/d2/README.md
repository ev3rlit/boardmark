# Feature Design: D2 Diagram Block

**Interface and Code Design Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-22 |
| 상태 | 초안 |
| 작성자 | Claude |
| 범위 | 인터페이스 · 모듈 · 의존성 설계만 다룬다. 제품 PRD(시나리오, rollout, risk)는 별도 문서로 분리한다. |

---

## 1. 설계 목표

D2 fenced code block을 mermaid와 동일한 fenced-block 레지스트리 위에 평행하게 얹는다. 새로운 추상 계층을 만들지 않고, 기존 `MarkdownContent → registry → lazy renderer` 흐름을 그대로 재사용한다.

설계상의 비기능 목표:

- D2 통합이 mermaid 통합 모듈을 건드리지 않는다.
- D2 통합이 markdown renderer 본체와 fenced-block registry contract를 변경하지 않는다(레지스트리에 한 항목 추가 외).
- D2 라이브러리 직접 의존은 단일 모듈로 격리한다.

---

## 2. 모듈 레이아웃

```
packages/ui/src/
├── lib/
│   ├── mermaid-renderer.ts          (기존)
│   └── d2-renderer.ts               (신규)
└── components/
    ├── mermaid-diagram.tsx          (기존)
    ├── d2-diagram.tsx               (신규)
    └── fenced-block/
        └── registry.ts              (수정: d2 항목 한 줄 추가)
```

추가 모듈은 두 개, 수정 모듈은 한 개다. 그 외 모든 파일은 변경 대상이 아니다.

### 2.1 모듈 책임 분리

| 모듈 | 책임 | 비책임 |
|------|------|--------|
| `lib/d2-renderer.ts` | D2 source → SVG 변환, D2 엔진 lazy init, 보수적 기본 config 보유 | React, 상태 관리, DOM 접근 |
| `components/d2-diagram.tsx` | 렌더 라이프사이클, 3-상태 UI, accessibility, error fallback | D2 라이브러리 직접 import, config 결정 |
| `components/fenced-block/registry.ts` | language → renderer 매핑 | 어떤 라이브러리도 직접 import하지 않음 (lazy) |

이 분리는 RULE.md의 "함수, 타입, 모듈은 한 가지 책임만 가진다" 원칙을 반영한다.

---

## 3. Public Surface

### 3.1 `lib/d2-renderer.ts`

mermaid-renderer.ts와 동일한 모양의 좁은 surface를 노출한다.

```ts
export type D2RenderResult = {
  svg: string
}

export async function renderD2Diagram(
  source: string,
  id: string
): Promise<D2RenderResult>
```

규칙:

- 입력은 D2 source 문자열과 React `useId` 기반 diagram id. options object를 만들지 않는다(인자가 적고 의미가 분명할 때 options object를 강제하지 말라는 RULE.md 원칙을 따름).
- 반환은 SVG 문자열을 가진 구체 타입. interface로 추상화하지 않는다(단일 구현체).
- 실패는 throw로만 드러낸다. 성공처럼 보이는 fallback이나 빈 SVG 반환을 금지한다.
- `id`는 호출부 책임이며, renderer는 id 충돌이나 unique 보장을 책임지지 않는다.

### 3.2 `components/d2-diagram.tsx`

```ts
export type D2DiagramProps = {
  source: string
}

export function D2Diagram({ source }: D2DiagramProps): JSX.Element
```

규칙:

- public props는 `source` 하나로 시작한다. theme, options, callback 등을 미리 받지 않는다.
- 컴포넌트는 D2 라이브러리를 직접 import하지 않는다. 항상 `lib/d2-renderer.ts`를 경유한다.
- 컴포넌트는 자신의 SVG markup을 직접 만들지 않는다. renderer가 돌려준 SVG 문자열만 사용한다.

### 3.3 `components/fenced-block/registry.ts` 변경

추가는 한 항목이다.

```ts
const registry: Record<string, FencedBlockDescriptor> = {
  mermaid: { ... },
  sandpack: { ... },
  d2: {
    renderer: lazy(() =>
      import('../d2-diagram').then((m) => ({ default: m.D2Diagram }))
    )
  }
}
```

`imageExportKind` 부여 여부는 §8.1 open question으로 유지한다.

---

## 4. 상태 모델

`D2Diagram` 내부 상태는 mermaid와 동일한 모양의 discriminated union으로 정의한다.

```ts
type D2DiagramState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string }
```

근거:

- RULE.md "여러 boolean보다 discriminated union을 우선한다"를 그대로 따름.
- `loading + ready + error`를 boolean 두 개로 표현하면 `loading && ready` 같은 무효 상태가 생긴다.
- 새 상태(예: `cancelled`, `stale`)를 도입할 필요가 생기면 union 한 줄로 확장 가능하다.

---

## 5. Loader 패턴

D2 엔진은 모듈 스코프 promise singleton으로 lazy init한다. mermaid-renderer.ts의 `loadMermaid`와 같은 모양을 유지한다.

```ts
let d2Promise: Promise<D2EngineHandle> | null = null

async function loadD2(): Promise<D2EngineHandle> {
  if (!d2Promise) {
    d2Promise = initD2Engine()
      .catch((error) => {
        d2Promise = null
        throw error
      })
  }
  return d2Promise
}
```

규칙:

- 첫 호출만 실제 init을 트리거한다.
- init 실패 시 promise를 비워 다음 호출에서 재시도가 가능하도록 한다(stuck-promise 방지).
- 모듈 스코프 singleton이지만, 외부에는 노출하지 않는다(`export`하지 않음).

`D2EngineHandle`은 D2 라이브러리 모양에 맞춰 정의하되, 외부에 export하지 않는다(internal type). 라이브러리 교체가 필요해지면 이 타입만 바뀐다.

---

## 6. Failure Contract

mermaid와 동일한 실패 표시 contract를 따른다.

| 단계 | 동작 |
|------|------|
| renderer throw | component가 catch하여 `{ status: 'error', message }`로 반영 |
| 메시지 정규화 | `Error.message → string → fallback message` 순으로 단일 문자열 화 |
| UI 표시 | 오류 fact, 메시지, 원본 source를 모두 노출 |
| markdown tree 영향 | 인접 markdown은 정상 렌더링되어야 한다 (격리) |

원본 source를 항상 노출하는 이유는 RULE.md "실패는 명시적으로 드러낸다 / 로그만 남기고 삼키는 에러를 피한다"의 직접 반영이다.

---

## 7. 의존성 방향

```
fenced-block/registry.ts
        │ (lazy import)
        ▼
components/d2-diagram.tsx
        │ (direct import)
        ▼
lib/d2-renderer.ts
        │ (dynamic import)
        ▼
external D2 library
```

규칙:

- 화살표는 단방향이며 역방향 import를 금지한다.
- registry는 lazy import만 사용해 D2 라이브러리가 markdown 본체 bundle에 포함되지 않게 한다.
- 외부 D2 라이브러리는 `lib/d2-renderer.ts` 한 곳에서만 import한다.
- `d2-diagram.tsx`는 D2 라이브러리 type을 직접 참조하지 않는다(우리 `D2RenderResult`만 참조).

이 방향은 RULE.md "의존성은 생성 시점, 팩토리, 함수 인자로 명시적으로 드러낸다 / import만으로 이어지는 결합을 피한다"의 반영이다.

---

## 8. Open Design Decisions

설계 확정 전에 결정이 필요한 항목이다.

### 8.1 Image Export Kind 도입 여부

`FencedBlockImageExportKind`는 현재 `'mermaid'` 단일 값이다. D2도 SVG를 만든다는 점에서 export 대상이 될 수 있다.

선택지:

- (A) v1에서 `'d2'`를 추가하고 image export pipeline까지 평행하게 지원.
- (B) v1은 export 미지원으로 두고 (즉 registry에 `imageExportKind` 부재), 후속에서 도입.

추천: **(B)**. export pipeline이 mermaid SVG 가정에 맞춰져 있을 가능성이 있고, 첫 도입의 변경 범위를 좁히기 위함이다. 결정은 `image-export.ts` 검토 후 확정한다.

### 8.2 D2 엔진 도입 형태

D2 표준 엔진은 Go 기반이라 브라우저에서는 WASM 빌드가 필요하다. 검증 항목:

- terrastruct 공식 WASM/JS 배포 패키지 존재 여부와 라이선스
- WASM 초기 init 비용과 번들 크기
- mermaid와 같은 `module.default.render(id, source)` 형태가 가능한지, 아니면 wrapper 함수가 필요한지

이 결과에 따라 `lib/d2-renderer.ts`의 `loadD2` 내부 init 코드만 달라진다. 외부 surface는 변하지 않는다.

### 8.3 Theme/Config 위치

mermaid-renderer.ts는 `BOARDMARK_MERMAID_CONFIG`를 같은 파일 안에 모듈 상수로 둔다. D2도 동일하게 모듈 상수로 시작한다.

확장 시 결정 항목:

- 테마 토큰(폰트, 색상)이 mermaid와 D2 양쪽에서 반복되면 `lib/diagram-theme-tokens.ts`로 공통 추출.
- 단, 추출은 RULE.md "추상화는 현재 비용을 줄일 때만 도입한다" 원칙에 따라 **두 번째 사용처가 생긴 시점**에 한다. 첫 도입 시점에는 inline 상수로 둔다.

### 8.4 Registry 진화 트리거

ADR-001은 정적 registry를 Option D(React Context registry)로 전환하는 트리거 중 하나로 "렌더러 5개 초과"를 명시한다.

D2 추가 후 등록 렌더러는 3개다. 정적 registry를 유지하되, 다음 렌더러 추가(=4개) 시 ADR-001 재평가를 함께 수행한다.

---

## 9. 변경 영향 요약

| 파일 | 변경 종류 | 변경 라인 규모 |
|------|-----------|----------------|
| `packages/ui/src/lib/d2-renderer.ts` | 신규 | mermaid-renderer.ts와 유사 (~60-90 lines) |
| `packages/ui/src/components/d2-diagram.tsx` | 신규 | mermaid-diagram.tsx와 유사 (~150-180 lines) |
| `packages/ui/src/components/fenced-block/registry.ts` | 수정 | +5 lines |
| `packages/ui/src/lib/d2-renderer.test.ts` | 신규 | mermaid-renderer.test.ts와 유사 |
| `packages/ui/src/components/d2-diagram.test.tsx` | 신규 | mermaid-diagram.test.tsx와 유사 |
| `package.json` | 수정 | D2 의존성 1줄 추가 |

`MarkdownContent`, fenced-block extract 모듈, image export 모듈, 다른 모든 컴포넌트는 변경 대상이 아니다.

---

## 10. Related Documents

- `RULE.md`
- `docs/features/mermaid/README.md`
- `docs/adr/` (ADR-001 — fenced-block registry 전환 트리거)
- `packages/ui/src/components/fenced-block/registry.ts`
- `packages/ui/src/lib/mermaid-renderer.ts`
- `packages/ui/src/components/mermaid-diagram.tsx`
