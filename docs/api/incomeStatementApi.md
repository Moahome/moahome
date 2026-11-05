# 손익계산서 API

상태: 2026-11-04 원천 업무 조회·관리자 분류 저장 구현. 정식 차변/대변 전표·계정별 원장·마감 API는 포함하지 않습니다. 업무 기준은 [회계 도메인 규칙](../domain/domainRules.md#9-회계), 저장·동시성은 [Server 설계](../../server/docs/incomeStatement.md), 화면은 [Client 설계](../../client/docs/incomeStatement.md)를 참조합니다.

## 인증과 공통 형식

관리대상의 ADMIN·MANAGER가 조회하며 설정·분류 저장은 ADMIN만 가능합니다. 기존 인증과 관리대상 접근 검사를 사용하고 모든 응답에 `Cache-Control: no-store`를 적용합니다. UUID는 문자열, 금액은 원 단위 정수 문자열, 월은 `YYYY-MM`, 날짜는 `YYYY-MM-DD`, 생성 시각은 UTC 오프셋 시각입니다. API의 빈 목록과 조회 실패를 구분하며 오류를 예시나 0원 손익으로 대체하지 않습니다.

기준 경로: `/api/properties/{propertyId}/accounting`.

## 손익 자료 조회

`GET /income-statement?startMonth=2026-07&endMonth=2026-10&buildingId={uuid}`

- 시작·종료 월은 둘 다 생략하거나 둘 다 지정합니다. 생략하면 한국 현재 월이며 포함 범위는 최대 120개월입니다. `buildingId` 생략은 전체입니다.
- 회계 시작 월 이전을 포함하면 `BEFORE_START`이며 부분 기간을 몰래 잘라 합산하지 않습니다.
- 조회는 청구 생성·회계 분류 저장·기초 잔액 생성을 실행하지 않습니다.

응답 필드:

| 필드 | 내용 |
| --- | --- |
| `propertyId/propertyName/generatedAt` | 관리대상·조회 시각 |
| `range` | `startMonth/endMonth` |
| `configuration` | 미설정이면 null, 설정 후 `startMonth/fiscalYearStartMonth` |
| `canManage` | 현재 사용자의 분류 저장 권한 |
| `completeness` | 아래 상태 |
| `buildings` | 조회 가능한 `{id,name,deleted}`; 과거 귀속 확인에 필요한 삭제 동 포함. deleted는 삭제 여부이며 현재 선택 목록과 구분 |
| `accounts` | `{id,code,name,group,systemKey}`; 코드 오름차순. group은 `asset/liability/operatingRevenue/operatingExpense/otherRevenue/otherExpense`이며 자산·부채 과목은 손익 합계에서 제외 |
| `records` | 반영 가능한 `{id,accountId,accountName,group,month,buildingId,amount}`; 관리대상 전체 귀속은 buildingId=null |
| `issues` | 미반영 `{id,code,label,sourceName,sourceContext,amount,path,expenseId,revenueItemId}`; label은 확인 사유, sourceName은 원본 이름, sourceContext는 원본 식별 설명. 분류 가능한 원천 ID 외 식별자 필드는 null |
| `expenses` | 유효 지출의 `{id,transactionId,date,name,amount,accountId,recognitionMonth,revision}` |
| `revenueItems` | 동일 부과 항목 ID별 `{id,name,amount,recognized,revision,sourceContext}`; 실제 부과월을 원본별로 표시 |
| `receivables` | 외부 부담별 `{id,accountCode,name,date,counterparty,amount,received,remaining,path}`; 발생 지출 날짜가 선택 기간에 속한 `102 미수금`의 발생·회수·조회 종료 월말 잔액. 손익에 합산하지 않음 |
| `otherIncomes` | 자동 연결된 기타 입금의 `{id,transactionId,date,name,amount,accountId}`; id는 수납 ID. 기존 실제 회수액을 제외한 `901 영업외수익`이며 기존 동 배분으로 집계 |

`SETUP_REQUIRED`는 회계 시작 기준 미설정, `BEFORE_START`는 시작 전 조회, `REVIEW_REQUIRED`는 미반영 자료가 남은 잠정 합계, `READY`는 현재 등록·확인 자료를 집계할 수 있는 상태입니다. `READY`도 기초 잔액·자동전표 대조 또는 마감 완료를 보증하지 않습니다.

`issues.path`는 기존 업무의 관리대상 기준 상대 경로입니다. 지출은 통장 거래 ID, 입금은 수납 ID, 0원·음수 청구 등은 해당 월·세대의 수납 상세로 연결합니다. 부과 항목은 여러 청구를 묶으므로 부과 이력에서 확인합니다. Client는 상세 종류에 따라 기존 PC 모달·모바일 경로를 재사용합니다.

2026-11-05 표시 보완: 같은 사유·금액의 거래도 구분할 수 있도록 `sourceName/sourceContext`를 제공합니다. 지출은 지출명·거래일·기존 부담처, 입출금은 적요·거래일·확인 가능한 세대, 개별 청구는 `관리비 부과`와 부과월·당시 동/호수/표시명을 사용합니다. 동이 비어 있으면 동 정보 없음을 표시하고 현재 세대 정보로 과거 귀속을 보정하지 않습니다. `buildings`의 삭제 동을 이름으로 합치거나 제거해 과거 원천을 유실하지 않으며, Client는 새 선택지에서 삭제 동을 제외합니다.

서버·Client 적용 시차를 고려해 Client는 위 추가 표시 필드가 없는 기존 응답도 허용하고 제공된 필드의 형식은 검사합니다. 기존 금액·관리대상·원천 연결 검증은 유지합니다. 원본 식별 정보·삭제 동 구분의 완전한 표시는 새 Server 응답 적용이 필요합니다.

지출은 입력 코드·기본 과목명·통상 표기를 같은 관리대상의 계정 ID에 자동 매칭합니다. 기본 비용 월은 기존 지출 날짜의 월이며 과목이 연결되면 바로 반영합니다. 기존 명시적 귀속 이력은 보존하고 비용 과목이 미연결인 건만 확인 대상으로 반환합니다. 외부 부담금은 `102 미수금`에 자동 연결하며 비용 원천의 amount는 우리 동들의 부담액만 포함합니다. 회수 입금은 기존 실제 연결액만큼 미수금을 줄이고, 나머지 확정 기타 입금은 `901 영업외수익`에 자동 연결합니다. 동이 있는 대상은 기존 입금 배분을 사용하고 미지정 입금만 `OTHER_INCOME_BUILDING_REQUIRED`로 원본 배분 화면에 연결합니다. 일반관리비에 예치·적립 선택을 반복 요구하지 않습니다. 0원·음수 청구, 과거 동 귀속 불명, 미분류·보류 거래도 원천 금액과 연결을 제공합니다.

## 시작 기준

`POST /settings`

```json
{"startMonth":"2026-07","fiscalYearStartMonth":1}
```

성공 204. 시작 기준과 해당 관리대상의 기본 계정 18개(812 보험료·813 잡비·901 영업외수익 포함)를 함께 생성합니다. 기존 계정 ID를 유지한 코드 이관은 `V20261105105439`를 따릅니다. 같은 설정 재전송은 성공하며 다른 값으로 덮어쓰기는 409입니다. 시작 기준 정정·기초 잔액 인계·마감은 이 API가 처리하지 않습니다.

## 비용 과목 추가

`POST /accounts`

```json
{"name":"청소비","group":"OPERATING_EXPENSE"}
```

`name` 1~100자, `group`은 `OPERATING_EXPENSE/OTHER_EXPENSE`, 선택 `code`는 `800~899`의 세 자리 문자열입니다. 코드를 생략하면 추가 과목 범위 `814~899`의 빈 코드를 배정하며 중복은 409입니다. 성공 200 `{"id":"uuid"}`. 같은 관리대상·분류·이름은 동일 ID를 반환합니다. 현재 API는 과목 변경·삭제·전체 계정과목 설정 기능을 제공하지 않습니다.

## 지출 계정과목 매칭

`POST /expenses/{expenseId}/reviews`

```json
{"accountId":"uuid","expectedRevision":0}
```

성공 204. 별도 날짜·귀속 월·변경 사유를 입력받지 않습니다. 첫 매칭 revision=0 이후 조회한 최신 revision을 전송합니다. Server는 원본 지출 날짜로 매칭 월을 결정합니다. 기존 Client의 recognitionMonth는 선택 호환 필드이며 저장 월 결정에 사용하지 않습니다. reason도 선택 호환 필드이며 생략하면 기존 감사 이력에는 `계정과목 매칭`을 기록합니다. 유효한 확정 지출과 같은 관리대상의 비용 과목을 검사합니다. 출금일·금액·동 배분 원본은 변경하지 않습니다. 시작 월 이전 귀속도 확인할 수 있으나 시작 전 손익 조회는 제공하지 않습니다. 동일 요청 재시도는 중복 이력을 만들지 않고 다른 최신 확인이 저장됐으면 409입니다.

## 부과 항목의 수익 성격 확인 및 정정

`POST /revenue-items/{itemId}/reviews`

```json
{"recognized":true,"expectedRevision":0}
```

성공 204. 요청 itemId는 원본 `fee_template_items.id`이며 같은 관리대상의 유효 부과 원본인지 검사합니다. `recognized=true`는 동일 항목 ID의 유효 확정 청구를 각 부과월의 `401 관리비수입`에 포함하고 false는 예치·적립 등 별도 확인 대상으로 남깁니다. 표준 일반관리비는 기본 연결로 반영하며 명시적 정정이 있으면 그 이력을 우선합니다. 명시적 확인 이후 시작 월 이상 조회에 반영하며 과거 조회 결과도 달라질 수 있습니다. 첫 확인·정정·재시도 규칙은 지출과 같습니다. 미지급·선급·환불 전표나 정식 마감 보존을 생성하지 않습니다.

## 오류

| 상태 | 코드·의미 |
| --- | --- |
| 400 | `INVALID_ACCOUNTING_REQUEST`, `INVALID_ACCOUNTING_ACCOUNT` 등 입력·조회 조건 오류 |
| 401/403 | 기존 인증·역할·관리대상 접근 오류 |
| 404 | `ACCOUNTING_SOURCE_NOT_FOUND`: 삭제·취소 등 현재 유효 원천 없음 |
| 409 | `ACCOUNTING_SETUP_REQUIRED`, `ACCOUNTING_SETTINGS_CONFLICT`, `ACCOUNTING_REVIEW_CONFLICT`, `ACCOUNTING_EXTERNAL_REVIEW_REQUIRED` |
| 503 | `ACCOUNTING_SERVICE_UNAVAILABLE`: 저장소 조회 실패 |
| 500 | `ACCOUNTING_REQUEST_FAILED`: 처리 실패 |

오류 본문은 `{code,message}`이며 SQL·사유 원문·내부 예외를 노출하지 않습니다. 충돌·저장 실패 시 Client는 입력을 유지하고 저장 성공 후 해당 관리대상의 손익 자료를 다시 조회합니다.
