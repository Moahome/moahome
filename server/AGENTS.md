# AGENTS.md

이 파일은 `server/` 영역에서 Codex가 따라야 하는 백엔드 공통 규칙을 정의합니다.

루트 `AGENTS.md`의 공통 규칙을 기본으로 적용하며,
Server 작업에서는 이 문서의 규칙을 추가로 적용합니다.

---

## 1. Architecture

Server는 **도메인 중심 Layered Architecture**를 사용합니다.

Java 21, Spring Boot, Spring Data JPA를 기준으로 합니다.

기본 요청 흐름은 아래 구조를 따릅니다.

```text
Controller
    ↓
Service
    ↓
Repository (Spring Data JPA)
    ↓
JPA / Hibernate
    ↓
PostgreSQL
```

Redis는 위 계층의 대체 저장소가 아니라
세션, 캐시 등 임시 데이터를 위한 별도 인프라로 사용합니다.

```text
                    ┌─ Redis
Controller → Service
                    └─ Repository → PostgreSQL
```

### 기본 원칙

- 기능은 **도메인 단위**로 분리합니다.
- Controller, Service, Repository를 전역 폴더에 한꺼번에 모으지 않습니다.
- 각 도메인 내부에서 Controller / Service / Repository를 구성합니다.
- 각 도메인의 Controller는 `controller/`, Service는 `service/`, Repository는 `repo/`, Entity와 업무 Enum은 `domain/`에 둡니다.
- Controller가 Repository, EntityManager 또는 JDBC를 직접 호출하지 않습니다.
- Service는 유스케이스와 트랜잭션 흐름을 조율합니다.
- 객체 자체의 업무 규칙과 상태 변경은 Entity의 메서드에 작성합니다.
- DB 접근 로직은 Repository에 작성합니다.
- JPA Entity는 해당 업무의 `domain/` 패키지에 둡니다. JPA 매핑 어노테이션은 허용하되 Entity에서 Repository, Redis, HTTP API를 호출하지 않습니다.

---

## 2. Directory Structure

기본 구조는 아래 방향을 따릅니다.

```text
server/
└── src/
    ├── main/
    │   ├── java/com/moahome/server/
    │   │   ├── ServerApplication.java
    │   │   ├── auth/
    │   │   ├── property/
    │   │   ├── resident/
    │   │   ├── membership/
    │   │   ├── billing/
    │   │   ├── payment/
    │   │   │   ├── controller/
    │   │   │   │   └── PaymentController.java
    │   │   │   ├── service/
    │   │   │   │   └── PaymentService.java
    │   │   │   ├── repo/
    │   │   │   │   └── PaymentRepository.java
    │   │   │   ├── domain/
    │   │   │   │   └── Payment.java
    │   │   │   └── dto/
    │   │   │       ├── ConfirmPaymentRequest.java
    │   │   │       └── PaymentResponse.java
    │   │   ├── banking/
    │   │   ├── expense/
    │   │   ├── accounting/
    │   │   ├── closing/
    │   │   ├── audit/
    │   │   ├── common/
    │   │   └── config/
    │   └── resources/
    │       ├── application.yml
    │       └── db/migration/
    └── test/
        ├── java/com/moahome/server/
        │   └── payment/
        │       ├── domain/
        │       │   └── PaymentTest.java
        │       └── service/
        │           └── PaymentServiceTest.java
        └── resources/
```

실제 기능이 없는 도메인 폴더를 미리 만들지 않습니다.

위 구조는 기능 구현 시의 예시입니다. 테스트 패키지는 대상 소스의 패키지 구조를 따릅니다.
인증 필터와 쿠키 / CSRF 처리는 `auth/security/`, 인증 오류는 `auth/exception/`에 둡니다. 테스트 공통 지원 코드는 대상 테스트 영역의 `support/`를 사용할 수 있습니다.

---

## 3. Controller

Controller는 HTTP 요청과 응답 처리만 담당합니다.

### Controller에서 하는 일

- Route 정의
- Request DTO 수신
- 입력값 검증 결과 처리
- 인증된 사용자 정보 전달
- Service 호출
- Response 반환

### Controller에서 하지 않는 일

- 비즈니스 규칙 구현
- 직접적인 DB 조회/수정
- Repository 직접 호출
- EntityManager 또는 JDBC 직접 호출
- 복잡한 데이터 가공
- 회계 계산
- 관리비 계산
- 납부 상태 계산

Controller는 가능한 얇게 유지합니다.

---

## 4. Service

Service는 해당 도메인의 **유스케이스와 업무 흐름**을 담당합니다.

예:

- 관리대상 생성
- 주민 가입 승인
- 관리비 부과
- 수납 확정
- 납부 금액 배분
- 지출 확정
- 입금 매칭
- 회계 이벤트 처리
- 월 마감

### Service 원칙

- 권한, 여러 객체 간 업무 흐름과 외부 조회가 필요한 판단은 Service에서 조율합니다.
- 객체 자체의 업무 규칙과 상태 전이는 Entity 메서드에 위임합니다.
- 필요한 Repository를 조합합니다.
- 다른 도메인의 기능이 필요하면 해당 도메인의 Service 경계를 우선 사용합니다.
- 여러 DB 변경이 하나의 업무 단위라면 Transaction을 사용합니다.
- 동일한 비즈니스 규칙을 여러 Service에 중복 작성하지 않습니다.
- 단순 조회를 이유로 Controller에 비즈니스 판단을 옮기지 않습니다.

### Entity / 상태 변경

- 값 조회는 필요한 Getter를 사용하며 필드는 외부에서 직접 수정하지 않습니다.
- 범용 Setter는 최소화하고 Entity 전체에 Lombok `@Setter` 또는 `@Data`를 적용하지 않습니다.
- 상태 변경은 `approve()`, `confirm()`, `cancel()`, `allocatePayment(amount)`처럼 업무 의미가 드러나는 메서드로 수행합니다.
- 메서드 안에서 허용되는 상태 전이와 불변식을 검증하고, 함께 바뀌어야 하는 필드를 일관되게 변경합니다.
- Service에서 Getter로 상태를 판단한 뒤 여러 Setter를 호출하는 방식으로 Entity의 업무 규칙을 분산하지 않습니다.
- 생성 시 필수값 검증과 초기 상태 설정은 생성자 또는 정적 팩토리 메서드가 담당합니다.
- JPA 기본 생성자는 `protected`로 두고, 무분별한 전체 필드 생성자나 상태를 우회하는 Builder를 노출하지 않습니다.
- 컬렉션 Getter로 내부 컬렉션을 직접 수정하게 하지 않고 추가 / 제거 메서드로 관계를 관리합니다.
- DTO는 가능한 불변 구조를 사용하고, 단순 요청 / 응답 데이터는 Java `record` 사용을 우선 검토합니다.

---

## 5. Repository

Repository는 데이터베이스 접근을 담당합니다.

### Repository에서 하는 일

- 단건 조회
- 목록 조회
- 생성
- 수정
- Entity 변경 사항 저장
- 집계 조회
- Transaction 내부 DB 작업

### Repository에서 하지 않는 일

- HTTP 처리
- 권한 정책 결정
- 관리비 부과 규칙 결정
- 납부 상태 판단
- 회계 업무 흐름 결정
- 화면 응답 형태에 맞춘 비즈니스 가공

Repository는 DB 접근을 캡슐화하고,
업무 흐름은 Service에, 객체의 업무 규칙은 Entity에 남깁니다.

---

## 6. Database

영속 업무 데이터의 Source of Truth는 **PostgreSQL**입니다.

### PostgreSQL에 저장하는 데이터

예:

- 사용자
- 소셜 계정
- 관리대상
- 동
- 세대
- 주민
- 권한
- 초대 / 가입 요청
- 관리비 부과
- 청구 항목
- 수납
- 수납 배분
- 관리계좌
- 은행 거래
- 지출
- 계정과목
- 전표
- 월 마감
- 감사 로그

### Database Rules

- 테이블명과 컬럼명은 `snake_case`를 사용합니다.
- 기존 Schema와 Migration을 확인한 후 구조를 변경합니다.
- 운영 DB를 직접 수정하지 않습니다.
- Schema 변경은 Migration을 통해 수행합니다.
- FK, UNIQUE, CHECK 등 무결성 제약은 가능한 DB에도 명시합니다.
- 금액 데이터에 부동소수점 타입을 사용하지 않습니다.
- Java 금액 계산은 `BigDecimal` 또는 명시적인 최소 화폐 단위 정수를 사용하며, 소수점과 반올림 기준을 명시합니다.
- 이미 존재하는 컬럼과 의미가 중복되는 컬럼을 임의로 추가하지 않습니다.

### Flyway Migration

- Migration SQL은 `src/main/resources/db/migration/`에 둡니다.
- 버전 Migration 파일명은 `VYYYYMMDDHHmmss__description.sql`을 사용합니다. 버전은 작성 시점의 UTC 시각 14자리로 만들고 설명은 `snake_case`로 작성합니다.
- 예: `V20261003010000__create_payment.sql`. Flyway 파일명은 루트의 `camelCase` 파일명 규칙의 예외입니다.
- 새 파일을 추가하기 전에 기존 버전과 충돌하지 않는지 확인합니다. 병렬 작업으로 버전이 겹치면 아직 공유 / 적용되지 않은 새 파일의 버전을 조정합니다.
- 공유되거나 적용된 Migration은 수정 / 삭제 / 이름 변경하지 않고 후속 Migration으로 변경합니다.
- 테이블뿐 아니라 FK, UNIQUE, CHECK, 인덱스와 업무 데이터 보정도 필요한 경우 Migration에 포함합니다.
- Hibernate `ddl-auto`는 `validate` 또는 `none`을 사용하고 공유 / 운영 DB에 `create`, `create-drop`, `update`를 사용하지 않습니다.
- 개발 / 운영 스키마 변경은 Flyway를 통해 적용합니다. 테스트용 일회성 DB에서 JPA 매핑만 검증하는 경우는 별도로 구분합니다.
- 변경 시 빈 PostgreSQL DB에 전체 Migration을 적용하는 경우와 기존 스키마에 새 Migration을 적용하는 경우를 검증합니다.
- 운영 데이터 삭제, 필수 컬럼 추가, 자료형 변경 시 기존 데이터 보정, 잠금 / 실행 시간, 복구 방안을 확인합니다.
- 운영에서 `flyway clean`을 실행하거나 검증 오류를 피하려고 이력 테이블을 직접 수정하지 않습니다.
- 현재 독립 Flyway Gradle 태스크는 설정되어 있지 않습니다. DB 연결을 구성한 Spring Boot 실행 또는 통합 테스트로 Migration을 적용 / 검증합니다.

---

## 7. Redis

Redis는 **영속 업무 데이터의 원본 저장소로 사용하지 않습니다.**

Redis 사용 범위는 다음을 기본으로 합니다.

- 인증 세션
- Refresh Session
- OAuth 임시 상태
- Rate Limit
- 짧은 TTL이 필요한 임시 데이터
- 필요한 경우 단기 Cache

### Redis Rules

- 주민, 세대, 관리비, 수납, 은행거래, 지출, 회계 원본 데이터를 Redis에만 저장하지 않습니다.
- Redis 데이터가 삭제되어도 영속 업무 데이터는 PostgreSQL에서 복구 가능해야 합니다.
- Cache를 사용할 경우 원본 데이터는 PostgreSQL에 존재해야 합니다.
- Redis Key는 용도를 식별할 수 있도록 일관된 Prefix를 사용합니다.
- TTL이 필요한 데이터는 만료시간을 명시합니다.

---

## 8. Domain Rules

모아홈의 공통 업무 기준은 [도메인 규칙](../docs/domainRules.md)을 따릅니다.

- 도메인 작업 전에 해당 문서의 용어, 기존 기준과 미정 항목을 확인합니다.
- 업무 규칙은 해당 문서에서 관리하며 이 파일에 같은 규칙을 중복 정의하지 않습니다.
- 핵심 업무 규칙을 임의로 변경하거나 미정인 정책을 추측하여 구현하지 않습니다.

---

## 9. Transaction

하나의 업무 처리 과정에서 여러 데이터가 함께 변경되어야 하면
Transaction을 사용합니다.

예:

```text
관리비 부과
→ Charge 생성
→ ChargeItem 생성
→ Accounting Event 생성
```

```text
수납 확정
→ Payment 상태 변경
→ PaymentAllocation 생성
→ Accounting Event 생성
```

중간 단계가 실패했는데 일부 데이터만 저장되는 상태를 만들지 않습니다.

- 트랜잭션 경계는 Service의 유스케이스 메서드에 Spring `@Transactional`로 선언합니다.
- 조회 전용 유스케이스는 `@Transactional(readOnly = true)`를 사용합니다.
- Entity 상태 변경은 트랜잭션 안에서 수행하고 JPA 변경 감지로 반영합니다.
- 외부 API 호출과 Redis 변경은 DB 트랜잭션만으로 함께 롤백되지 않으므로 필요한 실패 / 재처리 흐름을 명시합니다.

---

## 10. Validation

입력값 검증은 API 진입 단계에서 수행합니다.

Request DTO에 Jakarta Bean Validation을 사용하고 Controller에서 `@Valid`로 검증합니다.

다만 DTO 검증만으로 비즈니스 규칙을 대신하지 않습니다.

예:

```text
금액이 숫자인가?
→ DTO / Validation

이미 마감된 기간인가?
→ Service

현재 사용자가 해당 관리대상의 관리자인가?
→ Service / Authorization

수납 배분액이 수납 금액을 초과하는가?
→ Entity 메서드 (여러 객체의 조회와 조율은 Service)
```

---

## 11. Error Handling

- 예상 가능한 업무 오류와 시스템 오류를 구분합니다.
- 내부 DB 오류나 Stack Trace를 Client에 그대로 노출하지 않습니다.
- 동일한 유형의 오류는 일관된 Error Code와 응답 구조를 사용합니다.
- 개인정보나 Secret을 오류 메시지에 포함하지 않습니다.

---

## 12. Security

- 인증 구현은 [JWT 인증 설계](../docs/securityDesign.md)의 토큰 수명, 전달 방식, Redis 세션과 로그아웃 정책을 따릅니다.
- `.env`, API Key, Secret, Token을 코드에 직접 작성하지 않습니다.
- Access Token / Refresh Token 원문을 로그에 출력하지 않습니다.
- 전화번호, 계좌번호, 입금자명 등 개인정보 원문을 로그에 남기지 않습니다.
- 관리자 API는 반드시 Server에서 권한을 검증합니다.
- Client에서 숨겨진 버튼이라고 해서 권한 검증이 된 것으로 간주하지 않습니다.
- 감사 로그에 개인정보 원문을 그대로 저장하지 않습니다.

---

## 13. Naming

루트 `AGENTS.md`의 Naming Convention을 따릅니다.

Server 추가 규칙:

- Java 패키지 / 패키지 디렉터리: 소문자, 하이픈 사용 금지
- Java 소스 파일: 선언한 클래스 / 인터페이스 / Enum / Record와 같은 `PascalCase`
- 일반 파일: `camelCase` (도구 설정 파일과 Flyway 파일은 해당 규칙 적용)
- 변수 / 메서드: `camelCase`
- Class / Interface / Enum / Record: `PascalCase`
- 상수: `UPPER_SNAKE_CASE`
- DB 테이블 / 컬럼: `snake_case`
- API Path: `kebab-case`

예:

```text
MembershipRequestController.java
PaymentAllocationService.java
BankTransactionRepository.java
```

---

## 14. General Rules

- 기존 코드와 DB 구조를 먼저 확인한 후 수정합니다.
- 기존 Service 또는 Repository로 해결 가능한 기능을 중복 구현하지 않습니다.
- 작업과 관계없는 도메인 코드를 임의로 수정하지 않습니다.
- 단순한 기능에 불필요한 추상화 계층을 추가하지 않습니다.
- 아직 사용하지 않는 Interface, Base Class, Generic Repository를 미리 만들지 않습니다.
- 현재 요구사항에 없는 기능을 추측하여 구현하지 않습니다.
- 새로운 구조를 만들기 전에 기존 프로젝트 구조와 일관성이 있는지 확인합니다.

---

## 15. Control Flow

- 루트의 Control Flow 규칙을 따릅니다.
- 존재 여부, 권한, 잘못된 상태 같은 예외 조건은 Guard Clause로 처리합니다.
- Entity의 상태 판단과 상태 변경을 한 메서드에 모아 Service의 반복적인 `if / else`를 줄입니다.
- 같은 상태 분기를 여러 Service에서 반복하지 않습니다. 필요한 경우 Enum의 동작이나 상태 전이 메서드로 모읍니다.
- `Optional`이나 Stream을 조건문 제거만을 목적으로 사용하지 않고 더 읽기 쉬운 방식을 선택합니다.
- 검증 실패와 허용되지 않는 상태 전이를 조용히 무시하지 않고 명시적인 예외로 처리합니다.

---

## 16. Test / Build

명령은 `server/`에서 Java 21 환경으로 실행합니다.

```bash
./gradlew test
./gradlew build
```

- 구현 변경 후 관련 테스트를 실행하고 최종적으로 `./gradlew build`를 통과시킵니다. `build`에는 `test`가 포함되므로 이미 전체 빌드를 통과했다면 전체 테스트를 다시 실행할 필요는 없습니다.
- `-x test`로 테스트를 제외한 빌드를 정상 검증 완료로 보고하지 않습니다.
- Entity의 상태 전이, 불변식, 금액 계산은 Spring Context 없이 JUnit 단위 테스트로 검증합니다.
- Service는 협력 객체를 격리해 유스케이스 흐름과 실패 조건을 검증합니다.
- Controller는 필요한 경우 `@WebMvcTest`로 입력 검증, 인증 / 인가와 HTTP 응답을 검증합니다.
- Repository와 Migration은 PostgreSQL 통합 테스트로 검증합니다. PostgreSQL 전용 동작을 H2 결과만으로 검증했다고 간주하지 않습니다.
- Redis 사용 기능은 필요할 때 별도 통합 테스트를 추가합니다.
- 통합 테스트는 운영 / 공유 DB와 분리한 테스트 DB를 사용하고 테스트 간 데이터가 섞이지 않도록 합니다. 필요한 경우 Testcontainers를 도입합니다.
- 정상 흐름뿐 아니라 잘못된 상태, 권한 부족, 중복 처리와 트랜잭션 실패 시 결과도 검증합니다.
- 현재 테스트는 Context, JWT / 설정 / Service 단위 테스트와 Security / Redis 통합 테스트입니다. `test` Profile은 DB / JPA / Flyway 자동 구성을 제외합니다. Security 통합 테스트는 일회성 `redis-server` 프로세스를 사용하며, 실행 파일이 PATH에 없으면 `REDIS_SERVER_EXECUTABLE`에 경로를 지정합니다. DB 테스트는 별도 테스트 환경을 구성한 뒤 실행합니다.
- 아직 구현하지 않은 도메인이나 Migration의 테스트를 미리 만들지 않습니다.
- 문서만 변경한 경우 루트 Verification 규칙을 따릅니다.
