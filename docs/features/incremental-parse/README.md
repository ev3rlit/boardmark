# Incremental Parse & Source Map Fast Path PRD

## 1. 목적

이 문서는 `docs/features/bi-editing/README.md`에서 분리된 후속 최적화 작업이다.

bi-editing 단계에서는 매 edit commit마다 전체 `.canvas.md` source를 다시 parse해서 `CanvasDocumentRecord`를 만든다.
이 full reparse 경로는 정확성과 구현 단순성 면에서 올바른 첫 선택이다.

그러나 문서 규모가 커지거나 geometry edit가 빈번해지면, remark/unified 기반 full parse 비용이 사용자 체감 지연을 만들 수 있다.

이 문서는 그 시점에 도입할 **incremental parse 또는 source map 부분 갱신 fast path**의 방향을 정리한다.

---

## 2. 선행 조건

이 작업은 아래가 먼저 완료되어야 한다.

- bi-editing Phase 1: Object Source Map Foundation
- bi-editing Phase 2: Geometry Patch Pipeline
- Phase 2 완료 후 성능 측정에서 병목이 확인됨

성능 병목이 확인되지 않으면 이 작업은 보류한다.

---

## 3. 문제 정의

### 3.1 현재 경로

```
edit intent
  -> patch applier가 source 문자열 수정
  -> documentRepository.readSource(nextSource)
  -> parseCanvasDocument(nextSource)        ← full reparse
  -> buildRecord(parseResult)
  -> store 갱신
```

`parseCanvasDocument`는 아래를 수행한다.

1. YAML frontmatter 분리
2. remark/unified로 전체 markdown AST 생성
3. containerDirective 방문 및 node/edge 추출
4. source map 계산

이 중 2번(remark/unified full parse)이 가장 비용이 크다.

### 3.2 관찰 대상 시나리오

- note 50개 이상인 문서에서 연속 geometry edit (이동 후 이동)
- content edit 후 즉시 geometry edit
- debounced content edit가 짧은 간격으로 여러 번 발생하는 경우

### 3.3 목표 지표

- edit commit에서 store 갱신 완료까지 **16ms 이내** (60fps frame budget)
- 최소 목표: **50ms 이내** (사용자 체감 지연 없음)

---

## 4. 가능한 전략

### 4.1 Strategy A: Source Map 부분 갱신 (Patch-Aware Source Map Shift)

**핵심 아이디어**: patch가 object-local이면 다른 object의 source map은 offset만 shift하면 된다.

작업 내용:

1. patch applier가 patch의 위치와 크기 변화량(delta)을 반환한다.
2. patch 대상 object는 full reparse 없이 source map을 직접 재계산한다.
3. patch 이후에 위치하는 다른 object들의 source map은 delta만큼 offset을 shift한다.
4. patch 이전에 위치하는 object들의 source map은 변경 없이 유지한다.
5. 재정규화 대신 shifted source map + 기존 AST 일부를 합성해서 next record를 만든다.

장점:

- full reparse를 완전히 건너뛸 수 있다.
- object-local patch 원칙과 자연스럽게 맞는다.

단점:

- source map shift 계산이 틀리면 이후 모든 patch가 잘못된 위치를 참조한다.
- 누적 drift를 감지하고 복구하는 메커니즘이 필요하다.
- 검증: 주기적으로 full reparse 결과와 비교하는 assertion이 필요할 수 있다.

### 4.2 Strategy B: Partial Reparse (Directive-Level Incremental Parse)

**핵심 아이디어**: 변경된 directive만 다시 parse하고, 나머지는 기존 AST를 재사용한다.

작업 내용:

1. patch 대상 object의 `objectRange`를 사용해 변경된 directive block만 추출한다.
2. 해당 block만 remark/unified로 parse한다.
3. 기존 AST에서 해당 object를 교체한다.
4. 나머지 object의 source map은 Strategy A와 동일하게 offset shift한다.

장점:

- 변경된 object는 정확하게 reparse되므로 drift 위험이 없다.
- remark parse 범위가 줄어서 비용이 감소한다.

단점:

- directive block을 독립적으로 parse할 수 있는지 remark/unified 호환성 확인이 필요하다.
- frontmatter 변경은 여전히 full reparse가 필요하다.
- 전체 document context 없이 단일 directive를 parse하면 결과가 달라질 수 있다.

### 4.3 Strategy C: Geometry-Only Fast Path

**핵심 아이디어**: geometry edit는 opening line만 바꾸므로, AST의 content 부분은 절대 변하지 않는다. 이 불변성을 활용한다.

작업 내용:

1. geometry edit에서는 full reparse를 건너뛴다.
2. 대상 object의 attribute 값만 AST에서 직접 갱신한다.
3. source map은 Strategy A 방식으로 shift한다.
4. content edit가 발생하면 그때만 full reparse를 수행한다.

장점:

- 가장 빈번한 edit 종류(geometry)에 대해 최적화된다.
- content는 변하지 않았으므로 AST 직접 수정이 안전하다.
- 구현 범위가 좁다.

단점:

- geometry-only라는 가정이 깨지면 (예: geometry + content 동시 edit) fallback이 필요하다.
- edit intent 종류별로 다른 경로를 타게 되어 코드 경로가 분기된다.

---

## 5. 권장 방향

**Strategy C (Geometry-Only Fast Path)를 먼저 구현하고, 필요하면 Strategy A로 확장한다.**

이유:

- bi-editing에서 가장 빈번한 edit는 geometry(drag/resize)다.
- geometry edit는 opening line만 변경하므로 불변성 가정이 강하다.
- Strategy C는 구현 범위가 가장 좁고 검증이 쉽다.
- Strategy A는 content edit 최적화가 필요해질 때 추가한다.
- Strategy B는 remark 호환성 리스크가 있으므로 마지막 수단으로 둔다.

---

## 6. 구현 원칙

### 6.1 Full Reparse를 Fallback으로 항상 유지한다

- fast path는 최적화 경로일 뿐, full reparse 경로를 제거하지 않는다.
- fast path 결과에 대한 신뢰도가 낮은 상황에서는 full reparse로 fallback한다.
- 예: N번 연속 fast path 후 주기적으로 full reparse로 검증한다.

### 6.2 Repository 경계를 유지한다

- fast path도 repository 계약 안에서 수행한다.
- store나 edit service가 parser를 직접 호출하는 우회를 만들지 않는다.
- repository에 `readSourceIncremental(source, previousRecord, patchInfo)` 같은 새 메서드를 추가하는 방식으로 확장한다.

### 6.3 Source Map 정합성을 검증 가능하게 한다

- dev/test 환경에서 fast path 결과와 full reparse 결과를 비교하는 assertion을 둔다.
- source map drift가 감지되면 즉시 full reparse로 복구하고 경고를 남�다.

---

## 7. 새 public contract 초안

```ts
type CanvasPatchInfo = {
  patchOffset: number     // patch가 시작되는 source offset
  patchDelta: number      // source 길이 변화량 (양수: 늘어남, 음수: 줄어듦)
  affectedObjectId: string
  intentKind: CanvasDocumentEditIntent['kind']
}
```

```ts
// repository 확장
type CanvasDocumentRepository = {
  // 기존
  read: (locator: CanvasDocumentLocator) => ResultAsync<CanvasDocumentRecord, CanvasDocumentRepositoryError>
  readSource: (input: CanvasDocumentSourceInput) => Result<CanvasDocumentRecord, CanvasDocumentRepositoryError>
  save: (input: CanvasDocumentSaveInput) => ResultAsync<CanvasDocumentRecord, CanvasDocumentRepositoryError>

  // 신규: incremental parse fast path
  readSourceIncremental?: (
    input: CanvasDocumentSourceInput,
    previousRecord: CanvasDocumentRecord,
    patchInfo: CanvasPatchInfo
  ) => Result<CanvasDocumentRecord, CanvasDocumentRepositoryError>
}
```

`readSourceIncremental`이 실패하거나 구현되지 않은 경우 `readSource`로 fallback한다.

---

## 8. 테스트 계획

### Unit Tests

- geometry patch 후 source map shift가 올바른지
- shift된 source map으로 후속 geometry patch가 정확한지
- N번 연속 fast path 후 full reparse 결과와 일치하는지
- content edit 후에는 full reparse로 fallback하는지
- patch delta 계산이 정확한지

### Parity Tests

- 동일한 edit sequence를 fast path와 full reparse 양쪽으로 수행한 결과가 같은지
- 100회 연속 geometry edit 후 source map drift가 없는지

### Performance Tests

- note 50개 문서에서 geometry edit commit 시간 측정
- full reparse vs fast path 비용 비교
- 목표: fast path에서 16ms 이내

---

## 9. 범위 제외

- content edit incremental parse (Strategy A/B 영역, 이 단계에서는 제외)
- structural edit(create/delete) incremental parse (full reparse 유지)
- frontmatter 변경 incremental parse (full reparse 유지)
- multi-object batch edit 최적화

---

## 10. 수용 기준

- geometry edit commit이 목표 시간 이내에 완료된다.
- fast path 결과가 full reparse 결과와 parity test를 통과한다.
- fast path 실패 시 full reparse로 자동 fallback한다.
- repository 경계가 유지된다 (store/edit service가 parser를 직접 호출하지 않는다).
