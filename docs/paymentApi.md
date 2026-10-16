# 입금 관리 API

상태: 2026-10-16 구현. 공통 업무 정책은 [도메인 규칙](domainRules.md#6-수납--수납-배분--납부-상태), 저장 구조는 [ERD](erd.md#81-payments)를 참조합니다. Server 내부 흐름은 [Server 설계](../server/docs/payment.md), 화면은 [Client 설계](../client/docs/paymentManagement.md)에 둡니다.

## 공통 계약

기준 경로: `/api/properties/{propertyId}/payments`. 기존 Bearer 인증을 사용하며 모든 요청에서 현재 관리소장(`ADMIN`) 권한을 확인합니다. 다른 관리대상·부담당자는 403입니다. 성공·오류 응답은 `Cache-Control: no-store`입니다.

UUID는 문자열, 날짜는 `YYYY-MM-DD`, 청구월은 `YYYY-MM`, 원 단위 금액은 정수 문자열입니다. 입금은 1~999,999,999,999,999원입니다. 사유는 1~500자이며 선택 사유는 생략/null/공백을 미입력으로 취급합니다. 오류는 기존 `{code,message}` 형식을 사용하며 개인정보·SQL 원문을 포함하지 않습니다.

## 경로

| Method | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| GET | `/workspace` | 없음 | 현재 실제 원장 |
| POST | `/manual` | `{id,unitId,date,amount}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/confirm` | `{unitId,allocations:[{chargeId,amount}],separateReason?}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/hold` | `{reason}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/resume` | 없음 | 저장 후 실제 원장 |
| POST | `/{paymentId}/cancel` | `{reason}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/link` | `{paymentId:기존수동수납ID}` | 저장 후 실제 원장 |
| POST | `/import/preview` | multipart의 `file` | `{propertyId,rows,duplicateCount}` |
| POST | `/import` | multipart의 `file` | 저장 후 실제 원장 |

### 실제 원장

`{propertyId,asOf,accounts,units,charges,payments,history}`입니다. `asOf`는 한국시간 서버 날짜이며 `history`는 현재 빈 배열입니다. 취소 이력은 `payments`의 CANCELED 항목과 취소 사유로 표시하고 처리 이벤트는 DB에 보존합니다.

- `accounts`: `{id,label}`. 공용 기본 활성 계좌를 먼저 반환하며 번호는 뒤 네 자리만 표시합니다. 계좌 설정·선택 API를 이 기능에 추가하지 않습니다.
- `units`: `{id,label,status,eligible,representativeId,representativeName}`. `status`는 ACTIVE/VACANT 표시값, `eligible`은 현재 사용 중 세대 여부입니다. 대표가 없으면 대표 ID·이름은 null입니다. 과거 청구·입금과 연결된 삭제 세대도 이력 확인을 위해 포함합니다.
- `charges`: `{id,unitId,month,amount,status,dueDate}`. 실제 확정 부과기간의 저장된 청구입니다. 미래 예정 설정에서 청구를 만들어 반환하지 않습니다. 0원·음수 금액을 보존합니다. 취소·공실 제외는 배분하지 않습니다.
- `payments`: `{id,source,status,accountId,date,payer,amount,unitId,reason,allocations,linkedPaymentId,bankTransactionId,holdReason,cancelReason,separateReason,memo}`. 배분은 `{chargeId,amount}`입니다. 추천 세대가 없거나 대표 동명이인이면 `unitId`는 빈 문자열입니다. 선택 문자열·연결 ID는 null일 수 있습니다. 상태는 PENDING/ON_HOLD/CONFIRMED/CANCELED/LINKED입니다. LINKED는 기존 수납에 연결한 원본 확인 항목으로 수납 합계에 포함하지 않습니다.

### 수동 등록·확정·취소

수동 등록의 `id`는 클라이언트가 생성한 요청 UUID입니다. 같은 사용자·관리대상·세대·날짜·금액으로 같은 ID를 재전송하면 원래 항목을 반환하고 다른 내용으로 재사용하면 409입니다. 입금자명은 클라이언트 입력을 받지 않고 선택 세대의 현재 대표 주민에서 서버가 가져옵니다. 수동 등록만으로 납부 금액을 늘리지 않습니다.

확정은 현재 양수 유효 청구의 실제 잔액을 다시 확인합니다. 배분 합계는 양수이고 입금액 이하여야 하며 같은 청구를 중복 지정할 수 없습니다. 양수 반영액은 청구 잔액을 넘지 못합니다. 0원 배분 항목은 저장하지 않습니다. 다른 세대·관리대상·미발행·취소·공실 제외 청구 및 입금일 이후 부과 청구는 거부합니다. 현재 공실·삭제 상태여도 과거의 유효 청구는 조회·검토할 수 있습니다.

입금 전액은 수납에 기록하고 배분 후 남은 금액은 선입금 잔액으로 추적합니다. 미수금에서 입금 전액을 억지로 빼 음수로 만들지 않습니다. 선입금 자동 충당·환급 및 회계전표는 이번 API에서 구현하지 않습니다. 부과액 자체의 0원·음수 정산도 별도 정책이며 일반 배분을 허용하지 않습니다.

동일한 확정 내용의 재시도는 배분·처리 이벤트를 중복 생성하지 않습니다. 다른 내용의 재확정은 409입니다. 보류·해제는 수납 합계를 변경하지 않습니다. 취소는 전체 수납과 배분을 같은 트랜잭션에서 취소하며 최초 사유·시각·처리자를 유지합니다. 은행 원본은 제거하지 않고 재검토 초안으로 복귀합니다. 이미 취소된 수납에 대한 재요청은 최초 사유를 덮어쓰지 않습니다.

### 은행 파일·추천·중복

`.xlsx` 첫 시트와 UTF-8 CSV를 지원합니다. 최대 5MB·5,000행이며 첫 행은 헤더입니다. 필수 열은 입금일·입금자명·입금액, 선택 열은 적요·거래번호·거래시간·잔액입니다. 구현된 별칭만 자동 인식하며 `.xls`, 은행별 제목 행·수동 컬럼 매핑은 지원하지 않습니다. 수식·오류 셀, 잘못된 날짜·금액·크기·헤더는 거부합니다. 입금액이 비었거나 0인 출금 행은 수납 후보로 만들지 않습니다.

미리보기는 저장하지 않습니다. 가져오기 때 같은 파일을 서버에서 다시 읽고 원본과 확인 필요 항목을 함께 저장합니다. 거래번호가 있으면 같은 계좌의 거래번호로, 없으면 같은 계좌의 날짜·정규화한 입금자명·금액으로 자동 제외합니다. 이 규칙은 동일 파일 내 중복과 서로 다른 파일 재업로드에 동일하게 적용하며 원래 거래를 덮어쓰지 않습니다. 원본의 거래시간·잔액은 중복 키 사용 여부와 관계없이 보존합니다.

추천은 현재 대표 주민 이름 일치만 사용하며 동명이인은 자동 선택하지 않습니다. 가족·일반 주민은 추천 대상이 아닙니다. 추천·업로드만으로 수납을 자동 확정하지 않습니다. 같은 계좌·날짜·금액·입금자명의 기존 미연결 수동 확정 수납이 있으면 연결하거나 별도 입금 사유를 명시해야 합니다. 연결은 원본 확인 항목을 LINKED로 제외하고 기존 수납의 금액·배분을 보존합니다.

## 오류

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST / INVALID_AMOUNT / INVALID_PAYMENT_DATE | 요청 형식·금액·날짜 오류 |
| 400 | INVALID_BANK_FILE / INVALID_BANK_HEADER / INVALID_BANK_ROW / BANK_ROW_LIMIT / EMPTY_BANK_FILE | 파일 검증 오류 |
| 403 | ACCESS_DENIED | 현재 관리소장 권한 없음 |
| 404 | PAYMENT_NOT_FOUND | 해당 대상의 입금 없음 |
| 409 | PAYMENT_ACCOUNT_UNAVAILABLE / PAYMENT_UNIT_UNAVAILABLE / PAYMENT_REPRESENTATIVE_REQUIRED | 실제 계좌·세대·대표 확인 필요 |
| 409 | PAYMENT_ALLOCATION_INVALID | 최신 잔액·청구 상태·배분 한도 오류 |
| 409 | PAYMENT_DUPLICATE_REVIEW_REQUIRED | 기존 수동 수납 연결·별도 사유 확인 필요 |
| 409 | PAYMENT_REQUEST_CONFLICT / PAYMENT_STATE_CONFLICT / PAYMENT_LINK_CONFLICT / PAYMENT_CONFLICT | 처리 상태·재시도·동시 변경 충돌 |
| 503 | PAYMENT_SERVICE_UNAVAILABLE | 저장소 장애 |

수납이 반영된 당월 청구의 공실 제외·삭제·금액 변경은 관련 수납을 먼저 취소할 때까지 `BILLING_CHARGE_HAS_PAYMENTS`(409)로 보호합니다. 부분 취소·회계 정정 정책을 임의로 적용하지 않습니다.
