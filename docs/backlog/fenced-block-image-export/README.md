# 백로그: Fenced Block 공통 이미지 Export 레이어

## 문제

현재 Boardmark는 fenced block 렌더링 경계는 이미 어느 정도 정리되어 있지만, 이미지로 내보내는 기능은 공통 경계가 없다.

- `mermaid`는 SVG 기반이라 DOM snapshot보다 더 정확한 export 경로가 필요할 수 있다
- 일반 fenced code block은 syntax-highlighted DOM을 그대로 이미지화하면 충분할 가능성이 크다
- `sandpack`은 iframe sandbox를 포함하므로 같은 방식으로 캡처되지 않을 수 있다
- 추후에는 fenced block만 아니라 canvas object 자체도 이미지로 export하고 싶어질 수 있다

즉 "보이는 것을 이미지로 내보낸다"는 요구는 공통이지만, 구현 방식은 surface별로 다를 수 있다.

## 목표

첫 단계에서 해결하고 싶은 것은 세 가지다.

1. `mermaid`, 일반 fenced code block, `sandpack` 같은 서로 다른 preview block에 공통 export 진입점을 둔다.
2. export 구현은 block별로 다를 수 있게 둔다.
3. 이후 note, shape, image, group, selection 같은 object-level export도 같은 방향으로 확장 가능하게 둔다.

## 핵심 아이디어

렌더링 계약과 export 계약을 분리한다.

- 렌더러는 여전히 "무엇을 어떻게 보여주는가"만 책임진다
- exporter는 "현재 결과를 어떤 방식으로 image `Blob`으로 바꾸는가"만 책임진다
- 앱은 그 `Blob`을 어떻게 저장, 복사, 삽입하는지만 책임진다

이 구조면 렌더러와 저장 방식을 분리할 수 있다.

## 제안 레이어

### 1. parse / extract 레이어

현재처럼 fenced block source와 language를 추출한다.

- 예: `packages/ui/src/components/fenced-block/extract.ts`

이 레이어는 export를 알면 안 된다.

### 2. render descriptor 레이어

현재 registry가 `language -> component` 정도를 담당한다.

이것을 아래처럼 `language -> descriptor`로 넓힌다.

```ts
type FencedBlockDescriptor = {
  render: React.LazyExoticComponent<FencedBlockRenderer>
  exporter: BlockImageExporter
}
```

중요한 점은 component와 exporter를 같은 descriptor에 두되, 둘의 책임은 분리하는 것이다.

### 3. block preview surface 레이어

공통 preview shell을 둔다.

이 shell이 담당할 일:

- block source와 language 식별
- descriptor 조회
- export 버튼이나 action affordance 노출
- export 중 상태 표시
- exporter에 넘길 DOM root ref 관리

즉, export UX는 공통 surface에 두고 실제 export 구현은 exporter에 위임한다.

### 4. export runtime 레이어

저수준 이미지 변환만 담당한다.

예:

- DOM subtree snapshot
- SVG serialize
- canvas rasterize
- custom async export

이 레이어는 file save, clipboard write, canvas document mutation을 소유하지 않는다.

### 5. app action 레이어

`packages/canvas-app` 같은 앱 레이어는 export 결과를 사용한다.

예:

- PNG 다운로드
- clipboard에 이미지 복사
- canvas image object로 삽입
- asset 파일로 저장

즉 UI/runtime은 `Blob`까지만 책임지고, 제품 동작은 앱이 책임진다.

## 인터페이스는 처음부터 열어둔다

향후 export 대상이 여러 개가 될 수 있으므로, exporter는 처음부터 인터페이스 경계로 둔다.

```ts
type ImageExportRequest = {
  rootElement: HTMLElement | null
  fileBaseName: string
  pixelRatio: number
  background?: string
}

type ImageExportResult = {
  blob: Blob
  mimeType: string
  fileName: string
}

interface ImageExporter {
  exportImage(input: ImageExportRequest): Promise<ImageExportResult>
}
```

이때 중요한 점:

- `ImageExporter`는 export 대상이 fenced block인지 canvas object인지 알 필요가 없다
- 대상별 차이는 상위 descriptor나 adapter에서 해결한다
- 결국 공통 runtime contract는 "DOM 또는 동등한 export context를 받아 `Blob`을 돌려준다" 정도로 좁게 유지한다

## 대상별 adapter를 둔다

export 대상이 늘어날 것을 고려하면 exporter 하나로 모든 surface를 흡수하려고 하지 않는 편이 낫다.

예상 구조는 아래와 같다.

```ts
type ExportableSurfaceDescriptor = {
  kind: 'fenced-block' | 'canvas-object' | 'selection'
  exporter: ImageExporter
}

type FencedBlockExportDescriptor = ExportableSurfaceDescriptor & {
  kind: 'fenced-block'
  language: string
  render: React.LazyExoticComponent<FencedBlockRenderer>
}

type CanvasObjectExportDescriptor = ExportableSurfaceDescriptor & {
  kind: 'canvas-object'
  objectType: string
}
```

즉 공통 runtime interface는 작게 유지하고, 어떤 surface에 붙는지는 descriptor가 설명한다.

## 왜 단일 구현이 아니라 인터페이스여야 하나

### `mermaid`

- 실제 SVG를 직접 export하는 편이 품질과 배경 처리 면에서 유리할 수 있다

### 일반 code block

- 이미 렌더된 DOM을 snapshot 하는 방식이 가장 단순하다

### `sandpack`

- iframe sandbox 제약 때문에 별도 전략이 필요하거나 첫 단계에서 unsupported일 수 있다

### 추후 canvas object export

- note 전체, shape, selection group은 block과 다른 bounds 계산, background 합성, zoom 무시 규칙이 필요할 수 있다

즉 export 진입점은 공통화할 수 있지만, 구현은 여러 개가 되는 것이 자연스럽다.

## 추천 초안

첫 단계는 아래 정도가 안전하다.

1. fenced block registry를 descriptor registry로 확장한다
2. descriptor에 `render`와 `exporter`를 함께 둔다
3. 기본 exporter는 `dom snapshot exporter` 하나로 둔다
4. `mermaid`는 필요하면 `svg exporter`를 별도 둔다
5. `sandpack`은 초기에 `unsupported exporter` 또는 custom exporter로 둔다
6. 앱 레이어는 `ImageExportResult`를 받아 저장/복사/삽입만 담당한다

## 범위 밖

이 backlog는 아래를 지금 결정하지 않는다.

- PNG만 지원할지 SVG도 사용자 옵션으로 노출할지
- clipboard export를 web/desktop에서 어떻게 나눌지
- Sandpack iframe을 실제로 캡처할지, source fallback 이미지를 쓸지
- canvas 전체 export와 object export를 같은 UI에서 노출할지

## 현재 코드와 연결되는 지점

- `packages/ui/src/components/markdown-content.tsx`
- `packages/ui/src/components/fenced-block/registry.ts`
- `packages/ui/src/components/mermaid-diagram.tsx`
- `packages/ui/src/components/sandpack-block.tsx`
- `packages/canvas-app/src/components/editor/views/special-fenced-block-view.tsx`
- `packages/canvas-app/src/services/canvas-image-service.ts`

## 한 줄 결론

공통화해야 하는 것은 "이미지 export 진입점과 결과 계약"이고, 공통화하면 안 되는 것은 "모든 surface의 export 구현"이다. 따라서 renderer와 exporter를 분리하고, exporter는 처음부터 인터페이스 경계로 두는 쪽이 이후 object export까지 가장 안전하게 이어진다.
