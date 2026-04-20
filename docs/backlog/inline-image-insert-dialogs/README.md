# 백로그: Inline Image Insert Dialogs

## 문제

이미지 삽입과 alt text 편집이 브라우저 네이티브 `window.prompt()` 를 세 번
연속 띄우는 방식으로 동작한다.

- `packages/canvas-app/src/components/controls/tool-menu.tsx` 의 "Image → Link"
  흐름은 URL, alt, title 세 개의 prompt를 순차로 띄운다.
- `packages/canvas-app/src/app/canvas-app.tsx` 의 "Edit alt text" 흐름도
  동일하게 `window.prompt('Alt text', ...)` 를 사용한다.

이로 인한 UX 문제:

- 네이티브 prompt는 DESIGN.md의 "Luminous Curator" 톤에 완전히 이질적이다.
- macOS에서는 prompt가 떠 있는 동안 캔버스가 멎은 것처럼 보이고, ESC 외에는
  뒤로가기 방법이 없다.
- 세 번째 prompt에서 취소해도 앞 두 값은 검증 없이 확정된다. 되돌릴 수 없다.
- 풀스크린 상태에서 prompt 가 시스템 UI를 가져가면서 풀스크린이 풀린다.
- alt 를 빈 문자열로 넘기는 것을 막는 가드가 없고, 접근성 경고도 없다.

## 제안

네이티브 prompt 를 제거하고 앱 내부 폼 다이얼로그로 대체한다.

- `CanvasExportDialog` 와 동일한 톤의 `ImageLinkDialog` / `ImageAltDialog` 를
  `packages/canvas-app/src/components/context-menu/` 또는 controls 하위에
  신설한다.
- URL, alt, title 을 한 화면의 폼에서 동시에 다룬다. URL 유효성, alt 빈
  문자열 확인(decorative 이미지 체크박스) 을 폼 안에서 검증한다.
- 제출/취소 키보드 단축 (Enter / Esc) 과 focus trap 을 지킨다.
- 이미 존재하는 `Button` 프리미티브와 floating card 스타일을 재사용한다.
- 링크 삽입과 alt 편집 모두 `MarkdownContentImageActions` 또는 store 액션을
  통해 들어오므로, 다이얼로그는 값 수집만 하고 액션 호출은 기존 경로를
  그대로 쓴다.

## 왜 필요한가

- DESIGN.md "Do: use extreme white space", "Don't: drop standard dialogs"
  톤과의 기본선을 맞춘다.
- alt 누락은 접근성 회귀로 직결된다. 폼 안에서 decorative 여부를 명시적
  선택으로 다루는 것이 안전하다.
- 차후 이미지 붙여넣기, 링크 공유(`url-encoded-document-share`) 등에서
  재사용 가능한 폼 패턴이 필요하다.

## 관련 문서

- `DESIGN.md`
- `README.md`
- `docs/backlog/file-menu-and-destructive-action-ux/README.md`
- `docs/backlog/command-surface-and-quick-actions/README.md`
