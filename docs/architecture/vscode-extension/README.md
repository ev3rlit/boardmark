# VS Code Extension — Architecture Notes

| 항목 | 내용 |
|------|------|
| 상태 | 🟡 Draft (대화 기반 정리, 코드 결정 전) |
| 작성일 | 2026-04-17 |
| 관련 문서 | [`docs/backlog/multi-target-distribution/README.md`](../../backlog/multi-target-distribution/README.md) §7 · [`docs/features/extension/vscode-extension-implementation-plan.md`](../../features/extension/vscode-extension-implementation-plan.md) · [`docs/backlog/external-edit-conflict-ux/README.md`](../../backlog/external-edit-conflict-ux/README.md) |
| 관련 패키지 | `apps/vscode/` (scaffold), `packages/canvas-app`, `packages/canvas-repository` |

이 문서는 VS Code extension의 **아키텍처 방향성**만 다룹니다. 기능 범위/배포는 위 백로그 문서를, 단계별 implementation plan은 features 문서를 참조합니다.

---

## 1. 핵심 전제

VS Code extension의 본질은 **VS Code가 이미 제공하는 기능을 다시 만들지 않는 것**입니다.

- 단일 진실 원천(SoT)은 VS Code의 `TextDocument`다.
- 캔버스 UI는 그 TextDocument의 시각적 투영(projection)일 뿐이다.
- file I/O, undo/redo, dirty 추적, 외부 충돌 처리는 VS Code에 위임한다.

이 전제가 어긋나면 더블 소스 문제(텍스트 에디터 편집 vs 캔버스 편집)가 영구적으로 발생합니다. `external-edit-conflict-ux` 백로그는 이 전제를 지키는 것을 가정한 위에서의 UX 백로그입니다.

---

## 2. Extension 형태: CustomTextEditorProvider

세 후보 중 **CustomTextEditorProvider**를 채택합니다.

| 형태 | 평가 |
|---|---|
| **CustomTextEditorProvider** ✅ | TextDocument 직접 바인딩, undo/redo/dirty/save 무료, 텍스트 ↔ 캔버스 동시 뷰 가능 |
| WebviewPanel + 직접 fs | VS Code 문서 라이프사이클을 재구현해야 함. 기각 |
| CustomEditor(binary) | `.canvas.md`는 텍스트 — 부적합 |

`package.json`의 `contributes.customEditors`로 `*.canvas.md`에 등록, `workspaceContains:**/*.canvas.md` activation event로 자동 활성화합니다.

---

## 3. 패키지 경계

```
apps/vscode/
  src/
    extension/   # Node 컨텍스트 (VS Code extension host)
    webview/     # 브라우저 컨텍스트 (canvas-app mount)
    shared/      # 양쪽이 공유하는 메시지 프로토콜만
```

원칙:

- **extension host와 webview는 서로의 코드를 import하지 않는다.** `shared/`만 공유한다 (CLAUDE §3 단방향 의존, §4 promptable boundary).
- 기존 `canvas-domain`, `canvas-parser`, `canvas-renderer`, `canvas-app`, `ui`는 **그대로 사용** (변경 없음).
- `canvas-repository`의 `BoardmarkDocumentBridge`는 web/desktop과 마찬가지로 webview 쪽에서 새 구현체를 만든다. 단, 모든 fs 작업은 postMessage를 통해 extension host로 위임한다.

---

## 4. 데이터 흐름

```
[TextDocument (.canvas.md)]               ← VS Code가 소유
        │
        │ workspace.onDidChangeTextDocument
        ▼
[Extension host: text-document-bridge]
   parseCanvasDocument(text) → AST (선택, 또는 raw text 전달)
        │
        │ webview.postMessage({type:'document/sync', revision, source})
        ▼
[Webview: host-bridge]
   BoardmarkDocumentBridge 인터페이스를 메시지 프록시로 구현
        │
        ▼
[canvas-app store hydrate]
        ▲
        │ user edits in canvas
        │
        │ window.parent.postMessage({type:'document/edit', revision, nextSource})
        ▼
[Extension host]
   WorkspaceEdit으로 TextDocument 갱신
   (VS Code가 onDidChangeTextDocument 다시 발사 → loop 방지 필요)
```

---

## 5. Edit Loop 방지

webview → host edit이 round-trip되어 webview로 다시 돌아오면 무한 sync가 발생합니다.

채택안: **revision 카운터**.
- 모든 sync/edit 메시지에 단조 증가 `revision`을 싣는다.
- webview는 자기가 보낸 edit의 revision이 다시 돌아오면 재-hydrate를 스킵한다.
- 보조: edit origin tag (`'webview' | 'text'`)로 디버깅 보강.

---

## 6. 직렬화 전략 (단계별)

| Phase | 전략 | 트레이드오프 |
|---|---|---|
| MVP | 전체 마크다운 재생성 → `WorkspaceEdit.replace(entire range)` | 단순. undo가 한 덩어리로 묶임. git diff가 큼 |
| Phase 2 | 노드 단위 range edit | git 친화적, 작은 undo 단위. 노드↔text range 매핑 필요 |

MVP로 끝까지 뚫고 사용성 피드백 본 뒤 Phase 2 결정.

---

## 7. 구현 단계 (Phase Plan)

### Phase 1 — "캔버스가 뜬다" (read-only)
- CustomTextEditorProvider 등록
- TextDocument → webview source sync (단방향)
- Webview 빌드 파이프라인 (Vite library mode → 단일 IIFE)

### Phase 2 — "캔버스에서 편집한다"
- Webview → host edit 메시지
- Edit loop 방지 (revision)
- VS Code 테마(light/dark/high-contrast) → 캔버스 design token 매핑

### Phase 3 — VS Code 네이티브 가치
- `DocumentSymbolProvider`: 노드/그룹/엣지 → outline 트리 점프
- `Diagnostics`: `canvas-parser` 에러를 `Diagnostic`으로 노출
- Completion / Snippets: `:::note`, `:::edge`, frontmatter 키
- Commands: "Open as Canvas", "Toggle Source/Canvas"

### Phase 4 — 워크플로우 통합
- `boardmark://` URI 핸들러로 노드 딥링크
- markdown preview에 캔버스 썸네일

각 Phase는 독립적으로 검증 가능한 단위로 PR 분할(CLAUDE §5, §7).

---

## 8. 메시지 프로토콜 원칙

- `shared/protocol.ts`에서 **discriminated union**으로 정의
- 경계에서 zod 등으로 검증 (CLAUDE §6) — webview는 신뢰 경계 너머
- 모든 메시지는 `revision: number`을 가진다

초기 메시지 (자세한 정의는 `apps/vscode/src/shared/protocol.ts` 참조):

| 방향 | type | 페이로드 |
|---|---|---|
| host → webview | `document/sync` | revision, source |
| host → webview | `document/saved` | revision |
| host → webview | `theme/changed` | kind |
| webview → host | `document/ready` | — |
| webview → host | `document/edit` | revision, nextSource |
| webview → host | `command/run` | id, args? |

---

## 9. 빌드와 배포

- **두 개의 번들이 필요하다.**
  - extension host: `target: 'node'`, externals: `vscode`, output: CJS
  - webview: `target: 'web'`, single IIFE, CSP-safe (`unsafe-eval` 금지)
- Vite로 양쪽 모두 처리 (vite SSR build로 host 번들).
- 배포: `vsce package` → `.vsix`. 초기엔 marketplace 전 로컬/사내 install로 검증.

---

## 10. 열린 질문 (코드 작업 전 결정 필요)

1. **다중 webview**: 같은 파일을 두 탭에 열면 N개 webview가 같은 TextDocument를 공유. sync fan-out 전략 정해야 함.
2. **Untitled / dirty 문서**: 저장 안 된 `.canvas.md`도 캔버스로 열 수 있는지.
3. **이미지 자산 경로**: webview는 `vscode-resource:` 스킴 필요. `MarkdownContent`의 경로 처리 점검 필요.
4. **VS Code undo와 canvas-app 내부 undo 통합**: MVP는 분리, Phase 2에서 통합 검토 (비용 큼).
5. **`BoardmarkDocumentBridge` 인터페이스 위치**: 현재 `canvas-repository`가 소유. web/desktop/vscode 셋이 모두 의존 가능한 가장 낮은 레이어로 끌어올릴지 결정 필요. 끌어올린다면 별도 PR로 선행.

---

## 11. 참고

- VS Code Custom Editor API: https://code.visualstudio.com/api/extension-guides/custom-editors
- Webview API: https://code.visualstudio.com/api/extension-guides/webview
- `vsce` publishing: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
