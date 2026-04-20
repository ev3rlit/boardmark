# 백로그: Package Boundary and Alias Cleanup

## 문제

패키지 경계가 빌드 환경에 의해 여러 방향으로 새고 있다.

- `packages/canvas-app/src/index.ts` 가 `@boardmark/ui` 의 값/타입을 그대로
  re-export 한다. 예: `MarkdownContentImageActionsProvider`,
  `useMarkdownContentImageActions`, `MarkdownContentImageExportFormat` 등.
  `apps/web/src/App.tsx` 는 이것을 `@boardmark/canvas-app` 에서 받는다.
  실제 소유 패키지(ui)가 감춰진다.
- `tsconfig.base.json` 에 두 가지 alias 가 동시에 존재한다.
  `@canvas-app` / `@canvas-app/*` 와 `@boardmark/canvas-app` /
  `@boardmark/canvas-app/*`. 같은 경로로 매핑되며, 내부 코드는
  `@canvas-app/...`, 외부 소비자는 `@boardmark/canvas-app/...` 쓰는 것이
  암묵적 관례다. 명문화되지 않아 리뷰/에디터에서 구분이 안 된다.
- `packages/canvas-app/src/styles/canvas-app.css` 가 상대경로로 다른
  워크스페이스 패키지의 *소스* 를 건드린다:
  ```
  @import "../../../ui/src/styles/tokens.css";
  @source "../../../ui/src";
  ```
  워크스페이스 alias / 패키지 export 가 아니라 파일시스템 위치에 결합돼 있다.
  ui 를 dist 로만 배포하거나 폴더를 옮기는 순간 깨진다.

## 제안

경계를 명확히 하고, alias 와 re-export 정책을 하나로 정한다.

- `@boardmark/canvas-app` 의 public surface 를 다시 정의하고, `@boardmark/ui`
  의 값/타입 re-export 를 제거한다. `apps/web`, `apps/desktop` 은 필요한
  심볼을 ui 에서 직접 import 한다.
- alias 를 하나로 통일한다. 내부·외부 모두 `@boardmark/canvas-app` /
  `@boardmark/canvas-app/*` 만 쓰도록 하고, `@canvas-app` / `@canvas-app/*`
  는 제거한다. 이 결정을 `AGENTS.md` 또는 `RULE.md` 에 한 줄 명시한다.
- ui 패키지가 외부에 노출할 토큰 CSS, 컴포넌트 스타일을 public entry 로
  내보낸다. `@boardmark/ui/styles/tokens.css`, `@boardmark/ui/styles/base.css`
  등. Tailwind `@source` 경로도 패키지 entry 기준으로 바꾼다.
- 이 작업은 `workspace-package-manifest-completeness` 와 함께 진행해야
  안정적이다. manifest 가 먼저 들어오면 alias 정리 시 import 를 실수로
  끊어도 CI가 잡아 준다.

## 왜 필요한가

- AGENTS.md "Dependency-Linear Design" 의 가장 눈에 띄는 위반이다. 특히
  `@canvas-app` 가 `@boardmark/ui` 값을 re-export 하는 부분은 소유권 방향을
  역전시킨다.
- RULE.md "public surface 는 작게 유지하고 내부 세부사항은 export 하지
  않는다" 에 직접 대응.
- 패키지 분리 배포(`multi-target-distribution`, `standalone-reader-library`)
  전에 정리하지 않으면 배포 산출물에 의도치 않은 의존이 따라간다.

## 관련 문서

- `RULE.md`
- `AGENTS.md`
- `docs/backlog/workspace-package-manifest-completeness/README.md`
- `docs/backlog/multi-target-distribution/README.md`
- `docs/backlog/standalone-reader-library/README.md`
