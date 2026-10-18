# 통장 관리와 동별 비용 배분

상태: 2026-10-17 **입출금 업로드·선택 처리·수납 연결·지출 배분 구현**. 업무 기준은 [도메인 규칙](domainRules.md#통장-관리-페이지와-특수-배분-2026-10-17), 데이터는 [ERD](erd.md#94-공용-통장-거래-분류-확장-설계안), 화면은 [Client 설계](../client/docs/bankingManagement.md), 저장은 [Server 설계](../server/docs/bankingManagement.md)를 따릅니다.

## 사용자 요청과 구현 범위

통장 관리 아래 통장 거래, 월별 수납 현황, 지출 내역을 제공합니다. 은행 거래내역만 업로드하며 기존 회계 원장 파일은 업로드 대상으로 사용하지 않습니다. 업로드는 별도 페이지, 거래 설정과 PC 상세는 공통 모달, 모바일 저장 거래 상세는 페이지로 처리합니다. 미리보기 목록에서 입금·출금 필터와 10/20/50개 페이지 이동에도 선택·입력은 유지합니다. 기존 수납의 청구 충당·선입금·취소·보류는 [입금 API](paymentApi.md)를 재사용합니다.

한 관리대상의 공용 기본 계좌를 사용합니다. 은행 원본은 거래당 한 건이며 지출 배분만으로 동별 실제 계좌나 동 간 정산을 생성하지 않습니다. 서로 다른 관리대상 간 배분은 허용하지 않습니다.

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

Workspace.rows는 원본 UUID·계좌·날짜·선택 시간·지출명·메모·양수 금액·선택 거래 후 잔액·INCOME/EXPENSE·수납 ID·표시 상태·세대/항목 표시·선택 지출 배분입니다. 규칙에는 계좌·내용 HMAC 키·지출명·배분 방식·당시 배분을 반환합니다. 원본 일시와 금액을 편집하는 API는 없습니다.

주요 오류: `INVALID_BANK_FILE / INVALID_BANK_HEADER / INVALID_BANK_ROW / BANK_ROW_LIMIT / EMPTY_BANK_FILE / INVALID_BANK_SELECTION / INVALID_EXPENSE_TARGET / INVALID_EXPENSE_ALLOCATION / EXPENSE_ALLOCATION_MISMATCH / ALLOCATION_REMAINDER_REQUIRED / BANK_REQUEST_CONFLICT / BANK_TRANSACTION_NOT_FOUND`. 형식 오류는 400, 없는 거래는 404, 업무 충돌은 409이며 권한·DB 오류는 기존 보호된 오류 계약을 재사용합니다. 수납 오류는 [기존 계약](paymentApi.md)을 따릅니다.

## 조회와 구현 한계

은행 합계는 조회 월·검색·처리 상태 범위의 원본 거래를 방향별로 집계하며 방향 탭·페이지 이동은 합계를 바꾸지 않습니다. 미리보기는 파일 전체 기간입니다. 지출 내역은 각 동의 실제 부담액만 표시합니다. 전체 동에서는 각 관리 동의 부담액을 거래별로 합친 지출액 한 열로 표시하고, 특정 동에서는 그 동의 부담액을 표시합니다. 합계도 같은 범위로 계산합니다. 외부 부담액과 원본 출금 전액은 지출 표·합계에 포함하지 않습니다. 은행 원본과 배분액을 합쳐 중복 집계하지 않습니다. 최근 은행 확인 잔액은 가져온 원본 중 잔액이 있는 최근 거래와 기준시각이며 실시간 잔액이 아닙니다. 파일 상단 조회 당시 잔액을 기간 말 잔액으로 사용하지 않습니다.

입금의 기존 날짜·정규화 입금자·금액 중복 키는 보존합니다. 출금은 방향 접두어와 선택 시간·잔액을 포함합니다. 동일 조건의 입금·출금은 충돌하지 않습니다. 시간·잔액 유무가 다른 양식을 섞은 출금 중복 대사와 은행 정정 거래는 후속 범위입니다.

기타 입금은 세대 수납과 분리합니다. 동별 보유금·외부 회수는 아래 후속 API를 사용합니다. 환불 원거래 연결·회계전표·월 마감은 구현하지 않았습니다. 확정 지출의 직접 덮어쓰기는 지원하지 않습니다. 잘못 가져온 거래는 아래 선택 삭제 후 재등록할 수 있습니다. 기존 `/payments/*` 주소는 호환용으로 유지하고 사이드바에는 통장 관리만 표시합니다.

## 동별 잔고·외부 회수 API

2026-10-17 구현. 업무 기준은 [동별 잔고 확정 정책](domainRules.md#동별-잔고외부-부담금-정산-2026-10-17-후속-확정), 테이블은 [ERD](erd.md#95-building_cash_openings)를 참조합니다. 기존 ADMIN 권한·관리대상 잠금·공용 기본 계좌를 사용하며 응답은 `Cache-Control: no-store`입니다.

| 메서드 | `/api/properties/{propertyId}/banking/balances` 아래 경로 | 요청 |
| --- | --- | --- |
| GET | `?month=YYYY-MM` | 조회 월 |
| POST | `/openings` | `{ cutoffDate, buildings: [{ buildingId, amount }] }` |
| POST | `/openings/corrections` | `{ id, cutoffDate, buildings: [{ buildingId, amount, revision }] }` |
| POST | `/income-assignments` | `{ paymentId, buildingId }` |
| POST | `/settlement-decisions` | `{ id, allocationId, excluded, revision }` (정산 제외·복원) |
| POST | `/settlements` | `{ id, allocationId, paymentId, amount }` |

변경 성공은 `{ saved: true }`를 반환하며 클라이언트는 같은 관리대상의 잔고 조회를 갱신합니다. 금액은 원 단위 숫자 문자열입니다. 조회 응답은 `{ propertyId, month, cutoffDate, bankBalance, bankAsOf, buildings, entries, externals, incomes, pending }`입니다.

- buildings: `{ id, label, active, startBalance, income, expense, balance, status, openingBalance, openingRevision }`. openingRevision은 최초 0이며 정정 시 증가합니다. status는 `READY / OPENING_REQUIRED`, 시작값 미설정 잔고만 null입니다. openingBalance는 저장된 기준일 마감 잔고이며 조회 월 기초 잔고와 구분합니다. 기준일 이전 월은 확인된 입출금을 역산합니다. 비활성 동도 보유금·거래 이력이 있으면 반환합니다.
- entries: `{ id, buildingId, date, time, label, income, expense, paymentId }`. 입금의 paymentId는 기존 입금 처리 상세를 열 때 사용하며 출금은 null입니다. 원본 ID와 동별 실제 금액이며 조회 월 전체의 거래만 반환합니다. 역산용 기준일까지의 다른 월 거래는 서버 계산에만 사용합니다.
- externals: `{ id, label, expenseName, date, amount, received, remaining, recoveries, excluded, decisionRevision }`. excluded는 정산 대상 제외 상태이며 미회수 합계는 제외한 행을 빼고 계산합니다. decisionRevision은 처음 0이며 제외·복원마다 증가합니다. id는 외부 expense allocation ID이며 recoveries는 `{ id, paymentId, date, payer, amount }`입니다. 기준일 이후 부담액과 조회 월 말까지 유효한 실제 입금 연결만 집계합니다.
- incomes: `{ id, transactionId, date, payer, amount, available, kind, linkedBuildingId, linkedUnitLabel }`. 연결 동·세대는 현재 연결 세대의 확인용 단서이며 과거 귀속을 확정한 값이 아닙니다. 세대 연결·동 정보가 없어 자동 반영할 수 없는 기존 HOUSEHOLD 수납과 외부 연결 후보 OTHER 입금입니다. 세대가 연결된 확정 HOUSEHOLD 은행 입금은 동 귀속을 자동 기록하고 이 목록에서는 제외합니다. 외부 회수는 명시적인 실제 입금 연결을 사용합니다.
- pending: `{ id, date, label, direction, amount }`. 아직 확정되지 않은 은행 거래입니다. 역산 시에는 조회 월 초부터 기준일까지, 이후 월에는 기준일 다음 날부터 조회 월 말까지의 미확정 거래를 함께 확인합니다.

마지막 원본에 잔고가 없거나 같은 날짜의 거래 순서를 정할 수 없으면 이전 잔고를 월말 잔고로 대체하지 않고 bankBalance=null과 확인 안내를 반환합니다. 시각 없는 여러 거래와 같은 일시의 서로 다른 잔고가 이에 해당합니다. 잔고 없음은 0원이 아닙니다.

추가 업무 오류: `INVALID_CASH_OPENING`, `INVALID_CASH_OPENING_DATE`, `CASH_OPENING_CONFLICT`, `CASH_ASSIGNMENT_CONFLICT`, `INVALID_EXTERNAL_SETTLEMENT`, `EXTERNAL_SETTLEMENT_EXCEEDED`, `EXTERNAL_SETTLEMENT_CONFLICT`. 입력 오류는 400, 상태·한도 충돌은 409이며 권한은 기존 오류를 사용합니다.

정산 제외·복원은 같은 ADMIN 권한·관리대상 잠금을 사용합니다. 원본 거래·지출·회수액은 변경하지 않고 새 결정 이력을 남깁니다. 요청 UUID 재시도는 같은 결과를 반환하며 다른 내용 재사용·이전 revision 변경은 `EXTERNAL_SETTLEMENT_DECISION_CONFLICT`(409)입니다. 제외 상태의 신규 회수 연결은 `EXTERNAL_SETTLEMENT_EXCLUDED`(409)입니다. 복원 이후에도 과거 요청 재시도는 현재 상태를 되돌리지 않습니다.

기준일·마감 잔고 정정은 등록된 모든 동(보관 동 포함)의 값과 기대 revision을 함께 받습니다. 기준일은 오늘 이전도 허용하고 세대 미납·선납 인계 기준일과 분리합니다. 변경 전후 값·수정자를 보존하며 통장·수납·지출 원본은 바꾸지 않습니다. 오래된 버전·다른 내용의 UUID 재사용은 `CASH_OPENING_CONFLICT`(409), 동 누락·중복은 `INVALID_CASH_OPENING`(400)입니다. 같은 UUID 재시도는 이후 다른 정정이 있어도 과거 값을 다시 적용하지 않습니다.

## 통장 거래 선택 삭제·기타 입금 배분 API

- `POST /api/properties/{propertyId}/banking/transactions/delete`: `{transactionIds: UUID[]}`. 1~5,000개, ADMIN 전용이며 전체 소속 검증 후 원자적으로 처리합니다. 연결 수납·충당을 취소하고 원본은 소프트 삭제합니다. 응답은 최신 Workspace이며 `Cache-Control: no-store`입니다. 이미 삭제한 ID 재요청은 무효과이며 재등록한 새 ID에 영향을 주지 않습니다. 다른 관리대상·없는 ID는 `BANK_TRANSACTION_NOT_FOUND`로 전체 거부합니다.
- `POST /api/properties/{propertyId}/banking/transactions/{id}/income-allocation`: 지출 배분과 같은 `{category, note?, mode, saveAsRule:false, allocations:[{buildingId,amount?,percentage?}]}` 구조입니다. 실제 항목명·메모는 확정 기타 입금의 값을 유지하고 이 API는 배분만 저장합니다. `EQUAL`, `RATIO`, `AMOUNT`를 지원하며 관리 동을 명시하고 전액 합계를 검증합니다. 같은 확정 배분 재시도는 한 번만 반영하고 다른 값은 `BANK_REQUEST_CONFLICT`로 거부합니다.
- 업로드 Selection에 선택 필드 `incomeAllocation`을 추가합니다. 이 필드를 보내면 `incomeCategory`가 필요하며 `unitId`·`expense`와 함께 보낼 수 없습니다. 수납 확정·배분 저장은 한 트랜잭션이므로 배분 실패 시 입금 원본까지 롤백합니다.
- Workspace 거래에 `receiptType`과 `incomeAllocation`을 추가합니다. `incomeAllocation`은 기존 Expense 응답과 같은 구조이며 ID는 수납 ID, `saveAsRule`은 false입니다. 세대 입금·미배분 기타 입금은 null입니다. 동별 잔고 Entry에는 배분된 동마다 해당 몫의 income을 표시하되 실제 은행 잔액과 기타 입금 전체 합계는 복제하지 않습니다.
- `OTHER_INCOME_REQUIRED`: 확정 기타 입금이 아님. `INCOME_ALREADY_SETTLED`: 외부 회수에 이미 사용한 입금. 대상·금액·비율 검증은 기존 배분 오류를 재사용합니다. 동별 배분 입금은 외부 회수 후보·사용 가능 입금 목록에서 제외합니다. 삭제한 출금의 기존 회수 연결은 보관하되 활성 회수 집계에서 제외하여 연결 입금의 사용 가능액을 복원합니다.

## 기존 관리계좌 정보 정정 API

2026-10-18 구현. [기존 관리계좌 정정 정책](domainRules.md#기존-관리계좌-정보-정정-2026-10-18)을 따릅니다. ADMIN 전용이며 응답은 `Cache-Control: no-store`입니다.

- `GET /api/properties/{propertyId}/banking/account`: 현재 활성 공용 기본 계좌를 `{propertyId,accountId,updatedAt,bankCode,bankName,accountNumber,holderName}`으로 반환합니다. 계좌번호 원문은 권한 확인 뒤 복호화하며 로그·오류에 포함하지 않습니다.
- `PUT /api/properties/{propertyId}/banking/account`: `{accountId,updatedAt,bankCode,bankName,accountNumber,holderName}`을 보내고 같은 조회 응답 형식으로 정정 결과를 받습니다. 은행 코드 1~20자, 은행명·예금주 1~50자, 번호는 ASCII 공백·하이픈을 정리한 숫자 4~50자리이며 앞자리 0을 보존합니다.
- 계좌 ID·수정 시각이 달라진 요청은 `BANK_ACCOUNT_CONFLICT`(409), 같은 관리대상의 다른 미삭제 계좌와 은행 코드·번호가 중복되면 `BANK_ACCOUNT_DUPLICATE`(409), 활성 공용 기본 계좌가 정확히 하나가 아니면 `PAYMENT_ACCOUNT_UNAVAILABLE`(409)입니다. 같은 값의 재시도는 저장된 결과를 반환합니다. 입력·인증·권한·저장소 오류는 기존 보호된 오류 계약을 재사용합니다.
- ID·사용기간·기본 계좌 지정과 기존 거래·수납·지출·잔고를 변경하지 않습니다. 다른 계좌로의 전환·잔액 이체 기능은 포함하지 않습니다.


### 통장 거래·수동 수납 혼합 선택 삭제 (2026-10-18)

사용자 요청으로 기존 `/transactions/delete`의 요청을 `{transactionIds: UUID[], paymentIds?: UUID[]}`로 확장했습니다. 은행 원본 ID는 최대 5,000개, 은행에 연결되지 않은 MANUAL 수납 ID는 최대 1,000개이며 한쪽 배열은 비워도 되지만 전체 빈 선택은 거부합니다. 이전 transactionIds만 보내는 요청도 유지합니다. 소속·수동 출처·은행 미연결·삭제 가능 상태를 검증하고 같은 관리대상 잠금·트랜잭션에서 모두 처리하므로 하나라도 실패하면 전체 롤백합니다.

수동 PENDING·ON_HOLD·CONFIRMED·CANCELED를 모두 선택 삭제할 수 있습니다. 확정 수동 수납은 별도 선행 취소 없이 서버가 같은 트랜잭션에서 수납·충당을 취소한 뒤 소프트 삭제하고 누적 충당·선입금을 다시 계산합니다. 취소 상태·사유·충당·감사 이력은 보존하고 삭제 이벤트는 같은 선택 재시도에 한 번만 남깁니다. 은행 취소 이력을 임의의 수동 ID로 삭제하거나 다른 관리대상 수납을 삭제할 수 없습니다. 은행 원본 삭제의 기존 취소·재가져오기 정책은 유지합니다.
