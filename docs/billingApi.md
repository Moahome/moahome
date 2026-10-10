# 관리비 API

상태: 설정 조회·예약 변경, 월별 청구·세대 상세·확정 이력 조회 구현. 업무 정책은 [도메인 규칙](domainRules.md#5-관리비-부과--청구), 저장 구조는 [ERD](erd.md#7-관리비-부과)를 참조합니다.

모든 경로의 공통 prefix는 `/api/properties/{propertyId}/billing`입니다. Bearer 인증과 매 요청의 활성 계정·현재 ADMIN / MANAGER 참여·활성 관리대상 권한을 검증합니다. URL의 식별자는 UUID, 월은 `YYYY-MM`(1000~9999년)입니다. 응답은 `Cache-Control: no-store`를 사용합니다.

## 경로

| Method | 경로 | 응답 |
| --- | --- | --- |
| GET | `/settings` | 현재 설정·다음 달 적용 예정 설정·서버 기준월 |
| PUT | `/settings` | 다음 달 설정 저장 후 최신 Settings |
| GET | `/monthly/{month}` | 해당 월 실제 청구 또는 적용 예정 내역 |
| GET | `/monthly/{month}/units/{unitId}` | 같은 월·관리대상의 세대 상세 |
| GET | `/history` | 확정된 월별 이력, 최신 월 순 |

수동 생성·확정·취소·청구 수정·수납 상태 API는 이번 범위에 없습니다.

## 설정 조회 응답

최초 등록 완료 시 등록월 청구가 생성·확정됩니다. 이후 설정 변경의 다음 달 적용 기준은 유지합니다. 기존 등록월 누락은 서버 시작·정기 실행에서 복구하며 GET은 저장하지 않습니다.

Settings는 `propertyId`, `currentMonth`, `firstBillingMonth`, `nextBillingDate`, `revisionId`, `current`, `scheduled`를 반환합니다. 날짜는 `YYYY-MM-DD`, 월은 `YYYY-MM`입니다. 서버 한국시간 기준월과 최신 버전 토큰을 변경 요청에 사용합니다. `scheduled`는 다음 달 적용 설정이 현재 설정과 같으면 null입니다.

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
- `items`: 최소 1개. `itemName`은 공백 제거 후 1~100자, `itemCode`는 등록 API와 같은 nullable 코드입니다.
- `defaultAmount`: 요청에서는 JSON 정수, 필수. 항목과 최종 합계 모두 ±999,999,999,999,999원 범위이며 0원·음수를 허용합니다. 소수는 허용하지 않습니다. 항목 순서는 요청 순서입니다.

기존 버전을 덮어쓰지 않고 새 버전을 저장합니다. 같은 적용월을 반복 저장하면 마지막 저장본을 적용하며 이전 버전·사유는 보존합니다. 당월과 이미 확정된 청구는 변경되지 않습니다.

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
| 409 | `BILLING_SETTINGS_CONFLICT` | 오래된 버전 또는 적용월 변경. 최신 설정 재조회 필요 |
| 409 | `BILLING_CONFLICT` | DB 무결성 충돌 |
| 503 | `BILLING_SERVICE_UNAVAILABLE` / `AUTH_SERVICE_UNAVAILABLE` | 업무 / 인증 저장소 장애 |
| 500 | `INTERNAL_SERVER_ERROR` | 내부 오류 |

## 구현 설계

[Client 화면·상태](../client/docs/managementLayout.md#관리비-부과-2026-10-10), [Server 트랜잭션·재시도](../server/docs/billing.md)를 참조합니다. 수납·환급·주민 공개 화면·회계 연결은 별도 구현입니다.
