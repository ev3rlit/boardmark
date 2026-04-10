# 백로그: Object Command Completeness

## 문제

현재 Boardmark는 오브젝트를 만들고 이동하고 지우는 기본 조작은 가능하지만, 배치와 정리를 빠르게 끝내는 명령 레이어가 비어 있다.

- `duplicate`, `copy`, `paste`, `select all`이 핵심 작업 흐름으로 완성되어 있지 않다
- `nudge`, `align`, `distribute`, `arrange`, `group`, `lock` 같은 정리 명령이 없다
- 웹과 데스크톱의 다중 선택, 박스 선택, shortcut parity가 아직 완전하지 않다
- 결과적으로 보드는 만들 수 있어도 빠르게 다듬고 정리하는 도구라는 느낌이 약하다

## 제안

화이트보드 기본기에 해당하는 오브젝트 명령 체계를 P0부터 완성한다.

- P0: `duplicate`, `cut/copy/paste`, `select all`, `arrow key nudge`, `align`, `distribute`, `z-order`, `lock`
- P1: `group/ungroup`, `paste in place`, `alt-drag duplicate`, multi-select parity
- 모든 명령은 shortcut, context menu, selection toolbar 중 최소 두 surface에서 접근 가능해야 한다
- 명령 결과는 markdown source patch와 undo/redo history에 일관되게 반영되어야 한다

## 왜 필요한가

- FigJam 수준의 완성도는 "만드는 것"보다 "정리하는 속도"에서 체감된다
- Boardmark의 문서 기반 모델을 유지하더라도 selection과 transform command는 제품의 기본기다
- 이 축이 약하면 사용자는 보드를 손으로 다듬기보다 외부 도구로 옮기게 된다

## 관련 문서

- `docs/features/object-commands/README.md`
- `docs/features/object-commands-followup/README.md`
- `docs/features/undo-redo/README.md`
