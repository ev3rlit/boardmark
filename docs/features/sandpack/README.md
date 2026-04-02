# PRD: Sandpack Live Component Preview
**Product Requirements Document**

| 항목 | 내용 |
|------|------|
| 문서 버전 | v0.1 (Draft) |
| 작성일 | 2026-04-02 |
| 상태 | 초안 |
| 작성자 | Codex |

---

## 1. Overview

### 1.1 Problem Statement

현재 Boardmark에서 UI 컴포넌트(shadcn/ui, Radix, 사용자 컴포넌트 등)를 문서 안에서 실제로 실행해볼 방법이 없다.

이 상태는 아래 문제를 만든다.

- 디자인 리뷰, 컴포넌트 변형 비교, 인터랙션 확인을 Boardmark 바깥(Storybook, CodeSandbox, 별도 브라우저 탭)에서 해야 한다.
- 캔버스 위에 컴포넌트 스크린샷이나 이미지를 붙이면 실제 동작과 차이가 생기고 수정성이 떨어진다.
- AI가 컴포넌트 코드를 생성해도 사용자가 즉시 실행 결과를 확인할 수 없다.
- 문서와 실행 결과가 분리되어 있어 설계·검토 흐름이 끊긴다.

즉 지금 빠져 있는 것은 "새 파일 포맷"이 아니라, **markdown 안에서 실제로 동작하는 컴포넌트 미리보기를 인라인으로 제공하는 것**이다.

### 1.2 Why This Has High ROI

이 기능은 ROI가 높다.

- Mermaid로 만들어둔 "fenced block 언어 태그 감지 → 렌더러 위임" 파이프라인을 그대로 재사용한다.
- `@codesandbox/sandpack-react` 패키지 하나로 에디터 + 미리보기 + 콘솔이 완결된다.
- sandpack은 자체 iframe sandbox 위에서 동작하므로 별도 보안 경계 설계가 최소화된다.
- 캔버스 특성상 여러 노트를 나란히 펼치는 방식과 컴포넌트 변형 비교가 자연스럽게 맞아떨어진다.
- 코드 수정 → 즉시 미리보기의 피드백 루프가 Boardmark 캔버스 안에서 완결된다.

### 1.3 Product Goal

Boardmark는 ` ```sandpack ` fenced code block을 **제품 차원의 라이브 컴포넌트 실행 블록**으로 지원해야 한다.

- 사용자는 markdown 안에 sandpack JSON을 적으면 preview surface에서 실제 동작하는 React 컴포넌트 에디터를 볼 수 있어야 한다.
- 컴포넌트 코드를 에디터에서 직접 수정하면 미리보기가 즉시 반영되어야 한다.
- sandpack 블록이 실패해도 note 전체 렌더링은 깨지지 않아야 한다.
- 앱 본체의 보안 경계를 약화시키지 않아야 한다.

### 1.4 Success Criteria

- 신규 사용자가 별도 설명 없이 ` ```sandpack ` block에 React 코드를 적고 preview에서 동작을 확인할 수 있다.
- shadcn/ui, Radix UI 같은 외부 의존성을 지정하면 자동으로 로드되어 컴포넌트가 렌더된다.
- 에디터에서 코드를 수정하면 미리보기가 핫 리로드된다.
- sandpack 블록이 없는 일반 markdown 문서의 렌더링 성능이 눈에 띄게 나빠지지 않는다.

---

## 2. Goals & Non-Goals

### Goals

- fenced code block 언어가 `sandpack`일 때 live 컴포넌트 에디터로 렌더링
- `MarkdownContent`를 사용하는 모든 preview surface에서 동일 동작 보장
- npm 패키지 의존성 지정 지원 (`dependencies` 필드)
- 여러 파일 구성 지원 (`files` 필드)
- sandpack 블록 렌더 실패 시 명시적 오류 UI와 source fallback 제공
- React, React + TypeScript 템플릿 우선 지원

### Non-Goals

- sandpack 전용 WYSIWYG 편집기
- sandpack 이외 런타임(Vue, Svelte, Angular)의 첫 단계 지원
- 코드 저장 및 공유 (sandpack 세션 상태 영속)
- 외부 CDN 리소스 로딩 정책 커스터마이징
- node_modules 전체 번들 로컬 캐시
- note 외 별도 "sandpack object type" 추가

---

## 3. Users & Core Scenarios

### Target User

- shadcn/ui, Radix 같은 컴포넌트 라이브러리를 쓰는 프론트엔드 개발자
- 디자인 시스템 변형을 문서 안에서 비교하고 싶은 디자이너/개발자
- AI가 생성한 컴포넌트 코드를 즉시 실행해 확인하는 사용자

### Core User Stories

```text
AS  프론트엔드 개발자
I WANT  note 안에 shadcn Button 변형 여러 개를 나란히 놓고
SO THAT 스크린샷 없이 실제 동작하는 컴포넌트로 디자인 리뷰를 할 수 있다

AS  사용자
I WANT  AI가 생성한 React 컴포넌트 코드를 Boardmark에서 바로 실행하고
SO THAT 별도 탭을 열지 않아도 코드가 맞는지 즉시 확인할 수 있다

AS  문서 작성자
I WANT  설명 note 옆에 실제 동작하는 컴포넌트 데모를 붙여 두고
SO THAT 독자가 코드와 실행 결과를 같은 캔버스에서 함께 볼 수 있다
```

---

## 4. Current Assumptions

- 첫 버전의 핵심 렌더 범위는 공용 `MarkdownContent`가 쓰이는 preview surface다.
- sandpack 에디터 안의 코드 수정은 sandpack 자체 상태로만 관리되며, `.canvas.md` source에 자동 반영되지 않는다. source 동기화는 후속 단계로 미룬다.
- `@codesandbox/sandpack-react`는 자체 iframe sandbox를 제공하므로, 별도 iframe 보안 설계를 추가하지 않아도 첫 버전 가치는 충분하다.
- React 템플릿을 기본 템플릿으로 시작한다. 다른 런타임은 수요 확인 후 추가한다.
- sandpack의 npm 패키지 번들링은 sandpack 서비스(CDN)를 통해 처리한다. 로컬 오프라인 번들은 첫 단계 범위 밖이다.

---

## 5. Product Rules

### 5.1 Canonical Syntax

첫 버전의 canonical syntax는 fenced code block이다.

````md
```sandpack
{
  "template": "react",
  "files": {
    "App.tsx": "export default function App() {\n  return <button>Hello</button>\n}"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "latest"
  }
}
```
````

규칙은 아래와 같다.

- info string이 정확히 `sandpack`인 fenced block만 live 에디터 렌더링 대상으로 본다.
- block body는 JSON으로 파싱한다. 파싱 실패 시 오류 UI를 표시한다.
- sandpack source 원문은 문서 안에 그대로 저장되고 parser contract는 바뀌지 않는다.

### 5.2 JSON 필드 계약

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `template` | string | 권장 | sandpack 템플릿 이름. 기본값 `react` |
| `files` | Record\<string, string\> | 필수 | 파일 경로와 내용 |
| `dependencies` | Record\<string, string\> | 선택 | npm 패키지와 버전 |
| `options` | object | 선택 | sandpack UI 옵션 (에디터 표시 여부 등) |

### 5.3 Rendering Scope

- note body preview에서 sandpack은 live 에디터로 렌더링되어야 한다.
- 같은 `MarkdownContent` 경로를 타는 모든 surface에서 같은 규칙을 적용해야 한다.

### 5.4 Failure Behavior

- JSON 파싱 실패, sandpack 렌더 실패 모두 오류 상태 card로 렌더한다.
- 오류 card는 최소한 아래 정보를 보여줘야 한다.
  - sandpack 렌더 실패 사실
  - 가능한 원인 또는 에러 메시지
  - 원본 sandpack source
- 실패를 조용히 빈 영역으로 숨기면 안 된다.

### 5.5 Security Rules

- sandpack은 `@codesandbox/sandpack-react` 내부의 iframe sandbox 위에서만 실행된다.
- Boardmark 본체 DOM에 sandpack 내부 코드가 직접 접근할 수 없어야 한다.
- sandpack iframe과 Boardmark 본체 간 통신은 sandpack 라이브러리가 제공하는 API 범위로 제한한다.
- 임의 script를 Boardmark 앱 context에서 직접 실행하는 경로를 열면 안 된다.

### 5.6 Performance Rules

- sandpack이 없는 일반 markdown 문서는 기존 대비 렌더 경로가 크게 무거워지면 안 된다.
- sandpack 엔진은 실제 sandpack block이 존재할 때만 로드하는 lazy path가 바람직하다.
- `@codesandbox/sandpack-react`의 초기 번들 비용을 감안해 code splitting을 기본 전략으로 둔다.

### 5.7 Layout Rules

- sandpack block은 note 너비에 맞게 렌더되어야 한다.
- 에디터와 미리보기의 기본 분할 레이아웃은 sandpack 기본값을 따른다.
- note가 좁을 경우 에디터 패널 숨김 또는 미리보기만 표시하는 compact 모드를 검토한다.
- sandpack block이 note 레이아웃을 깨면 안 된다.

---

## 6. Functional Requirements

### 6.1 지원 템플릿 베이스라인

첫 버전은 최소한 아래 템플릿이 안정적으로 동작해야 한다.

- `react` — React + JavaScript
- `react-ts` — React + TypeScript

### 6.2 Rendering Contract

- sandpack block은 최종적으로 `@codesandbox/sandpack-react`의 `<Sandpack>` 컴포넌트로 렌더링되어야 한다.
- 원본 fenced code source는 저장 포맷에 그대로 남는다.
- 비-`sandpack` 언어 block은 기존 code highlight 경로를 유지한다.

### 6.3 에디터 상태 계약

- sandpack 에디터 안의 코드 수정은 sandpack 내부 상태로만 관리된다.
- note source(`.canvas.md`)로의 자동 반영은 첫 버전 범위에 포함하지 않는다.
- "source에 반영" 기능은 후속 단계에서 명시적 액션으로 제공할 수 있다.

### 6.4 Error Contract

- JSON 파싱 오류는 recoverable error로 취급한다.
- 오류 block은 UI에서 진단 가능해야 한다.
- 오류가 발생해도 surrounding markdown tree는 정상 렌더링되어야 한다.

### 6.5 Save / Compatibility Contract

- 기존 `.canvas.md` 문서는 migration 없이 그대로 유효해야 한다.
- sandpack 지원은 source schema version 증가 없이 도입 가능해야 한다.
- sandpack이 없는 markdown 문서는 렌더링 결과가 바뀌지 않아야 한다.

---

## 7. Technical Direction

### 7.1 Preferred Introduction Point

첫 구현은 Mermaid와 동일하게 shared UI renderer에서 처리한다.

- parser는 raw markdown body 보존 역할만 유지한다.
- `packages/ui/src/components/markdown-content.tsx`가 sandpack detection의 1차 경계가 된다.
- sandpack 전용 렌더링은 별도 `SandpackBlock` 컴포넌트로 분리한다.

### 7.2 Mermaid 파이프라인 재사용

sandpack 도입은 Mermaid로 확립된 패턴을 그대로 따른다.

```
fenced block 언어 태그 감지
  → "sandpack" → SandpackBlock 컴포넌트
  → "mermaid"  → MermaidDiagram 컴포넌트
  → 기타        → 기존 code highlight 경로
```

이 패턴은 향후 Graphviz, Vega-Lite 등 추가 렌더러 도입 시에도 동일하게 확장된다.

### 7.3 sandpack 설정 중앙화

- `SandpackBlock`은 `@codesandbox/sandpack-react`의 `<Sandpack>` 컴포넌트를 감싸는 thin wrapper다.
- 기본 `options`, `theme`, `template` 등의 설정은 중앙 모듈에서만 관리한다.
- block body JSON의 `options` 필드로 일부 override를 허용하되, 보안에 영향을 주는 옵션은 override 불가로 고정한다.

### 7.4 Lazy Import

- `@codesandbox/sandpack-react`는 sandpack block이 실제로 존재할 때만 dynamic import로 로드한다.
- 일반 markdown 문서에서는 sandpack 번들이 로드되지 않아야 한다.

---

## 8. Risks and Mitigations

### Bundle Size

- `@codesandbox/sandpack-react`는 무거운 패키지다.
- lazy import + code splitting을 기본 전략으로 두고, 번들 크기 증가를 측정한다.

### Network Dependency

- sandpack의 npm 패키지 번들링은 CodeSandbox CDN에 의존한다.
- 오프라인 또는 CDN 장애 시 sandpack block이 로드되지 않을 수 있다.
- 첫 단계는 이를 허용하고, 실패 시 명시적 오류 UI를 표시한다.

### Render Stability

- 잘못된 JSON이나 무거운 의존성이 sandpack 렌더를 지연시킬 수 있다.
- 비동기 render + loading placeholder를 사용하고, 실패를 명시적으로 surface에 노출한다.

### Security Drift

- sandpack 옵션이 느슨해지면 iframe 경계가 흐려질 수 있다.
- 보안에 영향을 주는 옵션은 중앙 모듈에서만 관리하고, block JSON에서 override를 막는다.

---

## 9. Canvas 활용 시나리오

sandpack은 Boardmark 캔버스 특성과 특히 잘 맞는다.

### 컴포넌트 변형 비교

여러 노트를 나란히 배치해 같은 컴포넌트의 variant를 동시에 비교한다.

```
::: note { id: btn-default, at: { x: 0, y: 0, w: 600, h: 400 } }
# Default

```sandpack
{ "template": "react-ts", "files": { "App.tsx": "..." } }
```
:::

::: note { id: btn-outline, at: { x: 640, y: 0, w: 600, h: 400 } }
# Outline

```sandpack
{ "template": "react-ts", "files": { "App.tsx": "..." } }
```
:::
```

### 설명 + 실행 결과 인접 배치

설명 note 바로 옆에 실행 결과 note를 두어 문서와 데모를 함께 관리한다.

---

## 10. Rollout Decision

첫 단계의 제품 결정은 아래로 고정한다.

- sandpack은 ` ```sandpack ` fenced block만 지원한다.
- 도입 지점은 parser가 아니라 shared markdown renderer다.
- 템플릿 기본값은 `react`다.
- sandpack 에디터 내부 코드 수정의 `.canvas.md` 자동 반영은 첫 버전 범위 밖이다.
- 실패 UX와 lazy import는 첫 버전 범위에 포함한다.
- Vue, Svelte 등 추가 템플릿과 오프라인 번들 지원은 후속 단계로 미룬다.
