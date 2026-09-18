# 보드에서 OpenAPI 읽기와 수정

노트에 `openapi` 코드 블록을 작성하거나 붙여넣으면 API 문서로 표시한다. DB에는 기존과 동일하게 Markdown 원문만 저장하며, API 문서는 원문에서 다시 만드는 화면이다.

````markdown
```openapi
openapi: 3.1.1
info:
  title: 반려동물 API
  version: '1.0'
paths:
  /pets:
    get:
      summary: 반려동물 목록
      responses:
        '200':
          description: 조회 성공
          content:
            application/json:
              schema:
                type: array
                items:
                  type: string
```
````

같은 `openapi` 블록 안에 JSON을 넣어도 된다. 일반 `yaml`, `json` 블록은 기존 코드 화면을 유지한다. 내부 파라미터 참조·요청 본문·응답 스키마·순환 참조가 있는 [전체 예제](../examples/openapi-pets.yaml)를 블록 안에 붙여넣어 볼 수 있다.

일반 본문에는 여는 줄과 닫는 줄을 포함한 **완성된 OpenAPI 블록 하나**를 붙여넣는다. 여러 블록과 본문이 섞인 문서 전체의 Markdown 붙여넣기는 이번에 확장하지 않았다. 노트가 작으면 크기를 늘리거나 기존 Auto height 기능과 본문 스크롤을 사용한다. [실제 검증 결과](../verification/openapi-block.md)도 함께 확인할 수 있다.

## 사용 흐름

1. 노트를 편집하고 `openapi` 코드 블록에 명세를 입력한다.
2. 소스 입력 영역 바깥으로 이동하면 제목과 엔드포인트 목록을 볼 수 있다. 노트 편집을 완료하면 기존 저장 경로로 저장한다.
3. 경로·HTTP 메서드·요약·operationId로 검색하고 엔드포인트를 펼친다. 파라미터, 요청 본문, 응답 상태, `content → application/json → schema`를 차례로 펼쳐 내용을 확인한다. 키보드 Tab과 Enter/Space로도 탐색할 수 있다.
4. 제목 영역을 더블클릭해 노트 편집에 들어간 뒤 **OpenAPI 원본 편집**을 누른다. 수정 후 입력 영역 바깥으로 이동하면 다시 표시한다. **편집 완료** 후 `저장됨`을 확인한다.
5. 문서를 다시 열면 DB의 같은 Markdown에서 API 문서를 재생성한다. 펼침 상태와 검색어는 저장하지 않는다.

오류가 나도 노트 전체를 중단하지 않는다. 오류 이유와 원본 보기, 노트 편집 중 원본 편집 버튼을 제공한다. 원문은 파싱 성공 여부와 관계없이 기존 경로로 수정·저장할 수 있다.

## 지원 범위

- OpenAPI **3.0.x와 3.1.x**의 YAML/JSON. Swagger 2.0, OpenAPI 3.2 이상은 명시적으로 거절한다.
- `info` 제목·버전·설명, `paths`의 GET/PUT/POST/DELETE/OPTIONS/HEAD/PATCH/TRACE, 요약·설명·선택적인 operationId를 표시한다.
- 경로 공통 파라미터와 작업 파라미터를 합친다. 같은 `in + name`이면 작업 쪽 정의가 우선한다.
- 요청 본문과 응답은 미디어 타입·스키마·예제를 포함해 필드 트리로 표시한다. `properties`, `items`, `required`, `allOf`/`oneOf`/`anyOf`, enum, nullable, boolean schema 등은 명세에 적힌 구조 그대로 탐색한다. JSON Schema를 실행하거나 조합을 하나의 스키마로 병합하지 않는다.
- 같은 문서의 `#/…` JSON Pointer 참조를 지원한다. `~0`/`~1`, URI 인코딩된 키를 처리한다. 경로·파라미터·요청 본문·응답의 Reference Object는 먼저 해석하고, 스키마의 참조는 별도 가지로 보여 준다. 스키마 `$ref` 옆 필드는 원문 구조로 함께 표시하며 버전별 제약 평가를 뜻하지 않는다.
- 스키마의 자기 참조·상호 참조 및 YAML 별칭 순환은 상위 구조를 다시 만나는 위치에서 멈춘다. 스키마 밖의 순환 Reference Object는 오류로 표시한다.
- 외부 파일·URL·anchor 참조는 불러오지 않는다. 스키마 안에서는 경고와 해당 참조 위치를 표시하고, 엔드포인트 구조 해석에 필요한 참조라면 오류 상태로 표시한다. 사용되지 않은 components 전체를 검사하지는 않는다.
- `$id`로 기준 URI를 바꾸는 스키마와 `$dynamicRef`는 지원하지 않으며 발견하면 오류를 표시한다. 사용자 정의 JSON Schema dialect 실행은 지원하지 않는다.
- 설명은 안전한 일반 텍스트다. Markdown/HTML 해석이나 원격 이미지 로드는 하지 않는다.
- 500,000자, 표시 모델 20,000개 항목을 넘으면 오류로 안내한다. 32단계를 넘는 구조는 경고와 원본 확인 안내로 접는다.

이 기능은 **읽기용 문서 투영**이다. 필수 헤더·경로·작업·파라미터·응답 등의 표시 전제와 참조를 확인하지만 OpenAPI 전체 적합성 검증기는 아니다. 인증·서버 설정·링크·보안 요구·callbacks·webhooks 전용 화면, API 실행, 인증정보 관리, URL 동기화는 제공하지 않는다. callbacks/webhooks가 있으면 표시하지 않는다는 안내를 낸다.

엔드포인트의 파생 식별자는 대문자 메서드와 경로를 합친 `GET /pets/{id}`다. operationId의 존재나 유일성, 임시 DOM ID에 의존하지 않는다. 이 키는 **한 명세 블록 안에서** 식별하며, 별도 그래프·블록 영구 ID·문서 간 연결 계약은 추가하지 않았다.

## 구현 선택과 근거

| 선택지 | 실제 지원과 통합 비용 | 이번 판단 |
| --- | --- | --- |
| Swagger UI | OpenAPI 3.0/3.1 지원, 별도 뷰어 의존성·스타일과 요청 실행 설정 필요 | 이번 범위보다 넓은 독립 문서 화면 |
| Redoc CE | OpenAPI 2.0/3.0/3.1 지원, 별도 뷰어 의존성·문서 레이아웃 통합 필요 | 좁은 노트 내 탐색보다 전체 문서 구성에 가까움 |
| 작은 전용 React 뷰어 | 위에 명시한 부분 범위, 기존 js-yaml로 YAML/JSON 읽기, 기존 토큰과 lazy fenced renderer 사용 | 새 런타임 의존성과 저장 계약 변경 없이 필요한 읽기·편집 흐름 제공 |

공식 근거: [OpenAPI 3.0.4](https://spec.openapis.org/oas/v3.0.4.html), [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), [Swagger UI 호환성](https://github.com/swagger-api/swagger-ui/blob/main/README.md), [Redoc CE 지원 범위](https://redocly.com/docs/redoc/v3.x), [js-yaml](https://github.com/nodeca/js-yaml). js-yaml은 YAML 구문 파서이며 OpenAPI 버전 검증 라이브러리가 아니다. JSON_SCHEMA 옵션으로 날짜·사용자 정의 태그의 임의 타입 변환을 피한다.

파싱·기본 검증·참조 탐색·표시 모델 생성은 `packages/ui/src/lib/openapi-document.ts`, React 표시와 검색은 `packages/ui/src/components/openapi-block.tsx`가 담당한다. Markdown 저장 및 편집권 API는 변경하지 않는다.
