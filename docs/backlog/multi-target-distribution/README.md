# Boardmark Multi-Target Distribution Backlog

## 1. 목적

이 문서는 현재 Boardmark 코드베이스를 아래 4개 배포 타겟으로 확장하기 위한 제품/기술 백로그를 한곳에 정리한다.

- VS Code extension
- Obsidian plugin
- Desktop app
- Web app on Vercel

핵심 원칙은 같다.

- 문서 truth는 계속 `.canvas.md`다.
- parser 직접 호출 대신 repository 경계를 유지한다.
- 호스트 차이는 shell capability와 bridge로만 표현한다.
- 공용 canvas/editor core는 최대한 `packages/*`에 유지한다.

---

## 2. 현재 상태 요약

현재 저장소 기준으로 확인된 상태는 아래와 같다.

- `apps/web`
  - Vite 기반 웹 앱이 이미 있다.
  - browser document bridge가 있고, `showOpenFilePicker` / `showSaveFilePicker` 기반 open/save 경로가 이미 들어가 있다.
- `apps/desktop`
  - Electron 런타임이 이미 있다.
  - 하지만 설치 파일 생성, 코드 서명, 자동 릴리즈 파이프라인은 아직 없다.
- `packages/canvas-app`
  - 공용 `CanvasApp`, store, save/edit 서비스, WYSIWYG 편집 surface가 이미 있다.
  - 현재 body editing은 textarea + Tiptap WYSIWYG 경로가 있다.
- 미구현 타겟
  - VS Code extension package는 아직 없다.
  - Obsidian plugin package도 아직 없다.

즉, 지금 필요한 일은 renderer를 새로 만드는 것이 아니라, 호스트별 shell과 배포 파이프라인을 추가하는 일에 가깝다.

---

## 3. 배포 전략

### 3.1 공용 코어를 먼저 고정한다

먼저 고정해야 하는 것은 UI가 아니라 host boundary다.

- 문서 열기/저장
- 외부 변경 감시
- 이미지 asset import/open/reveal
- capability 노출
- save policy

이 계약이 먼저 안정돼야 desktop, web, VS Code, Obsidian이 같은 canvas shell을 재사용할 수 있다.

### 3.2 호스트별 책임을 분리한다

- web
  - 브라우저 capability와 배포만 담당
- desktop
  - Electron main/preload와 native file system만 담당
- VS Code extension
  - extension host와 webview message bridge만 담당
- Obsidian plugin
  - vault adapter, workspace view, plugin lifecycle만 담당

공용 canvas 렌더링과 편집 로직은 호스트 패키지 안으로 다시 내려가면 안 된다.

---

## 4. 공통 선행 백로그

### P0. Host Bridge 정리

- `documentPicker`, `documentPersistenceBridge`, `imageAssetBridge`, `documentRepository` 계약을 문서화한다.
- web / desktop에서 이미 쓰는 capability shape를 host-neutral 타입으로 정리한다.
- 외부 변경 감시를 host feature로 승격하고, shell이 이를 capability로만 소비하게 만든다.
- 호스트별 bootstrap이 공용 `CanvasApp` 초기화 코드를 중복하지 않도록 묶는다.

완료 기준:

- 새 호스트가 추가돼도 `CanvasApp` 자체를 fork하지 않고 붙일 수 있다.

### P0. 저장 정책 분리

- 지금 있는 save service를 host-independent contract로 고정한다.
- runtime draft와 persisted snapshot을 계속 분리한다.
- explicit save, save-as, autosave 후보를 같은 service boundary 아래에서 다룰 수 있게 정리한다.

완료 기준:

- VS Code extension과 Obsidian plugin이 파일 write를 각자 제멋대로 구현하지 않는다.

### P0. 공용 검증

- 같은 sample `.canvas.md`를 web / desktop / future webview host에서 렌더 비교할 수 있는 테스트 fixture를 고정한다.
- host bridge contract test를 추가한다.

완료 기준:

- 새 호스트를 붙여도 renderer parity가 깨졌는지 빠르게 확인할 수 있다.

---

## 5. Web on Vercel 백로그

### 목표

`apps/web`를 Vercel에 배포해 URL로 바로 열 수 있게 한다.

### 해야 할 일

- `apps/web`를 Vercel project로 배포한다.
- build command를 `pnpm build:web`로 고정한다.
- output directory를 `apps/web/dist`로 맞춘다.
- 추후 client-side route가 생기면 `index.html` fallback rewrite를 추가한다.
- 브라우저 capability matrix를 정리한다.
  - Chromium 계열에서는 File System Access API 기반 open/save 유지
  - 비지원 브라우저에서는 import/export fallback 제공 여부 결정
- unsupported browser UX를 추가한다.
  - open/save 불가 이유를 명시
  - upload-only mode 또는 download export mode 제공 여부 결정
- 배포 후 smoke test를 추가한다.
  - initial load
  - sample board render
  - open/save button capability
  - drag-and-drop

### 주의점

현재 웹 브리지는 `showOpenFilePicker` / `showSaveFilePicker`를 사용한다. 이 경로는 브라우저 지원 범위가 제한적이므로, Vercel 배포 자체는 가능하지만 모든 브라우저에서 같은 저장 UX를 기대하면 안 된다.

### CodeMirror 의사결정

웹에서 CodeMirror는 기본 필수 항목이 아니다.

- 현재는 Tiptap WYSIWYG + textarea 경로가 이미 존재한다.
- CodeMirror가 필요한 경우는 아래처럼 좁게 정의하는 편이 맞다.
  - raw markdown source panel
  - split view source editing
  - diff/debug용 텍스트 편집기

즉, web backlog에는 `CodeMirror 도입`이 아니라 `raw markdown surface가 정말 필요한지 결정`이 먼저 와야 한다.

완료 기준:

- Vercel URL에서 앱이 열린다.
- 지원 브라우저에서는 open/save가 동작한다.
- 비지원 브라우저에서는 capability 제한이 명시적으로 보인다.

---

## 6. Desktop App 백로그

### 목표

현재 Electron 개발 앱을 실제 설치 가능한 desktop 배포물로 바꾼다.

### 해야 할 일

- Electron packaging 도구를 도입한다.
  - 권장: Electron Forge
- macOS / Windows용 distributable을 만든다.
  - macOS: `.dmg` 또는 `.zip`
  - Windows: `.exe` 또는 Squirrel/MSIX 중 하나 결정
- app icon, app id, versioning, auto-update 전략을 정한다.
- 코드 서명/공증 범위를 정한다.
  - macOS notarization
  - Windows signing
- GitHub Actions 기반 release job을 추가한다.
- release artifact smoke test를 추가한다.
  - open file
  - save
  - image import
  - external change reload

### 주의점

지금 `apps/desktop`은 실행 경로는 있지만 배포물 생성 경로는 없다. 따라서 desktop backlog의 핵심은 UI가 아니라 packaging, signing, release automation이다.

완료 기준:

- 로컬 개발 실행이 아니라 설치 파일로 배포할 수 있다.
- 최소 macOS 하나의 signed release artifact가 나온다.

---

## 7. VS Code Extension 백로그

### 목표

`.canvas.md`를 VS Code 안에서 바로 여는 extension을 만든다.

### 해야 할 일

- `apps/vscode-extension` 패키지를 새로 만든다.
- extension host entrypoint를 추가한다.
- Boardmark webview panel을 붙인다.
- host ↔ webview message bridge를 만든다.
- 파일 읽기/쓰기/감시는 extension host가 전담한다.
- 현재 `packages/*` 공용 코어를 webview bundle에서 재사용한다.
- `.canvas.md` open command 또는 custom editor 진입점을 결정한다.
- packaging/publish 경로를 추가한다.
  - `vsce package`
  - Marketplace publish
- extension 환경 테스트를 추가한다.

### 구현 방향

- webview는 사실상 또 하나의 browser shell이다.
- 하지만 file system 접근은 webview가 아니라 extension host가 해야 한다.
- 따라서 web 앱을 그대로 publish하는 방식이 아니라, webview shell + host bridge로 재구성해야 한다.

### 연결 문서

- 기존 상세 계획: `docs/features/extension/vscode-extension-implementation-plan.md`

완료 기준:

- VS Code에서 `.canvas.md`를 Boardmark panel로 열 수 있다.
- 외부 raw markdown 수정과 Boardmark panel이 같은 파일 세션 위에서 동작한다.

---

## 8. Obsidian Plugin 백로그

### 목표

Obsidian vault 안의 `.canvas.md` 또는 `.md` 기반 Boardmark 문서를 Obsidian 내부 view로 연다.

### 해야 할 일

- `apps/obsidian-plugin` 패키지를 새로 만든다.
- `manifest.json`, plugin entry, release zip 산출 구조를 추가한다.
- custom view 또는 markdown leaf integration 방식을 결정한다.
- Obsidian `Vault` / `Workspace` API 기반 document bridge를 만든다.
- vault file read/write/rename/delete/watch를 bridge에 연결한다.
- desktop/web과 같은 `CanvasApp` 조립을 plugin view에 넣는다.
- Obsidian desktop/mobile 지원 범위를 정한다.
  - 1차는 desktop only 권장
- plugin settings와 command를 최소 범위로 정의한다.
  - Open in Boardmark
  - New Boardmark file
- community plugin 제출 전 체크리스트를 문서화한다.

### 구현 방향

- Obsidian plugin은 기술적으로 browser shell과 비슷하지만, 파일 접근은 브라우저 API 대신 Obsidian Vault API를 사용해야 한다.
- 따라서 web fallback을 억지로 재사용하기보다, Obsidian 전용 host bridge를 따로 두는 편이 안전하다.

### 주의점

Obsidian mobile까지 바로 포함하면 범위가 급격히 커진다. 첫 버전은 desktop-only로 자르는 편이 맞다.

완료 기준:

- Obsidian에서 Boardmark 전용 view를 열 수 있다.
- vault 파일을 열고 저장할 수 있다.
- community plugin 제출에 필요한 산출물이 나온다.

---

## 9. 우선순위 제안

현실적인 순서는 아래가 맞다.

1. web + desktop 공통 host boundary 정리
2. web on Vercel 배포
3. desktop packaging
4. VS Code extension
5. Obsidian plugin
6. raw markdown CodeMirror surface 필요 여부 결정

이 순서를 권장하는 이유는 명확하다.

- web과 desktop은 이미 런타임이 있다.
- VS Code와 Obsidian은 새 호스트를 추가하는 작업이라 bridge contract가 먼저 안정돼야 한다.
- CodeMirror는 제품 필수 조건이 아니라 편집 UX 확장 항목이다.

---

## 10. 배포 산출물 정의

- web
  - Vercel project
  - preview / production URL
- desktop
  - signed installer artifacts
  - release notes
- VS Code extension
  - `.vsix`
  - Marketplace listing
- Obsidian plugin
  - `manifest.json`
  - `main.js`
  - `styles.css`
  - community release zip

---

## 11. 외부 참고

- Vercel static/Vite deploy docs: https://vercel.com/docs
- VS Code extension publishing docs: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- Obsidian plugin docs: https://docs.obsidian.md
- Electron Forge docs: https://www.electronforge.io
- `showOpenFilePicker()` docs: https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
