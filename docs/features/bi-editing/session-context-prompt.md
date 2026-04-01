# Bi-Editing 구현 세션 컨텍스트

이 파일은 `docs/features/bi-editing/README.md`의 구현을 새 세션에서 시작하기 위한 컨텍스트 프롬프트다.

---

## 구현 대상

`docs/features/bi-editing/README.md` — canvas UI 조작을 `.canvas.md` source patch로 반영하는 양방향 편집 파이프라인.

구현 순서는 Phase 1 → 2 → 3 → 4 → 5이며, 이 세션에서는 **Phase 1: Object Source Map Foundation**부터 시작한다.

---

## 코드베이스 구조

### 모노레포 패키지

| 패키지 | 경로 | 역할 |
|--------|------|------|
| `@boardmark/canvas-domain` | `packages/canvas-domain/src/index.ts` | 도메인 타입 정의 (CanvasNode, CanvasEdge, CanvasAST, CanvasSourceRange 등) |
| `@boardmark/canvas-parser` | `packages/canvas-parser/src/index.ts` | `.canvas.md` source → AST 파싱. remark/unified + remark-directive 기반 |
| `@boardmark/canvas-repository` | `packages/canvas-repository/src/index.ts` | 정규화 경계. source → parse → CanvasDocumentRecord 생성 |
| `@boardmark/canvas-renderer` | `packages/canvas-renderer/src/index.ts` | ReactFlow 기반 canvas 렌더링 |
| `@boardmark/canvas-app` | `packages/canvas-app/src/index.ts` | CanvasStore(Zustand), SaveService, DocumentSession, CanvasApp 컴포넌트 |
| `@boardmark/ui` | `packages/ui` | 공통 UI 컴포넌트 |
| `@boardmark/desktop` | `apps/desktop` | Electron 호스트 |
| `@boardmark/web` | `apps/web` | 브라우저 호스트 |

### 핵심 데이터 흐름 (읽기)

```
.canvas.md source
  → parseCanvasDocument(source)          # canvas-parser
  → buildRecord(parseResult)             # canvas-repository
  → CanvasDocumentRecord                 # { locator, name, source, ast, issues }
  → CanvasStore.applyDocumentRecord()    # canvas-app
  → nodes[], edges[], viewport           # derived state
  → Canvas UI render                     # canvas-renderer
```

### 핵심 데이터 흐름 (저장)

```
store.saveCurrentDocument()
  → saveService.save(document, session, mode)
  → persistenceBridge.saveDocument() 또는 repository.save()
  → documentRepository.readSource()로 재정규화
  → store.applyDocumentRecord()
```

### 핵심 타입 (현재 상태)

```ts
// canvas-domain
type CanvasSourceRange = {
  start: { offset: number; line: number }
  end: { offset: number; line: number }
}

type CanvasNode = {
  id: string; type: 'note'
  x: number; y: number; w?: number; color?: CanvasNodeColor
  content: string
  position: CanvasSourceRange  // ← object 전체 범위만 있음
}

type CanvasEdge = {
  id: string; from: string; to: string
  kind?: CanvasEdgeKind; content?: string
  position: CanvasSourceRange
}

// canvas-repository
type CanvasDocumentRecord = {
  locator: CanvasDocumentLocator
  name: string
  source: string           // canonical source string
  ast: CanvasAST
  issues: CanvasParseIssue[]
  isTemplate: boolean
}

type CanvasDocumentRepository = {
  read: (locator) => ResultAsync<CanvasDocumentRecord, Error>
  readSource: (input) => Result<CanvasDocumentRecord, Error>
  save: (input) => ResultAsync<CanvasDocumentRecord, Error>
}

// canvas-app
type CanvasDocumentState = {
  locator: CanvasDocumentLocator
  fileHandle: FileSystemFileHandle | null
  isPersisted: boolean
  currentSource: string
  persistedSnapshotSource: string | null
  isDirty: boolean
}
```

### 현재 제약

- `CanvasNode.position`과 `CanvasEdge.position`은 object 전체 범위만 가리킨다.
- opening line, body, closing fence, 개별 attribute의 source range가 없다.
- edit intent / edit service / patch applier가 존재하지 않는다.
- store에는 읽기 + 선택 + viewport + 저장 action만 있고, content/geometry 수정 action이 없다.

---

## Phase 1 구현 목표: Object Source Map Foundation

### 할 일

1. **canvas-domain에 source map 타입 추가**

```ts
type CanvasDirectiveSourceMap = {
  objectRange: CanvasSourceRange
  openingLineRange: CanvasSourceRange
  bodyRange: CanvasSourceRange
  closingLineRange: CanvasSourceRange
  attributeRanges?: Partial<Record<string, CanvasSourceRange>>
}
```

- `CanvasNode`와 `CanvasEdge`에 `sourceMap: CanvasDirectiveSourceMap` 필드 추가
- 기존 `position` 필드는 `sourceMap.objectRange`로 대체하거나 공존시킴

2. **canvas-parser에서 source map 계산**

- `parseNoteDirective` / `parseEdgeDirective`에서 directive를 읽을 때 source map을 함께 계산
- `openingLineRange`: directive 첫 줄 (`::: note #id x=120 ...`)
- `bodyRange`: opening line 다음부터 closing fence 이전까지
- `closingLineRange`: closing fence (`:::`)
- `attributeRanges`: Phase 1에서는 optional, 구현하지 않아도 됨

3. **canvas-repository 변경 없음** (parser 출력이 바뀌면 record에 자동 반영)

4. **canvas-store를 draft-aware로 확장 준비** (Phase 2에서 본격 구현)

### 완료 기준

- parser가 모든 node/edge에 대해 `sourceMap`을 계산한다.
- `objectRange`, `openingLineRange`, `bodyRange`, `closingLineRange`가 정확하다.
- 기존 테스트가 깨지지 않는다.
- source map 계산이 parse 성능에 유의미한 퇴행을 만들지 않는다.

### 테스트 파일 위치

- `packages/canvas-parser/src/index.test.ts` — parser 단위 테스트
- `packages/canvas-repository/src/index.test.ts` — repository 통합 테스트
- 테스트 프레임워크: Vitest
- 설정: `vitest.config.ts`

---

## 핵심 설계 원칙 (PRD에서 발췌)

1. **Source of Truth = `.canvas.md` source string**. AST는 파생 view.
2. **Repository 경계 유지**. store/edit service가 parser를 직접 호출하지 않는다.
3. **Object-local patch 우선**. 작은 편집 때문에 문서 전체를 다시 stringify하지 않는다.
4. **attributeRanges는 optional**. 첫 버전은 opening line 전체 재구성 방식. 개별 attribute range 추출은 이후 최적화.
5. **Runtime interaction state와 draft source 분리**. drag 중 좌표는 runtime preview. source patch는 commit 시점에만.
6. **Full reparse fallback 유지**. incremental parse는 별도 후속 작업 (`docs/features/incremental-parse/README.md`).

---

## 참고 문서

- PRD 전문: `docs/features/bi-editing/README.md`
- Incremental parse 후속 작업: `docs/features/incremental-parse/README.md`
- 프로젝트 규칙: `RULE.md`
- 디자인 규칙: `DESIGN.md`
- 에이전트 규칙: `CLAUDE.md`
