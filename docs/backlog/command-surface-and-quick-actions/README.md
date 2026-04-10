# 백로그: Command Surface and Quick Actions

## 문제

기능이 추가되어도 사용자가 그 기능을 발견하고 빠르게 실행할 수 없으면 제품 레벨은 올라가지 않는다.

- 현재 command surface가 얇아 shortcut 중심 사용자와 마우스 중심 사용자 모두에게 발견성이 부족하다
- 오브젝트 선택 상태에서 바로 쓸 수 있는 quick action, floating toolbar, context menu 정리가 부족하다
- 명령이 늘어날수록 "어디서 실행하나"가 일관되지 않으면 제품이 급격히 복잡해 보인다
- 결과적으로 기능 자체보다 사용 경로가 더 큰 마찰이 된다

## 제안

selection과 document 상태에 반응하는 command surface를 정리한다.

- 오브젝트 선택 시 selection toolbar 또는 quick action strip을 제공한다
- context menu는 disabled placeholder가 아니라 실제 작업 흐름 중심으로 재정리한다
- command palette 또는 searchable action menu로 power user surface를 추가한다
- shortcut hint와 action label을 공통 vocabulary로 맞춘다

## 왜 필요한가

- FigJam은 기능 그 자체보다 "항상 다음 액션이 눈에 보인다"는 점에서 강하다
- Boardmark도 object command가 늘어날수록 surface 설계가 함께 올라가지 않으면 완성도 체감이 떨어진다
- 이 층이 있어야 onboarding, template, editing, layout command가 하나의 제품처럼 느껴진다

## 관련 문서

- `docs/features/object-commands/README.md`
- `docs/features/wysiwyg/README.md`
