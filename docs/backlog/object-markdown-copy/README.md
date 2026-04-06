# 백로그: 오브젝트 Markdown Copy

## 문제

현재 Boardmark의 `copySelection()`은 캔버스 내부 붙여넣기를 위한 구조화 clipboard payload를 만든다.

- 캔버스 안에서는 `copy -> paste`가 동작한다
- 하지만 메모장, 채팅창, 문서 편집기, 외부 AI 툴에 붙여넣으면 바로 쓸 수 있는 `text/plain` markdown은 없다
- 결과적으로 사용자는 캔버스 안의 note body나 edge label을 다른 도구로 재활용하려면 다시 열어서 수동 복사해야 한다

이건 구현 난이도에 비해 체감 가치가 큰 마찰이다.

## 왜 ROI가 높은가

이 기능은 새 오브젝트 타입이나 복잡한 렌더링 없이 바로 사용 빈도가 높다.

- note 내용을 외부 메모장으로 바로 옮길 수 있다
- AI 툴이나 채팅창에 바로 붙여넣어 재사용할 수 있다
- Boardmark를 "캔버스 전용 편집기"가 아니라 "markdown 작업 허브"처럼 쓸 수 있다
- 기존 내부 clipboard 흐름을 버리지 않고 확장만 하면 된다

즉 사용자는 새로운 UI를 배우지 않아도 기존 `copy` 동작의 가치가 커진다.

## 요구를 어떻게 해석할 것인가

여기에는 두 가지 해석이 있다.

1. 선택 오브젝트의 전체 Boardmark object block을 복사한다
2. 선택 오브젝트의 사용자 콘텐츠 body를 markdown text로 복사한다

현재 요구는 "메모장 같은 곳에 붙여넣으면 컨텐츠 바디를 활용할 수 있어야 한다"에 더 가깝다.

따라서 MVP는 2번으로 두는 것이 맞다.

- note: note body markdown
- edge: edge body 또는 label text
- group: 첫 단계에서는 미지원 또는 하위 object body 병합
- shape/image: body가 없으면 미지원 또는 빈 text

즉 첫 단계 목표는 "Boardmark source object 복사"가 아니라 "외부 소비 가능한 markdown text 복사"다.

## 핵심 아이디어

복사를 한 종류로 유지하되, clipboard 표현을 두 가지로 만든다.

- 내부용 structured clipboard payload
- 외부용 `text/plain` markdown payload

이 두 surface를 동시에 쓰면 아래가 같이 성립한다.

- Boardmark 내부 paste는 기존처럼 오브젝트 복제 semantics를 유지한다
- 외부 앱 paste는 markdown text를 받는다

즉 "copy는 하나지만 표현은 둘"이라는 구조가 핵심이다.

## 제안 구조

### 1. selection serialization 분리

현재 selection copy는 내부 payload 생성에 집중돼 있다.

여기에 외부 text 복사를 추가하려면 serialization을 두 갈래로 분리하는 편이 안전하다.

```ts
type SelectionClipboardSerialization = {
  internalPayload: CanvasClipboardPayload
  plainText: string | null
}
```

### 2. plain text 전용 serializer 추가

plain text serializer는 선택된 오브젝트에서 외부용 markdown text만 뽑는다.

```ts
interface SelectionPlainTextSerializer {
  serializeSelectionToPlainText(input: SelectionPlainTextInput): string | null
}
```

이 serializer는 paste offset, regenerated id, group remap 같은 내부 clipboard 관심사를 몰라도 된다.

### 3. clipboard write adapter 분리

시스템 clipboard 접근은 런타임 제약이 있으므로 store 안에 직접 박아넣기보다 adapter로 둔다.

```ts
interface SystemClipboardWriter {
  writePlainText(text: string): Promise<void>
}
```

web/desktop 제약이 다르면 adapter 구현을 분리하면 된다.

### 4. copySelection 흐름

추천 흐름은 아래다.

1. 현재 selection에서 내부 clipboard payload 생성
2. 같은 selection에서 plain markdown text 생성
3. store에는 기존처럼 internal payload 저장
4. 시스템 clipboard에 `text/plain` 쓰기 시도
5. 시스템 clipboard 쓰기 실패는 내부 copy 전체 실패로 간주하지 않고, operation error surface로만 드러낸다

핵심은 Boardmark 내부 paste 기능을 시스템 clipboard availability에 묶지 않는 것이다.

## 왜 기존 copy를 대체하면 안 되나

기존 copy는 오브젝트 재생성을 위한 구조 정보가 필요하다.

- node geometry
- edge 연결
- group membership
- z
- lock 등 메타데이터

반면 외부 메모장 paste는 이런 구조를 이해하지 못한다.

즉 하나의 clipboard 표현으로 두 요구를 모두 만족시키려 하면 둘 다 어색해진다.

따라서 아래 분리가 맞다.

- internal clipboard: Boardmark paste fidelity
- plain text clipboard: 외부 재활용성

## MVP 제안

### note

- 선택한 note가 1개면 body markdown만 복사
- 여러 note가 선택되면 body를 `\n\n---\n\n` 같은 구분자로 연결

### edge

- edge body가 있으면 그 text를 포함
- edge만 단독 선택일 때는 body 그대로 복사

### note + edge 혼합 선택

- 첫 단계에서는 top-level selection order 기준으로 markdown text를 이어붙인다
- 구분자는 명시적으로 둔다

### shape / image / group

- body가 없으면 첫 단계에서는 plain text export 대상에서 제외한다
- 전체 selection이 body 없는 오브젝트뿐이면 plain text는 `null`로 둔다

이렇게 시작하면 가장 가치 높은 note/edge 활용 경로를 먼저 닫을 수 있다.

## 선택 순서와 출력 포맷

여기에도 해석이 필요하다.

가능한 기준:

- 현재 selection 순서
- 문서 source 순서
- 캔버스 z 순서
- 화면 위치 순서

MVP에서는 문서 source 순서를 추천한다.

이유:

- 가장 안정적이다
- 사용자가 source 결과를 예측하기 쉽다
- geometry나 z 변경과 무관하게 text export가 흔들리지 않는다

## API 스케치

```ts
type PlainTextCopyResult =
  | { status: 'empty' }
  | { status: 'ready'; text: string }

interface SelectionPlainTextSerializer {
  serializeSelectionToPlainText(input: {
    nodes: CanvasNode[]
    edges: CanvasEdge[]
    groups: CanvasGroup[]
    selectedNodeIds: string[]
    selectedEdgeIds: string[]
    selectedGroupIds: string[]
  }): PlainTextCopyResult
}

interface SystemClipboardWriter {
  writePlainText(text: string): Promise<void>
}
```

Store action은 예를 들어 아래 정도가 가능하다.

```ts
copySelection: () => Promise<void>
copySelectionAsMarkdown: () => Promise<void>
```

하지만 첫 단계에서는 command를 새로 늘리기보다, 기존 `copySelection()`이 두 payload를 함께 준비하는 편이 더 자연스럽다.

## UX 제안

첫 단계는 새로운 메뉴를 굳이 만들지 않아도 된다.

- `Cmd/Ctrl+C`
- context menu `Copy`

이 두 surface는 그대로 유지한다.

사용자는:

- Boardmark 안에 붙여넣으면 오브젝트가 복제되고
- 메모장에 붙여넣으면 markdown body가 들어간다

즉 학습 비용이 거의 없다.

후속 단계에서만 별도 메뉴를 검토한다.

- `Copy as markdown`
- `Copy object block`

## 위험과 경계

### 1. 시스템 clipboard 권한/환경 차이

web과 desktop의 clipboard write 제약이 다를 수 있다.

그래서 시스템 clipboard write는 adapter 경계로 분리해야 한다.

### 2. 다중 선택 출력 포맷 논쟁

여러 오브젝트를 어떤 구분자로 이어붙일지는 취향 문제가 생길 수 있다.

그래서 첫 단계는 단순하고 예측 가능한 delimiter 하나를 고정하는 편이 낫다.

### 3. 내부 copy 회귀

외부 clipboard 요구를 넣다가 기존 `pasteClipboard()` fidelity를 깨뜨리면 안 된다.

따라서 structured payload 생성과 plain text 생성은 서로 독립 경로로 유지해야 한다.

### 4. body 없는 오브젝트

모든 오브젝트를 같은 수준으로 지원하려 하면 기능 범위가 커진다.

첫 단계는 note/edge 중심이 맞다.

## 추천 구현 순서

1. selection plain text serializer 추가
2. 시스템 clipboard writer adapter 추가
3. `copySelection()`에서 internal payload + plain text를 함께 준비
4. note/edge 단일 선택 케이스를 먼저 닫기
5. 다중 선택 join rule 추가
6. 실패 시 operation error와 fallback policy 정리

## 범위 밖

이 backlog는 아래를 바로 포함하지 않는다.

- `Copy object block` 전체 directive export
- markdown와 rich text를 동시에 쓰는 multi-format clipboard
- HTML clipboard
- drag-copy 또는 share sheet 연동
- body 없는 shape/image/group의 텍스트 표현 표준화

## 현재 코드와 연결되는 지점

- `packages/canvas-app/src/store/canvas-store-slices.ts`
- `packages/canvas-app/src/store/canvas-store-types.ts`
- `packages/canvas-app/src/app/commands/canvas-object-commands.ts`
- `docs/features/object-commands/README.md`
- `docs/features/object-commands-followup/README.md`

## 한 줄 결론

오브젝트 markdown copy는 기존 copy를 대체하는 기능이 아니라, 내부 구조화 clipboard 위에 외부용 `text/plain` markdown body를 함께 얹는 기능이다. note와 edge 중심으로 시작하면 구현 대비 체감 가치가 크고, Boardmark의 활용 범위를 가장 빠르게 넓힐 수 있다.
