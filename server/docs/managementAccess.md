# Server 관리 영역 접근 설계

작성일: 2026-10-09. **상태: 목록 / 현재 관리 권한 API 구현.** 기존 참여와 관리대상 테이블을 사용하며 새 Migration은 없습니다.

업무 정책은 [도메인 규칙](../../docs/domainRules.md#로그인-이후-진입-기준), 데이터 구조는 [ERD](../../docs/erd.md#56-property_members), 요청·응답·오류·조회 조건은 [공통 관리 영역 접근 API](../../docs/managementAccessApi.md)를 기준으로 합니다. 이 문서는 API 필드를 다시 정의하지 않고 서버 책임과 구현 순서를 설명합니다.

## 1. 현재 코드와 설계의 차이

| 현재 구성 | 재사용 / 변경 방향 |
| --- | --- |
| `user/controller/UserController`의 본인 정보 조회 | 기존 인증·정상 계정 확인과 응답은 유지 |
| `property/domain/Property`, `membership/domain/PropertyMember` | 관리대상·현재 참여를 읽는 원본으로 사용 |
| `membership/repo/PropertyMemberRepository.hasCurrentAccess` | 등록 결과의 일반 접근 확인 용도로 유지 |
| `property/repo/PropertyRepository` | 기존 관리대상 Repository 재사용 |
| `property/service/PropertyRegistrationService` | 등록 / 결과 복구 책임 유지, 기본 목적지 결정은 추가하지 않음 |
| 기존 등록 Migration | 조회에 필요한 컬럼이 이미 있으므로 이번 조회를 위한 새 테이블 / 컬럼 추가 없음 |

`hasCurrentAccess`는 현재 활성 참여가 있는지를 검사하며 관리자 역할로 제한하지 않습니다. 주민의 유효한 참여만으로 관리자 영역이 열리지 않도록 관리 영역 전용 조회에서 공통 API의 역할 조건을 적용합니다. 기존 결과 조회의 의미를 바꾸기 위해 공통 메서드를 임의로 관리자 전용으로 축소하지 않습니다.

## 2. 계층과 코드 배치 설계

| 위치 | 책임 |
| --- | --- |
| `property/controller/ManagementAccessController.java` | 두 접근 API의 HTTP 요청과 응답 연결, 인증 주체 전달 |
| `property/service/ManagementAccessService.java` | 정상 계정 확인과 현재 관리자 참여 조회 조합 |
| `property/dto/` | 목록 / 단건의 불변 응답 DTO |
| `membership/repo/PropertyMemberRepository.java` | 관리대상과 참여를 결합하는 목록 / 단건 조회 |

위 이름으로 구현했습니다. 공통 Base Controller, Repository Interface 계층이나 독립적인 권한 저장소를 미리 추가하지 않습니다. 현재 저장소와 예외 처리의 재사용 범위를 확인한 뒤 필요한 코드만 만듭니다.

응답 DTO는 Java record를 우선 사용하고 Entity를 그대로 반환하지 않습니다. Repository의 투영 / DTO 조회로 필요한 이름·ID·역할만 읽어 Entity 순회에 따른 추가 조회를 피합니다.

## 3. 목록 처리 순서

1. 기존 인증 계층이 검증한 `AuthPrincipal`의 사용자 ID를 받습니다.
2. 기존 계정 조회 로직으로 정상 계정 여부를 확인합니다.
3. 공통 API의 현재 관리자 참여 / 관리대상 조건을 같은 DB 조회에 적용합니다.
4. 계약의 기본 정렬로 목록을 만들고 최소 응답 DTO로 반환합니다.
5. 조회 결과가 실제로 없을 때만 빈 목록으로 응답합니다.

목록에는 다른 계정이나 주민 전용 참여가 포함되지 않아야 합니다. 요청에서 사용자 ID나 역할을 덮어쓸 수 있는 필드를 추가하지 않습니다. DB 조회 실패를 빈 목록으로 변환하지 않습니다.

## 4. 단건 처리 순서

1. Bearer 인증과 정상 계정 확인 후 경로 UUID를 검증합니다.
2. 인증된 사용자 ID와 요청한 관리대상 ID를 함께 조건으로 조회합니다.
3. 공통 API의 현재 관리자 참여 조건에 맞는 행이 있을 때만 관리 컨텍스트를 반환합니다.
4. 조건에 맞는 행이 없으면 계약의 접근 거부로 처리하고 다른 사용자의 관리대상 정보를 조회해 응답하지 않습니다.

목록에 포함된 적이 있다는 사실, 등록 성공 결과나 최근 선택 기록을 단건 검증의 대체 자료로 사용하지 않습니다. 목록 응답 이후 권한이 바뀐 경우에도 단건 조회 시점의 조건을 적용합니다.

## 5. 트랜잭션과 보관

조회 유스케이스는 `@Transactional(readOnly = true)`로 처리합니다. 관리대상 생성, 역할 변경, 초안 저장, 최근 선택 저장과 결과 스냅샷 갱신을 하지 않습니다.

영속 원본은 기존 PostgreSQL 테이블입니다. 권한을 Redis 목록이나 JWT의 과거 역할로 대체하지 않습니다. 최근 선택은 Client 편의 정보이므로 서버의 사용자 컬럼이나 별도 최근 선택 테이블을 추가하지 않습니다.

응답은 `Cache-Control: no-store`로 제공하고 개인정보 원문·토큰·내부 SQL을 오류나 로그에 기록하지 않습니다. 인증 / 정상 계정 확인 장애와 업무 조회 오류는 공통 계약에 맞춰 구분하며, 내부 예외를 원문 그대로 전달하지 않습니다.

동일 역할의 중복 행은 한 대상으로 묶습니다. 서로 다른 관리자 역할이 충돌하면 우선순위를 정하지 않고 내부 오류로 실패합니다. 충돌 행의 정리나 역할 우선순위 / 유일성 Migration은 도입하지 않았습니다.

## 6. 후속 업무 API의 권한

관리 컨텍스트 응답은 Client 화면을 구성하는 자료이며 다른 업무 API에 재전송할 권한 증명이 아닙니다. 후속 세대·관리비·회계 API는 요청마다 인증된 사용자와 실제 처리 대상의 관리대상 ID를 연결해 현재 소속과 해당 업무 권한을 다시 검사합니다.

목록 / 컨텍스트 조회는 관리대상 참여를 생성하거나 변경하지 않습니다. 주민 승인·부담당자 지정과 관리소장 역할 변경은 각각 해당 업무의 정책과 트랜잭션에서 처리합니다.

## 7. 구현 시 검증

- Service: 본인 목록의 정상 조회 / 빈 목록, 계정 이용 불가와 저장소 장애의 구분.
- Repository: 공통 계약의 역할·종료·삭제·비활성 조건, 다른 사용자 제외, 기본 정렬과 단건의 사용자 / 관리대상 조건 결합.
- Controller / Security: Bearer 필수, 만료 처리, 잘못된 UUID, 접근 거부와 응답 캐시 금지.
- 권한 변경: 목록 확인 이후 종료·해제·주민 역할 변경 시 단건 조회 거부, 과거 등록 결과의 역할을 현재 권한으로 사용하지 않음.
- 응답: 최소 필드만 포함하고 계좌·예금주·주소·주민·토큰·내부 오류 원문 미포함.
- 조회 중단 / 장애: 데이터 쓰기·부분 상태·빈 목록으로의 오류 변환이 없음.
- DB 검증: 기존 등록 Migration으로 만든 관리대상 / 참여를 읽으며 새 Migration 없이 동작함.

Service / Controller 단위 검사, 기존 Bearer Security 통합 검사와 격리 PostgreSQL의 `ManagementAccessPersistenceTest`에 검증을 작성했습니다. 실행과 빌드는 [Server AGENTS.md](../AGENTS.md)를 따릅니다.

## 동적 권한을 위한 조회 보완 설계 (2026-10-25)

상태: 미구현 설계. [도메인 규칙](../../docs/domainRules.md#초대-인증서비스-복귀역할-변경의-후속-확정-방향-2026-10-25)의 역할 변경 감지를 위한 최소 조회입니다. 신규 요청·응답·오류는 [공통 API 보완안](../../docs/managementAccessApi.md#8-동적-권한을-위한-최소-조회-보완안-2026-10-25)에만 정의합니다.

기존 실제 위치는 `src/main/java/com/moahome/server/` 아래 `property/controller/ManagementAccessController.java`, `property/service/ManagementAccessService.java`, `membership/repo/PropertyMemberRepository.java`, `resident/repo/ResidentRepository.java`, `resident/repo/UnitResidentRepository.java`입니다. 계정 상태는 `user/service/UserService.java`, 업무 인증은 `auth/security/JwtAuthenticationFilter.java`·`auth/service/AuthService.java`, 역할 변경과 이벤트는 `membership/service/MemberManagementService.java`·`membership/domain/MemberRoleEvent.java`가 담당합니다. `auth/service/TokenService.java`의 JWT에는 현재 관리대상별 역할을 넣지 않습니다.

변경 순서는 다음과 같습니다.

1. PropertyMemberRepository에 정상 계정의 단일 Property 현재 참여를 ADMIN/MANAGER/RESIDENT 범위로 읽는 투영 조회를 추가합니다. 기존 findManagementContext와 hasCurrentAccess의 의미를 바꾸지 않습니다.
2. 주민 자격은 같은 Property·현재 계정·미삭제 주민·유효 세대 관계·승인 출처의 일치를 기존 ResidentRepository 조회 기준과 대조해 계산합니다. 이름·전화번호로 주민을 추정하지 않습니다.
3. ManagementAccessService에 getPropertyAccessContext 후보 메서드를 추가해 계정 확인·역할 충돌 검사·최소 DTO 조합만 합니다. DTO 후보 `PropertyAccessContextResponse.java`는 property/dto에 둡니다. 불필요한 공통 권한 계층은 추가하지 않습니다.
4. ManagementAccessController에 access-context 읽기 경로를 추가하고 기존 Bearer·정상 계정·no-store·오류 은닉을 적용합니다. 기존 클라이언트 목록·관리 컨텍스트는 호환 유지합니다.
5. 기존 역할 변경·인계·명부 수정과 개별 업무의 ManagementAccessService 검사를 계속 사용합니다. 관리자 조회가 성공했다는 과거 기록으로 이후 API를 허용하지 않습니다.

조회는 readOnly 트랜잭션이며 권한 캐시를 Redis에 추가하지 않습니다. 역할 변경 요청은 기존 Property 잠금·현재 actor 권한·예상 역할·실제 주민 연결 검증과 member_role_events 저장을 유지합니다. 관리소장의 일반 강등은 거부하고 인계의 ADMIN→MANAGER를 정상 변경으로 처리합니다. 외부 MANAGER의 주민 전환 조건은 이번 조회에서 느슨하게 바꾸지 않습니다.

추가 테스트는 기존 `property/repo/ManagementAccessPersistenceTest.java`에 세 역할·타 계정·다른 Property·주민 자격·종료/삭제/비활성·충돌·역할 변경 후 재조회를 보강합니다. `auth/security/SecurityIntegrationTest.java`와 `config/OpenApiIntegrationTest.java`에는 Bearer·UUID·최소 필드·no-store·403/503 계약을 추가합니다. 같은 사용자의 A 대상 관리자·B 대상 주민 결과가 섞이지 않는지 검증합니다. 주민 승격 후 이전 주민 업무 API, 강등 후 이전 관리자 업무 API를 직접 호출해 현재 DB 권한으로 차단되는지도 별도 검증합니다. 주민 세부 업무 API는 아직 없으므로 현 단계에서 존재한다고 가정하지 않습니다.
