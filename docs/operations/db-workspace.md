# DB 작업 공간 실행·CLI·복구

## 실행과 설정

저장소 루트, Node 24, Corepack pnpm 10.6.2를 사용한다. `corepack pnpm install --frozen-lockfile` 후 별도 터미널에서 `corepack pnpm dev:api`, `corepack pnpm dev:web`을 실행한다. 웹 연결 화면에 `/api`와 `.boardmark/access-token` 값을 입력한다. 토큰을 로그·Markdown·저장소에 넣지 않는다.

| 설정 | 기본값 / 의미 |
|---|---|
| BOARDMARK_DATA_DIR | `.boardmark`; DB와 토큰 위치 |
| BOARDMARK_HOST, BOARDMARK_PORT | `127.0.0.1`, `4317` |
| BOARDMARK_TOKEN | 미설정이면 데이터 폴더의 생성된 접근 토큰 사용 |
| BOARDMARK_ORIGINS | localhost/127.0.0.1의 웹 5173·preview 4173; 쉼표 구분 정확한 Origin |
| BOARDMARK_API_PROXY | 웹 dev/preview 프록시 대상 `http://127.0.0.1:4317` |
| BOARDMARK_API_URL | CLI API 주소 `http://127.0.0.1:4317/api` |
| BOARDMARK_TOKEN_FILE | CLI 토큰 파일 `.boardmark/access-token` |
| BOARDMARK_SESSION | CLI 세션; 미설정 시 프로세스별 임의 값 |

브라우저는 연결 화면에서 API 주소를 바꿀 수 있다. 작업 공간 토큰 소유자는 그 작업 공간 문서를 모두 읽고 쓸 수 있다. 세션 ID는 임의의 16~128자 비밀 값이며 편집권 소유를 구분한다. 계정·문서별 접근 등급은 범위 밖이다. 원격 사용에는 HTTPS와 인증된 네트워크 및 허용 Origin 설정이 필요하다. 정적 Vercel 배포만으로 API와 DB가 실행되지 않는다.

## 읽기와 변경 기준

```powershell
node apps/cli/dist/main.mjs document list --json
node apps/cli/dist/main.mjs document read DOCUMENT_ID --json
node apps/cli/dist/main.mjs node read DOCUMENT_ID NODE_ID --json
node apps/cli/dist/main.mjs node update DOCUMENT_ID NODE_ID --body-file note.md --base-revision 7 --request-id proposal-001 --json
```

`revision: 7`은 변경안을 만들기 전에 읽었던 문서 버전이다. AI는 편집권을 잡지 않고 내용을 검토하고 수정안을 만든다. 제출 시 서버가 계산한 전체 영향 범위를 짧게 확보한다. 다른 노트만 바뀐 경우 적용하고 대상·연결·그룹 구조가 바뀌면 `stale-base`를 반환한다. 최신 내용을 검토해 새 제안을 만들고 새 요청 ID를 사용한다. 숫자만 최신으로 바꿔 오래된 내용을 덮어쓰면 안 된다.

본문은 UTF-8 파일 또는 `--body-file -`의 stdin이다. 범용 객체 명령은 `command DOCUMENT_ID --input command.json --base-revision 7`로 호출한다. 예:

```json
{"kind":"move-nodes","moves":[{"nodeId":"a","x":120,"y":80},{"nodeId":"b","x":500,"y":80}]}
```

본문 변경, 이동/리사이즈, 생성, 이미지, 연결선, 삭제, 그룹, 정렬 명령의 구체 계약은 `packages/canvas-edit/src/edit-intents.ts`와 API validator에 있다. 영향 범위는 서버가 계산한다. 전체 교체·삭제는 저수준 API의 `*` 문서 편집권과 정확한 문서 버전을 요구하며 기본 GUI에는 노출하지 않는다.

## 재시도·대기·오류

`--wait-ms 5000`은 CLI 편집권 대기를 최대 5초로 제한한다. 상한은 60초이고 Ctrl+C로 취소할 수 있다. 대기는 수정안의 기준을 바꾸지 않는다. GUI는 막힌 클릭을 대기열에 넣지 않는다. 사용자가 다시 시작할 때 확인한다. 우선순위와 무한 대기열은 없다.

CLI 객체 수정은 `.boardmark/requests`에 전송 전 요청과 세션·수정안을 기록한다. `--journal-dir`로 위치를 바꿀 수 있다. 응답이 불명확하면 **같은 입력·기준·요청 ID·기록 폴더**로 다시 실행한다. 확정 결과는 중복 적용하지 않는다. 재시작으로 권한만 만료했고 요청은 미확정이면 원래 기준을 다시 검증해 확보한다. 기록에는 문서 내용이 있으므로 DB 백업과 같은 접근 범위로 관리한다.

문서 생성·가져오기·이름 변경의 재전송에는 동일 `BOARDMARK_SESSION`과 `--request-id`를 유지한다. 이 명령들은 객체 수정 기록 파일을 사용하지 않는다.

출력은 `{ "ok": true, "value": ... }` 또는 `{ "ok": false, "error": { "code", "message", "retryable", "details" } }` JSON이다. `document read`에서 `--json`을 생략하면 원문만 출력한다. 빌드 CLI는 진행 로그를 stdout에 섞지 않는다. pnpm 경유 시 `corepack pnpm --silent boardmark ...`를 사용한다.

| 오류 | 종료 코드 | 다음 행동 |
|---|---:|---|
| invalid-request, invalid-document, not-found | 2 | 명령·객체·포맷 확인 |
| locked | 3 | 현재 편집 종료 후 제한 시간 내 재시도 가능 |
| stale-base | 3 | 최신 대상과 오류 details로 수정안 재검토 |
| lease-expired | 3 | 초안 보존 후 원래 기준으로 다시 권한 확인 |
| request-reused | 3 | 동일 재전송인지 새 제안인지 구분 |
| unauthorized | 4 | 토큰·Origin 확인 |
| connection-failed, internal-error | 5 | 저장 여부가 불명확할 수 있으므로 동일 요청 재확인 |

편집권(lease)은 30초 동안만 유효한 자동 편집 권한이다. 웹은 10초마다 갱신한다. 10분 동안 입력이 없으면 반납하고 초안은 남긴다. 종료/단절 후 다른 작성자는 만료 뒤 진행한다. 서버 재시작 시 이전 권한을 무효화한다. 이전 소유자의 늦은 저장·반납은 새 권한에 영향을 주지 않는다.

## 가져오기·첨부·백업

```powershell
node apps/cli/dist/main.mjs document import --input board.md --json
node apps/cli/dist/main.mjs document export DOCUMENT_ID --output backup.boardmark.json --json
node apps/cli/dist/main.mjs document import --input backup.boardmark.json --name 복원본 --json
```

가져오기는 새 ID를 발급한다. .md와 첨부를 삭제하거나 옮기지 않는다. CLI는 객체 이미지 및 일반 `![설명](상대경로)` 이미지의 파일을 읽어 DB에 함께 저장한다. 문서 폴더 밖 또는 폴더 밖으로 연결된 symlink는 자동 수집하지 않는다. 먼저 문서 폴더에 명시적으로 복사해야 한다. 원격 URL 자료는 외부 서버에 남으며 백업에 포함되지 않는다. 참조형 Markdown 이미지 문법·HTML 내부 임의 첨부는 자동 수집 범위 밖이다.

`.boardmark.json`은 원문·이름·첨부 경로·MIME·base64 바이트를 담는 이동용 묶음이다. 웹에서도 가져올 수 있다. CLI의 .md 내보내기는 첨부가 있으면 `.md.boardmark.json` 동반 파일을 만든다. 재가져오기에는 두 파일을 함께 둔다. 이미 존재하는 출력 파일은 덮어쓰지 않는다. 동반 파일을 먼저 써서 Markdown 쓰기 실패 때도 자료를 복구할 수 있게 한다. 일반 Markdown만 내보낸 파일의 `asset:` 참조에는 묶음이 필요하다.

첨부는 내용 해시로 공유하는 DB BLOB이다. 업로드가 성공했지만 문서 명령이 실패하면 참조 없는 BLOB이 남을 수 있다. 자동 삭제하지 않는다. 문서 삭제 후에도 공유 첨부·요청 기록·이력은 유지한다. 외부 파일 저장소와 DB의 원자성을 가정하지 않는다.

전체 작업 공간 백업은 **API를 정상 종료한 뒤 데이터 폴더 전체**를 복사한다. 실행 중인 SQLite 파일 하나만 복사하지 않는다. 복원은 API를 멈춘 상태에서 별도의 데이터 폴더로 복사한 뒤 BOARDMARK_DATA_DIR로 지정한다. 초기 스키마는 v1이며 자동 다운그레이드를 제공하지 않는다. DB당 한 서버만 허용하고 시작 시 PID 소유 정보를 확인한다. 비정상 종료 후 해당 PID가 다른 프로세스에 재사용된 드문 경우에는 시작을 보수적으로 거절하므로 PID의 실제 프로세스와 백업을 확인한 뒤 소유 정보를 복구해야 한다.

## 브라우저 초안

서버 원문은 DB, 미반영 초안은 브라우저 localStorage, 현재 탭의 복구 위치는 sessionStorage에 둔다. 같은 탭의 새로고침 뒤 초안을 찾는다. 탭마다 초안 키가 달라 다른 탭의 초안을 지우지 않는다. 저장 응답 대기 중 추가 입력도 보존한다. 브라우저 저장소를 지우면 미반영 초안은 복구할 수 없다.

실패에서 `다시 시도 / 초안 열기`는 최초 요청을 재확인한다. 확정되었으면 결과만 복구하고 미확정이면 예전 기준으로 다시 확인한다. 다른 작성자가 대상을 바꾸면 자동 덮어쓰지 않는다. `초안 사본 내보내기`로 편집 문서·원문 텍스트·요청 기준을 포함한 JSON을 보관하고 최신 노트와 비교해 새 변경안을 만든다. 복구 이력 탐색/자동 의미 병합 UI는 없다.

Undo/Redo는 같은 세션에서 자신이 확정한 작업의 영향 객체만 역으로 바꾼다. 대상 또는 관계가 이후 변경되었거나 다른 세션이 편집 중이면 거절한다. 다중 이동은 한 명령·한 취소 단위다. 재접속 후 이전 세션의 Undo 목록은 자동 복원하지 않으며 영속 변경 이력은 DB에 남는다.

Undo/Redo도 요청을 먼저 보존한다. 저장 응답만 유실되면 같은 요청 ID로 결과를 확인하며 취소를 한 번 더 적용하지 않는다. 편집권 승인 대기 중 입력은 별도 텍스트 초안으로 남기고 승인 후 노트 끝에 이어 붙인다. Escape로 취소한 입력은 남기되 늦은 승인이 편집기를 열지 않는다. 한글 조합 중에는 조합 종료 후 편집기로 넘긴다.

드래그·크기 조절은 서버 응답을 기다리지 않고 화면에 먼저 미리보기한다. 포인터를 놓으면 승인 후 저장하며, 그동안 미반영 상태는 상단에 `변경됨`으로 표시한다. 승인 대기 중 Escape로 취소할 수 있다. 다른 작성자의 편집권이나 오래된 기준 때문에 거절되면 최신 확정 위치로 돌아온다. 승인 대기 미리보기는 메모리에만 있으므로 새로고침하면 취소된다. 실제 저장 요청을 전송한 이후의 실패는 위의 복구 초안 경로를 따른다.

충돌로 복구를 적용할 수 없으면 `사본 보관 후 복구 닫기`를 사용한다. JSON 다운로드와 함께 localStorage의 `boardmark:draft:…:archive:…` 키에 초안을 별도로 보관하고 최신 서버 원문을 다시 읽는다. 보관본을 자동 재적용하지 않는다. 보관본 목록 UI는 후속 범위이며 브라우저 저장소를 삭제하기 전 내려받은 JSON을 확인해야 한다. 복구 대기 중 다른 노트 편집으로 기존 초안을 대체하지 않는다.

## 용량과 운영 경계

JSON 요청 한 건은 20 MiB, 가져오기 묶음은 첨부 1,000개 이하로 제한한다. base64 인코딩으로 실제 첨부 바이트보다 요청이 커진다. 현재 변경 이력과 요청 결과에 원문 snapshot을 남기므로 장기 사용 시 DB 용량이 증가한다. 자동 이력 정리·첨부 삭제는 하지 않는다.

웹에서 원시 .md를 가져오면 브라우저가 이웃 파일을 자동 읽을 수 없다. 상대 경로 첨부가 있는 문서는 CLI로 가져오거나 `.boardmark.json` 묶음을 웹에 가져온다. PDF 등 일반 첨부 바이트도 묶음/API로 보관할 수 있으나 전용 목록·뷰어는 제공하지 않는다. 인라인 `data:` 이미지, 참조형 이미지, HTML 내부 첨부의 자동 수집은 지원 범위 밖이다.

화면 위치와 최근 문서는 브라우저별로 복원하고 Markdown 좌표에 쓰지 않는다. 좁은 창의 선택 도구는 상단 패널, 하단 기본 도구와 줌은 서로 다른 줄에 둔다. 높이가 작은 편집 화면에서는 하단 도구를 숨겨 본문과 상단 완료 버튼을 사용할 수 있게 한다. 실제 휴대폰 키보드·스크린리더 검증과 1,000개 객체의 추가 최적화는 [검증 보고서](../verification/db-workspace.md)의 한계를 참고한다.
