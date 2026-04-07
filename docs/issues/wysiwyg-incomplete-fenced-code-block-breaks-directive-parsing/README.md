# WYSIWYG 미완성 Fenced Code Block이 Directive Parsing을 깨뜨리는 문제

## 요약

현재 WYSIWYG body editing은 사용자가 입력하는 중간 상태의 markdown도 바로 flush합니다. 이때 사용자가 fenced code block을 추가하려고 여는 fence만 입력하고 아직 닫는 fence를 입력하지 않은 상태라면, editor는 `::: note` body 내부에 열린 code fence가 있는 markdown을 내보냅니다.

canvas parser는 이 상태에서 note body의 나머지 영역, 즉 note를 닫는 `:::`까지도 아직 fence 내부로 간주합니다. 그 결과 바깥 directive가 닫히지 않은 것처럼 보이게 되고, repository reparse는 아래와 같은 에러로 실패합니다.

`Canvas repository could not parse "...canvas.md": Directive "note" starting on line X is missing a closing ":::" line.`

즉 이 문제의 1차 원인은 `replace-object-body` range 자체가 잘못됐기보다는, 아직 문법적으로 완성되지 않은 fenced markdown이 canonical repository parse 경계까지 흘러들어가는 데 있습니다.

## 재현 방법

관찰된 사용자 흐름:

1. production WYSIWYG surface에서 note body 편집을 시작합니다.
2. 예를 들어 아래와 같이 fenced block 시작 마커를 입력합니다.
   ```md
   ```ts
   ```
3. `Enter`를 누른 뒤, 닫는 ````` ``` ````` 줄을 아직 입력하지 않은 상태에서 code를 입력합니다.
4. debounced editing flush가 실행되기를 기다립니다.

실제 결과:

- `updateEditingMarkdown`가 flush를 예약합니다.
- `replace-object-body`가 현재 note body markdown을 커밋합니다.
- repository reparse는 note closing `:::`를 더 이상 볼 수 없기 때문에 실패합니다.

## 근거

### 1. parser 동작이 실제 production 에러와 일치합니다

`createCanvasMarkdownDocumentRepository()`를 이용해 로컬 재현을 해보면:

- note body 안에 incomplete fenced block이 있는 경우:
  - 결과: `Canvas repository could not parse "incomplete.canvas.md": Directive "note" starting on line 6 is missing a closing ":::" line.`
- 같은 내용에서 fenced block을 정상적으로 닫은 경우:
  - 결과: `ok`

즉 이 에러는 note body 내부에 닫히지 않은 markdown fence가 있을 때 정확히 재현됩니다.

### 2. parser 구현이 왜 바깥 `:::`를 무시하는지 설명해줍니다

`packages/canvas-parser/src/index.ts`

- `splitObjectBlocks(...)`는 `fenceMarker` 상태를 추적합니다.
- directive block이 열려 있는 동안에도, `:::` 줄은 `fenceMarker === null`일 때만 directive closing line으로 처리됩니다.
- ````` ```ts ````` 같은 opening code fence를 만나면 `fenceMarker`가 활성화됩니다.
- 대응되는 closing fence가 나오기 전까지 note의 closing `:::`는 directive closer로 취급되지 않습니다.

그래서 incomplete fenced block이 들어간 note body는 “fenced markdown 문제”가 아니라 “directive closing line이 없음”이라는 에러로 나타납니다.

### 3. body replacement 경로에는 directive-safe buffering이 없습니다

`packages/canvas-app/src/store/canvas-store-slices.ts`

- `updateEditingMarkdown(...)`는 최신 markdown 문자열을 editing session state에 저장합니다.
- 그리고 바로 `scheduleEditingFlush()`를 호출합니다.
- `flushEditingSession(...)`는 `readEditingIntent(session, flushedMarkdown)`을 통해 `replace-object-body` intent를 커밋합니다.

`packages/canvas-app/src/services/edit-object-compilers.ts`

- `replace-object-body`는 직접 `replaceBodyRange(...)`로 컴파일됩니다.

`packages/canvas-app/src/services/edit-compiler-helpers.ts`

- `replaceBodyRange(...)`는 `serializeBodyFragment(markdown)`를 사용합니다.
- `serializeBodyFragment(...)`는 줄바꿈 정규화와 trailing newline 처리만 수행합니다.
- 즉, 입력된 markdown이 아직 미완성인지 여부는 검사하지 않습니다.

정리하면 현재 edit pipeline은 “현재 markdown fragment가 이미 directive body 안에서 parse 가능한 상태”라는 전제를 갖고 있습니다.

### 4. WYSIWYG surface는 입력 중간 상태의 markdown도 즉시 내보냅니다

`packages/canvas-app/src/components/editor/wysiwyg-editor-surface.tsx`

- `onUpdate({ editor })`는 `onMarkdownChange(editor.getMarkdown())`를 호출합니다.
- 이 호출은 일반 typing 중간 상태에서도 그대로 발생합니다.

대부분의 inline edit에는 이 방식이 문제되지 않습니다. 하지만 fenced block은 closing fence가 나중에 입력되어야 문법이 닫히므로, 중간 상태 markdown을 flush하는 순간 repository 경계에서 unsafe해집니다.

## 근본 원인

근본 원인은 아래 3가지가 동시에 성립하기 때문입니다.

1. WYSIWYG editor가 입력 중간 상태의 markdown도 매번 serialize합니다.
2. store가 그 markdown을 canonical repository/source patch pipeline으로 flush합니다.
3. canvas parser는 directive body 내부의 fenced code block이 균형 잡힌 상태여야만 바깥 directive closing `:::`를 정상적으로 인식할 수 있습니다.

즉 현재 시스템은

- “editor가 내보낸 최신 markdown은 언제나 repository reparse에 안전하다”

라고 가정하고 있는데,

- incomplete fenced block 입력은 그 가정을 깨는 예외입니다.

## 왜 fenced code block 추가 시에 특히 잘 발생하는가

일반적인 편집은 각 타이핑 순간에도 대부분 문법적으로 유효합니다.

- paragraph 편집
- bold/italic mark
- link
- 이미 완성된 custom code block node 내부 수정

하지만 fenced markdown을 처음부터 타이핑하는 경우는 다릅니다.

- opening fence는 생겼지만
- closing fence는 아직 없는 순간이 존재합니다.

이 순간 note body 전체는 document parser 입장에서 구조적으로 애매해집니다. 그래서 fenced code block을 새로 추가하는 도중, 특히 opening fence 뒤에서 `Enter`를 누른 직후에 문제가 잘 드러납니다.

## 2차 증상

### `StatusPanels`의 duplicate React key warning

콘솔에는 아래 warning도 같이 보입니다.

- 동일한 parse message에 대한 duplicate key warning

이건 fenced block parsing 실패의 1차 원인은 아니고, invalid-state 경로가 만든 2차 UI 문제입니다.

관련 파일:

- `packages/canvas-app/src/store/canvas-store-projection.ts`
- `packages/canvas-app/src/components/controls/status-panels.tsx`

invalid editing outcome이 발생하면:

- `createCanvasInvalidDocumentPatch(...)`가 같은 message를 두 군데에 씁니다.
  - `invalidState.message`
  - `operationError`

그 뒤 `StatusPanels`는 이 둘을 모두 `messages` 배열에 넣고, `key={message}`로 렌더합니다.

그래서 동일 문자열이 두 번 들어오면 React duplicate key warning이 발생합니다. 이건 fenced block 문제의 근본 원인이 아니라, 동일 메시지를 중복 표시하는 렌더링 이슈입니다.

## 영향 경계

- `packages/canvas-app/src/components/editor/wysiwyg-editor-surface.tsx`
- `packages/canvas-app/src/store/canvas-store-slices.ts`
- `packages/canvas-app/src/services/edit-object-compilers.ts`
- `packages/canvas-app/src/services/edit-compiler-helpers.ts`
- `packages/canvas-parser/src/index.ts`
- `packages/canvas-app/src/components/controls/status-panels.tsx`

## 근본 원인이 아닌 것들

현재 근거로는 아래가 1차 원인으로 보이지 않습니다.

- 잘못된 `bodyRange` offset
- transaction resolver ordering
- 잘못된 `replace-object-body` anchor selection
- 이미 완성된 code block에 대한 custom node view serialization 자체

이 영역들도 추후 hardening 대상은 될 수 있지만, 지금 보고된 “missing closing `:::` line” 에러를 직접 설명해주지는 못합니다.

## 가능한 수정 방향

이 문서는 분석 문서이며, 아직 fix를 구현하지 않았습니다. 다만 현재 분석상 해결 방향은 아래 중 하나의 경계에서 나와야 합니다.

1. transient incomplete fenced markdown이 repository parse 경계에 도달하지 않게 막는다.
   - 예: locally buffered state로만 유지하다가 syntax가 닫힌 뒤 flush
2. 사용자가 fence를 타이핑하는 순간 raw incomplete markdown이 아니라 structured editor node로 먼저 승격한다.
3. editing session 차원에서 “현재 body가 incomplete fenced block 상태”일 때 auto flush를 억제한다.

어떤 방식을 택하든 최종적으로 만족해야 할 invariant는 같습니다.

- repository reparse는 편집 중에도 항상 directive-safe한 markdown fragment만 보아야 한다.

## 권장 해석

이 문제는 parser bug로 보기보다 editor/persistence boundary bug로 보는 것이 맞습니다.

- parser는 현재 block splitting 로직에 따라 일관되게 동작하고 있습니다.
- 문제는 production WYSIWYG integration이 아직 directive body 안에서 안전하지 않은 중간 markdown을 canonical pipeline으로 flush한다는 데 있습니다.
