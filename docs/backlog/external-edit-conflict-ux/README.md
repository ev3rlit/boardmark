# 백로그: External Edit Conflict UX

## 문제

Boardmark는 같은 `.canvas.md` 파일을 VS Code, AI 에이전트, shell picker 경로에서 함께 다루게 된다.  
이 구조에서는 외부 변경과 로컬 draft 충돌을 제품 차원에서 다뤄야 한다.

- 사용자가 Boardmark에서 편집 중일 때 VS Code나 AI가 같은 파일을 수정할 수 있다
- 외부 source 변경을 단순 reload로만 처리하면 로컬 draft가 조용히 사라질 위험이 있다
- 반대로 모든 외부 변경을 무시하면 사용자는 stale canvas를 보고 있게 된다
- conflict가 명시적으로 보이지 않으면 "왜 저장이 안 됐는지"와 "무엇이 최신인지"를 설명하기 어렵다

## 제안

external change와 local draft의 공존을 explicit conflict UX로 다룬다.

- 외부 source 변경 감지 시 `clean` 문서는 자동 반영하거나 명시적 reload 제안으로 처리한다
- local draft가 있는 상태에서 외부 변경이 들어오면 conflict banner와 action surface를 띄운다
- 최소 액션은 `reload external`, `keep local draft`, `save as copy` 수준으로 시작한다
- 충돌 상태는 hidden flag가 아니라 session state와 UI 상태로 명시적으로 남긴다

## 왜 필요한가

- Boardmark의 차별점은 "사람과 AI가 같은 파일을 직접 만진다"는 점이다
- 이 장점은 conflict UX가 없으면 오히려 제품 리스크로 바뀐다
- 협업이 없어도 multi-writer-like 상황은 이미 로컬 파일 편집 흐름 안에서 발생한다

## 관련 문서

- `docs/features/bi-editing/README.md`
- `docs/vision/README.md`
