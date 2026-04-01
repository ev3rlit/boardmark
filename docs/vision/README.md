# Boardmark Vision

## 1. 제품 비전

Boardmark의 핵심 목표는 다음 한 문장으로 정리할 수 있다.

> 사용자와 AI가 같은 워크스페이스 파일을 직접 읽고 수정하면서, 그 결과를 캔버스로 시각적으로 탐색하는 markdown-native canvas system을 만든다.

Boardmark는 별도 데이터베이스나 전용 바이너리 포맷 중심 제품이 아니다.  
`.canvas.md`와 관련 파일이 source of truth이고, 제품은 그 파일을 시각화하고 구조적으로 다루기 위한 인터페이스를 제공한다.

---

## 2. 현재 제품 우선순위

장기적으로 가장 중요한 배포 형태는 **VS Code extension**이다.

이유:

- 사용자와 AI가 이미 VS Code 안에서 파일에 접근하고 수정한다.
- 워크스페이스 파일 읽기/쓰기/감시를 extension host에서 직접 다루기 좋다.
- canvas viewer/editor를 webview로 제공하면 파일 시스템과 시각 인터페이스를 자연스럽게 연결할 수 있다.

즉 최종 제품 우선순위는 아래와 같다.

1. VS Code extension
2. 공용 parser / renderer / pack system
3. 필요 시 standalone desktop app

단, **현재 구현 순서**는 다르게 가져간다.

---

## 3. 현재 구현 전략

지금은 VS Code extension을 바로 구현하기보다, 먼저 아래를 마무리한다.

1. web에서 실행 가능한 viewer foundation
2. style pack / component pack / preset 시스템
3. 그 다음에 VS Code extension shell

이 순서를 택하는 이유:

- web에서 바로 돌려보며 renderer, parser, UI, pack system을 빠르게 검증할 수 있다.
- extension shell보다 공용 core를 먼저 안정화하는 편이 구조적으로 안전하다.
- 테스트와 디버깅을 계속 web 실행 기준으로 돌릴 수 있다.

즉, **제품 우선순위는 extension-first**이지만, **구현 순서는 web-first**로 가져간다.

---

## 4. 사용자 경험 원칙

- 사용자는 파일을 소유한다.
- AI도 같은 파일을 직접 읽고 수정할 수 있어야 한다.
- canvas는 파일을 대체하지 않고, 파일을 더 잘 이해하고 편집하게 돕는 시각 계층이어야 한다.
- 특정 앱 내부 상태보다 파일 자체가 더 중요하다.

---

## 5. 저장과 동시성 원칙

- runtime interaction state와 persisted file state는 분리한다.
- viewport, selection, hover 같은 값은 즉시 파일에 쓰지 않는다.
- 파일 write는 하나의 실행 경로에서만 수행한다.
- 동시성 제어와 저장 정책은 shell별 UI가 아니라 중앙 저장 파이프라인에서 관리한다.
- 나중에 양방향 편집이 붙어도 저장 정책은 즉시 저장, 주기 저장, 다른 변경과 묶어 저장 같은 모드를 분리 가능해야 한다.

이 원칙은 특히 VS Code extension 단계에서 중요하다.

- extension host가 single writer가 된다.
- webview는 렌더링과 interaction을 담당한다.
- 실제 파일 write와 watcher 반응은 extension host가 일원화한다.

---

## 6. Pack System 방향

Boardmark는 단순 테마 시스템이 아니라, **디자인 파운데이션 + renderer registry** 구조를 지향한다.

- style pack: semantic token foundation collection
- component pack: namespace 기반 React renderer registry
- preset: style/components 조합

frontmatter는 pack source를 등록하고 optional global default만 제공한다.

- `style`, `components`, `preset`: 사용 가능한 pack source 등록
- `defaultStyle`, `defaultComponent`: optional global default

실제 적용은 node가 우선한다.

- `node.styleRef`
- `node.renderer`

선택 우선순위:

1. node override
2. frontmatter global default
3. built-in default

---

## 7. 현재 문서 구조 해석

이 비전 기준에서 문서 역할은 다음과 같다.

- `docs/canvas-md-prd.md`
  - 제품 요구사항과 포맷 목표
- `docs/features/viewer-mvp-implementation-plan.md`
  - 현재까지 구현한 viewer foundation
- `docs/features/post-viewer/implementation-plan.md`
  - viewer 이후 남은 MVP 구현 순서
- `docs/features/post-viewer/pack-system-design.md`
  - style/component/preset 설계 계약

---

## 8. 현재 결론

Boardmark는 결국 VS Code extension 중심 제품으로 간다.  
하지만 지금은 그 전 단계로서, web에서 바로 검증 가능한 공용 viewer와 pack system을 먼저 완성한다.

이 순서를 유지하면:

- 테스트를 계속 빠르게 돌릴 수 있고
- AI와 사용자가 직접 다룰 파일 포맷을 안정화할 수 있으며
- 이후 extension shell을 얹을 때 구조를 다시 뒤집지 않아도 된다.
