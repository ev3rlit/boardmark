# Boardmark

Markdown으로 생각을 펼치고, 웹과 AI에서 함께 다듬는 캔버스입니다.

**DB에 저장한 Markdown 원문이 문서의 단일 원본입니다.** 웹 GUI와 AI CLI는 같은 API를 통해 편집합니다. 노트·연결선·검색 모델은 원문에서 다시 만들 수 있습니다. 웹에서 A 노트를 편집하는 동안 AI는 B를 수정할 수 있지만, 같은 A를 수정하려는 요청은 서버가 차단합니다.

이 방향은 이전의 “AI가 원본 .md 파일을 직접 수정한다”는 설명을 대체합니다. .md는 가져오기·내보내기에 사용하며 DB와 양방향 동기화하지 않습니다.

## 로컬 실행

Node.js **24**와 Corepack이 필요합니다. 저장소의 pnpm 버전은 10.6.2입니다.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev:api
```

다른 터미널에서 웹을 실행합니다.

```powershell
corepack pnpm dev:web
```

[로컬 웹](http://127.0.0.1:5173)을 열고 API 주소 `/api`, `.boardmark/access-token` 파일의 값을 입력합니다. API는 기본적으로 `127.0.0.1:4317`에서만 실행합니다. 문서·첨부·이력은 `.boardmark/boardmark.sqlite`에 저장됩니다. 토큰은 해당 브라우저 탭의 세션 저장소에 보관합니다.

## AI CLI

AI의 기존 파일 편집 도구로 노트 본문을 수정할 수 있습니다. 문서 ID와 노트 ID는 실제 읽기 결과로 바꿉니다.

```powershell
corepack pnpm --silent boardmark checkout DOCUMENT_ID --node NODE_ID --output note.md --json
# AI가 note.md를 읽고 기존 파일 편집 도구로 수정합니다.
corepack pnpm --silent boardmark diff DOCUMENT_ID --node NODE_ID --input note.md --json
corepack pnpm --silent boardmark apply DOCUMENT_ID --node NODE_ID --input note.md --json
```

`apply`는 명시한 문서·노트·API 주소를 checkout 메타데이터와 대조한 뒤 본문을 저장합니다. `note.md.boardmark-checkout.json`은 원래 본문과 버전을 보관하므로 작업 파일과 함께 유지하고 수정하지 않습니다. 같은 수정안의 재실행은 중복 저장하지 않습니다. 성공 후 새 수정은 새 경로로 checkout하여 시작합니다. `diff`는 checkout 원본과 작업 파일의 변경 여부 및 `before`/`after` 본문을 반환합니다.

CLI는 서버 문서를 API를 통해 저장합니다. 읽기 결과의 `revision`은 **읽었을 때의 문서 버전**입니다. 직접 변경 명령을 만들 때는 읽은 값을 제출해야 합니다.

```powershell
corepack pnpm --silent boardmark document list --json
corepack pnpm --silent boardmark document import --input board.md --json
corepack pnpm --silent boardmark node read DOCUMENT_ID NODE_ID --json
corepack pnpm --silent boardmark node update DOCUMENT_ID NODE_ID --body-file note.md --base-revision 3 --request-id proposal-001 --json
corepack pnpm --silent boardmark document export DOCUMENT_ID --output backup.boardmark.json --json
```

ID와 기준 버전은 실제 읽기 결과로 바꿉니다. 다른 노트만 바뀌었다면 적용되지만, 대상이나 관련 구조가 바뀌면 거절합니다. 실패 후 숫자만 최신으로 바꿔 제출하지 말고 수정안을 다시 검토해야 합니다.

본문은 UTF-8 파일 또는 `--body-file -`의 표준 입력으로 전달합니다. 자동화에서는 pnpm의 `--silent`를 사용하거나 빌드 CLI를 직접 실행합니다.

```powershell
corepack pnpm build:cli
node apps/cli/dist/main.mjs document list --json
```

[CLI·운영·복구 안내](docs/operations/db-workspace.md), [편집 정책과 설계 선택](docs/architecture/db-markdown-api.md), [실행·성능 검증 결과](docs/verification/db-workspace.md)를 참고하세요.

## 저장과 파일 호환

편집권은 실제 변경 시작 때 자동으로 확보·갱신하고 마지막 저장 후 반납합니다. 연결이 끊기면 권한은 만료되고 미반영 초안은 브라우저에 별도로 남습니다. Undo는 자신의 대상 변경만 검증하여 되돌립니다.

현재 포맷은 명시적인 객체 ID와 JSON 속성을 가진 Markdown입니다.

```markdown
---
type: canvas
version: 2
---

::: note {"id":"idea","at":{"x":120,"y":80,"w":320,"h":220}}
사람과 AI가 함께 다듬는 아이디어
:::
```

가져오기는 새 문서를 만들고 원본 파일을 남깁니다. 무수정 내보내기는 원문을 그대로 보존합니다. 첨부 이동에는 `.boardmark.json` 묶음을 사용하세요. CLI는 상대 경로 이미지도 함께 가져옵니다.

기존 desktop·VS Code는 **별도의 파일 호환 모드**로 유지되며 서버 문서를 동시에 쓰지 않습니다. VS Code 미저장 TextDocument 버퍼는 서버 원본에 연결되지 않습니다.

## 빌드와 배포 경계

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build:web
corepack pnpm build
corepack pnpm test:api
```

`build`는 API·CLI·desktop·web을 빌드합니다. 빌드 API는 저장소 루트에서 `node apps/server/dist/main.mjs`, 웹 preview는 `corepack pnpm preview:web`으로 실행합니다.

기존 Vercel 설정은 `apps/web/dist`만 정적으로 배포합니다. **웹 빌드에 DB 서버는 포함되지 않습니다.** 지속 가능한 별도 API 프로세스와 SQLite 볼륨이 필요합니다. 원격 API 주소는 웹 연결 화면에서 설정할 수 있지만, 현재 인증은 하나의 작업 공간 접근 토큰 방식입니다. HTTPS·허용 Origin·접근 통제는 별도로 구성해야 합니다.

## License

MIT
