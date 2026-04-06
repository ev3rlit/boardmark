# Boardmark TransactionResolver PRD

## 1. 목적

이 문서는 Boardmark canvas editing 경로에 **TransactionResolver** 역할을 추가하기 위한 제품 요구사항을 정의한다.

이번 단계의 목표는 단일 edit intent를 처리하는 것을 넘어, **여러 edit unit을 하나의 transaction으로 안전하게 묶고, 그 묶음을 어떻게 적용해야 하는지 해석**할 수 있게 만드는 것이다.

핵심은 edit service가 직접 문자열 patch 적용 순서를 판단하는 구조를 유지하지 않고,  
**편집 해석 책임을 별도 resolver 엔티티로 분리**하는 것이다.

---

## 2. 배경과 문제 인식

이 아이디어는 현재 editing pipeline을 보면서 생긴 아래 우려에서 출발했다.

- 현재 history는 `성공한 문서 commit 1회`를 기준으로 기록된다.
- 일부 intent는 이미 내부적으로 여러 위치를 한 번에 수정한다.
- 실제 파일에 patch를 쓸 때, 앞선 edit에서 줄 수가 늘거나 줄면 뒤 edit의 range와 line 기준이 흔들릴 수 있다.
- 이런 drift가 누적되면 텍스트가 어긋나거나 `:::` directive object 구조가 깨질 수 있다.

즉 문제의 본질은 “intent가 하나냐 여러 개냐”보다,  
**여러 edit를 어떤 순서와 규칙으로 안전하게 적용해야 하는가**다.

이 때문에 edit service 내부에 patch 순서를 계속 추가하는 대신, 아래 책임을 맡는 새 역할이 필요하다.

- edit들을 transaction으로 묶기
- 동시에 적용 가능한 edit와 순차 적용해야 하는 edit를 구분하기
- 줄 수 변화나 구조 변화가 이후 edit anchor에 영향을 주는지 판단하기
- phase를 나누고, 각 phase 뒤에 재기준화가 필요한지 명시하기
- 전체 transaction을 안전하게 적용할 수 있는 plan으로 해석하기

---

## 3. 사용자/제품 가치

이 기능이 제공하는 가치는 아래와 같다.

- 사용자는 하나의 큰 편집 동작이 여러 내부 수정으로 나뉘더라도, 이를 하나의 undo step으로 다룰 수 있다.
- 개발자는 multi-object edit, structural edit, line-count-changing edit를 더 안전하게 추가할 수 있다.
- 문서 patch 순서가 명시적이 되어 source drift와 directive corruption 위험을 줄일 수 있다.
- history 단위, patch 해석 단위, 실제 적용 단위를 분리해 구조를 더 명확하게 유지할 수 있다.

---

## 4. 제품 요구사항

### 4.1 새 역할: TransactionResolver

Boardmark는 edit service 외부에 아래 책임을 가진 새 엔티티를 둔다.

- 인터페이스 이름은 `TransactionResolver`를 기준으로 한다.
- 구현 타입 이름은 `CanvasEditTransactionResolver`를 기준으로 한다.
- resolver는 edit execution order와 phase 구성을 해석한다.
- edit service는 “무엇을 바꾸고 싶은가”를 transaction/edit unit으로 표현하는 데 집중한다.
- resolver는 “어떤 순서와 기준으로 적용해야 안전한가”를 결정한다.
- 실제 source 반영은 resolver가 만든 결과를 바탕으로 별도 apply 단계에서 수행한다.

### 4.2 편집 단위와 history 단위

첫 버전에서 구분해야 할 단위는 아래와 같다.

- `intent`
  - 사용자 의미 단위
  - 예: move, resize, replace body, delete selection
- `edit unit`
  - 실제 source에 적용할 개별 변경 단위
  - 예: 특정 header line 교체, body range 교체, object block 제거
- `transaction`
  - 하나 이상의 edit unit을 묶는 상위 편집 단위
  - 성공 시 history entry 1개를 만든다

첫 버전 규칙:

- 사용자 action 1회는 기본적으로 transaction 1개를 만든다.
- transaction은 edit unit 여러 개를 가질 수 있다.
- history는 edit unit 기준이 아니라 **성공한 transaction 기준**으로 기록한다.

### 4.3 Transaction 해석 규칙

resolver는 transaction 안의 edit unit을 아래 규칙으로 해석해야 한다.

- 서로 겹치지 않고 줄 수 변화가 없는 edit unit은 같은 phase에서 함께 적용할 수 있다.
- 줄 수가 바뀌는 edit unit은 이후 range 계산에 영향을 줄 수 있으므로 순차 phase로 분리한다.
- 구조 edit(create/delete/group membership change 등)는 이후 source map 기준을 바꿀 수 있으므로 별도 phase로 분리한다.
- 같은 phase 안의 적용 순서는 offset이 큰 range부터 역순이 되도록 정해야 한다.
- phase 사이에서는 다음 edit가 의존하는 anchor를 다시 검증하거나 재계산해야 하는지 표시할 수 있어야 한다.

### 4.4 Reparse와 재기준화

아래 경우 resolver 결과를 소비하는 apply 단계는 결과를 재기준화할 수 있어야 한다.

- 줄 수가 바뀌는 body replacement 이후
- object create/delete 이후
- source range 재사용이 unsafe한 phase 이후

첫 버전 원칙:

- repository 경계는 유지한다.
- resolver는 어떤 phase 뒤에 재기준화가 필요한지 명시할 수 있어야 한다.
- apply 단계는 resolver 결과를 따라 phase 경계에서 reparse 기반 재기준화를 수행할 수 있어야 한다.
- 실패 시 조용한 fallback 없이 명시적 오류를 반환한다.

### 4.5 계층 책임 분리

아래 책임 분리는 필수다.

- UI/store
  - intent 발생, commit 요청, history 반영
- edit service
  - intent를 transaction 또는 edit unit 계획으로 컴파일
- transaction resolver
  - phase 구성, 순서 결정, overlap 검증, 재기준화 요구 결정
- apply 단계
  - resolver가 만든 phase plan을 실제 source에 반영
- repository
  - source를 정규화된 `CanvasDocumentRecord`로 재파싱

즉, edit service가 patch 순서 해석자와 patch executor를 동시에 맡지 않는다.

### 4.6 충돌과 오류 규칙

resolver 또는 apply 단계는 아래 상황을 명시적으로 실패시켜야 한다.

- 겹치는 range edit가 같은 phase에 들어온 경우
- stale source range로 인해 anchor를 신뢰할 수 없는 경우
- phase 적용 후 source가 invalid가 된 경우
- 재기준화 또는 reparse가 실패한 경우

금지 사항:

- broad success-shaped fallback
- 겹치는 edit를 임의 순서로 그냥 진행
- 실패를 무시하고 일부 edit만 적용한 뒤 성공처럼 반환

### 4.7 첫 버전 범위

이번 단계에서 최소로 커버해야 할 대상:

- multi-object geometry edit
- multi-object metadata edit
- batch delete
- line-count-changing body replacement
- 향후 multi-intent transaction을 수용할 수 있는 타입/경계

### 4.8 비범위

이번 단계에서 제외한다.

- collaborative multi-writer transaction
- CRDT/OT
- typing 중간 단계를 세밀하게 transaction으로 쪼개는 history
- arbitrary markdown 전 범위 patch scheduler
- cross-document transaction

---

## 5. 설계 원칙

### 5.1 새 역할은 좁고 명시적인 계약을 가져야 한다

- resolver의 public surface는 작게 유지한다.
- 한눈에 “transaction을 해석한다”는 책임이 드러나야 한다.
- 구현 세부사항인 phase 분할 규칙이나 replacement ordering은 내부에 숨긴다.

### 5.2 edit service는 compiler에 더 가깝게 축소한다

- intent별 object lookup
- edit unit 생성
- transaction metadata(label, changed objects 등) 구성

반대로 아래는 resolver 책임이다.

- 실행 순서
- 동시 적용 가능 여부 판정
- phase 분리
- 재기준화 필요 여부 표시

### 5.3 문서 source를 최종 truth로 유지한다

- transaction 처리의 최종 결과는 항상 source snapshot이어야 한다.
- AST/runtime state를 직접 조합해 성공으로 간주하지 않는다.
- 최종 결과는 repository 재정규화를 통과해야 한다.

---

## 6. 성공 기준

- 하나의 transaction이 여러 edit unit을 포함해도 source drift 없이 안정적으로 적용된다.
- 줄 수 변화가 있는 edit와 없는 edit가 명시적 규칙에 따라 해석된다.
- transaction 실패 시 partial success가 남지 않는다.
- 성공한 transaction 1회가 history entry 1개를 만든다.
- edit service와 resolver의 책임이 코드 경계에서 분리된다.

---

## 7. 수용 기준

- multi-object edit가 하나의 transaction으로 실행되고 history도 1 step만 쌓인다.
- 같은 transaction 안에서 비중첩, non-line-changing edit는 한 phase로 처리된다.
- line-count-changing edit가 포함되면 이후 edit는 안전한 후속 phase로 분리된다.
- structural edit 이후 stale range를 그대로 재사용하지 않는다.
- 겹치는 range edit가 들어오면 명시적 오류가 반환된다.
- transaction 결과 source는 repository reparse를 통과해야만 성공으로 간주된다.
