# 통장 관리와 동별 비용 배분

상태: 2026-10-17 **입출금 업로드·선택 처리·수납 연결·지출 배분 구현**. 업무 기준은 [도메인 규칙](domainRules.md#통장-관리-페이지와-특수-배분-2026-10-17), 데이터는 [ERD](erd.md#94-공용-통장-거래-분류-확장-설계안), 화면은 [Client 설계](../client/docs/bankingManagement.md), 저장은 [Server 설계](../server/docs/bankingManagement.md)를 따릅니다.

2026-10-23 후속 요청 중 **은행 코드별 업로드·신한은행 매핑 수정·입금 중복 보완을 구현**했습니다. 적용 범위는 아래 [구현 상태](#은행-코드별-업로드-구현-상태-2026-10-23)를 따릅니다. 수동 지출의 등록·배분·조회는 아래 [등록 API](#수동-지출-등록-api-2026-10-23)로 구현했으며 취소·은행 연결은 후속 범위입니다. 기존 범용 헤더·입금 중복 설명은 후속 구현과 구분합니다.

## 사용자 요청과 구현 범위

통장 관리 아래 통장 거래, 월별 수납 현황, 지출 내역을 제공합니다. 은행 거래내역만 업로드하며 기존 회계 원장 파일은 업로드 대상으로 사용하지 않습니다. 업로드는 별도 페이지, 거래 설정과 PC 상세는 공통 모달, 모바일 저장 거래 상세는 페이지로 처리합니다. 미리보기 목록에서 입금·출금 필터와 10/20/50개 페이지 이동에도 선택·입력은 유지합니다. 기존 수납의 청구 충당·선입금·취소·보류는 [입금 API](paymentApi.md)를 재사용합니다.

한 관리대상의 여러 공용 관리계좌를 사용하고 기본 납부계좌는 하나 지정합니다. 은행 원본은 거래당 한 건이며 지출 배분만으로 동별 실제 계좌나 동 간 정산을 생성하지 않습니다. 서로 다른 관리대상 간 배분은 허용하지 않습니다.

## 실제 처리 흐름

1. XLS·XLSX·UTF-8 CSV 파일을 서버에서 검증합니다. 한도는 5MB·5,000행입니다.
2. 계좌의 활성 원본 중복과 인계 기준일 이전을 제외해 미리보기를 반환합니다. 원장은 저장하지 않습니다.
3. 전체·입금·출금으로 필터링해 거래를 선택합니다. 입금은 자동 매칭·세대 직접 지정·기타 입금, 출금은 원본 내용으로 자동 입력한 지출명과 부담처를 확인합니다.
4. 선택 전체를 원본 파일로 재검증하고 한 트랜잭션에서 저장합니다. 실패하면 일부 수납·출금·지출도 남기지 않습니다.
5. 입금은 기존 수납에, 출금은 확정 지출·동별 부담액에 반영합니다. 가져오지 않은 거래는 재업로드에서 다시 선택할 수 있습니다.

미일치 입금은 확인 필요로 남고 상세 페이지에서 기존 수납 확인·보류·취소·연결 절차를 사용합니다. 새 API는 미분류 출금 수집도 지원하지만 현재 업로드 UI는 선택 출금의 분류·배분을 모두 검증한 뒤 처리합니다.

## 특수 배분

506,000원 승강기 비용을 두 동에 균등 배분하면 각 253,000원입니다. 182,660원 전기료를 25%·25%·50%로 지정하면 45,665원·45,665원·91,330원입니다. 외부 부담처 이름과 비율은 관리자가 지정합니다. 25%씩만 입력해 남은 50%를 누락하면 확정할 수 없습니다.

균등·비율 계산의 원 미만은 직접 금액 조정으로 해결합니다. 직접 금액의 합계도 원본 출금과 같아야 합니다. 현재 한 출금에는 지출명 하나를 저장합니다. 별도 비용 항목 입력은 받지 않으며 여러 비용 항목 분할은 후속 설계입니다.

규칙 저장은 별도 전역 규칙 관리 기능이 아니라 확정 지출의 배분 스냅샷을 재사용하는 구현입니다. 같은 계좌·내용의 가장 최근 저장 규칙을 다음 미리보기에 제안합니다. 내용 앞의 1~2자리 월 숫자와 선택 `월`·공백을 제외해 반복 월을 대조합니다. 이는 제안만 하며 관리자가 검토하고 선택 처리합니다. 직접 금액 규칙은 이전 금액을 제안하므로 출금액이 달라졌다면 조정해야 합니다.

## API 계약

모든 경로는 `/api/properties/{propertyId}/banking` 아래이며 Bearer 인증·ADMIN 권한을 확인하고 `Cache-Control: no-store`를 반환합니다. 요청 원문은 오류에 포함하지 않습니다.

| 메서드·경로 | 요청 | 응답 |
| --- | --- | --- |
| GET `/workspace` | 없음 | `propertyId, asOf, buildings, units, rows, rules` |
| POST `/import/preview` | multipart `file` | `propertyId, rows, duplicateCount, beforeCutoffCount` |
| POST `/import` | multipart `file`, JSON part `selection` | 최신 Workspace |
| POST `/transactions/{id}/expense` | JSON Expense | 최신 Workspace |

`selection`은 `{ rows: [{ id, unitId?, incomeCategory?, incomeNote?, expense? }] }`입니다. `id`는 파일 미리보기 거래 키에서 파생한 선택 ID이며 저장된 원본 UUID와 다릅니다. 선택은 1~5,000개, 중복 ID·다른 파일 ID·인계 이전·입금에 지출 설정·출금에 입금 설정은 거부합니다. `unitId`와 `incomeCategory`를 동시에 지정하지 않습니다. 금액·일시는 요청값을 받지 않고 파일을 다시 읽습니다.

Expense는 `{ category, note?, mode, saveAsRule, allocations }`, mode는 `EQUAL / RATIO / AMOUNT`입니다. allocations는 `{ buildingId?, label?, amount?, percentage? }` 1~100개입니다. 실제 동은 같은 관리대상의 활성 동만 허용하고 표시명은 서버가 조회합니다. 외부·공통은 buildingId 없이 label을 입력합니다. `category`는 화면의 지출명 값이며 기존 API 키를 유지합니다. Client는 은행 원본 내용으로 초기화하고 관리자가 변경할 수 있습니다. category·label은 100자, note는 선택 500자입니다. 금액은 원 단위 숫자 문자열, percentage는 소수점 둘째 자리까지입니다. 불필요한 선택 문자열의 공백은 미입력으로 정리합니다.

은행 원본의 Workspace.rows는 원본 UUID·계좌·날짜·선택 시간·지출명·메모·양수 금액·선택 거래 후 잔액·INCOME/EXPENSE·수납 ID·표시 상태·세대/항목 표시·선택 지출 배분입니다. 규칙에는 계좌·내용 HMAC 키·지출명·배분 방식·당시 배분을 반환합니다. 원본 일시와 금액을 편집하는 API는 없습니다.

주요 오류: `INVALID_BANK_FILE / INVALID_BANK_HEADER / INVALID_BANK_ROW / BANK_ROW_LIMIT / EMPTY_BANK_FILE / INVALID_BANK_SELECTION / INVALID_EXPENSE_TARGET / INVALID_EXPENSE_ALLOCATION / EXPENSE_ALLOCATION_MISMATCH / ALLOCATION_REMAINDER_REQUIRED / BANK_REQUEST_CONFLICT / BANK_TRANSACTION_NOT_FOUND`. 형식 오류는 400, 없는 거래는 404, 업무 충돌은 409이며 권한·DB 오류는 기존 보호된 오류 계약을 재사용합니다. 수납 오류는 [기존 계약](paymentApi.md)을 따릅니다.

## 조회와 구현 한계

통장 거래 합계는 조회 월·통장·검색·처리 상태 범위의 은행 원본과 취소되지 않은 수동 입출금을 방향별로 집계하며 방향 탭·페이지 이동은 합계를 바꾸지 않습니다. 취소 이력 행은 추가 합산하지 않고 은행에 연결된 수동 입금은 원본 한 건만 반영합니다. 미리보기는 파일 전체 기간입니다. 지출 내역은 각 동의 실제 부담액만 표시합니다. 전체 동에서는 각 관리 동의 부담액을 거래별로 합친 지출액 한 열로 표시하고, 특정 동에서는 그 동의 부담액을 표시합니다. 합계도 같은 범위로 계산합니다. 외부 부담액과 원본 출금 전액은 지출 표·합계에 포함하지 않습니다. 은행 원본과 배분액을 합쳐 중복 집계하지 않습니다. 최근 은행 확인 잔액은 가져온 원본 중 잔액이 있는 최근 거래와 기준시각이며 실시간 잔액이 아닙니다. 파일 상단 조회 당시 잔액을 기간 말 잔액으로 사용하지 않습니다.

기존 저장 입금의 날짜·정규화 입금자·금액 중복 키는 보존하며 신규 입금 식별은 아래 2026-10-23 구현을 따릅니다. 출금은 방향 접두어와 선택 시간·잔액을 포함합니다. 동일 조건의 입금·출금은 충돌하지 않습니다. 시간·잔액 유무가 다른 양식을 섞은 출금 중복 대사와 은행 정정 거래는 후속 범위입니다.

기타 입금은 세대 수납과 분리합니다. 동별 보유금·외부 회수는 아래 후속 API를 사용합니다. 환불 원거래 연결·회계전표·월 마감은 구현하지 않았습니다. 확정 지출의 직접 덮어쓰기는 지원하지 않습니다. 잘못 가져온 거래는 아래 선택 삭제 후 재등록할 수 있습니다. 기존 `/payments/*` 주소는 호환용으로 유지하고 사이드바에는 통장 관리만 표시합니다.

## 동별 잔고·외부 회수 API

2026-10-17 구현. 업무 기준은 [동별 잔고 확정 정책](domainRules.md#동별-잔고외부-부담금-정산-2026-10-17-후속-확정), 테이블은 [ERD](erd.md#95-building_cash_openings)를 참조합니다. 기존 ADMIN 권한·관리대상 잠금과 전체 공용 관리계좌를 사용하며 응답은 `Cache-Control: no-store`입니다.

| 메서드 | `/api/properties/{propertyId}/banking/balances` 아래 경로 | 요청 |
| --- | --- | --- |
| GET | `?month=YYYY-MM&accountId=UUID` | 조회 월·선택 통장. accountId 생략은 전체 |
| POST | `/openings` | `{ accountId, cutoffDate, buildings: [{ buildingId, amount }] }` |
| POST | `/openings/corrections` | `{ id, accountId, cutoffDate, buildings: [{ buildingId, amount, revision }] }` |
| POST | `/income-assignments` | `{ paymentId, buildingId }` |
| POST | `/settlement-decisions` | `{ id, allocationId, excluded, revision }` (정산 제외·복원) |
| POST | `/settlements` | `{ id, allocationId, paymentId, amount }` |

변경 성공은 `{ saved: true }`를 반환하며 클라이언트는 같은 관리대상의 잔고 조회를 갱신합니다. 금액은 원 단위 숫자 문자열입니다. 조회 응답은 `{ propertyId, month, accountId, cutoffDate, bankBalance, bankAsOf, buildings, entries, externals, incomes, pending, accounts, legacyOpening }`입니다. accountId는 전체 조회일 때 null입니다. cutoffDate는 조회 범위의 기준일이 하나로 같을 때만 반환하고, 여러 통장의 서로 다른 기준일은 각 통장별 계산에 사용합니다. legacyOpening은 통장 귀속이 미정인 기존 확정값이 있을 때 `{cutoffDate,buildings:[{buildingId,amount}]}`로 반환합니다. 이 참고값은 선택 통장의 확정 잔고로 자동 합산하지 않습니다.

- buildings: `{ id, label, active, startBalance, income, expense, balance, status, openingBalance, openingRevision }`. openingRevision은 최초 0이며 정정 시 증가합니다. status는 `READY / OPENING_REQUIRED`, 시작값 미설정 잔고만 null입니다. openingBalance는 저장된 기준일 마감 잔고이며 조회 월 기초 잔고와 구분합니다. 기준일 이전 월은 확인된 입출금을 역산합니다. 비활성 동도 보유금·거래 이력이 있으면 반환합니다.
- entries: `{ id, accountId, buildingId, date, time, label, income, expense, paymentId }`. 입금의 paymentId는 기존 입금 처리 상세를 열 때 사용하며 출금은 null입니다. 원본 ID와 동별 실제 금액이며 조회 월 전체의 거래만 반환합니다. 역산용 기준일까지의 다른 월 거래는 서버 계산에만 사용합니다.
- externals: `{ id, label, expenseName, date, amount, received, remaining, recoveries, excluded, decisionRevision }`. excluded는 정산 대상 제외 상태이며 미회수 합계는 제외한 행을 빼고 계산합니다. decisionRevision은 처음 0이며 제외·복원마다 증가합니다. id는 외부 expense allocation ID이며 recoveries는 `{ id, paymentId, date, payer, amount }`입니다. 기준일 이후 부담액과 조회 월 말까지 유효한 실제 입금 연결만 집계합니다.
- incomes: `{ id, transactionId, date, payer, amount, available, kind, linkedBuildingId, linkedUnitLabel }`. 연결 동·세대는 현재 연결 세대의 확인용 단서이며 과거 귀속을 확정한 값이 아닙니다. 세대 연결·동 정보가 없어 자동 반영할 수 없는 기존 HOUSEHOLD 수납과 외부 연결 후보 OTHER 입금입니다. 세대가 연결된 확정 HOUSEHOLD 은행 입금은 동 귀속을 자동 기록하고 이 목록에서는 제외합니다. 외부 회수는 명시적인 실제 입금 연결을 사용합니다.
- pending: `{ id, date, label, direction, amount }`. 아직 확정되지 않은 은행 거래입니다. 역산 시에는 조회 월 초부터 기준일까지, 이후 월에는 기준일 다음 날부터 조회 월 말까지의 미확정 거래를 함께 확인합니다.

마지막 원본에 잔고가 없거나 같은 날짜의 거래 순서를 정할 수 없으면 이전 잔고를 월말 잔고로 대체하지 않고 bankBalance=null과 확인 안내를 반환합니다. 시각 없는 여러 거래와 같은 일시의 서로 다른 잔고가 이에 해당합니다. 잔고 없음은 0원이 아닙니다.

추가 업무 오류: `INVALID_CASH_OPENING`, `INVALID_CASH_OPENING_DATE`, `CASH_OPENING_CONFLICT`, `CASH_ASSIGNMENT_CONFLICT`, `INVALID_EXTERNAL_SETTLEMENT`, `EXTERNAL_SETTLEMENT_EXCEEDED`, `EXTERNAL_SETTLEMENT_CONFLICT`. 입력 오류는 400, 상태·한도 충돌은 409이며 권한은 기존 오류를 사용합니다.

정산 제외·복원은 같은 ADMIN 권한·관리대상 잠금을 사용합니다. 원본 거래·지출·회수액은 변경하지 않고 새 결정 이력을 남깁니다. 요청 UUID 재시도는 같은 결과를 반환하며 다른 내용 재사용·이전 revision 변경은 `EXTERNAL_SETTLEMENT_DECISION_CONFLICT`(409)입니다. 제외 상태의 신규 회수 연결은 `EXTERNAL_SETTLEMENT_EXCLUDED`(409)입니다. 복원 이후에도 과거 요청 재시도는 현재 상태를 되돌리지 않습니다.

기준일·마감 잔고 정정은 선택 통장에 등록된 모든 동(보관 동 포함)의 값과 기대 revision을 함께 받습니다. 다른 통장의 동별 값은 변경하지 않습니다. 기준일은 오늘 이전도 허용하고 세대 미납·선납 인계 기준일과 분리합니다. 변경 전후 값·수정자를 보존하며 통장·수납·지출 원본은 바꾸지 않습니다. 오래된 버전·다른 내용의 UUID 재사용은 `CASH_OPENING_CONFLICT`(409), 동 누락·중복은 `INVALID_CASH_OPENING`(400)입니다. 같은 UUID 재시도는 이후 다른 정정이 있어도 과거 값을 다시 적용하지 않습니다.

## 통장 거래 선택 삭제·기타 입금 배분 API

- `POST /api/properties/{propertyId}/banking/transactions/delete`: `{transactionIds: UUID[]}`. 1~5,000개, ADMIN 전용이며 전체 소속 검증 후 원자적으로 처리합니다. 연결 수납·충당을 취소하고 원본은 소프트 삭제합니다. 응답은 최신 Workspace이며 `Cache-Control: no-store`입니다. 이미 삭제한 ID 재요청은 무효과이며 재등록한 새 ID에 영향을 주지 않습니다. 다른 관리대상·없는 ID는 `BANK_TRANSACTION_NOT_FOUND`로 전체 거부합니다.
- `POST /api/properties/{propertyId}/banking/transactions/{id}/income-allocation`: 지출 배분과 같은 `{category, note?, mode, saveAsRule:false, allocations:[{buildingId,amount?,percentage?}]}` 구조입니다. 실제 항목명·메모는 확정 기타 입금의 값을 유지하고 이 API는 배분만 저장합니다. `EQUAL`, `RATIO`, `AMOUNT`를 지원하며 관리 동을 명시하고 전액 합계를 검증합니다. 같은 확정 배분 재시도는 한 번만 반영하고 다른 값은 `BANK_REQUEST_CONFLICT`로 거부합니다.
- 업로드 Selection에 선택 필드 `incomeAllocation`을 추가합니다. 이 필드를 보내면 `incomeCategory`가 필요하며 `unitId`·`expense`와 함께 보낼 수 없습니다. 수납 확정·배분 저장은 한 트랜잭션이므로 배분 실패 시 입금 원본까지 롤백합니다.
- Workspace 거래에 `receiptType`과 `incomeAllocation`을 추가합니다. `incomeAllocation`은 기존 Expense 응답과 같은 구조이며 ID는 수납 ID, `saveAsRule`은 false입니다. 세대 입금·미배분 기타 입금은 null입니다. 동별 잔고 Entry에는 배분된 동마다 해당 몫의 income을 표시하되 실제 은행 잔액과 기타 입금 전체 합계는 복제하지 않습니다.
- `OTHER_INCOME_REQUIRED`: 확정 기타 입금이 아님. `INCOME_ALREADY_SETTLED`: 외부 회수에 이미 사용한 입금. 대상·금액·비율 검증은 기존 배분 오류를 재사용합니다. 동별 배분 입금은 외부 회수 후보·사용 가능 입금 목록에서 제외합니다. 삭제한 출금의 기존 회수 연결은 보관하되 활성 회수 집계에서 제외하여 연결 입금의 사용 가능액을 복원합니다.

2026-10-18 후속 요청으로 잔고 응답의 각 `externals`에 원본 출금 `transactionId`와 전체 출금액 `transactionAmount`를 제공합니다. 외부 부담금 상세의 잘못 등록된 거래 삭제는 위 `/banking/transactions/delete`에 해당 원본 ID를 보내며 별도 삭제 API나 DB 구조를 추가하지 않습니다. 외부 부담액만 제거하거나 확정 배분 금액을 변경하지 않고, 원본 삭제에 따라 해당 출금의 동별 지출·외부 정산을 모두 유효 계산에서 제외합니다. 권한·원자성·재시도·이력 보존은 기존 선택 삭제 계약을 따릅니다.

## 기존 관리계좌 정보 정정 API

2026-10-18 구현. [기존 관리계좌 정정 정책](domainRules.md#기존-관리계좌-정보-정정-2026-10-18)을 따릅니다. ADMIN 전용이며 응답은 `Cache-Control: no-store`입니다.

- `GET /api/properties/{propertyId}/banking/account`: 현재 활성 공용 기본 계좌를 `{propertyId,accountId,updatedAt,bankCode,bankName,accountNumber,holderName}`으로 반환합니다. 계좌번호 원문은 권한 확인 뒤 복호화하며 로그·오류에 포함하지 않습니다.
- `PUT /api/properties/{propertyId}/banking/account`: `{accountId,updatedAt,bankCode,bankName,accountNumber,holderName}`을 보내고 같은 조회 응답 형식으로 정정 결과를 받습니다. 은행 코드 1~20자, 은행명·예금주 1~50자, 번호는 ASCII 공백·하이픈을 정리한 숫자 4~50자리이며 앞자리 0을 보존합니다.
- 계좌 ID·수정 시각이 달라진 요청은 `BANK_ACCOUNT_CONFLICT`(409), 같은 관리대상의 다른 미삭제 계좌와 은행 코드·번호가 중복되면 `BANK_ACCOUNT_DUPLICATE`(409), 활성 공용 기본 계좌가 정확히 하나가 아니면 `PAYMENT_ACCOUNT_UNAVAILABLE`(409)입니다. 같은 값의 재시도는 저장된 결과를 반환합니다. 입력·인증·권한·저장소 오류는 기존 보호된 오류 계약을 재사용합니다.
- ID·사용기간·기본 계좌 지정과 기존 거래·수납·지출·잔고를 변경하지 않습니다. 이 호환 API는 기본 지정 전환·통장 추가를 처리하지 않습니다. 후속 다중 통장 API는 아래를 따릅니다.


### 통장 거래·수동 수납 혼합 선택 삭제 (2026-10-18)

사용자 요청으로 기존 `/transactions/delete`의 요청을 `{transactionIds: UUID[], paymentIds?: UUID[]}`로 확장했습니다. 은행 원본 ID는 최대 5,000개, 은행에 연결되지 않은 MANUAL 수납 ID는 최대 1,000개이며 한쪽 배열은 비워도 되지만 전체 빈 선택은 거부합니다. 이전 transactionIds만 보내는 요청도 유지합니다. 소속·수동 출처·은행 미연결·삭제 가능 상태를 검증하고 같은 관리대상 잠금·트랜잭션에서 모두 처리하므로 하나라도 실패하면 전체 롤백합니다.

수동 PENDING·ON_HOLD·CONFIRMED·CANCELED를 모두 선택 삭제할 수 있습니다. 확정 수동 수납은 별도 선행 취소 없이 서버가 같은 트랜잭션에서 수납·충당을 취소한 뒤 소프트 삭제하고 누적 충당·선입금을 다시 계산합니다. 취소 상태·사유·충당·감사 이력은 보존하고 삭제 이벤트는 같은 선택 재시도에 한 번만 남깁니다. 은행 취소 이력을 임의의 수동 ID로 삭제하거나 다른 관리대상 수납을 삭제할 수 없습니다. 은행 원본 삭제의 기존 취소·재가져오기 정책은 유지합니다.


## 다중 통장·내부 이체 API (2026-10-18)

[다중 통장 정책](domainRules.md#다중-통장-운영-2026-10-18)을 구현합니다. 모든 변경은 ADMIN·같은 관리대상 잠금을 사용하며 응답은 `Cache-Control: no-store`입니다.

| 경로 | 요청·응답 |
| --- | --- |
| GET `/api/properties/{propertyId}/banking/account/list` | 계좌 목록. 기존 계좌 응답에 `alias, isPrimary, status` 추가. 권한 확인 뒤 원문 조회 |
| POST `/api/properties/{propertyId}/banking/account/save` | `{accountId,updatedAt?,bankCode,bankName,accountNumber,holderName,alias?,isPrimary,primaryAccountId}` → 계좌 응답 |
| POST `/api/properties/{propertyId}/banking/account/{id}/close` | `{updatedAt}` → 종료한 계좌 응답 |
| POST `/api/properties/{propertyId}/banking/transfers` | `{id,outgoingId,incomingId}` → 최신 Workspace |
| POST `/api/properties/{propertyId}/banking/transfers/{id}/cancel` | 본문 없음 → 최신 Workspace |

추가의 accountId는 클라이언트 UUID이며 같은 내용 재시도는 중복 생성하지 않습니다. 기존 계좌 정정에는 updatedAt이 필요하고 primaryAccountId는 조회 당시 기본 계좌 ID입니다. 기본 전환·정정 충돌은 `BANK_ACCOUNT_CONFLICT`, 번호 중복은 `BANK_ACCOUNT_DUPLICATE`, 기본 계좌 종료·해제는 `BANK_ACCOUNT_PRIMARY_REQUIRED`, 종료 계좌 정정은 `BANK_ACCOUNT_CLOSED`(모두 409)입니다. 별칭은 선택 100자이며 공백은 null로 정리합니다.

Workspace에 `accounts:[{id,bankName,last4,alias,isPrimary,status}]`를 추가합니다. 원문 번호·예금주 없이 통장 선택에 사용합니다. 종료 계좌는 아래 사용 종료 통장 조회 계약에 따라 표시 기간을 제한합니다. 거래의 `accountId`는 실제 통장입니다. 미리보기 multipart의 선택 accountId와 Import.selection의 선택 accountId로 사용 중인 같은 대상 통장을 지정합니다. 생략한 기존 호출은 기본 계좌를 사용합니다. 미리보기 선택 ID는 파일 키에서 파생하므로 통장 전환 시 미리보기를 폐기하고 다시 검증합니다. 원본 중복은 기존 `(bank_account_id,deduplication_key)` 기준을 유지합니다.

`POST /payments/manual` 요청에 선택 accountId를 추가합니다. 명시한 통장이 종료·다른 대상이면 거부하고, 같은 UUID 재시도에서도 통장 일치를 검사합니다. 기존 생략 호출은 기본 계좌를 사용합니다. 수납 Workspace.accounts에 isPrimary·status를 추가합니다.

Selection의 `transfer:true`는 세대·기타 입금·지출·공동 입금 배분 설정과 함께 보낼 수 없습니다. 원본만 저장하며 거래에 `transferCandidate:true`, 상태 `TRANSFER_PENDING`을 반환합니다. 연결하면 `transferId`와 `TRANSFER` 상태를 반환하고 연결 해제하면 대기로 돌아갑니다. 양쪽 원본의 동일 대상·다른 통장·반대 방향·같은 양수 금액을 검사하며 중복 연결·이미 분류한 원본·잘못된 UUID 재사용은 `BANK_TRANSFER_CONFLICT`(409)입니다. 같은 요청 ID 재시도는 이후 취소된 연결을 다시 적용하지 않습니다. 연결 원본의 한쪽만 삭제하면 `BANK_TRANSFER_DELETE_PAIR_REQUIRED`(409)입니다.

`Selection.transfer`는 선택 입력이며 생략·null은 `false`로 처리합니다. 일반 입출금과 이전 클라이언트의 multipart 요청을 허용하되 명시한 `true`는 유지하고, 잘못된 boolean 값이나 다른 요청 필드의 검증을 완화하지 않습니다.

잔고 응답에 `accounts:[{id,label,status,balance,asOf}]`를 추가하고 bankBalance는 조회 범위에 속한 통장의 확인 잔액 합계입니다. 하나라도 미확인이면 null이며 계좌별 asOf를 표시합니다. 통장 내부 이체는 은행 입출금에는 남지만 동별 Entry·세대 수납·운영 지출에는 포함하지 않습니다. 연결 대기는 pending에 표시하고 연결 완료는 제외합니다. 외부 부담금과 연결 후보 입금에는 accountId를 추가해 기존 같은 통장 회수 제한에 맞는 후보만 선택합니다. 다른 계좌로 받은 외부 부담금 회수는 후속 정책입니다.

수동 기타·동별 입금은 [수동 등록 계약](paymentApi.md#수동-등록확정취소)을 사용합니다. 동별 잔고 조회는 미연결 수동 기타 입금의 transactionId=null을 허용하며, 동별 배분 원장 행은 수동 입금 UUID와 paymentId를 반환합니다. 은행 원본 상세를 만들어 열지 않고 기존 수납 상세를 엽니다. 확정 수동 OTHER는 미배분 기타 입금·외부 회수 후보에, SHARED는 지정 동의 입금에 반영하며 나중에 원본 연결 후에도 한 번만 집계합니다.


### 통장별 동 기준 잔고 조회·확정 (2026-10-18 후속)

`accountId`는 같은 관리대상의 공용 통장만 허용하며 선택 통장은 동별 기준값·원장·입출금·외부 부담금·정산 후보까지 같은 범위로 제한합니다. 전체는 각 통장의 독립 기준일에서 계산한 동별 금액을 합산합니다. 미확정 통장의 금액은 0원으로 보완하지 않습니다. 기존 호출의 accountId 생략 저장은 통장 미분류 호환 자료로 남기며 새 화면은 선택 통장을 항상 보냅니다. 통장별 금액과 은행 실제 확인 잔액은 서로 다른 정보입니다.

기존 자료를 등록할 당시 공용 통장이 하나였다는 사실이 확인되면 금액·날짜·버전·이력을 유지해 원래 통장에 연결합니다. 소속이 불명확하면 legacyOpening의 기존 금액을 보여주고 `/openings`로 명시적인 통장별 확정을 받습니다. 이미 확정된 통장×동 값은 그대로 조회하며 정정은 기존 `/openings/corrections`를 사용합니다. 별도 통장 기초 잔액 등록 버튼·통장별/동별 탭은 제공하지 않습니다. 운영 중 잔액 직접 확인은 아래 2026-10-24 후속 구현과 구분합니다.

기존 독립 은행 실제 잔액 기록 호환 API `POST /balances/account-openings`는 `{id,accountId,cutoffDate,amount,revision}`을 받습니다. amount는 0 이상, 기준일은 오늘 또는 이전 날짜이며 요청 UUID·기대 버전으로 중복·정정 충돌을 검증합니다. 이 기록은 은행 확인 잔액 참고값이며 동별 기준 잔고를 생성하거나 변경하지 않습니다. 현재 기준 잔고 화면은 이 별도 API의 진입 버튼을 제공하지 않습니다. 이 호환 API를 아래 운영 중 확인 이력의 구현으로 간주하지 않습니다.


### 계산 잔액 응답

통장 목록 응답 배열은 저장된 최초 등록 순서입니다. 초기 설정의 입력 순서를 유지하고 추가 통장은 뒤에 붙이며 기본 지정 변경·은행명 정정은 순서를 바꾸지 않습니다. 별도 순서 변경 API는 제공하지 않습니다.

accounts의 각 항목에 `calculatedBalance: 원 단위 부호 있는 문자열|null`, `calculationBasisDate: YYYY-MM-DD|null`을 추가합니다. [기준 잔고 기반 계산 기준](domainRules.md#기준-잔고-기반-통장-계산-잔액-표시-2026-10-18-후속)을 적용하며 계산에 필요한 동별 기준값이 없으면 두 필드는 null입니다. 기존 balance·asOf와 Workspace.bankBalance·bankAsOf는 은행 파일·기존 실제 잔액 기록의 확인값 의미를 유지합니다. 계산값으로 이 필드를 채우거나 가상의 은행 원본을 저장하지 않습니다. 원본이 없어도 통장×동 기준값이 확인됐으면 계산값을 반환하며 이전 월은 해당 통장 기준일에서 역산합니다.

`accounts`에는 조회 월 말까지 사용 근거가 있는 통장만 포함하며 같은 계좌 집합으로 동별 합계·입출금·정산을 계산합니다. 같은 관리대상에 속하지만 사용 전인 accountId를 요청하면 응답 accountId는 null이고 해당 월의 전체 통장 결과를 반환합니다. 다른 관리대상의 계좌는 기존대로 거부합니다. 사용 근거 판정은 위 공통 계산 기준을 따르며 해당 월에 사용한 통장이 없으면 accounts·buildings는 빈 목록, 은행 잔액과 기준일은 null입니다.


동별 buildings에 선택 계좌 보고서용 `accountBalances:[{accountId,startBalance,balance}]`를 추가합니다. 기존 통장별 기준값 계산의 결과를 재사용하며 미설정은 null입니다. 통장 미구분 기존 기준값은 특정 계좌로 임의 귀속하지 않고 빈 목록을 유지합니다.

### 선택 통장 상세와 계좌번호 공개

2026-10-18 사용자 요청을 구현합니다. 기존 Bearer 인증·ADMIN 권한·`Cache-Control: no-store`를 적용하며 두 요청 모두 같은 관리대상·미삭제 공용 통장을 확인합니다. 종료 통장은 조회할 수 있습니다. 권한 부족·다른 대상·삭제·비공용·없는 통장은 `403 ACCESS_DENIED`로 구분 없이 거부합니다.

- `GET /api/properties/{propertyId}/banking/account/{id}` → `{propertyId,accountId,updatedAt,bankCode,bankName,last4,holderName,alias,isPrimary,status}`. 번호 원문·암호문·HMAC 없이 끝 네 자리만 반환하며 복호화하지 않습니다.
- `POST /api/properties/{propertyId}/banking/account/{id}/number-reveal` → `{propertyId,accountId,updatedAt,accountNumber}`. 본문 없이 선택 통장 한 건의 전체 번호를 반환합니다. 권한과 소속을 다시 확인하며 원문은 로그·오류에 포함하지 않습니다.

기존 설정용 `/account`, `/account/list` 계약은 유지합니다. 잔액은 기존 조회 월·통장별 잔고 응답을 사용합니다. Client는 상세와 공개 응답의 관리대상·통장·수정 버전·끝 네 자리 일치를 검증하고 상세 정정 후 다른 버전 번호는 표시하지 않습니다. 브라우저 번호 수명은 [Client 설계](../client/docs/bankingManagement.md#통장별-확인-잔액의-통장-상세)를 따릅니다.

## 은행별 업로드와 수동 출금 설계안 (2026-10-23)

상태: **초기 설계안과 후속 구현을 구분**합니다. 아래는 최초 제안이며 실제 적용한 은행 업로드 계약은 마지막 구현 상태 절을 따릅니다. 수동 출금은 아래 후속 등록 API만 구현했으며 이 절의 취소·은행 연결은 제안입니다. 수납의 자동 매칭 제외 여부를 보존하는 후속 Migration을 추가했으며 은행 업로드 변경에 이어 수동 지출 저장 변경을 별도 후속 Migration으로 적용했습니다. 사용자 요청과 남은 업무 결정은 [도메인 규칙](domainRules.md#은행별-업로드와-수동-출금-2026-10-23), 저장 변경안은 [ERD](erd.md#은행별-업로드와-수동-지출-저장-설계안-2026-10-23), 화면과 내부 처리는 각 영역 설계를 참조합니다.

### 제공 파일 분석과 수정 전 구현

사용자가 제공한 은행 파일 6개를 Apache POI로 읽고 현재 `BankTransactionReader.readAll`에도 직접 전달했습니다. 모두 첫 시트에 거래가 있는 실제 XLS/XLSX이며 수식·오류 셀은 없었습니다. 아래는 제목·계좌 안내·집계 행을 제외한 파일상 거래 수이며 서비스의 인계 기준일·중복 검사·자동 수납을 통과한 저장 건수가 아닙니다. 원문 파일·계좌번호·거래 상대 이름·개인 PC 경로는 저장소에 추가하지 않습니다.

| 은행·코드 | 제공 형식·헤더 행 | 거래 수와 방향 | 수정 전 파서 결과 |
| --- | --- | --- | --- |
| 국민은행 `004` | XLS·7행 | 117건: 입금 26·출금 91 | `INVALID_BANK_HEADER` |
| 기업은행 `003` | XLS·6행 | 63건: 입금 50·출금 13 | `INVALID_BANK_HEADER` |
| 농협은행 `011` 후보 | XLS·10행 | 301건: 입금 27·양수 출금 265·음수 출금 9 | `INVALID_BANK_HEADER` |
| 수협은행 `007` 후보 | XLS·12행 | 43건: 입금 7·출금 36 | `INVALID_BANK_HEADER` |
| 우리은행 `020` | XLSX·4행 | 1,284건: 입금 767·출금 517 | `INVALID_BANK_HEADER` |
| 신한은행 `088` | XLSX·1행 | 162건: 입금 69·출금 93 | 읽기 성공. 거래 상대 대신 `적요`를 사용 |

총 1,970건입니다. 기업은행 파일은 2022-04-05~2022-06-30, 우리은행은 2026-04-01~2026-07-31 거래로 파일명·문서 작성일에서 기간을 추측하지 않습니다. 기업은행은 과거→최근, 나머지는 최근→과거 순서입니다. 인접 거래 잔액은 해당 정렬 방향과 부호 있는 입출금 증감에 모두 일치했습니다. 이는 제공 파일의 연속성 검사이며 실시간 잔액·대사 완료를 뜻하지 않습니다.

농협·수협 코드는 지원 후보입니다. 제공 양식만으로 농협은행 `011`과 지역농축협 `012`, 수협은행 `007`과 다른 기관 코드의 양식 호환까지 확정하지 않습니다. 하나은행 `081`·카카오뱅크 `090`은 사용자가 언급한 기존 지원 대상이며 이번 6개 파일 분석에 포함되지 않았습니다. 은행 전체가 아니라 검증한 다운로드 양식·확장자를 지원 단위로 삼습니다.

### 은행별 헤더와 거래 해석안

아래는 제공 파일의 열 대응 설계안입니다. 헤더 행 번호를 고정하지 않고 기존 상단 탐색 범위에서 해당 은행의 필수 헤더 조합을 찾습니다. 공백·BOM 등은 공통 정규화하되 임의의 열을 입금자·금액으로 추정하지 않습니다.

| 은행 | 날짜·시간 | 입금 / 출금 | 거래 후 잔액 | 거래 상대·내용 해석 |
| --- | --- | --- | --- | --- |
| 국민은행 | `거래일시` | `입금액(원)` / `출금액(원)` | `잔액(원)` | `보낸분/받는분` 사용. `내 통장 표시`·`적요`·`메모`는 구분해 보존 |
| 기업은행 | `거래일시` | `입금` / `출금` | `거래후 잔액` | `상대계좌예금주명`·`내용`·`거래내용` 구분. 예금주가 빈 7건은 거래를 보존하고 자동 세대 매칭에서 제외하는 안 |
| 농협 | `거래일자` + `거래시간` | `입금금액(원)` / `출금금액(원)` | `거래 후 잔액(원)` | `거래기록사항`을 상대·내용 표시 후보로 사용. `거래내용`·`이체메모`·`거래메모`는 별도 원문 |
| 수협 | `일자`에 일시 포함 | `입금` / `출금` | `잔액` | `보낸분/받는분` 사용. 병합된 헤더 사이 빈 열의 위치 유지 |
| 우리은행 | `거래일시` | `입금(원)` / `지급(원)` | `거래후 잔액(원)` | `기재내용` 사용. `적요`는 거래 종류, `메모`는 별도 원문 |
| 신한은행 | `거래일시` | `입금액` / `출금액` | `잔액` | `내용` 사용. `적요`는 거래 종류로 분리하고 중복 `메모` 헤더는 열별로 보존 |

기업은행 `합계`, 우리은행 `총 1,284건` 형태의 집계, 신한은행의 마지막 `합계` 두 행 등 명시적인 집계만 제외합니다. 실제 거래의 날짜 누락·금액 오류는 조용히 건너뛰지 않습니다. `No`·파일명·조회 기간을 은행 고유 거래번호로 사용하지 않습니다. 여러 메모의 저장 표현은 ERD·Server 설계에서 정하며 하나를 조용히 버리지 않습니다.

농협 음수 출금 9건은 잔액을 늘리는 이동입니다. 후속 사용자 지시로 음수 거래도 포함하며 실제 증가 방향과 원문 음수 표기를 보존합니다. 아래 구현 상태의 처리 기준을 따르고 원지출 취소·환입 관계를 자동 생성하지 않습니다.

### 통장 선택과 업로드 계약 확장안

- Server가 선택 통장의 저장된 `bankCode`로 지원 양식을 결정합니다. Client가 보낸 은행명·파서 이름은 신뢰하지 않습니다. 미지원 은행은 등록·조회할 수 있지만 파일 업로드는 거부합니다.
- Workspace.accounts에 `bankCode`, `importSupport: { enabled, extensions, message }`를 추가하는 안입니다. `extensions`는 지원 확장자 목록이며 지원 은행은 `.xls`·`.xlsx`를 모두 포함하고 미지원은 빈 배열입니다. 기존 ACTIVE 제한도 함께 적용합니다.
- 지원 여부와 헤더 규칙은 같은 Server 정의를 사용합니다. 신규 은행은 목표 범위이며 구현·회귀 검증 전에는 `enabled=true`로 제공하지 않습니다. 기존 범용 CSV 지원도 은행별 검증 없이 자동 승계하지 않습니다.
- `/banking/import/preview`와 `/banking/import`는 같은 은행 규칙으로 파일을 재검증합니다. 호환 `/payments` 업로드와 accountId 생략 시 기본 통장 호출에도 같은 지원 검사를 적용합니다.
- 제안 오류는 미지원 은행 `BANK_IMPORT_UNSUPPORTED`(400), 선택 은행 헤더 불일치는 기존 `INVALID_BANK_HEADER`(400)입니다. 불일치 때 다른 은행의 범용 파서로 재시도하지 않습니다. 헤더 일치는 실제 계좌번호 일치 검증을 뜻하지 않습니다.
- 미리보기 응답에 파일 전체 거래 기간 `period: { from, to }`를 추가하는 안입니다. 인계 이전·중복 제외 후 행이 없어도 실제 파일 기간을 안내하며 기존 `duplicateCount`, `beforeCutoffCount` 의미는 유지합니다.

### 입금 중복 기준 보완안

국민·농협·우리 파일에는 각각 날짜·상대·금액이 같고 시간·잔액이 다른 입금 2건의 묶음이 하나씩 있습니다. 현재 키로는 각 묶음의 실제 입금 한 건이 제외될 수 있습니다. 신한은행의 상대 열 오류도 거래 식별에 영향을 주므로 함께 검토합니다.

1. 은행의 안정적인 고유 거래번호가 있으면 우선합니다. 없으면 통장 범위에서 방향·거래일·정규화한 상대·금액·제공 시간·거래 후 잔액을 사용하는 버전 있는 식별안을 적용합니다. 미제공 시간·잔액을 0시·0원으로 만들지 않습니다.
2. 미리보기의 행 ID와 중복 판단을 분리합니다. 같은 후보 키인 파일 행도 먼저 개별 식별하며, 동일 초의 별도 거래를 합치거나 파일 `No`를 영구 키로 삼지 않습니다.
3. 기존 원본 ID·키·수납·지출 연결은 보존합니다. 새 키가 없다는 이유만으로 신규로 인정하거나 과거의 날짜·상대·금액 키가 같다는 이유만으로 별도 거래를 제외하지 않습니다. 저장된 시간·잔액 등으로 일치를 입증할 수 있는 건만 호환 중복으로 판정합니다.
4. 시간·잔액 누락, 양식 간 차이, 과거 신한 매핑 때문에 일치를 입증할 수 없으면 확인 대상으로 분리하고 자동 수납·중복 저장을 막는 안입니다. 관리자 확인 동작과 응답 필드는 구현 전에 확정합니다. 기존 매핑 자료를 일괄 덮어쓰거나 수납을 취소하지 않습니다.
5. 같은 파일·겹치는 기간·통장 전환·동시 업로드·선택 삭제 후 재가져오기를 검증합니다. 잠금·DB 유일성 보장이 새 버전과 호환 식별 전체에 적용돼야 합니다.

### 수동 출금 계약 제안

초기 제안 당시 `expenses.bank_transaction_id`는 필수였고 거래일·통장은 연결 원본에서 가져왔습니다. 아래는 은행 원본 없이 수동 지출과 동별 부담을 저장하는 새 계약 제안입니다. 은행 원본이나 실제 은행 확인 잔액을 만들어 해결하지 않습니다.

| 메서드·경로 | 제안 요청 | 제안 결과 |
| --- | --- | --- |
| POST `/api/properties/{propertyId}/banking/expenses/manual` | `{ id, accountId, date, category, amount, note?, mode, allocations }` | 저장된 수동 지출 ID·최신 Workspace |
| POST `/api/properties/{propertyId}/banking/expenses/{id}/cancel` | `{ id: 요청 UUID, reason }` | 취소 이력·갱신된 조회 결과 |
| POST `/api/properties/{propertyId}/banking/expenses/{id}/bank-link` | `{ id: 요청 UUID, transactionId }` | 기존 수동 지출과 은행 출금 연결 결과 |

`category`는 기존 지출명 키, `amount`는 1~15자리 양수 원 단위 숫자 문자열, `date`는 실제 출금일입니다. 배분 필드·한도·합계·원 미만 검증은 기존 Expense 계약을 재사용하고 등록·배분을 한 트랜잭션에서 확정하는 안입니다. 별도 비용 항목·증빙 필수를 추가하지 않으며 수동 등록의 배분 규칙 저장은 초기 범위에서 제외하는 안입니다.

ADMIN·같은 관리대상의 사용 중 공용 통장·관리 시작 상태·오늘 이후 날짜 금지를 검증하는 안입니다. 인계 기준일 이하 허용 여부는 세대 수납의 차단 정책에서 자동 도출하지 않고 별도로 결정합니다. 등록 UUID 재시도는 같은 내용이면 한 번만 반영하고 다른 내용이면 충돌로 거부합니다.

조회 응답은 수동 지출 ID·출처·통장·거래일·선택 은행 원본 ID·확정/취소 상태·배분·취소 감사 정보를 표현해야 합니다. 기존 은행 거래 UUID와 수동 지출 UUID를 혼동하지 않도록 식별 구조를 확장하며 상세 응답·상태·오류 코드의 최종 형태는 미정입니다. 수동 출금은 기존 은행 원본 전용 삭제 API에 ID를 보내지 않습니다.

통장 계산 잔액은 유효한 은행 미연결 수동 출금을 한 번 차감하고 동별 원장은 해당 동의 부담액만 차감하는 안입니다. 실제 은행 확인 잔액은 은행 원본·확인 기록 기준을 유지하며 수동 등록으로 갱신하지 않습니다. 취소 후 유효 집계에서 제외하되 원문·배분·처리자·시각·사유를 보존합니다.

추후 업로드 원본은 같은 통장·같은 금액의 미분류 출금인지 검증하고 관리자가 명시적으로 연결하는 안입니다. 날짜·이름·금액 유사성만으로 자동 연결하지 않습니다. 연결 시 은행 입출금에는 원본 전액, 지출·동별 부담에는 기존 지출을 한 번 반영하며 미연결 수동 출금 차감을 제거합니다. 기존 확정 지출·이체 원본·다른 대상에 중복 연결하지 않습니다. 연결 전 의심 거래도 관리자 검토 대상으로 분리해 두 지출을 함께 확정하지 않게 합니다.

취소 API의 은행 연결 지출 허용 범위, 연결 해제·연결 원본 삭제와 지출 복원, 외부 회수 이력이 있는 수동 지출 취소는 미정입니다. 제안으로 기존 업로드 지출의 불변·선택 삭제 정책을 변경하지 않습니다.

### 남은 결정과 완료 기준

- 업무 결정: 농협 음수 출금과 원지출의 취소·환입 관계, 농협·수협 기관 코드별 지원 범위, 불완전한 식별의 관리자 확인, 수동 출금의 취소·은행 연결 수명주기·외부 정산 취소 범위입니다.
- 초기 실제 잔액·기준일은 기존 등록 흐름과 계좌 잔액 기록을 재사용합니다. 운영 중 추가 통장의 잔액 입력 UI는 이번 네 가지 요청에 포함해 확정한 기능이 아닙니다.
- 완료 기준: 지원 은행만 업로드 가능, 신한 상대 정상 매핑, 별도 입금 보존과 재업로드 중복 방지, 수동 출금의 등록·배분·취소·은행 연결 후 일회 집계, 기존 원본·수납·지출 보존입니다. 미지원 양식이나 판단 불가능한 거래를 숨기고 파일 전체가 정상 처리됐다고 표시하지 않습니다.


## 은행 코드별 업로드 구현 상태 (2026-10-23)

사용자는 선택한 통장의 은행 코드에 따른 업로드를 구현하고 농협 음수 출금도 포함하도록 지시했습니다. 후속 사용자 요청에 따라 샘플 파일의 확장자로 제한하지 않고 지원 은행 모두 `.xls`·`.xlsx`를 허용합니다. 다음은 실제 코드에 적용한 범위입니다. 이 은행 업로드 변경에는 수동 출금을 포함하지 않았으며 후속 등록 구현은 아래 계약을 따릅니다. 취소·은행 연결은 후속 범위입니다.

| 은행 코드 | 지원 양식의 파일 확장자 |
| --- | --- |
| 국민은행 `004`, 기업은행 `003`, 농협은행 `011`, 수협은행 `007`, 우리은행 `020`, 신한은행 `088` | `.xls`·`.xlsx` |
| 하나은행 `081` | 기존 `.xls`·`.xlsx`·UTF-8 `.csv` |
| 카카오뱅크 `090` | `.xls`·`.xlsx`·기존 UTF-8 `.csv` |

`BankImportFormat`이 지원 여부·확장자·은행별 필수 헤더를 함께 관리합니다. `012` 등 별도 기관 코드와 부산은행 `032`를 은행명으로 추측해 허용하지 않습니다. 명시한 은행 규칙의 헤더가 맞지 않으면 다른 은행이나 범용 파서로 우회하지 않습니다. 하나은행의 기존 입금 전용 CSV만 해당 코드 안에서 호환합니다. 모든 업로드 진입점은 저장된 코드와 실제 파일 형식을 검사합니다.

- Workspace.accounts에 `bankCode`, `importSupport: { enabled, extensions, message }`를 반환합니다. 미지원은 `enabled=false`, 빈 extensions이며 Client는 파일 선택·드롭·최종 저장을 차단합니다. 선택 통장이 미지원이면 거래 목록의 업로드 버튼도 비활성화합니다. 사용 종료 통장의 기존 신규 입력 금지도 유지합니다.
- 미지원은 `400 BANK_IMPORT_UNSUPPORTED`, 잘못된 확장자·실제 파일 형식은 `400 INVALID_BANK_FILE`, 다른 은행 헤더는 `400 INVALID_BANK_HEADER`입니다. `/payments` 호환 미리보기·저장도 같은 검사를 사용합니다.
- 신한은 `내용`을 상대 표시로 읽습니다. 여러 메모·거래 종류는 열 위치를 붙여 기존 암호화 memo에 함께 보존합니다. 기업의 예금주가 빈 행은 거래내용을 표시하되 자동 세대 매칭에서 제외합니다. 거래 상대 정보를 임의의 주민 이름으로 바꾸지 않습니다.
- 농협 음수 출금은 양수 금액의 `INCOME`으로 정규화하고 memo에 `은행 원문 출금금액(원): -금액`을 보존합니다. 이는 실제 잔액 증가를 표현한 구현 선택이며 원지출 취소나 운영 수입을 자동 확정한 의미가 아닙니다. 자동 세대 후보·최초 자동 수납·이후 일치 입금 일괄 처리에서 제외하고 PENDING으로 보존합니다. 제외 여부는 payments.auto_match_eligible에 저장합니다. 관리자가 명시적으로 분류할 수 있으며 기존 일반 양수 금액·방향 구조를 유지합니다.
- 신규 입금은 시간 또는 잔액이 제공되면 `income:v2` 식별에 포함합니다. 고유 거래번호가 있거나 시간·잔액이 모두 없는 기존 양식은 기존 키 규칙을 유지합니다. 저장된 기존 키·원본 ID는 변경하지 않습니다. 같은 통장 원본의 일시·잔액을 대조해 교차 재업로드를 제외하고 차이가 확인된 별도 입금은 보존합니다.
- 과거 자료의 정보가 부족하거나 동일 일시·잔액의 상대가 달라 중복 여부를 입증하지 못하면 `409 BANK_DUPLICATE_REVIEW_REQUIRED`로 해당 요청 전체를 거부합니다. 현재 별도 관리자 대사 화면이나 행별 강제 통과 API는 없습니다. 삭제된 원본은 유효 중복에서 제외하며 새 원본으로 다시 가져올 수 있습니다.
- 미리보기는 `period: { from, to }`로 원본 파일 전체 거래 기간을 반환합니다. 날짜·시간 셀 내부 줄바꿈과 은행별 명시적 집계 행을 처리하며 실제 거래의 잘못된 일시·금액은 거부합니다.

검증 자료는 제공 파일 6개의 파싱 총 1,970건, 신한 `내용` 열 162건 일치, 농협 음수 9건 보존입니다. 이 수치는 파일 읽기 검증이며 관리 시작·기준일·중복·선택 처리 후 DB 저장 건수는 아닙니다. 코드 검증은 Client·Server 설계의 회귀 항목을 따릅니다.


## 수동 지출 등록 API (2026-10-23)

상태: **등록·배분·조회 구현**. 업무 기준은 [도메인 규칙](domainRules.md#수동-지출-등록-2026-10-23-후속-확정)을 따릅니다. 앞의 수동 출금 계약 제안 중 다음 경로만 구현했습니다.

`POST /api/properties/{propertyId}/banking/expenses/manual`

요청은 `{ id, accountId, date, amount, category, note?, mode, allocations }`입니다. `id`는 클라이언트 요청 UUID이자 저장된 수동 지출 ID이고 `accountId`는 필수입니다. 금액은 양수 원 단위 1~15자리 숫자 문자열, date는 실제 출금일입니다. 지출명·메모·배분 대상과 한도는 기존 Expense 계약을 재사용하며 규칙 저장은 받지 않습니다. ADMIN·같은 관리대상의 사용 중 공용 통장·관리 시작·오늘 또는 이전 날짜를 검증합니다. 기준 잔고 날짜와 무관하게 과거 등록을 허용합니다.

응답은 최신 Workspace입니다. 수동 지출의 `rows[].id`는 지출 ID이며 `expense.id`와 같습니다. `sourceType=MANUAL`, `direction=EXPENSE`, `status=CONFIRMED`, `paymentId/time/balance=null`, `ruleKey=''`로 반환합니다. 은행 원본 행은 `sourceType=BANK_IMPORT`이며 기존 ID 의미를 유지합니다. 수동 ID를 은행 원본 선택 삭제 API에 보내지 않습니다.

등록과 전체 배분은 같은 관리대상 잠금·트랜잭션에서 저장합니다. 같은 사용자·대상·요청 ID와 같은 내용의 재시도는 중복 반영하지 않고 다른 내용은 `BANK_REQUEST_CONFLICT`입니다. 날짜 오류는 `INVALID_MANUAL_EXPENSE_DATE`, 금액 오류는 `INVALID_MANUAL_EXPENSE`이며 기존 통장·권한·배분 오류를 함께 사용합니다.

수동 지출은 거래·지출 목록·월별 지출 합계·엑셀·동별 원장과 통장 계산 잔액에 반영됩니다. 외부 부담분은 관리 동 지출 합계에서 제외하며 기존 정산으로 회수합니다. 은행 확인 잔액·확인 시각은 변경하지 않습니다. 기준일 이전 출금은 기존 누적·역산 계산을 따릅니다. 취소·은행 연결·연결 해제·업로드 출금과의 중복 대사는 후속 범위이며, 같은 거래를 다시 은행 지출로 확정하면 별도 지출로 집계됩니다.


## 사용 종료 통장 조회 계약 (2026-10-23 후속)

[사용 종료 통장 표시 정책](domainRules.md#사용-종료-통장-표시-2026-10-23-후속-확정)을 적용합니다. 거래 Workspace.accounts에 `availableFrom: YYYY-MM-DD`, `closedOn: YYYY-MM-DD|null`, `hasHistory: boolean`을 추가합니다. availableFrom은 등록 사용 시작일과 실제 은행 거래·수납·지출 중 이른 날짜입니다. 동별 기준값·최초 잔고·직접 잔액 확인은 사용 시작을 앞당기거나 hasHistory를 true로 만드는 근거가 아닙니다. Client는 조회 월 말보다 시작이 늦은 통장과 미사용 종료 통장을 제외하고 사용한 종료 통장은 종료 월까지만 거래·지출 필터에 표시합니다. Workspace의 원본 이력은 유지합니다.

잔고 API는 서버에서 월별 노출 범위와 잔액·동별 자금·미회수 외부 부담금 예외를 판정하여 accounts와 계산 범위를 함께 반환합니다. 숨겨진 같은 관리대상 accountId는 accountId=null의 전체 통장 결과로 복원합니다. 설정의 통장 상세·과거 기록은 표시 제외로 삭제하지 않습니다. 기존 bank_accounts의 status·valid_from·valid_to와 사용 자료를 활용하므로 새 컬럼·Migration은 추가하지 않습니다.


## 은행 잔액 직접 확인 API 설계안 (2026-10-24)

상태: **등록·이력 조회·취소 및 잔고 조회 연동 구현**. 최초 제안에서 확정한 실제 계약이며 업무 기준은 [도메인 규칙](domainRules.md#운영-중-은행-잔액-직접-확인-2026-10-24), 저장 구조는 [ERD](erd.md#은행-잔액-직접-확인-저장-설계안-2026-10-24)을 따릅니다.

| 메서드 | `/api/properties/{propertyId}/banking/balances` 아래 경로 | 요청 / 응답 |
| --- | --- | --- |
| POST | `/checks` | `{id,accountId,amount,checkedAt,sourceType,memo?}` → `{saved:true}` |
| GET | `/checks?accountId=UUID` | `{propertyId,accountId,checks}` |
| POST | `/checks/{id}/cancel` | `{id: 취소 요청 UUID,reason}` → `{saved:true}` |

amount는 0 이상 원 단위 1~15자리 숫자 문자열, checkedAt은 오프셋이 포함된 실제 확인일시이며 미래시점은 거부합니다. sourceType은 `BANK_APP / INTERNET_BANKING / OTHER`, memo는 선택 500자, 취소 reason은 필수 500자 이내입니다. checkedBy·createdAt·취소 처리자와 시각은 인증 정보·서버 시계로 기록합니다. ADMIN·통장 소속·사용 상태와 이력 처리 범위는 업무 기준을 따릅니다. 모든 응답은 `Cache-Control: no-store`입니다.

checks는 실제 확인시점·기록시점 내림차순의 전체 이력이며 각 행은 `{id,amount,checkedAt,sourceType,checkedBy,checkedByName,memo,createdAt,canceledAt,canceledBy,canceledByName,cancelReason}`입니다. 메모·사유가 없으면 null이고 취소 원문도 유지합니다. checkedByName은 기록한 계정의 표시명이며 주민 실명으로 추정하지 않습니다. 화면 페이지는 Client에서 나눕니다.

등록은 같은 UUID·사용자·통장·본문이면 재시도 성공이며 다른 내용은 `409 BANK_CHECK_CONFLICT`입니다. 취소는 같은 요청 UUID·처리자·사유만 재시도 성공이고 이후 등록 재시도로 취소를 복원하지 않습니다. 미래 확인시점은 `400 INVALID_BANK_CHECK_TIME`, DTO 형식 오류는 `400 INVALID_REQUEST`이며 권한·통장 오류는 기존 계약을 재사용합니다.

잔고 응답의 통장별 accounts에 `confirmation: {source,sourceId,date,time,precision,status,method}|null`, `comparisonTimeDifferent: boolean`을 추가합니다. 기존 balance/asOf는 선택된 실제 확인값, calculatedBalance는 별도 계산값입니다. source는 `BANK_IMPORT / HANDOVER / ACCOUNT_OPENING / DIRECT_CHECK / MULTIPLE`, precision은 `DATE / TIME / DAY_END`, status는 `READY / ORDER_UNCLEAR / BALANCE_MISSING`입니다. 직접 확인일 때 method에 확인 방법을 반환하고 나머지는 null입니다. 복수 출처·순서 불명확일 때 sourceId는 null일 수 있으며 DATE·DAY_END에는 가상 시각을 만들지 않습니다.

순서 불명확은 확인 금액을 null로 반환하고 Client도 계산값으로 이를 가리지 않습니다. 최신 거래의 잔액 미제공은 기존 계산값 대체 표시를 유지하되 확인 자료 상태를 보존합니다. 실제 확인값과 월말 동별 계산시점의 차이는 comparisonTimeDifferent로 전달합니다. 원천·과거 월·합계 해석은 업무 기준을 따르며 가상 거래·새 계산 시작값을 생성하는 API는 없습니다. 날짜·시각 충돌의 강제 대사는 후속 범위입니다.
