# 계정과목 설정 API

기준일: 2026-11-07. [도메인 확정 표](../domain/domainRules.md#계정과목-설정의-변경사용-중지삭제-2026-11-07-사용자-확정)를 적용합니다. 실제 저장은 [ERD](../domain/erd.md#계정과목-설정-저장-2026-11-07), 화면은 [Client 설계](../../client/docs/accountingAccounts.md), 트랜잭션은 [Server 설계](../../server/docs/accountingAccounts.md)를 따릅니다. 코드·API 구현과 운영 배포·실제 DB 적용은 구분합니다.

기준 경로는 `/api/properties/{propertyId}/accounting/accounts`입니다. ADMIN·MANAGER는 조회하고 변경은 ADMIN만 가능합니다. UUID는 문자열, 시각은 오프셋 시각이며 응답은 `Cache-Control: no-store`입니다. 조회에서 계정 생성·변경을 수행하지 않습니다. 과목 설정은 부과 전에도 가능하며 회계 시작 프로필을 생성하지 않습니다.

## 목록

`GET /`

응답: `{propertyId,canManage,accounts}`. 과목은 `{id,code,name,group,defaultAccount,active,used,revision}`이며 코드 오름차순으로 반환합니다. 논리 삭제된 과목은 제외합니다. 사용 중지 과목은 목록에 포함하고 신규 선택에서 제외합니다. `used`는 취소·삭제한 업무와 과거 분류까지 포함한 참조 여부입니다.

`group`은 `ASSET/LIABILITY/OPERATING_REVENUE/OTHER_REVENUE/OPERATING_EXPENSE/OTHER_EXPENSE`입니다. 자본 과목은 현재 지원하지 않습니다. 유형과 손익 분류를 별도 문자열 이름으로 추측하지 않습니다.

## 추가

`POST /` → 200 `{id}`

요청: `{name,group,code?}`. 이름은 공백을 제거한 1~100자이며 코드는 세 자리 문자열입니다. 자산 100~199, 부채 200~299, 영업수익 400~499, 영업외수익 400~499 또는 900~999, 비용 800~899를 검증합니다. 기존 영업외수익 400번대의 호환을 유지하며 새 영업외수익의 자동 코드는 902부터 배정합니다.

코드 생략 시 자산 104, 부채 203, 영업수익 402, 영업외수익 902, 비용 814부터 같은 유형 범위의 빈 코드를 배정합니다. 기본 코드·다른 과목·삭제한 과목의 코드는 중복 사용하지 않습니다. 같은 활성 과목의 분류·이름과 선택 코드가 같은 재요청은 같은 ID를 반환합니다. 기존 손익 화면의 비용 추가도 같은 경로를 사용합니다.

## 수정·사용 상태·삭제

| 동작 | 요청 | 성공 |
| --- | --- | --- |
| `PUT /{accountId}` | `{name,code,group,expectedRevision}` | 204 |
| `POST /{accountId}/status` | `{active,expectedRevision}` | 204 |
| `DELETE /{accountId}` | `{expectedRevision}` | 204 |

`expectedRevision`은 조회한 0 이상의 정수이며 저장 직전에 현재 값과 비교합니다. 다른 변경이 있으면 409이며 Client는 입력을 유지합니다. 다른 관리대상·삭제된 계정은 변경할 수 없습니다. 보호 범위와 업무 사용의 의미는 도메인 표를 따릅니다. 삭제는 논리 삭제이며 되살리기 API는 제공하지 않습니다.

이름을 바꾸어도 계정 ID·원천 금액·귀속·연결을 변경하지 않습니다. 현재·과거 기간의 재조회는 새 표시명을 쓰고 이전 표시는 변경 이력에 보존합니다. 사용 중지 과목은 손익·원장에서 유지하며 손익 응답 `accounts[].active=false`로 신규 매칭 선택에서 제외합니다. 지출 최초 선택과 미지급 발생도 서버에서 활성 상태를 검사합니다.

## 변경 이력

`GET /{accountId}/history` → 200 `[{revision,name,code,group,active,deletedAt,changedAt}]`

최신 revision부터 반환합니다. 저장된 최초 상태는 revision 0이며 조회에만 보충한 기본 과목은 아직 이력이 없을 수 있습니다. 이력 저장에는 변경자도 보존하며 이 API는 개인정보를 추가 조회하지 않습니다.

## 오류

| 코드 | HTTP | 의미 |
| --- | --- | --- |
| `ACCESS_DENIED` | 403 | 설정 변경 권한 없음 |
| `ACCOUNTING_ACCOUNT_NOT_FOUND` | 404 | 같은 관리대상에 유효한 과목 없음 |
| `INVALID_ACCOUNTING_REQUEST/INVALID_ACCOUNTING_ACCOUNT` | 400 | 형식·유형·코드·활성 상태 검증 실패 |
| `ACCOUNTING_ACCOUNT_PROTECTED` | 409 | 기본 과목의 보호된 변경 |
| `ACCOUNTING_ACCOUNT_USED` | 409 | 사용한 과목의 코드·분류 변경 또는 삭제 |
| `ACCOUNTING_ACCOUNT_CONFLICT` | 409 | revision 충돌 |
| `ACCOUNTING_CODE_CONFLICT/ACCOUNTING_CODE_EXHAUSTED` | 409 | 코드·이름 중복 또는 배정 범위 소진 |
| `ACCOUNTING_REVIEW_CONFLICT` | 409 | DB 무결성 검사 충돌, 최신 정보 재확인 |
| `ACCOUNTING_SERVICE_UNAVAILABLE` | 503 | 저장소 조회 실패 |

원문·내부 SQL 오류를 응답하지 않고 실패를 빈 목록이나 가상 기본 자료로 바꾸지 않습니다.
