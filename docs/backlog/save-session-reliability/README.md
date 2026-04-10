# 백로그: Save Session Reliability

## 문제

Boardmark는 파일 기반 제품이기 때문에, 저장과 세션 상태가 흐리면 기능이 많아져도 제품 신뢰도가 올라가지 않는다.

- 사용자가 지금 보고 있는 문서가 `clean`, `dirty`, `saving`, `save failed` 중 어떤 상태인지 즉시 알기 어렵다
- `Save`, `Save As`, 새 문서 시작, 파일 열기 전환이 하나의 document session 모델로 정리돼야 한다
- shell별로 저장 경로가 다르게 보이면 single-writer 원칙이 무너질 위험이 있다
- 저장 신뢰성이 약하면 raw markdown을 직접 다루는 제품에서는 곧바로 데이터 손실 공포로 이어진다

## 제안

문서 단위 session state를 제품 표면으로 끌어올린다.

- document session 상태를 `clean | dirty | saving | saved | error`처럼 명시적 state machine으로 관리한다
- 실제 persisted write는 기존 single-writer save service만 통과시킨다
- dirty indicator, last saved feedback, save error recovery를 shell UI에서 일관되게 드러낸다
- web, desktop, 이후 VS Code shell에서도 같은 session vocabulary를 재사용한다

## 왜 필요한가

- FigJam은 협업이 강점이지만, 단일 사용자 제품에서도 "저장해도 되는가"를 고민하게 만들지 않는다
- Boardmark는 파일 자체가 source of truth이므로 저장 UX가 곧 제품 핵심 신뢰도다
- editing, conflict handling, external reload UX도 모두 안정적인 session 모델 위에서만 설명 가능하다

## 관련 문서

- `docs/features/browser-persistence-shell/README.md`
- `docs/features/bi-editing/README.md`
