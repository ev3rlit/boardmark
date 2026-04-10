# 백로그: Onboarding, Templates, and Empty States

## 문제

프로덕트 레벨이 높은 도구는 첫 진입부터 사용자가 "무엇을 해야 하는지"를 바로 알게 만든다.  
현재 Boardmark는 철학은 분명하지만, 첫 캔버스 진입 경험은 아직 실험적 도구에 가깝다.

- 빈 문서를 열었을 때 시작 방법, 추천 구조, 예시 사용 패턴이 충분히 드러나지 않는다
- markdown-native라는 강점이 처음 쓰는 사용자에게는 오히려 추상적으로 느껴질 수 있다
- 템플릿, starter board, empty state guidance가 없으면 제품 가치가 사용 전에 전달되지 않는다
- 사용자는 "무엇이 가능한가"를 문서가 아니라 직접 보드 안에서 학습하고 싶어 한다

## 제안

첫 진입과 새 문서 시작 경험을 제품 기능으로 다룬다.

- use case별 starter template을 제공한다
- 새 문서 생성 시 blank only가 아니라 template 선택을 기본 옵션으로 둔다
- empty state에서 핵심 action, sample object, markdown-native value proposition을 보여 준다
- AI와 사람이 같은 파일을 다루는 예시 보드를 onboarding asset으로 제공한다

## 왜 필요한가

- FigJam은 기능을 다 외우지 않아도 template와 starter flow만으로 빠르게 가치를 느끼게 한다
- Boardmark도 협업 없이 충분히 강해질 수 있지만, 첫 사용자가 구조를 스스로 상상하게 두면 전환율이 낮다
- command surface와 editing 완성도가 올라갈수록 onboarding 자산의 가치도 함께 커진다

## 관련 문서

- `README.md`
- `docs/vision/README.md`
