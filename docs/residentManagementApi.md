# 주민 관리 API

작성일: 2026-10-10. 현재 구현 범위는 주민 목록 조회입니다. 업무 기준은 [도메인 규칙](domainRules.md#확정된-주민-목록-조회), 스키마는 [ERD](erd.md#54-residents), 화면은 [Client 주민 목록](../client/docs/residentList.md)을 따릅니다. 등록·상세·수정·대표 변경·엑셀 등록 API는 아직 제공하지 않습니다.

## 목록 조회

`GET /api/properties/{propertyId}/residents`

- `Authorization: Bearer <accessToken>`이 필요합니다.
- 정상 계정과 현재 활성 관리대상·참여를 확인한 뒤 해당 관리대상의 관리소장(`ADMIN`)에게만 허용합니다. 부담당자·주민·다른 관리대상 관리자·플랫폼 관리자라는 이유만으로는 접근할 수 없습니다.
- `propertyId`는 UUID입니다. 조회 조건과 서버 페이지네이션 파라미터는 없습니다. 삭제되지 않은 주민 전체를 이름·ID 순서로 반환하고 Client에서 필터와 페이지를 처리합니다.
- 주민의 저장 상태로 행을 제외하지 않습니다. 현재 세대 관계(`ACTIVE`, 미삭제)만 결합하고 과거 관계로 주민 행을 중복하지 않습니다.
- 성공과 Controller 오류 응답에 `Cache-Control: no-store`를 적용합니다.

### 응답

HTTP `200`. 명부가 비었으면 `residents: []`입니다.

```json
{
  "propertyId": "11111111-1111-4111-8111-111111111111",
  "hasBuildings": true,
  "buildings": [
    { "id": "22222222-2222-4222-8222-222222222222", "name": "103동" }
  ],
  "residents": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "name": "김민수",
      "phoneLast4": "1234",
      "unitId": "44444444-4444-4444-8444-444444444444",
      "buildingId": "22222222-2222-4222-8222-222222222222",
      "unitNumber": "301",
      "relationType": "TENANT",
      "representative": true,
      "signupStatus": "NOT_JOINED"
    }
  ]
}
```

| 필드 | 의미 |
| --- | --- |
| `hasBuildings` | 관리대상의 동 구분 사용 여부 |
| `buildings` | 동 필터와 이름 표시용 동 목록: 미삭제·활성 동, 표시 순서·이름 순 |
| `residents[].id`, `name` | 주민 명부 ID와 이름 |
| `phoneLast4` | 숫자 4자리 또는 `null`. 전체 번호·암호문·HMAC은 조회하거나 반환하지 않음 |
| `unitId`, `buildingId`, `unitNumber` | 현재 미삭제 세대. 동 없음은 `buildingId: null` |
| `relationType` | `OWNER / TENANT / FAMILY / OTHER` 또는 현재 소속 없음의 `null` |
| `representative` | 현재 세대 관계의 대표 여부 |
| `signupStatus` | `APPROVED`(가입 완료), `NOT_JOINED`(미가입), `PENDING`(승인 대기) |

현재 관계가 없거나 세대가 삭제되었으면 세대 ID·동 ID·호수·관계는 모두 `null`, 대표 여부는 `false`이며 주민 행은 반환합니다. 가입 상태는 계정 ID의 존재 여부와 구분해 다음 기준으로 계산합니다. 계정 ID와 신청 연락처는 반환하지 않습니다.

### 가입 상태 판정

사용자 요청에 따라 승인 대기는 **명부의 누구인지 확인된 주민만** 표시·집계합니다. 명부에 없거나 확인되지 않은 신청을 주민 행으로 추가하거나 같은 세대의 주민에게 임의로 연결하지 않습니다.

아래는 조회 구현의 판정 기준입니다. 신청·승인·자동 매칭 절차를 구현했다는 뜻은 아닙니다.

1. `APPROVED`: 주민에 연결된 계정의 현재 세대 `APPROVED` 요청이 미삭제로 존재하고, 같은 관리대상의 참여가 `ACTIVE`이며 종료·삭제되지 않았을 때입니다.
2. `PENDING`: 위 가입 완료에 해당하지 않고, 주민 ID가 확인 연결된(`MATCHED` / `MANUAL`) 현재 세대의 미삭제 `PENDING` 요청이 존재할 때입니다. `POSSIBLE` 후보·미확인 신청·다른 세대 요청은 제외합니다.
3. `NOT_JOINED`: 위 두 조건에 해당하지 않는 주민입니다. 계정만 연결된 기록, 거절·취소·삭제된 신청과 과거 세대 승인만으로 가입 완료·승인 대기를 표시하지 않습니다.

주민당 한 상태를 반환하고 여러 신청은 `EXISTS`로 확인하므로 주민 행과 카드 집계가 중복되지 않습니다. 전체 주민 수는 가입 완료·미가입·승인 대기 주민 수의 합입니다. 전체 가입 요청 건수와는 구분합니다.

### 오류

기존 공통 오류 형태 `{ "code": "...", "message": "..." }`를 사용하고 전화번호·SQL·명부 원문을 오류에 넣지 않습니다.

| HTTP | 코드 | 조건 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 잘못된 관리대상 UUID |
| 401 | 공통 인증 오류 코드 | 인증정보 없음·만료·무효 |
| 403 | `ACCESS_DENIED` | 현재 관리소장 권한 없음, 대상 접근 불가 |
| 403 | `ACCOUNT_UNAVAILABLE` | 정상 사용 가능한 계정 아님 |
| 503 | `RESIDENT_SERVICE_UNAVAILABLE` | 저장소 조회 실패 |
| 500 | `INTERNAL_SERVER_ERROR` | 그 외 예상하지 못한 오류 |

인증 필터의 오류는 [관리 영역 접근 API](managementAccessApi.md)의 공통 인증 처리를 따릅니다.

## 저장 구조와 검증 범위

`V20261010041826__create_resident_directory.sql`로 `residents`와 `unit_residents`를 생성합니다. 같은 관리대상의 주민·세대만 관계를 맺도록 복합 FK를 두고, 미삭제 현재 관계를 주민당 하나로 제한하는 부분 UNIQUE 인덱스를 적용합니다. 같은 세대에 여러 주민은 허용합니다.

`V20261010043914__create_membership_request_read_model.sql`로 가입 상태 조회에 필요한 `membership_requests` 저장 구조를 추가합니다. 신청의 세대·확인 주민이 같은 관리대상인지 복합 FK로 보장하고 같은 계정·세대의 중복 대기를 제한합니다. 초대 연결 컬럼과 FK는 초대 기능 구현 시 추가합니다.

이번에 쓰기 API를 제공하지 않으므로 최초 대표 자동 지정·대표 변경·주민 재등록 복구는 아직 실행되지 않습니다. 계정 연결·가입 요청·가입 승인 처리와 전체 전화번호 복호화도 이번 범위에 포함하지 않습니다. 조회는 저장된 신청·승인 기록을 읽습니다. PostgreSQL 통합 테스트에서 빈 DB 전체 Migration과 이전 스키마의 후속 Migration, 실제 조회·무결성 제약을 검증합니다.
