# PostgreSQL·Redis 구조 점검

점검일: 2026-10-25. 대상은 로컬 개발 환경의 애플리케이션 PostgreSQL `moahome`과 설정된 Redis DB입니다. PostgreSQL의 관리용 `postgres` DB와 시스템 카탈로그는 제거 대상에서 제외합니다. 이 기록은 실제 구현 점검 결과이며 미정 업무 정책을 확정하지 않습니다.

## 점검 범위와 결과

실제 DB 카탈로그를 현재 Entity·Repository·Service·Migration 및 [도메인 규칙](../../docs/domainRules.md), [ERD](../../docs/erd.md)와 대조했습니다. JPA 필드 참조만으로 사용 여부를 판단하지 않고 네이티브 SQL, DB 트리거, 감사 이력, Hibernate 낙관적 잠금과 등록 재시도 처리도 확인했습니다.

| 객체 | 정리 전 | 정리 후 |
| --- | ---: | ---: |
| 업무 테이블 | 41 | 41 |
| Flyway 이력 테이블 | 1 | 1 |
| 컬럼 | 499 | 499 |
| 인덱스 | 131 | 130 |
| 제약 | 393 | 391 |
| 사용자 트리거 | 37 | 37 |
| 사용자 함수 | 29 | 29 |
| 뷰 | 0 | 0 |

업무 테이블 41개 모두 현재 Entity 매핑이 있습니다. 제거 가능한 미사용 테이블·고아 트리거 함수·무효 인덱스는 발견하지 않았습니다. 사용 횟수가 0인 인덱스나 데이터가 없는 테이블이라는 이유만으로 삭제하지 않았습니다. 통계는 초기화될 수 있으며 이력·예외 처리의 사용 빈도를 대신하지 않습니다.

| 영역 | 유지한 테이블 |
| --- | --- |
| 계정 | `users`, `social_accounts` |
| 관리대상 | `properties`, `buildings`, `units`, `property_registration_results` |
| 주민 | `residents`, `unit_residents`, `resident_account_links`, `resident_import_batches`, `resident_registration_results` |
| 권한·가입 | `property_members`, `member_invitations`, `member_role_events`, `membership_requests`, `resident_invitations`, `resident_join_codes` |
| 부과·기초 잔액 | `billing_additions`, `billing_periods`, `fee_templates`, `fee_template_items`, `charges`, `charge_items`, `credit_applications`, `bank_opening_balances`, `opening_balance_batches`, `opening_balance_items` |
| 통장·동별 보유금 | `bank_accounts`, `bank_balance_checks`, `bank_transactions`, `bank_transfers`, `building_cash_openings`, `building_cash_opening_changes`, `external_settlement_decisions`, `external_settlement_links`, `income_allocations` |
| 수납 | `payments`, `payment_allocations`, `payment_events` |
| 지출 | `expenses`, `expense_allocations` |

## 제거한 중복 구조

후속 Migration: [V20261025080504__remove_redundant_database_constraints.sql](../src/main/resources/db/migration/V20261025080504__remove_redundant_database_constraints.sql).

| 제거 대상 | 유지한 보장과 제거 근거 |
| --- | --- |
| `units.units_property_id_id_unique` UNIQUE와 그 인덱스 | 기존 `units_property_id_unique`가 같은 `(property_id, id)` 순서·조건을 보장합니다. 세대를 참조하는 복합 FK 7개는 모두 유지할 기존 인덱스를 참조하며 제거할 중복 인덱스에는 FK 의존성이 없습니다. |
| `fee_template_items.fee_template_items_fee_template_id_fkey` FK | `fee_template_items_property_template_fk`가 NOT NULL인 `(property_id, fee_template_id)`로 같은 템플릿의 존재와 관리대상 일치를 보장합니다. 두 FK의 참조 동작·지연 여부·검증 상태도 같습니다. |

업무 데이터 변경이나 `CASCADE` 없이 두 제약만 제거합니다. 적용된 과거 Migration과 체크섬은 유지합니다. DDL 실행에 필요한 테이블 잠금을 오래 기다리지 않도록 실제 개발 DB 적용 연결에는 잠금 대기 5초·명령 30초 제한을 설정합니다. 실패하면 Flyway 트랜잭션이 롤백하며 강제 잠금 해제나 서버 중단을 하지 않습니다.

앞선 `V20261025075117__remove_unused_payer_match_rules.sql`에서 폐기한 `payer_match_rules`, `payments.payer_match_rule_id`, 관련 트리거·함수가 실제 DB에 남아 있지 않은 것도 확인했습니다.

## 확인했지만 유지한 항목

| 항목 | 유지 이유 |
| --- | --- |
| `member_invitations.resident_id`, `unit_id` | [ResidentRepository](../src/main/java/com/moahome/server/resident/repo/ResidentRepository.java)의 네이티브 SQL에서 기존 승인·초대 이력을 조회합니다. Entity의 일반 필드에 없다는 이유로 제거할 수 없습니다. |
| `membership_requests.rejection_reason` | 가입 거절 사유의 필수 여부·표시 범위는 도메인 규칙상 미정입니다. 미입력 상태를 폐기 결정으로 해석하지 않습니다. |
| `unit_residents.move_in_date` | ERD의 입주일이며 퇴거일과의 날짜 무결성 제약이 있습니다. 현재 화면에서 입력받지 않는 정책만으로 과거 관계 저장 설계를 폐기하지 않습니다. |
| `bank_accounts.holder_resident_id` | 초기 계좌에서 주민 연결을 선택 사항으로 두는 확정 정책에 해당합니다. 초기 NULL 저장이 정상입니다. |
| `bank_accounts.gl_account_id`, `fee_template_items.revenue_account_id`, `charge_items.revenue_account_id` | ERD의 후속 회계 설계 영역입니다. 부과 항목은 수익 계정 값을 청구 항목에 복사하는 코드도 있습니다. 회계 설계 폐기 결정 없이 제거하지 않습니다. |
| 삭제자·삭제시각·revision | 감사 이력과 Hibernate 낙관적 잠금을 위한 값입니다. 일반 Java 호출 수만으로 미사용 여부를 판단할 수 없습니다. |
| `building_cash_opening_changes` 감사 컬럼 | DB 트리거가 변경 전 값·변경자·변경시각을 기록합니다. |
| 등록 결과·업로드 검증 테이블 | 등록 중복 방지, 재요청 응답, 검증 후 저장 흐름에서 사용합니다. 만료 데이터의 영구 삭제 주기는 별도 정책이며 이번 구조 정리에서 업무 행을 삭제하지 않습니다. |
| PostgreSQL 초대·가입 테이블 | Redis로 코드 자격 증명을 관리해도 PostgreSQL은 요청·승인·사용 이력과 재시도 판단의 원본으로 사용합니다. |

## Redis

점검 시 애플리케이션 Redis DB의 키는 `auth:session:` 접두사에 속하는 hash 2개였으며 모두 양수 TTL이 있었습니다. 알 수 없는 접두사나 만료시간 없이 남은 임시 키는 발견되지 않았습니다. 활성 로그인 세션을 삭제하지 않았습니다. 세션 키 식별자·값·인증정보는 이 기록에 남기지 않습니다.

## 검증

[PaymentPersistenceTest](../src/test/java/com/moahome/server/payment/repo/PaymentPersistenceTest.java)의 PostgreSQL 회귀 검사에서 정리 직전 버전으로 만든 스키마에 실제 서비스로 생성한 데이터를 복사한 후 후속 Migration을 적용합니다. 수납·배분·감사를 포함한 16개 테이블의 전체 행, 기존 Migration 체크섬, 남겨야 할 전체 제약 정의를 전후 비교합니다. 중복 인덱스 제거와 기존 인덱스 유지를 확인하며, 존재하는 템플릿이라도 다른 관리대상에 연결하려는 저장이 복합 FK로 거부되는지 검사합니다.

전체 Migration 신규 적용·Hibernate 검증·기존 스키마 업그레이드는 실행 중인 개발 서버와 분리한 임시 PostgreSQL 및 빌드 디렉터리에서 검증합니다. 실제 개발 DB 적용 여부와 최종 빌드 결과는 아래 실행 확인에 기록합니다.

실행 확인: `./gradlew --init-script /private/tmp/moahome-db-audit-build.gradle build exportAuditRuntimeClasspath --console=plain` 통과. 테스트 561개 모두 통과(실패·오류·건너뜀 0). 신규 Migration은 개발 DB에 Flyway로 1개 적용됐고 버전 `20261025080504`, 전체 51개 Migration 검증 성공을 확인했습니다. 적용 후 실제 카탈로그를 다시 조회해 표의 정리 후 수치와 정확히 두 제약·한 인덱스만 제거된 것을 확인했습니다.

최초 HTTP 확인은 8080 연결 실패(exit 7)였습니다. 이후 사용자가 제공한 `missing table [payer_match_rules]` 기동 오류를 조사해, 삭제한 소스의 `PayerMatchRule.class`와 Repository·DTO 클래스가 실제 실행 경로인 `server/build/classes/java/main`에 남은 것을 확인했습니다. 별도 빌드 디렉터리의 검증만으로 실제 실행 폴더까지 정리됐다고 판단한 것이 누락 원인이었습니다.

2026-10-25 17:22 KST 복구 확인: 실제 실행 폴더에서 `./gradlew clean build --console=plain`을 수행해 테스트 561개가 모두 통과했습니다. 재생성한 두 JAR에서 폐기된 Entity·Repository·DTO가 없는 것을 검사했습니다. 8080 수신 프로세스가 없는 상태에서 `./gradlew bootRun --console=plain`으로 개발 서버를 기동했고, Flyway 51개 검증·변경 없음, JPA EntityManagerFactory 초기화, Tomcat 8080 및 `Started ServerApplication` 로그를 확인했습니다. `GET http://localhost:8080/v3/api-docs`는 HTTP 200으로 응답했습니다. DB 테이블 복원이나 과거 Migration 수정은 하지 않았습니다.

## 반복된 기동 장애와 조치

| 증상 | 원인 | 조치와 누락한 확인 |
| --- | --- | --- |
| Flyway 체크섬 불일치 | 이미 적용된 Migration의 내용을 변경했습니다. | 적용 당시 원본을 복구하고 변경은 후속 Migration으로 분리했습니다. 로컬 개발 서버의 자동 적용 여부와 체크섬을 파일 수정 전에 확인해야 했습니다. |
| `Schema validation: missing table [payer_match_rules]` | 소스와 DB에서는 폐기했지만 실제 실행 폴더에 `PayerMatchRule.class`가 남았습니다. 별도 디렉터리에서 통과한 빌드만 확인했습니다. | 실제 실행 폴더를 `clean build`하고 JAR까지 확인했습니다. 삭제된 클래스가 실제 실행 classpath에서도 제거됐는지 확인해야 했습니다. |
| `Port 8080 was already in use` | Codex가 확인용으로 시작한 서버 PID 17497을 남겨 사용자 쪽 서버 실행과 충돌했습니다. | 해당 프로세스만 정상 종료하고 8080 해제를 확인했습니다. 기동 검증 직후 프로세스를 정리해야 했습니다. |

공통 누락은 소스·테스트 결과와 실제 실행 상태를 따로 확인하지 않고, 확인용 프로세스의 수명도 관리하지 않은 것입니다. 재발 방지 절차는 [Server 작업 규칙](../AGENTS.md#서버-기동과-실행-파일-확인)에 기록했습니다. 이 문서 수정은 작업 절차의 보완이며 자동 정리 코드나 검사기를 추가한 것은 아닙니다.
