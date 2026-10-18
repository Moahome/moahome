# 입금 관리 API

상태: 2026-10-16 구현. 공통 업무 정책은 [도메인 규칙](domainRules.md#6-수납--수납-배분--납부-상태), 저장 구조는 [ERD](erd.md#81-payments)를 참조합니다. Server 내부 흐름은 [Server 설계](../server/docs/payment.md), 화면은 [Client 설계](../client/docs/paymentManagement.md)에 둡니다.

## 공통 계약

기준 경로: `/api/properties/{propertyId}/payments`. 기존 Bearer 인증을 사용하며 모든 요청에서 현재 관리소장(`ADMIN`) 권한을 확인합니다. 다른 관리대상·부담당자는 403입니다. 성공·오류 응답은 `Cache-Control: no-store`입니다.

UUID는 문자열, 날짜는 `YYYY-MM-DD`, 청구월은 `YYYY-MM`, 원 단위 금액은 정수 문자열입니다. 입금은 1~999,999,999,999,999원입니다. 사유는 1~500자이며 선택 사유는 생략/null/공백을 미입력으로 취급합니다. 오류는 기존 `{code,message}` 형식을 사용하며 개인정보·SQL 원문을 포함하지 않습니다.

## 경로

| Method | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| GET | `/workspace` | 없음 | 현재 실제 원장 |
| POST | `/manual` | `{id,accountId?,purpose?,unitId?,payer?,date,amount,category?,note?,incomeAllocation?}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/confirm` | `{unitId,separateReason?}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/other-income` | `{category,note?}` | 기타 입금 확정 후 실제 원장 |
| POST | `/confirm-matches` | 없음 | 명단 일치 입금 일괄 확정 후 실제 원장 |
| DELETE | `/{paymentId}` | 없음 | 미확정 입금 단일 삭제 후 실제 원장 |
| POST | `/delete` | `{paymentIds:[UUID]}` | 선택 삭제 후 실제 원장 |
| POST | `/{paymentId}/hold` | `{reason}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/resume` | 없음 | 저장 후 실제 원장 |
| POST | `/{paymentId}/cancel` | `{reason}` | 저장 후 실제 원장 |
| POST | `/{paymentId}/link` | `{paymentId:기존수동수납ID}` | 저장 후 실제 원장 |
| POST | `/import/preview` | multipart의 `file` | `{propertyId,rows,duplicateCount}` |
| POST | `/import` | multipart의 `file`·`selection` JSON | 선택 저장 후 실제 원장 |

### 실제 원장

`{propertyId,asOf,accounts,units,charges,payments,history}`입니다. `asOf`는 한국시간 서버 날짜이며 `history`는 현재 빈 배열입니다. 취소 이력은 `payments`의 CANCELED 항목과 취소 사유로 표시하고 처리 이벤트는 DB에 보존합니다.

- `accounts`: `{id,label}`. 공용 기본 활성 계좌를 먼저 반환하며 번호는 뒤 네 자리만 표시합니다. 계좌 설정·선택 API를 이 기능에 추가하지 않습니다.
- `units`: `{id,label,status,eligible,representativeId,representativeName,residentNames,buildingName}`. `status`는 ACTIVE/VACANT 표시값, `eligible`은 현재 사용 중 세대 여부입니다. 대표가 없으면 대표 ID·이름은 null입니다. `residentNames`는 현재 소속 주민 이름 목록으로 세대 검색에 사용하며, `buildingName`은 동 필터용 이름으로 동이 없으면 빈 문자열입니다. 과거 청구·입금과 연결된 삭제 세대도 이력 확인을 위해 포함합니다.
- `charges`: `{id,unitId,month,amount,status,dueDate}`. 실제 확정 부과기간의 저장된 청구입니다. 미래 예정 설정에서 청구를 만들어 반환하지 않습니다. 0원·음수 금액을 보존합니다. 취소·공실 제외는 배분하지 않습니다.
- `payments`: `{id,source,status,accountId,date,payer,amount,unitId,reason,allocations,linkedPaymentId,bankTransactionId,holdReason,cancelReason,separateReason,memo,receiptType,incomeCategory,incomeNote}`. 배분은 `{chargeId,amount}`입니다. 이름·동호수로 유일하게 일치하는 세대가 없으면 `unitId`는 빈 문자열입니다. PENDING의 `unitId`는 후보이며 확정 전 저장 세대와 구분합니다. 선택 문자열·연결 ID는 null일 수 있습니다. 상태는 PENDING/ON_HOLD/CONFIRMED/CANCELED/LINKED입니다. LINKED는 기존 수납에 연결한 원본 확인 항목으로 수납 합계에 포함하지 않습니다.

### 수동 등록·확정·취소

수동 등록의 `id`는 클라이언트가 생성한 요청 UUID입니다. `purpose`는 `HOUSEHOLD / OTHER / SHARED`이며 생략한 기존 요청은 HOUSEHOLD입니다. 명단 자동 매칭은 수동 용도로 받지 않습니다. 실제 입금 통장 `accountId`는 같은 관리대상의 사용 중인 공용계좌이며 생략하면 기존 기본 계좌를 사용합니다.

- HOUSEHOLD: `unitId` 필수이며 서버가 현재 대표 주민을 입금자로 조회합니다. PENDING 초안으로 등록하고 상세에서 전액 수납을 확정합니다. `category / note / incomeAllocation`은 받지 않습니다.
- OTHER: `unitId` 없이 `payer / category`를 필수로 받고 선택 `note`를 받습니다. CONFIRMED·OTHER로 등록하며 세대 관리비 충당을 만들지 않습니다.
- SHARED: OTHER 입력과 `incomeAllocation`을 함께 받습니다. 분류명은 동별 입금이며 이자에 한정하지 않습니다. 배분 구조는 [통장 배분 계약](bankingManagement.md)의 Expense를 재사용하고 category·note는 상위 입력과 같아야 합니다. `saveAsRule=false`, 같은 관리대상의 활성 동 1~100개만 허용하며 외부 부담처는 허용하지 않습니다. 한 동 전액 또는 균등·비율·직접 금액으로 전액을 배분합니다. 예: amount=1500000, AMOUNT의 2동=1000000·3동=500000. 나머지·합계·비율 검증 실패 시 입금까지 롤백합니다.

입금자·항목은 최대 100자, 메모는 선택 500자이며 앞뒤 공백을 정리합니다. 같은 UUID의 용도·통장·입금일·금액·입금자·항목·메모·배분이 같으면 중복 생성하지 않고 다르면 409입니다. HOUSEHOLD 재시도는 당시 대표 이름을 보존합니다. 원장의 `buildings:[{id,label}]`는 현재 배분 가능한 동이며 수납의 `incomeAllocation:{id,category,note,mode,saveAsRule:false,allocations}`은 저장된 방식·항목·메모·동별 몫입니다. 배분이 없으면 null입니다.

수동 기타·동별 입금은 은행 파일 원본이나 거래 후 잔액을 생성하지 않습니다. 동별 입금은 지정한 동의 보유금에 반영하며 기존 수동 세대 수납의 은행 연결 전 현금 제외 기준은 유지합니다. 나중에 같은 거래를 업로드하면 기존 중복 검토·연결 경로를 사용합니다.

확정의 기본 요청은 `{unitId,separateReason?}`이며 `allocations`를 생략하거나 null로 전달합니다. 입금 전액을 지정 세대의 누적 수납으로 확정하고 미사용 수납을 실제 양수 유효 청구에 충당합니다. 미납이 없거나 청구가 없으면 배분 0건으로 전액 선입금을 보관할 수 있습니다. 현재 사용 중 세대만 새로 연결합니다. 과거 청구는 조회에서 보존합니다.

호환 경로로 `allocations:[{chargeId,amount}]`를 명시한 기존 요청은 종전 배분 한도·입금일 이후 청구 금지 검증을 유지합니다. 기본 화면은 이 경로를 사용하지 않습니다. 기본 누적 경로와 새 청구 생성은 기존 선입금을 충당할 수 있습니다. 미래 청구를 생성하지 않으며 0원·음수 부과 정산, 환급·회계전표는 구현하지 않습니다.

기본 확정 요청의 같은 세대·별도 사유 재시도는 이후 선입금이 충당되어도 배분·처리 이벤트를 중복 생성하지 않습니다. 다른 내용의 재확정은 409입니다. 보류·해제는 수납 합계를 변경하지 않습니다. 취소는 전체 수납과 배분을 같은 트랜잭션에서 취소하며 최초 사유·시각·처리자를 유지합니다. 은행 원본은 제거하지 않고 재검토 초안으로 복귀합니다. 이미 취소된 수납에 대한 재요청은 최초 사유를 덮어쓰지 않습니다.

### 은행 파일·추천·중복

`.xls`·`.xlsx` 첫 시트와 UTF-8 CSV를 지원합니다. 최대 5MB이며 거래 머리글 뒤의 비어 있지 않은 행은 5,000행까지 읽습니다. 은행 제목·계좌 정보가 앞에 있는 파일은 비어 있지 않은 첫 20행에서 거래 머리글을 찾습니다. 필수 열은 입금일·입금자명·입금액, 선택 열은 적요·출금액·거래번호·거래시간·잔액이며 구현된 별칭만 자동 인식합니다. 입금자 전용 열이 없는 입출금 은행 양식은 출금액 열과 적요 열이 함께 있을 때 적요를 입금자로 사용하고 같은 원문을 메모에도 보존합니다. 전용 입금자 열이 있으면 그 열을 우선 사용합니다. 카카오뱅크의 `거래일시 / 구분 / 거래금액 / 거래 후 잔액 / 거래구분 / 내용 / 메모` 양식도 지원합니다. 이 양식은 `구분=입금`만 수납 후보로 읽고 `내용`을 입금자명, `메모`를 별도 메모로 보존합니다. 출금은 금액 부호와 관계없이 수납에서 제외하며 알 수 없는 구분이나 음수 입금은 오류입니다. 수동 컬럼 매핑은 지원하지 않습니다.

Excel은 확장자와 실제 XLS(OLE2)·XLSX(OOXML) 형식의 일치를 확인합니다. 수식·오류 셀, 잘못된 날짜·금액·크기·헤더는 거부하고 수식이나 매크로를 실행하지 않습니다. 원본의 거래일시에서 날짜·시간을, 잔액 열에서 거래 후 잔액을 보존합니다. 입출금 양식에서 거래일 칸에 합계·총합계가 있거나 거래일이 비어 있고 적요가 합계·총합계인 행은 공백을 정리한 뒤 은행 합계 행으로 제외합니다. 그 외 날짜가 없는 입금 행은 오류입니다. 입금액이 비었거나 0인 출금 행은 수납 후보로 만들지 않으며 이 API로 출금 원본을 저장하지 않습니다. 입금액과 출금액이 동시에 양수인 실제 거래 행은 잘못된 행으로 거부합니다.

미리보기는 저장하지 않습니다. 가져오기 때 같은 파일을 서버에서 다시 읽고 원본과 확인 필요 항목을 함께 저장합니다. 거래번호가 있으면 같은 계좌의 거래번호로, 없으면 같은 계좌의 날짜·정규화한 입금자명·금액으로 자동 제외합니다. 이 규칙은 동일 파일 내 중복과 서로 다른 파일 재업로드에 동일하게 적용하며 원래 거래를 덮어쓰지 않습니다. 원본의 거래시간·잔액은 중복 키 사용 여부와 관계없이 보존합니다.

입금자명을 유니코드 정규화·공백 제거 후 현재 명단의 주민 이름 및 동·호수와 대조합니다. 동·호수의 마지막 `호`는 생략할 수 있어 `103동501`과 `103동 501호`를 같은 세대 표기로 찾습니다. 정확하게 한 세대에 일치하면 가져오기에서 자동 확정하고 전액 누적합니다. 여러 주민이 같은 이름이어도 한 세대에만 소속되면 해당 세대로 일치합니다. 여러 세대에 걸친 이름·동호수 충돌, 미일치, 기존 미연결 수동 수납 중복 의심은 PENDING으로 남깁니다. 미리보기는 후보만 반환하고 저장·자동 확정하지 않습니다.

미리보기의 `rows[].id`는 원본 거래 키로 만든 안정적인 선택 ID이며 저장 후의 수납 ID와 다릅니다. 가져오기는 같은 원본 `file`과 JSON 파트 `selection={"transactionIds":[미리보기ID]}`를 받습니다. 선택은 1~5,000개의 UUID이며 빈 목록·NULL 항목·파일에 없는 ID는 400입니다. 선택한 거래만 저장·자동 확정하고 제외한 거래는 원본·수납·중복 키를 만들지 않으므로 다음 업로드에서 다시 선택할 수 있습니다. 기존 파일만 보내는 호출은 호환을 위해 전체 가져오기를 유지하지만 현재 화면은 항상 선택 목록을 보냅니다.

서버는 파일 전체를 다시 검증하고 선택 ID가 원본의 거래 키에 포함되는지 먼저 확인합니다. 다른 금액의 파일로 바꾸거나 미리보기와 무관한 ID를 섞으면 전체 실패합니다. 선택한 거래가 이미 저장된 경우에는 기존 중복 정책으로 건너뛰어 같은 선택의 재시도·동시 업로드에 중복 입금을 만들지 않습니다.

`POST /confirm-matches`는 이미 가져온 PENDING 은행 입금의 명단을 다시 검사해 유일한 일치 건만 같은 트랜잭션에서 확정합니다. 보류·수동 입력·삭제·취소 항목과 취소 원본의 검토 초안은 처리하지 않으며 반복 호출은 이미 확정한 금액을 늘리지 않습니다. 같은 계좌·날짜·금액·입금자명의 기존 미연결 수동 확정 수납이 있으면 기존 수납에 연결하거나 별도 사유를 입력해야 합니다.

### 기타 입금 확정·취소

`POST /{paymentId}/other-income`은 PENDING 은행 입금을 세대 없이 기타 입금으로 확정합니다. `category`는 필수 1~100자, `note`는 선택 최대 500자이며 앞뒤 공백은 제거합니다. 보류 건은 먼저 해제하고, 기존 미연결 수동 수납 중복 후보가 있으면 기존 수납 검토를 먼저 완료해야 합니다. 수동 세대 입금·이미 확정한 세대 납부의 직접 재분류는 허용하지 않습니다.

응답의 `receiptType`은 HOUSEHOLD / OTHER이며 기존 수납은 HOUSEHOLD입니다. OTHER는 CONFIRMED / CANCELED 상태만 존재하며 `unitId`는 빈 문자열, `allocations`는 빈 배열입니다. `incomeCategory`·`incomeNote`는 기타 입금의 별도 항목·메모이고 `memo`는 은행 원본을 유지합니다. 기타 입금은 세대 수납·선입금·미납 계산과 다음 청구의 자동 충당에서 제외합니다.

같은 항목·메모로 재요청하면 처리 이벤트를 중복 생성하지 않고 다른 내용은 409입니다. `POST /{paymentId}/cancel`과 필수 사유로 확정을 취소하며 원 분류·최초 사유·시각을 보존합니다. 같은 원본의 PENDING 초안을 복구해 세대 납부 또는 기타 입금으로 다시 검토할 수 있습니다. 파일 중복 제외는 유지하고 기존 확정 이력을 삭제하지 않습니다.

### 입금 삭제

`POST /delete`는 `paymentIds`에 1~1,000개의 UUID를 받습니다. 모든 대상의 관리대상 소속·상태를 먼저 검증하고 PENDING·ON_HOLD와 은행 미연결 MANUAL의 CANCELED를 한 트랜잭션으로 소프트 삭제합니다. 2026-10-18 사용자 요청으로 취소된 미연결 수동 입금의 목록 삭제를 허용하며 취소 상태·사유·충당·이벤트는 보존합니다. 다른 관리대상·확정 수납·은행 연결 취소 이력을 이 API에 섞으면 전체 실패합니다. 같은 ID 반복과 이미 삭제한 ID 재요청은 멱등 처리합니다. 단일 삭제 API도 같은 기준입니다.

삭제는 수납과 은행 원본에 삭제자·시각을 남기고 활성 중복 키를 해제합니다. 같은 엑셀 행을 다시 가져오면 새 은행 원본과 새 수납 초안을 저장할 수 있습니다. 재등록한 활성 거래는 기존 날짜·입금자·금액 규칙으로 중복 방지합니다. 실패하면 삭제 표시와 키 해제를 함께 롤백합니다. 이전 구현에서 삭제 수납만 숨겨진 원본도 후속 Migration으로 보정합니다.

이 수납 직접 삭제 API는 확정 납부와 은행에 연결된 취소 수납을 거부하며 `PAYMENT_DELETE_NOT_ALLOWED`입니다. 통장 거래의 선택 삭제는 별도 [혼합 선택 삭제 계약](bankingManagement.md#통장-거래수동-수납-혼합-선택-삭제-2026-10-18)을 통해 확정된 미연결 수동 입금도 수납·충당 취소와 함께 소프트 삭제합니다. `POST /{paymentId}/cancel`은 확정 수납·충당을 합계에서 제외하고 은행 원본을 PENDING 검토 초안으로 돌립니다. 원본 키와 취소 이력을 보존합니다. 취소로 만든 검토 초안은 일치 입금 일괄 확정에서 제외합니다.

## 오류

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST / INVALID_AMOUNT / INVALID_PAYMENT_DATE / INVALID_INCOME_CATEGORY | 요청 형식·금액·날짜 오류 |
| 400 | INVALID_BANK_FILE / INVALID_BANK_HEADER / INVALID_BANK_ROW / INVALID_BANK_SELECTION / BANK_ROW_LIMIT / EMPTY_BANK_FILE | 파일 검증 오류 |
| 403 | ACCESS_DENIED | 현재 관리소장 권한 없음 |
| 404 | PAYMENT_NOT_FOUND | 해당 대상의 입금 없음 |
| 409 | PAYMENT_ACCOUNT_UNAVAILABLE / PAYMENT_UNIT_UNAVAILABLE / PAYMENT_REPRESENTATIVE_REQUIRED | 실제 계좌·세대·대표 확인 필요 |
| 409 | PAYMENT_DELETE_NOT_ALLOWED | 확정 수납은 먼저 취소하며 은행 연결 취소 이력은 보호 |
| 409 | PAYMENT_ALLOCATION_INVALID | 최신 잔액·청구 상태·배분 한도 오류 |
| 409 | PAYMENT_DUPLICATE_REVIEW_REQUIRED | 기존 수동 수납 연결·별도 사유 확인 필요 |
| 409 | PAYMENT_REQUEST_CONFLICT / PAYMENT_STATE_CONFLICT / PAYMENT_LINK_CONFLICT / PAYMENT_CONFLICT | 처리 상태·재시도·동시 변경 충돌 |
| 503 | PAYMENT_SERVICE_UNAVAILABLE | 저장소 장애 |

수납이 반영된 당월 청구의 공실 제외·삭제·금액 변경은 관련 수납을 먼저 취소할 때까지 `BILLING_CHARGE_HAS_PAYMENTS`(409)로 보호합니다. 부분 취소·회계 정정 정책을 임의로 적용하지 않습니다.

## 기존 잔액 연결 (2026-10-17)

원장 `charges`에 `chargeType=MONTHLY / OPENING_RECEIVABLE`을 추가합니다. 초기 미수의 month는 기준일의 월이며 신규 월별 부과액과 구분합니다. 기간 FK 없는 초기 미수도 실제 수납 배분에 사용할 수 있습니다. 기존 명시적 allocations 호환 경로는 월별 기간 청구만 처리하며 화면의 기본 누적 경로가 초기 미수를 먼저 충당합니다.

원장 `openingCredits`는 `{id,unitId,date,amount,allocations:[{chargeId,amount}]}`입니다. date는 인계 기준일이며 확정 인계의 선납금과 활성 충당만 반환합니다. payments 배열에 가짜 수납을 넣지 않습니다. 청구 미납은 실제 유효 수납 배분과 기존 선납 충당을 모두 차감합니다.

관리 시작 전 수납 변경은 `OPENING_BALANCE_REQUIRED`(409), 기준일 이하 수동 등록·수납 확정·기타 입금 확정은 `PAYMENT_BEFORE_OPENING_CUTOFF`(409)입니다. 은행 미리보기·가져오기는 기준일 이하 거래를 제외하며 미리보기 duplicateCount에 제외 건수를 함께 집계합니다. 실제 입금 월 합계에는 기존 선납·통장 시작 잔액을 포함하지 않습니다.

월별 수납 목록은 실제 당월 부과 세대와 조회월 이하에 유효한 초기 미수가 있는 세대를 표시합니다. 초기 미수는 전월 이월·인계 잔액에 포함하고 당월 신규 부과 합계에는 더하지 않습니다. 초기 선납만 있고 아직 신규 청구가 없는 세대의 잔액은 인계 화면에서 확인합니다.
