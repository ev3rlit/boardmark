# 백로그: Large Canvas Performance

## 문제

Boardmark가 실제 업무용 보드가 되려면 작은 예제 캔버스가 아니라 큰 문서에서도 조작 감각이 무너지지 않아야 한다.

- note 수가 많아지면 selection, drag, zoom, hit-test, render 비용이 동시에 올라간다
- `mermaid`, `sandpack`, image, syntax highlight 같은 무거운 블록이 섞이면 viewport 안에서도 성능 편차가 커진다
- 작은 보드에서는 보이지 않던 저장 직후 재정규화 비용과 렌더 교체 비용이 커질 수 있다
- 성능 기준이 없으면 기능을 추가할수록 "어느 순간 느려진다"는 식으로 퇴행한다

## 제안

대형 캔버스를 위한 explicit performance budget과 최적화 단위를 backlog로 관리한다.

- pan, zoom, drag, box selection에 대한 interaction budget을 먼저 정의한다
- viewport 중심 렌더 우선순위, 무거운 block의 staged render, incremental update 전략을 정리한다
- parse, normalize, render, interaction 중 어느 단계가 병목인지 분리 측정한다
- 재현 가능한 large fixture와 성능 회귀 체크를 도입한다

## 왜 필요한가

- FigJam 수준의 제품 감각은 예쁜 UI보다도 큰 보드에서의 안정적인 조작감으로 체감된다
- Boardmark는 markdown-native 구조라서 parse와 source patch 비용까지 함께 관리해야 한다
- 이 항목을 뒤로 미루면 후속 기능이 모두 "작은 캔버스 기준"으로만 검증되는 문제가 생긴다

## 관련 문서

- `docs/features/incremental-parse/README.md`
- `docs/features/input-pipeline-improvement/README.md`
- `docs/features/object-content-scaling/README.md`
