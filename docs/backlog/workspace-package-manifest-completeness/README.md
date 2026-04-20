# 백로그: Workspace Package Manifest Completeness

## 문제

워크스페이스 간 의존 관계가 `package.json`에 선언되지 않고 루트 hoisting과
`tsconfig.base.json`의 path alias만으로 동작하고 있다.

- `apps/web/package.json`, `apps/desktop/package.json`에 `dependencies`가 비어 있다.
  그러나 `apps/web/src/App.tsx`는 `@boardmark/canvas-app`, `react`, `zustand` 등을
  import 한다.
- `packages/canvas-app/package.json`은 tiptap 계열과 `lucide-react`만 선언한다.
  실제 코드는 `@boardmark/canvas-domain`, `@boardmark/canvas-renderer`,
  `@boardmark/canvas-repository`, `@boardmark/ui`, `@xyflow/react`, `zustand`,
  `react`, `react-dropzone`, `neverthrow` 등을 전부 사용한다.
- `packages/ui/package.json`, `packages/canvas-domain`, `packages/canvas-parser`,
  `packages/canvas-renderer` 모두 같은 상태다.

결과:

- `pnpm --filter` 단위의 분리 설치, 분리 빌드, 분리 테스트가 불가능하다.
- 패키지 매니페스트가 의존 그래프를 강제하지 않기 때문에 순환 의존이 조용히
  형성돼도 경고가 없다. 실제로 `@boardmark/canvas-app`이 `@boardmark/ui`를
  import 하면서 `@canvas-app/index.ts`가 `@boardmark/ui` 타입을 re-export 하고
  있다.
- 배포/패키지 분리 시점에 한꺼번에 누락이 드러난다.

## 제안

모든 워크스페이스 패키지의 `package.json`에 실제 import 관계를 그대로
선언한다.

- 각 패키지의 소스에서 import 하는 모듈을 스캔해 `dependencies`,
  `peerDependencies`, `devDependencies` 어느 쪽에 속해야 하는지 결정한다.
- 워크스페이스 내부 의존은 `"@boardmark/ui": "workspace:*"` 형식으로 명시한다.
- 루트 `package.json`의 `dependencies`는 실제로 루트에서만 쓰이는 것(빌드
  스크립트, vitest 등)만 남기고, React/Zustand/ReactFlow 같은 런타임 패키지는
  사용하는 패키지로 내린다.
- `peerDependencies`가 맞는 것(`react`, `react-dom`)은 peer로 분리한다.
- CI에 `pnpm -r` 기반 lint/typecheck/test를 걸어 매니페스트 누락이 즉시
  드러나도록 한다.

## 왜 필요한가

- AGENTS.md "Dependency-Linear Design"의 기반 조건. 매니페스트가 없으면
  일방향 의존 흐름을 강제할 수 없다.
- 차후 `standalone-reader-library`, `multi-target-distribution` 백로그처럼
  패키지를 별도 타깃으로 배포/분리하려 할 때 필수 전제.
- RULE.md "의존성은 생성 시점, 팩토리, 함수 인자로 명시적으로 드러낸다"의
  모듈 레벨 버전.

## 관련 문서

- `README.md`
- `docs/backlog/package-boundary-and-alias-cleanup/README.md`
- `docs/backlog/multi-target-distribution/README.md`
- `docs/backlog/standalone-reader-library/README.md`
