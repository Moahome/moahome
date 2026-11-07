# 미지급 비용·지급 연결 API

상태: 2026-11-07 구현. 사용자가 요청한 202 미지급금 등록·나중의 실제 출금 연결을 지원합니다. 정식 전표·범용 비용 분할·마감 구현과 구분합니다. 저장·잠금은 [Server 설계](../../server/docs/accountLedger.md#미지급-저장동시성), 화면은 [Client 설계](../../client/docs/accountLedger.md#202계정-다중-선택101-후속-구현)를 참조합니다.

기준 경로: `/api/properties/{propertyId}/accounting/payables`. 응답은 `Cache-Control: no-store`입니다. ADMIN은 조회·변경, MANAGER는 조회만 가능하며 서버에서 현재 참여·권한을 검증합니다.

| 메서드·경로 | 요청 | 응답 |
| --- | --- | --- |
| GET `/` | 없음 | Workspace |
| POST `/` | `id`, `date`, `name`, `counterparty`, `memo`, `accountId`, `buildingId`, `amount` | 204 |
| POST `/{payableId}/payments` | `id`, `expenseId` | 204 |
| POST `/{payableId}/payments/{paymentId}/cancel` | 없음 | 204 |
| POST `/{payableId}/cancel` | 없음 | 204 |

발생일은 미래가 아닌 실제 날짜, 금액은 15자리 이하 양의 정수 원 문자열입니다. 동일 ID·동일 내용의 재시도는 한 번만 저장하고 다른 내용으로 ID를 재사용하면 충돌입니다. 등록은 실제 입출금을 만들지 않고 발생일 비용과 202 증가에 한 번 반영합니다.

Workspace는 `propertyId/hasBuildings/canManage/accounts/buildings/items/candidates`입니다. 과목은 비용 과목이며 항목은 발생금액 `amount`, 활성 지급 합계 `paid`, 잔여액 `remaining`, `REGISTERED/CANCELED`와 모든 지급 감사 이력을 반환합니다. 지급 이력은 `id/expenseId/date/amount/status/path`이며 `ACTIVE/CANCELED`를 구분합니다. `path`는 해당 실제 지출의 기존 상세입니다.

현재 연결 단위는 비용 한 과목·부담 동 한 곳(동 없는 대상은 관리대상 전체)의 기존 확정 지출 전액입니다. 외부 부담 혼합·여러 동 분할 지출의 일부 금액 연결은 제공하지 않습니다. 여러 번 지급하면 실제 출금별로 각각 연결하여 부분 지급합니다. 후보는 같은 관리대상·비용 과목·부담 동, 발생일 이후, 남은 금액 이하인 확정 지출 중 다른 활성 미지급에 연결되지 않은 건입니다. 은행 원본·수동 지출 모두 기존 실제 출금을 사용합니다.

지급 연결은 202를 감소시키고 기존 지출의 비용 재인식을 제외합니다. 따라서 10만원 발생 후 실제 4만원·6만원 지급을 연결하면 비용 10만원, 남은 미지급 0원, 실제 출금 합계 10만원입니다. 실제 출금 자체를 새로 생성하지 않습니다.

연결 해제는 해당 지급 링크만 취소하고 출금·지출 원본은 유지합니다. 해제된 출금은 다시 일반 비용으로 반영되므로 잘못 연결한 경우의 정정 동작으로 안내합니다. 발생 등록 취소는 활성 지급을 모두 해제한 뒤 가능합니다. 취소 감사 정보는 보존하고 등록 원본을 삭제하지 않습니다. 활성 지급 원본의 삭제·과목 변경은 DB에서도 차단합니다.

업무 오류는 회계 공통 응답 `code/message`를 사용합니다. 잘못된 등록·지급은 `INVALID_PAYABLE_REQUEST/INVALID_PAYABLE_PAYMENT`, 초과 지급은 `PAYABLE_PAYMENT_EXCEEDS_REMAINING`, 다른 재시도 내용은 `PAYABLE_REQUEST_CONFLICT`, 없는 항목은 `PAYABLE_NOT_FOUND`, 취소 상태는 `PAYABLE_CANCELED`입니다. 권한·저장 장애는 기존 인증·회계 오류 계약을 따르며 DB 상세를 노출하지 않습니다.
