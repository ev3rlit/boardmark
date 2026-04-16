# 백로그: URL 인코딩 문서 공유

## 문제

Boardmark를 웹으로 배포한 뒤 문서를 다른 사람에게 즉시 공유하려면, 별도 백엔드 저장소 없이도 열 수 있는 전달 방식이 필요하다.

현재 떠오른 아이디어는 명확하다.

- 문서 source를 URL 안에 인코딩한다
- 사용자가 해당 URL을 열면 웹 앱이 source를 decode해서 캔버스로 렌더링한다
- 서버는 문서 상태를 저장하지 않아도 된다

이 방식은 "URL을 임시 데이터베이스로 쓴다"는 감각으로 이해할 수 있다. 다만 제품/아키텍처 관점에서는 "자기완결형 문서 전달 포맷" 또는 "zero-backend 공유 레이어"로 정의하는 편이 더 정확하다.

핵심은 저장소를 대체하는 것이 아니라, 작은 문서를 링크 하나로 재현 가능하게 전달하는 것이다.

## 왜 검토할 가치가 큰가

- 정적 배포만으로도 공유 기능을 만들 수 있다
- markdown-native source를 그대로 싣고 다닐 수 있다
- 예제 공유, 버그 재현, AI 산출물 전달, 템플릿 배포에 특히 잘 맞는다
- "링크를 열면 바로 보인다"는 경험은 설명 비용이 거의 없다

즉, 문서 협업 인프라를 먼저 만들지 않아도 공유 가치 일부를 빠르게 확보할 수 있다.

## 이 아이디어를 어떻게 해석할 것인가

이 아이디어에는 두 가지 해석이 있다.

1. URL 자체를 문서의 주 저장소로 쓴다
2. URL을 문서 공유와 재현을 위한 transport로 쓴다

현재 단계에서 더 안전한 해석은 2번이다.

이유는 아래와 같다.

- Boardmark의 문서 truth는 계속 markdown 파일이나 이후의 원격 저장소여도 된다
- URL은 공유 시점의 상태를 self-contained snapshot으로 운반하는 데 강하다
- 협업, 최신 상태 동기화, 대용량 자산 포함 같은 문제는 별도 레이어로 분리할 수 있다

즉 첫 backlog 정의는 "URL을 통한 snapshot 공유"가 맞다.

## 항목별 트레이드오프

### 1. URL 길이와 payload 크기

이건 절대적 한계라기보다, 표현 방식에 따라 허용 범위가 크게 달라지는 제약이다.

개선 가능성:

- query string 대신 `hash fragment`를 사용한다
- raw markdown 대신 압축 후 URL-safe 인코딩을 사용한다
- 기본값 필드나 중복 스타일 값을 제거한 직렬화 포맷을 쓴다
- document 전체가 아니라 공유에 필요한 subset만 싣는다

대안:

- 작은 문서는 pure URL로 공유한다
- 일정 크기를 넘으면 서버 업로드 후 짧은 URL로 전환한다
- 대용량 문서는 URL에 payload가 아니라 content id만 담는다

트레이드오프:

- raw markdown를 그대로 넣으면 투명성과 디버그 용이성은 높지만 길이가 커진다
- 압축/전용 포맷을 쓰면 더 많은 문서를 담을 수 있지만 링크가 불투명해지고 버전 관리가 필요하다
- pure URL만 고집하면 backend-free 성질은 지키지만 문서 크기 상한이 낮다

결론:

- "작은 문서용 pure URL + 큰 문서용 업로드 링크"의 하이브리드가 가장 현실적이다

### 2. 프라이버시와 노출 범위

이 역시 고정된 한계가 아니라 공유 UX와 보안 수준 사이의 선택 문제다.

개선 가능성:

- `query`보다 `hash`에 payload를 두어 서버 로그 노출을 줄인다
- payload를 클라이언트 측에서 암호화한다
- 만료 가능한 짧은 링크나 별도 공유 토큰을 도입한다

대안:

- 민감하지 않은 문서는 plain URL 공유
- 민감 문서는 encrypted URL 공유
- 더 민감한 문서는 서버 저장형 private link

트레이드오프:

- 링크만 열면 바로 보이는 UX는 가장 좋지만 노출 위험이 크다
- 암호화와 추가 키 입력을 넣으면 안전해지지만 공유 흐름이 무거워진다
- 서버 저장형 비공개 링크는 제어력이 좋지만 zero-backend 장점은 사라진다

결론:

- 문서 민감도에 따라 공유 모드를 나누는 쪽이 맞다

### 3. 이미지와 첨부 자산

텍스트 중심 문서에는 잘 맞지만, 자산 포함 문서도 반드시 불가능한 것은 아니다.

개선 가능성:

- 아주 작은 자산은 data URL로 inline한다
- 이미지 등 큰 자산은 외부 asset URL이나 blob store로 분리한다
- 추후 `share pack`처럼 document + asset manifest 조합을 정의할 수 있다

대안:

- pure URL 공유는 텍스트 중심 문서만 지원한다
- 자산이 있으면 업로드 기반 공유로 승격한다
- 첨부는 제외하고 placeholder만 유지하는 degraded share를 허용한다

트레이드오프:

- 모든 자산을 URL 안에 넣으면 self-contained 성질은 유지되지만 payload가 급격히 커진다
- 외부 asset로 분리하면 링크는 가벼워지지만 "링크 하나만으로 완결"이라는 성질을 잃는다
- degraded share는 구현이 단순하지만 재현 fidelity가 낮아진다

결론:

- 첫 단계는 텍스트 중심 문서만 pure URL 대상으로 제한하는 편이 안전하다

### 4. 스냅샷과 최신 상태

이 항목은 단점이라기보다 성격 차이다.

URL 기반 공유는 기본적으로 immutable snapshot에 가깝다.

개선 가능성:

- 문서 버전 정보와 schema version을 payload에 넣는다
- "이 링크에서 포크" 또는 "새 공유 링크 만들기"를 제공한다
- 나중에 live 문서 id와 snapshot URL을 분리한다

대안:

- URL은 스냅샷 공유만 맡긴다
- 최신 문서는 원격 저장소의 document id 기반으로 연다
- 협업은 별도 backend feature로 둔다

트레이드오프:

- snapshot은 재현성과 공유 안정성이 높다
- live document는 최신성은 좋지만 backend, 권한, 충돌 해결 비용이 커진다

결론:

- URL share의 기본 성격은 snapshot으로 고정하는 것이 맞다

### 5. 포맷 호환성과 마이그레이션

payload가 제품 버전과 함께 오래 살아남을 수 있으므로, 포맷 진화 전략이 필요하다.

개선 가능성:

- payload에 explicit schema version을 둔다
- 구버전 decode와 migration 경로를 유지한다
- 가능하면 markdown source 자체를 기준 payload로 유지한다

대안:

- markdown source 기반 payload
- AST 기반 payload
- 전용 compact share format

트레이드오프:

- markdown source 기반은 호환성과 디버그성이 좋지만 비효율적일 수 있다
- AST/전용 포맷은 compact하지만 버전 마이그레이션 비용이 커진다

결론:

- 첫 단계는 markdown source 중심이 가장 안전하고, size 압박이 생기면 그때 compact format을 검토하는 편이 낫다

### 6. 안전성과 성능

URL에서 읽는 payload는 전부 외부 입력이므로, 렌더 전에 방어가 필요하다.

개선 가능성:

- 최대 payload 크기 제한
- 압축 해제 후 최대 크기 제한
- 파싱 실패/검증 실패 UX 명시
- raw HTML, scriptable surface, 특수 fenced block에 대한 명시적 안전 규칙
- 무거운 decode/parse는 worker 분리 후보로 검토

대안:

- 읽기 전용 공유 모드만 먼저 제공한다
- 특정 fenced block은 share mode에서 제한한다
- 안전하게 렌더할 수 없는 콘텐츠는 fallback block으로 보여준다

트레이드오프:

- 강한 방어 규칙은 안전하지만 표현력이 줄 수 있다
- permissive renderer는 편하지만 share surface가 공격 입력에 취약해진다

결론:

- URL share는 일반 로컬 파일 열기보다 더 엄격한 입력 경계를 가져야 한다

## 제품 방향 제안

단일 방식으로 밀어붙이기보다, 공유 모드를 계층화하는 편이 좋다.

### 모드 A. Pure URL Share

- 대상: 작은 텍스트 중심 문서
- 특징: backend 없이 링크 하나로 공유
- 장점: 가장 간단하고 즉시성 높음
- 한계: 크기, 자산, 민감 정보에 약함

### 모드 B. Encrypted URL Share

- 대상: 민감하지만 여전히 self-contained로 보내고 싶은 문서
- 특징: 클라이언트 측 복호화 필요
- 장점: plain URL보다 안전
- 한계: UX가 무거워지고 운영 복잡도 증가

### 모드 C. Uploaded Share Link

- 대상: 큰 문서, 자산 포함 문서, 장기 링크
- 특징: payload는 서버/스토리지에 저장하고 URL은 id만 보유
- 장점: 사실상 크기 제약을 크게 낮출 수 있음
- 한계: zero-backend 이점이 사라짐

이 세 모드는 경쟁 관계가 아니라 fallback 계층으로 보는 편이 맞다.

## MVP 제안

첫 단계는 범위를 강하게 자르는 것이 좋다.

- `apps/web`에서만 지원
- `hash fragment` 기반 payload 사용
- 텍스트 중심 markdown source만 지원
- 링크를 열면 읽기 전용으로 렌더
- 사용자가 명시적으로 "이 링크에서 편집 시작" 또는 "포크해서 계속 작업"을 선택하게 한다
- 크기 상한을 명시하고 초과 시 업로드형 공유 후보로 넘긴다

이렇게 하면 현재 아이디어의 장점은 살리고, 저장/동기화/충돌 문제를 초기 범위에서 분리할 수 있다.

## 범위 밖

이 backlog는 아래를 첫 단계에 포함하지 않는다.

- 다중 사용자 실시간 협업
- URL을 정본 저장소로 쓰는 설계
- 대용량 이미지/첨부를 모두 self-contained로 포함하는 보장
- 모든 브라우저에서 동일한 open/save parity
- 영구 비공개 권한 모델

## 열어둘 질문

- pure URL share의 최대 허용 크기를 어디에 둘 것인가
- 공유 링크를 열었을 때 기본 모드를 read-only로 둘 것인가
- `boardmark` 특수 fenced block 중 share surface에서 제한할 항목이 있는가
- 향후 업로드형 share를 붙일 때 같은 "공유" 버튼 아래에서 자동 승격할 것인가

## 추천 판단

이 아이디어는 backlog로서 충분히 보관할 가치가 있다.

- Boardmark의 markdown-native 특성과 잘 맞는다
- web 배포 시 체감 가치가 즉각적이다
- 다만 "URL이 저장소를 대체한다"보다 "small-doc zero-backend share"로 정의해야 설계가 단단해진다

따라서 이 backlog는 "URL 인코딩 snapshot 공유"를 1차 목표로 두고, 이후 필요 시 encrypted share와 uploaded share로 확장하는 방향이 적절하다.
