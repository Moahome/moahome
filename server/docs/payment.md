# 입금 저장과 실제 청구 연결

구현: 2026-10-16. 외부 요청·응답·오류는 [입금 API](../../docs/paymentApi.md), 업무 기준과 테이블은 [도메인 규칙](../../docs/domainRules.md#6-수납--수납-배분--납부-상태)·[ERD](../../docs/erd.md#81-payments)를 참조합니다.

## 데이터와 권한

PaymentService는 기존 ManagementAccessService와 ResidentListService를 사용해 매 요청의 관리소장 권한과 현재 대표를 확인합니다. 실제 units/residents/unit_residents, 발행된 billing_periods/charges의 기존 ID를 참조하며 예시 주민·청구·수납을 생성하지 않습니다. 관리비 기본 설정의 예정액을 실제 청구로 바꾸지 않습니다.

`V20261015231910__create_payment_workspace.sql`은 기존 테이블·ID·금액을 변경하지 않고 은행 원본, 수납, 배분, 처리 이벤트와 무결성 제약을 추가합니다. `V20261016002928__preserve_bank_transaction_details.sql`은 은행 원본의 선택 시간·잔액을 추가하고 무결성 함수의 스키마를 고정합니다. 적용된 초기 파일의 체크섬은 유지하며 후속 변경은 새 Migration으로만 적용합니다. Flyway는 기존 서버 실행 방식으로 적용하며 운영 DB를 직접 수정하지 않습니다.

입금자명·적요·보류·취소·별도 입금 사유는 PaymentTextSecurity로 암호화합니다. 기존 계좌 보안 키 설정을 재사용하지만 AES-GCM AAD와 HMAC 입력의 용도 접두사를 입금 전용으로 분리합니다. 번호는 뒤 네 자리만 반환합니다. 개인정보 원문·암호문·키를 로그에 남기지 않습니다.

## 저장 순서와 동시성

모든 변경은 현재 권한 확인 후 PropertyRepository.findForUnitUpdate로 관리대상을 잠급니다. 기존 세대 변경·부과 생성과 같은 잠금이므로 청구 변경과 확정 사이에 잔액 검사가 분리되지 않습니다. 조회는 REPEATABLE_READ로 원장의 여러 조회가 같은 스냅샷을 보게 합니다.

확정은 최신 유효 청구·기존 ACTIVE 배분을 검사하고 Payment 상태, PaymentAllocation, PaymentEvent를 한 트랜잭션에서 기록합니다. 실패하면 전부 롤백합니다. DB의 복합 FK, 활성 은행 원본 부분 유일 인덱스와 지연 배분 제약으로 같은 대상·세대 연결과 양쪽 금액 한도를 보완합니다. 이미 수납된 청구의 제외·변경은 Service와 DB에서 막아 자동 재분류를 수행하지 않습니다.

은행 원본 연결은 BANK_IMPORT 초안을 먼저 LINKED로 flush해 활성 원본 유일성을 해제한 뒤 기존 MANUAL 수납에 원본을 연결합니다. 취소도 이전 활성 수납을 먼저 flush한 뒤 원본 검토 항목을 복구합니다. 취소된 배분과 원래 금액·처리 이벤트는 남깁니다.

파일 미리보기와 가져오기는 같은 BankTransactionReader를 사용합니다. 가져오기에서는 같은 대상 잠금 아래 중복을 재확인하므로 동시에 같은 파일을 올려도 원본·초안이 두 번 생성되지 않습니다. 원본 파일의 영구 보관·범용 import_batches 화면·회계 이벤트/전표는 이번 구현에 포함하지 않습니다.

## 검증

PaymentPersistenceTest는 별도 PostgreSQL 클러스터에서 기존 자료 업그레이드와 실제 적용된 입금 초기 버전의 체크섬·은행 원본·수납·배분 보존, 대표 주민·실제 청구 연결, 재시도·파일 중복, 연결·보류·취소, 동시 과배분과 후반 저장 실패 롤백을 확인합니다. BankTransactionReaderTest는 CSV·XLSX·수식·날짜·금액 검증을, PaymentControllerTest는 인증·입력·응답 캐시를 확인합니다. 전체 검증은 `server/AGENTS.md`의 Java 21 `./gradlew build`를 따릅니다.
