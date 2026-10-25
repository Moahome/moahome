# 관리비 API

상태: 설정 조회·예약 변경, 월별 청구·세대 상세·확정 이력 조회와 당월 청구 취소 구현. 업무 정책은 [도메인 규칙](domainRules.md#5-관리비-부과--청구), 저장 구조는 [ERD](erd.md#7-관리비-부과)를 참조합니다.

2026-10-25 [전체·동별 기본 부과와 다음 달 임시 부과](billingSettings.md)를 구현했습니다. 기본·임시 범위를 독립적으로 저장하며 아래 추가 설정 계약을 사용합니다. 기존 범위 필드를 생략한 요청은 전체 기본 부과·임시 없음으로 처리합니다.

모든 경로의 공통 prefix는 `/api/properties/{propertyId}/billing`입니다. Bearer 인증과 매 요청의 활성 계정·현재 ADMIN / MANAGER 참여·활성 관리대상 권한을 검증합니다. URL의 식별자는 UUID, 월은 `YYYY-MM`(1000~9999년)입니다. 응답은 `Cache-Control: no-store`를 사용합니다.

## 경로

| Method | 경로 | 응답 |
| --- | --- | --- |
| GET | `/settings` | 현재 설정·다음 달 적용 예정 설정·서버 기준월 |
| PUT | `/settings` | 다음 달 설정 저장 후 최신 Settings |
| GET | `/monthly/{month}` | 해당 월 실제 청구 또는 적용 예정 내역 |
| GET | `/monthly/{month}/units/{unitId}` | 같은 월·관리대상의 세대 상세 |
| DELETE | `/monthly/{month}/charges/{chargeId}` | 당월 개별 청구 취소, 204 |
| GET | `/history` | 확정된 월별 이력, 최신 월 순 |

반복 기본 청구의 수동 생성·확정·금액 수정·수납 상태 API는 이번 범위에 없습니다. 이번 달 임시 항목의 별도 추가 부과는 아래 설정 저장에서 제공합니다. 당월 개별 청구 취소를 제공합니다. 세대 추가 시 당월 전액 보충 부과와 동·세대 삭제 시 당월 청구 취소는 [세대 관리 API](unitManagementApi.md#세대동-삭제)의 변경 트랜잭션에서 수행합니다.

## 설정 조회 응답

인계 정보를 생략한 이전 등록은 청구를 생성하지 않습니다. 현재 신규 등록은 인계·관리 시작을 함께 확정하고 지정한 첫 부과월이 도래했으면 같은 트랜잭션에서 생성합니다. 미래 첫 월은 스케줄에서 처리합니다. 기존 운영 대상의 청구와 첫 부과월은 보존하며 GET은 저장하지 않습니다.

Settings는 `propertyId`, `currentMonth`, `firstBillingMonth`, `nextBillingDate`, `revisionId`, `current`, `scheduled`, `managementStarted`를 반환합니다. 운영 시작 전 `firstBillingMonth`·`nextBillingDate`는 등록월 기반 설정 표시값이며 확정 부과 일정을 의미하지 않습니다. 날짜는 `YYYY-MM-DD`, 월은 `YYYY-MM`입니다. 서버 한국시간 기준월과 최신 버전 토큰을 변경 요청에 사용합니다. `scheduled`는 다음 달 적용 설정이 현재 설정과 같으면 null입니다.

Template은 `id`, `effectiveMonth`, `items`, `reason`(최초 설정은 null), `changedAt`(ISO offset timestamp)입니다. Item은 `id`, `code`(추천 코드 또는 null), `name`, `amount`입니다. 추천 코드는 [등록 API의 항목 계약](propertyRegistrationApi.md#기본-관리비-항목)을 공유합니다.

모든 **응답 금액은 부호 있는 원 단위 정수 문자열**입니다. 여러 세대 합계가 JavaScript 안전 정수 범위를 넘더라도 손실하지 않습니다.

## 설정 저장 요청

```json
{
  "revisionId": "00000000-0000-0000-0000-000000000001",
  "effectiveMonth": "2026-11",
  "reason": "공용 비용 변경",
  "items": [
    { "itemCode": null, "itemName": "기본 관리비", "defaultAmount": 0 },
    { "itemCode": null, "itemName": "차감", "defaultAmount": -1000 }
  ]
}
```

- `revisionId`: GET으로 받은 최신 버전 UUID, 필수.
- `effectiveMonth`: 조회한 기준월의 다음 달, 필수. 저장 시 서버 기준월이 바뀌었거나 토큰이 오래되면 409입니다.
- `reason`: 공백 제거 후 1~1000자, 필수. 모든 수정 버전과 수정자를 보존합니다.
- `items`: 전체 기본 방식에서 최소 1개, 동별 방식에서는 빈 배열. `itemName`은 공백 제거 후 1~100자, `itemCode`는 등록 API와 같은 nullable 코드입니다.
- `defaultAmount`: 요청에서는 JSON 정수, 필수. 항목과 최종 합계 모두 ±999,999,999,999,999원 범위이며 0원·음수를 허용합니다. 소수는 허용하지 않습니다. 항목 순서는 요청 순서입니다.

기존 버전을 덮어쓰지 않고 새 버전을 저장합니다. 같은 적용월을 반복 저장하면 마지막 저장본을 적용하며 이전 버전·사유는 보존합니다. 당월과 이미 확정된 청구는 변경되지 않습니다.

## 전체·동별 기본 설정과 독립적인 임시 부과 (2026-10-25)

Settings에 `hasBuildings`와 현재 미삭제 동 목록 `buildings: [{id,name}]`을 추가합니다. Template에는 아래 필드를 추가하며 기존 `items`는 전체 기본 항목을 뜻합니다.

| 필드 | 의미 |
| --- | --- |
| `mode` | 기본 부과 방식 `ALL / BUILDING` |
| `buildingItems` | 동별 기본 설정 `[{buildingId,items}]`, Item 응답 형식 공유 |
| `temporaryMode` | 기본 방식과 독립적인 임시 부과 방식 `ALL / BUILDING` |
| `temporaryItems` | `[{id,buildingId,code,name,amount,note}]`, 조회 대상 월에 유효한 임시 항목만 반환 |

PUT `/settings`에는 기존 `revisionId / effectiveMonth / reason`과 아래 설정을 함께 보냅니다. 다음 달 전체 설정을 새 버전으로 저장하며 이전 사유·항목을 유지합니다.

```json
{
  "revisionId": "00000000-0000-0000-0000-000000000001",
  "effectiveMonth": "2026-11",
  "reason": "102동 수선비 추가",
  "mode": "ALL",
  "items": [{"itemCode": null, "itemName": "기본 관리비", "defaultAmount": 50000}],
  "buildingItems": [],
  "temporaryMode": "BUILDING",
  "temporaryItems": [{"buildingId": "00000000-0000-0000-0000-000000000102", "itemCode": null, "itemName": "수선비", "defaultAmount": 100000, "note": "승강기 보수"}]
}
```

- 기본 `ALL`이면 `items`가 최소 1개이며 `buildingItems`는 비웁니다. `BUILDING`이면 `items`를 비우고 현재 모든 미삭제 동을 중복 없이 `buildingItems`에 제출합니다. 각 동의 items는 최소 1개이며 요청 항목 형식은 기존과 같습니다.
- 임시 `ALL`이면 각 행의 `buildingId`는 null이며, 임시 `BUILDING`이면 같은 관리대상의 현재 미삭제 동 UUID가 필수입니다. 기본 `ALL`·임시 `BUILDING` 및 기본 `BUILDING`·임시 `ALL`을 모두 허용합니다.
- `temporaryItems` 빈 배열은 임시 없음입니다. 행의 명칭·종류·정수 금액 범위는 기본 항목과 같고 `note`는 선택 500자입니다. 각 행의 선택 `month`는 서버 기준 이번 달 또는 다음 달입니다. 생략하면 최상위 `temporaryMonth` 또는 effectiveMonth(다음 달)를 사용합니다.
- 기본 합계 및 기본+임시 합계는 각 동의 세대당 값으로 범위를 검증합니다. 여러 동의 기본 금액을 합산해 세대당 한도로 검사하지 않습니다.
- 혼합된 기본 범위·누락/중복 동·다른 관리대상 동·잘못된 임시 대상은 400 `INVALID_REQUEST`입니다. 최신 버전·다음 달 적용월 경합은 기존 409를 유지합니다.
- 예정 조회와 실제 부과는 동일한 월·동 계산을 사용합니다. 임시 항목은 설정 버전의 적용 시작월에만 포함하고 이후 월에 제외하며 기존 확정 청구를 변경하지 않습니다.

## 이번 달 즉시 추가 부과 (2026-10-25)

동일한 PUT `/settings`에서 `temporaryItems[].month`를 `2026-10` 또는 `2026-11`처럼 이번 달·다음 달 중 선택합니다. 한 요청에 두 월의 항목을 함께 제출할 수 있습니다. 기본 `effectiveMonth`는 항상 다음 달입니다. 이번 달 항목이 있으면 요청 UUID인 `requestId`가 필수이며 동일한 payload와 ID로 재시도합니다. 같은 ID의 다른 내용·다른 처리자는 409 `BILLING_SETTINGS_CONFLICT`입니다. 기존 다음 달 전용 클라이언트는 새 필드를 생략할 수 있습니다.

- 이번 달 항목은 관리 시작·첫 부과월 도래를 검증하고 즉시 별도 청구로 발행합니다. 운영 시작 전 또는 필수 requestId 없음은 400입니다. 지난 월·다다음 달 이후 및 서버 월 변경 경합은 409입니다.
- 기본 설정·다음 달 예약·이번 달 추가 청구·선납 충당을 한 트랜잭션에서 저장하며 실패 시 모두 롤백합니다. 응답 유실 후 같은 요청을 다시 보내도 중복 발행하지 않습니다.
- 기본 청구·항목·기존 납부 배분을 보존합니다. 새 청구는 같은 월말 납부기한을 사용하며 입금·은행 거래를 임의로 생성하지 않습니다. 기존 선납이 있으면 기존 충당 규칙을 재사용합니다.
- 월별·세대 상세 응답은 같은 세대의 기본·추가 청구 항목을 합쳐 한 행으로 반환합니다. id는 기본 청구가 있으면 해당 ID이며 각 항목 ID·출처는 보존합니다. 추가 부과 후 이력의 unitCount는 중복 없는 세대 수, totalAmount는 기본+추가 합계입니다.
- 이번 달 추가 부과는 다음 달 예약 항목으로 반환하지 않습니다. 다음 달 항목은 기존처럼 scheduled에 보존합니다. 이번 달 추가 내역은 월별 부과·세대 상세에서 조회합니다.

## 세대 변경 반영 (2026-10-12)

사용 중 세대 추가는 당월 적용 설정으로 주민 명부 등록 여부와 관계없이 전액 청구를 즉시 생성·확정합니다. 공실은 제외합니다. 기존 기간이 있으면 신규 세대만 보충하고 기존 청구·항목은 유지합니다. 동·세대 삭제는 당월 청구를 `CANCELED`로 전환하고 `canceled_at / canceled_by / cancellation_reason=UNIT_DELETED`를 보존합니다. 월별·상세·이력 합계 조회는 `ISSUED` 청구만 포함하므로 취소 청구는 제외되며 이전 달 확정 청구는 유지됩니다. 현재·미래 예정값은 미삭제 사용 중 세대만 포함합니다. 당월 조회·이력 합계도 현재 공실과 삭제된 동·세대의 잔여 청구를 제외합니다. 과거 청구는 당시 저장 상태로 조회합니다.

공실 전환 시 당월 기존 청구는 `EXCLUDED_VACANT`가 되어 합계에서 제외됩니다. 같은 월에 사용 중으로 복귀하면 기존 스냅샷을 재사용하고, 아직 청구가 없다면 당월 적용 설정으로 생성합니다. 수동 취소·세대 삭제 취소는 복구하지 않습니다. 세대 변경과 같은 트랜잭션입니다.

## 당월 청구 삭제

2026-10-12 후속 요청에 따라 Client 상세의 청구 삭제 버튼과 호출 코드는 제거했습니다. 아래 서버 API와 기존 취소 이력은 유지하며 화면에서 수동 취소를 제공하지 않습니다.

`DELETE /monthly/{month}/charges/{chargeId}`는 본문 없이 호출하며 현재 ADMIN / MANAGER만 사용할 수 있습니다. 서버 한국시간 당월의 확정 청구만 허용하고 관리대상·기간·청구 ID를 함께 검증합니다. `CANCELED`로 전환하고 `cancellation_reason=MANUAL_CANCELED` 및 최초 처리자·시각을 저장합니다. 동일 당월 취소의 재요청은 204이며 최초 근거를 유지합니다. 월별·상세·이력 건수와 합계에서 제외하고 세대·주민·다음 달 부과는 변경하지 않습니다. 과거·미래 월의 요청은 409입니다.

## 월별 응답

Month는 `propertyId`, `hasBuildings`, `month`, `billingDate`, `dueDate`, `status`, `baseAmount`, `charges`를 반환합니다. `hasBuildings`는 관리대상의 동 구분 여부입니다.

| status | 의미 |
| --- | --- |
| `ISSUED` | 실제 생성·확정된 기간의 저장 스냅샷 |
| `SCHEDULED` | 첫 부과월 이후 현재·미래 월의 실제 설정·현재 세대를 기준으로 계산한 예정 내역. 저장된 청구가 아님 |
| `NOT_BILLED` | 최초 부과월 이전 또는 실제 청구가 없는 과거 월. charges는 빈 배열 |

ChargeRow는 `id`, `unitId`, `building`(동 없음은 빈 문자열), `room`, `displayName`(nullable), `representativeName`(nullable), `items`를 반환합니다. `representativeName`은 조회 시점의 현재 대표 주민 이름이며 부과 당시 스냅샷이나 납부 의무자 확정을 뜻하지 않습니다. 현재 대표가 없거나 삭제·퇴거한 경우 null이며 임의로 다른 구성원을 지정하지 않습니다. 세대 목록과 같은 주민 조회 권한을 유지하므로 MANAGER에게는 null을 반환합니다. ISSUED의 id는 청구 UUID, SCHEDULED는 세대 UUID입니다. 예정값은 실행 전 세대나 설정이 변경되면 달라질 수 있습니다. 부과 금액은 items의 합계이며 납부 여부를 뜻하지 않습니다.

세대 상세도 Month 구조를 사용하고 해당 세대 1개만 반환합니다. 같은 범위에서 찾을 수 없으면 404이며 다른 관리대상 세대를 대신 반환하지 않습니다. 목록 검색·정렬·페이지네이션은 현재 Client가 조회 결과에서 처리합니다.

## 이력 응답

`{ "propertyId": "UUID", "periods": [...] }`입니다. 각 period는 `month`, `billingDate`, `dueDate`, `unitCount`, `totalAmount`(정수 문자열), `confirmedAt`입니다. 확정된 기간만 반환하고 예정월은 포함하지 않습니다.

## 오류

공통 형식은 `{ "code": "...", "message": "..." }`이며 SQL·입력 원문을 노출하지 않습니다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 월·UUID·항목·금액·사유 등 잘못된 입력 |
| 401 | 기존 인증 오류 | 인증 없음 / 만료 |
| 403 | `ACCESS_DENIED` / `ACCOUNT_UNAVAILABLE` | 현재 관리 권한 또는 계정 이용 불가 |
| 404 | `BILLING_SETTINGS_NOT_FOUND` | 해당 월에 적용할 기본 설정 없음 |
| 404 | `BILLING_CHARGE_NOT_FOUND` | 해당 월·세대의 상세 없음 |
| 409 | `BILLING_CANCELLATION_NOT_ALLOWED` | 당월 확정 청구가 아닌 취소 요청 |
| 409 | `BILLING_SETTINGS_CONFLICT` | 오래된 버전 또는 적용월 변경. 최신 설정 재조회 필요 |
| 409 | `BILLING_CONFLICT` | DB 무결성 충돌 |
| 503 | `BILLING_SERVICE_UNAVAILABLE` / `AUTH_SERVICE_UNAVAILABLE` | 업무 / 인증 저장소 장애 |
| 500 | `INTERNAL_SERVER_ERROR` | 내부 오류 |

## 구현 설계

[Client 화면·상태](../client/docs/managementLayout.md#관리비-부과-2026-10-10), [Server 트랜잭션·재시도](../server/docs/billing.md)를 참조합니다. 수납·환급·주민 공개 화면·회계 연결은 별도 구현입니다.

활성 수납 배분이 있는 청구의 취소·제외는 `BILLING_CHARGE_HAS_PAYMENTS`(409)입니다. [입금 API](paymentApi.md)의 수납 정리를 먼저 수행하며 임의로 납부 기록을 제거하지 않습니다.

## 기존 잔액 인계

2026-10-17 구현. 기준 경로는 `/api/properties/{propertyId}/billing/opening-balances`이며 현재 ADMIN / MANAGER를 허용합니다. 일반 부과 조회·설정의 ADMIN / MANAGER 범위는 유지합니다.

| Method | 경로 | 요청 | 결과 |
| --- | --- | --- | --- |
| GET | 기본 경로 | 없음 | 기준일·관리 시작 여부·초안/확정·세대·계좌·인계 이력 |
| PUT | 기본 경로 | 아래 초안 | 저장한 최신 버전 |
| POST | `/import/preview` | multipart `file` | 검증한 세대 입력 배열, 저장 없음 |
| POST | `/{batchId}/confirm` | `{revision}` | 인계·관리 시작·첫 부과·선납 충당 확정 |
| POST | `/{batchId}/cancel` | `{revision,reason}` | 사용 전 취소와 이력 보존 |

초안은 `{batchId,revision,cutoffDate,firstBillingMonth,units,accounts}`입니다. 새 작업은 batchId·revision이 null입니다. units는 `{unitId,receivable,credit,originMonth?,responsibility?}`, accounts는 `{accountId,amount}`이며 전체 미삭제 세대·계좌를 중복 없이 제출합니다. 금액은 0~999,999,999,999,999원의 정수 문자열입니다. 기준일은 오늘까지, 첫 부과월의 1일은 기준일 이후이며 서버 현재월의 다음 달을 넘지 않습니다. 발생월은 기준월 이하의 선택값, 부담 주체 메모는 선택 500자입니다.

응답은 `{propertyId,asOf,managementStarted,cutoffDate,firstBillingMonth,batch,units,accounts,history}`입니다. batch는 `{id,revision,status,cutoffDate,firstBillingMonth,confirmedAt,canceledAt,cancelReason}`입니다. 세대·계좌 행에는 표시용 label이 추가됩니다. 같은 기준일·월을 다시 저장해도 revision을 갱신합니다. 오래된 초안은 409입니다.

엑셀은 내려받은 `.xlsx` 양식의 `세대 ID·세대·기존 미납·기존 선납·발생월·부담 주체 메모` 순서이며 5MB·10,000행까지 허용합니다. ID는 현재 대상의 실제 세대와 대조하고 수식·소수·음수·중복 ID·잘못된 발생월을 거부합니다. 미리보기는 저장하지 않으며 직접 입력과 합쳐 검토한 전체 초안을 별도로 저장·확정합니다.

CONFIRMED의 재확정은 원 결과를 반환합니다. 취소는 확정 수납이 없을 때만 허용하며 기존 월별 청구·최초 기준일·첫 부과월은 보존합니다. 정정은 취소 후 새 인계 작업으로 기록합니다. 기존 운영 대상에 인계 작업이 없으면 소급 잔액 추가를 허용하지 않습니다.

409: `OPENING_BALANCE_CONFLICT`, `OPENING_TARGETS_CHANGED`, `OPENING_ALREADY_HAS_RECEIPTS`. 400: `INVALID_OPENING_DATES`, `INVALID_OPENING_FILE`. 404: `OPENING_NOT_FOUND`. 저장소 충돌·장애는 기존 업무 오류 처리기의 `PAYMENT_CONFLICT` / `PAYMENT_SERVICE_UNAVAILABLE`을 재사용합니다. 자세한 업무 정책은 [도메인 규칙](domainRules.md#확정-정책-기존-잔액-인계와-관리-시작-2026-10-17)을 따릅니다.
