# 관리대상 등록 API

이 문서는 Client와 Server가 함께 사용하는 관리대상 등록의 기본 정보 검증, 최종 일괄 저장과 결과 조회 API 계약을 정의합니다. API의 입력, 응답, 오류와 중복 요청의 의미를 이 문서에서 관리합니다.

작성일: 2026-10-05. 업무 정책은 [도메인 규칙](domainRules.md), 데이터 구조는 [ERD](erd.md)를 따릅니다. Server의 세 API와 Service / Entity / Migration, Client 기본 정보 화면과 검증 API 연결, 동·세대와 관리계좌 설정을 구현했습니다. 관리비 항목 이후 설정과 전체 등록 제출의 Client 처리는 후속 구현 범위입니다. 내부 처리와 검증은 [Server 등록 설계](../server/docs/propertyRegistration.md)를 따릅니다.

## 1. 공통 적용 기준

- 정상 로그인 사용자가 기존 관리대상 유무와 관계없이 등록을 시작할 수 있습니다. 플랫폼 관리자 역할을 요구하지 않습니다.
- 기본 정보 검증과 단계 이동에는 업무 데이터 쓰기가 없습니다. 마지막 `관리 시작하기`에서 전체 정보를 한 번에 저장합니다.
- 최종 등록은 관리대상, 필요한 동, 세대, 공용 관리계좌, 기본 관리비 템플릿 / 항목, 생성자의 `ADMIN / ACTIVE` 참여와 성공 등록 결과를 하나의 트랜잭션으로 저장합니다. 커밋 전 저장 실패에는 전체를 롤백합니다.
- 세대 / 계좌 / 항목은 각각 최소 1개, 동 있음이면 동도 최소 1개가 필요합니다. 기본 계좌는 정확히 1개, 계좌 사용 시작일은 등록 완료일, 기본 항목 금액은 0원 이상 정수입니다.
- 생성자 주민 명부나 주민 세대 관계를 자동 생성하지 않습니다. 월별 실제 청구, 수납과 회계 전표는 별도 업무입니다.

### 공통 인증과 오류

세 API 모두 `Authorization: Bearer <Access Token>`으로 인증하며 `Cache-Control: no-store`인 JSON을 반환합니다. 업무 API는 Refresh 쿠키로 인증하지 않고 `X-CSRF-TOKEN`을 요구하지 않습니다. 인증 / CORS는 [보안 설계](securityDesign.md)를 따릅니다. 오류에는 입력 원문, 계좌번호, 토큰이나 내부 저장소 예외를 포함하지 않습니다.

| HTTP | code | 발생 조건 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Bearer 인증 없음 |
| 401 | `INVALID_TOKEN` | 유효하지 않은 토큰 |
| 401 | `ACCESS_TOKEN_EXPIRED` | Access Token 만료 |
| 401 | `SESSION_EXPIRED` | 로그인 세션 만료 / 없음 |
| 403 | `ACCOUNT_UNAVAILABLE` | 정지 / 탈퇴 등 이용 불가 계정 |
| 403 | `ACCESS_DENIED` | 인증 계층 접근 거부 또는 기존 결과의 현재 접근권한 없음 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST 요청의 JSON 이외 Content-Type |
| 500 | `INTERNAL_SERVER_ERROR` | 예상하지 못한 내부 처리 오류 |
| 503 | `AUTH_SERVICE_UNAVAILABLE` | 인증에 필요한 Redis / 계정 조회 장애 |

인증 오류의 메시지는 기존 인증 기준을 유지합니다. 415의 메시지는 `JSON 형식으로 요청해주세요.`, 500은 `요청을 처리하지 못했습니다.`입니다. 각 API의 입력 오류와 등록 전용 오류는 아래에 정의합니다.

## 2. 기본 정보 검증 API

첫 단계의 `등록하고 계속`에서 입력을 검증하고 정리한 값을 반환합니다. 관리대상과 생성자 권한을 저장하지 않습니다.

### 요청

| 항목 | 계약 |
| --- | --- |
| Method | `POST` |
| Path | `/api/property-registrations/basic-info/validate` |
| 인증 | `Authorization: Bearer <Access Token>` |
| 요청 형식 | `Content-Type: application/json` |
| 응답 형식 | `application/json`, `Cache-Control: no-store` |
| 업무 데이터 저장 | 없음 |

#### 입력 필드

| 필드 | 타입 | 필수 | 검증과 정리 |
| --- | --- | --- | --- |
| `name` | string | 필수 | 앞뒤 공백 제거 후 1~50자 |
| `address` | string | 필수 | 앞뒤 공백 제거 후 1~255자 |
| `addressDetail` | string 또는 null | 선택 | 앞뒤 공백 제거 후 최대 255자, 생략 / null / 빈 값은 null |
| `propertyType` | string 또는 null | 선택 | 앞뒤 공백 제거 후 최대 30자, 생략 / null / 빈 값은 null |
| `hasBuildings` | boolean | 필수 | true / false만 허용, 생략 / null / 문자열은 거부 |

문자열 길이는 앞뒤 공백을 제거한 뒤 Unicode 코드 포인트 수로 판단합니다. 한글 등 특정 문자만 허용하는 제한을 추가하지 않습니다. 문자열 필드에 숫자나 객체가 들어오면 문자열로 자동 변환하지 않고 잘못된 입력으로 처리합니다. `hasBuildings = false`는 정상 입력입니다.

건물 유형은 현재 ERD의 선택적인 문자열 설계를 유지하며 이번 계약에서 새로운 유형 Enum을 만들지 않습니다. 화면의 유형 목록과 코드 체계는 해당 입력 UI를 구현할 때 정리합니다. 주소는 입력 형식과 길이를 검증하며, 이 API 성공을 주소의 실재 여부나 건물 소유 확인으로 해석하지 않습니다.

요청에는 생성자 ID, 역할, 상태, 주민 ID를 받지 않습니다. 등록 계약 밖의 필드는 허용하지 않고 `400 / INVALID_REQUEST`로 거부합니다. 관리소장 지정은 최종 등록 시 인증된 계정을 기준으로 Server가 수행합니다.

#### 요청 예시

아래 주소는 계약 설명을 위한 예시이며 실제 주소 검색 결과를 의미하지 않습니다.

```json
{
  "name": "성내빌라",
  "address": "서울특별시 강동구 예시로 1",
  "addressDetail": null,
  "propertyType": "빌라",
  "hasBuildings": false
}
```

### 성공 응답

HTTP `200 OK`로 정리한 기본 정보 객체를 직접 반환합니다. 선택 필드는 입력에서 생략해도 응답에 null로 포함합니다.

```json
{
  "name": "성내빌라",
  "address": "서울특별시 강동구 예시로 1",
  "addressDetail": null,
  "propertyType": "빌라",
  "hasBuildings": false
}
```

초안을 Server에 보관하지 않으므로 `propertyId`, `registrationId`, 참여 역할이나 다음 단계 URL을 발급하지 않습니다. Client는 응답을 현재 등록의 기본 정보에 반영하고 동 / 세대 단계로 이동합니다. 검증 호출을 반복해도 관리대상이나 참여 레코드가 생기지 않습니다.

### 오류 응답

기존 인증 API와 같은 `code`, `message` JSON 구조를 사용합니다. 오류 메시지에는 입력한 이름 / 주소 원문, 토큰이나 내부 저장소 오류를 넣지 않습니다.

```json
{
  "code": "INVALID_REQUEST",
  "message": "요청 형식이 올바르지 않습니다."
}
```

| HTTP | code | 발생 조건 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | JSON 형식 오류, 필수 필드 누락, 타입 / 길이 오류, 계약 밖 필드 |

나머지 오류는 공통 인증 / 오류 계약을 따릅니다. 등록 Controller 전용 예외 처리에서 입력 / 업무 저장 / 인증 오류를 구분합니다.

이 API는 관리대상을 생성하지 않으므로 이름 / 주소 중복을 임의로 `409` 오류로 추가하지 않습니다. 최종 저장의 중복 요청 처리와 무결성 오류는 최종 등록 계약에서 정의합니다.

통신 실패와 입력 유지 / 단계 이동의 처리는 [Client 등록 설계](../client/docs/propertyRegistration.md)를 따릅니다.

## 3. 최종 등록 API

마지막 `관리 시작하기`에서 모든 설정을 제출합니다. 주소 검색 서비스와 등록 이후 데이터 수정 API는 이 계약의 범위 밖입니다.

### 요청

| 항목 | 계약 |
| --- | --- |
| Method | `POST` |
| Path | `/api/property-registrations` |
| 인증 | `Authorization: Bearer <Access Token>` |
| 요청 형식 | `Content-Type: application/json` |
| 응답 형식 | `application/json`, `Cache-Control: no-store` |
| 첫 저장 성공 | `201 Created` |
| 같은 요청의 성공 결과 재반환 | `200 OK` |

기존 업무 API와 같이 Bearer로 인증합니다. Refresh 쿠키나 `X-CSRF-TOKEN`으로 업무 요청을 인증하지 않습니다. 중복 방지 값은 JSON의 `requestId`로 전달하므로 새로운 요청 헤더나 CORS 허용 헤더가 필요하지 않습니다.

#### 최상위 필드

| 필드 | 타입 | 필수 | 의미 |
| --- | --- | --- | --- |
| `requestId` | UUID string | 필수 | Client가 최종 제출 직전에 생성하는 중복 방지 ID |
| `basicInfo` | object | 필수 | 기본 정보 검증 API와 같은 입력 객체 |
| `buildings` | object array | 필수 | 동 없음이면 빈 배열, 동 있음이면 최소 1개 |
| `units` | object array | 필수 | 최소 1개의 세대 |
| `bankAccounts` | object array | 필수 | 최소 1개의 공용 관리계좌 |
| `feeItems` | object array | 필수 | 최소 1개의 기본 관리비 항목 |

배열의 null 요소와 필수 객체 / 배열의 생략 또는 null을 허용하지 않습니다. 문자열을 숫자나 불리언으로 자동 변환하지 않습니다. 요청의 모든 객체에서 계약 밖 필드는 거부합니다. 생성자 ID, 관리대상 / 참여 역할, DB ID와 저장 시각은 Server가 결정합니다.

#### 기본 정보

`basicInfo`의 필드와 필수 여부, 길이와 정규화는 기본 정보 검증 요청과 동일합니다. 이전 검증 응답이 있어도 전체 저장 시 다시 검증합니다. 이름 / 주소에 관리대상 전체의 유일성 제약을 추가하지 않습니다.

#### 동

| 필드 | 타입 | 필수 | 검증 |
| --- | --- | --- | --- |
| `buildings[].clientId` | string | 필수 | 앞뒤 공백 없는 1~50자의 영문 / 숫자 / `_` / `-`, 요청 안에서 중복 금지 |
| `buildings[].name` | string | 필수 | 공백·동 접미사 정리 후 1~50자, 같은 요청의 정리된 동 이름 중복 금지 |

`clientId`는 아직 DB ID가 없는 동을 세대와 연결하는 요청 내부 식별자입니다. 대소문자를 구분하며 DB 컬럼으로 저장하지 않습니다. Server가 생성한 동 ID와의 매핑을 같은 저장 과정에서 사용합니다. 동의 표시 순서는 요청 배열 순서를 따릅니다. 저장 초기값은 [Server 등록 설계](../server/docs/propertyRegistration.md)를 따릅니다.

`hasBuildings = false`이면 `buildings`는 빈 배열이어야 합니다. `true`이면 하나 이상의 동을 받고, 모든 세대가 이번 요청의 동을 참조해야 합니다. 동마다 최소 세대 수를 추가로 요구하지 않습니다.

#### 세대

| 필드 | 타입 | 필수 | 검증 |
| --- | --- | --- | --- |
| `units[].buildingClientId` | string 또는 null | 조건부 | 동 있음이면 이번 요청의 `clientId`, 동 없음이면 생략 / null |
| `units[].unitNumber` | string | 필수 | 공백 정리 후 1~30자 문자열, 문자·앞자리 0 유지, 같은 동 안에서 중복 금지, 동 없음이면 전체 세대 안에서 중복 금지 |
| `units[].displayName` | string 또는 null | 선택 | 최대 50자, 생략 / null / 공백은 null |
| `units[].floor` | integer 또는 null | 선택 | ERD의 smallint 범위인 -32,768~32,767, 생략 / null은 null |
| `units[].status` | string | 필수 | 초기 등록은 `ACTIVE / VACANT`만 허용 |

동 참조에는 `clientId`와 같은 형식을 적용하며 동 없음에서 빈 문자열을 동 참조로 받지 않습니다. 동 이름은 앞뒤 공백을 정리하고 끝에 `동`이 없으면 붙입니다. `101`과 `101동`, `A`와 `A동`은 각각 동일한 이름으로 저장·중복 검사합니다. 동 이름의 내부 공백·대소문자는 유지합니다. 세대번호는 앞뒤 공백만 정리하고 문자·내부 공백·대소문자·`호` 접미사를 유지합니다. `201` / `201호`, `001` / `1`은 각각 문자열 기준으로 구분합니다. 표시 이름과 세대번호는 각각 저장합니다. 세대 상태의 변경과 비활성화 조건은 이 등록 계약으로 확정하지 않습니다.

#### 관리계좌

| 필드 | 타입 | 필수 | 검증 |
| --- | --- | --- | --- |
| `bankAccounts[].bankCode` | string | 필수 | 공백 정리 후 1~20자 |
| `bankAccounts[].bankName` | string | 필수 | 공백 정리 후 1~50자 |
| `bankAccounts[].accountNumber` | string | 필수 | 앞뒤 공백 제거, ASCII 숫자(0~9)·공백·하이픈만 허용, 공백 / 하이픈 제거 후 4~50자리 숫자 |
| `bankAccounts[].holderName` | string | 필수 | 공백 정리 후 1~50자 |
| `bankAccounts[].isPrimary` | boolean | 필수 | true인 계좌가 전체에서 정확히 1개 |

계좌가 1개여도 `isPrimary: true`를 명시합니다. 계좌번호는 앞자리 0을 보존하는 문자열이며 숫자 타입으로 받지 않습니다. 등록 요청의 은행 코드 / 이름은 현재 ERD의 문자열 구조를 사용합니다. 이 API의 형식 검증이 실제 은행 계좌나 예금주 확인을 의미하지 않습니다.

초기 계좌는 공용계좌이며 예금주 주민 연결은 등록 이후에 처리할 수 있습니다. `valid_from`은 성공 등록의 `createdAt`을 `Asia/Seoul`로 변환한 날짜로 자동 설정합니다. 성공 결과를 다음 날 재조회 / 재전송해도 처음 저장한 날짜를 유지합니다.

계좌번호 보호와 내부 저장 방식은 [Server 등록 설계](../server/docs/propertyRegistration.md)를 따릅니다.

##### 은행 선택 목록

Client의 초기 관리계좌 화면은 국내 은행과 아래 예금 취급 기관을 선택지로 제공하며 선택한 은행의 `bankCode` / `bankName`을 함께 유지합니다. 화면에는 이름만 표시하고 코드는 앞자리 0을 보존한 3자리 문자열입니다. 코드 대응은 [금융결제원 대표코드 안내](https://e-giro.giro.or.kr/service/jadongbatch/guideJadongInfo.do)를 확인했습니다(2026-10-08).

| 은행명 | 코드 | 은행명 | 코드 |
| --- | --- | --- | --- |
| 국민은행 | 004 | 신한은행 | 088 |
| 우리은행 | 020 | 하나은행 | 081 |
| 농협은행 | 011 | 기업은행 | 003 |
| 카카오뱅크 | 090 | 케이뱅크 | 089 |
| 토스뱅크 | 092 | 산업은행 | 002 |
| 수협은행 | 007 | SC제일은행 | 023 |
| 한국씨티은행 | 027 | 아이엠뱅크 | 031 |
| 부산은행 | 032 | 광주은행 | 034 |
| 제주은행 | 035 | 전북은행 | 037 |
| 경남은행 | 039 | 지역농축협 | 012 |
| 새마을금고 | 045 | 신협중앙회 | 048 |
| 산림조합중앙회 | 064 | 우체국 | 071 |

이 목록은 현재 Client 선택지의 코드 / 이름 대응입니다. Server의 기존 문자열 형식 검증과 API 예시의 가상 코드는 유지하며 목록 밖 코드의 거부나 은행별 계좌번호 검증을 추가하지 않습니다. 계좌 진위 / 예금주 확인, 은행 로고와 외부 기관 조회는 이번 화면 범위에 포함하지 않습니다.

#### 기본 관리비 항목

| 필드 | 타입 | 필수 | 검증 |
| --- | --- | --- | --- |
| `feeItems[].itemName` | string | 필수 | 공백 정리 후 1~100자 |
| `feeItems[].defaultAmount` | integer | 필수 | 원 단위, 0~999,999,999,999,999 |

0원은 허용하고 음수, 소수 금액과 숫자 문자열은 거부합니다. 항목 합계도 0~999,999,999,999,999 범위로 검증합니다.

등록한 항목은 세대당 월 기본 관리비로 사용하고 표시 순서는 요청 배열 순서를 따릅니다. 합계는 세대 수를 곱한 금액이 아닙니다. 템플릿 생성과 내부 초기값은 [Server 등록 설계](../server/docs/propertyRegistration.md)를 따릅니다.

#### 요청 예시

아래 주소와 은행 코드 / 이름, 계좌번호와 예금주 이름은 계약 설명을 위한 가상 데이터입니다. 은행 코드 목록이나 실제 계좌를 의미하지 않습니다.

```json
{
  "requestId": "7f0c8c26-33d9-4bb3-8ca7-2c7c99e7f0ef",
  "basicInfo": {
    "name": "성내빌라",
    "address": "서울특별시 강동구 예시로 1",
    "addressDetail": null,
    "propertyType": "빌라",
    "hasBuildings": true
  },
  "buildings": [
    { "clientId": "building-101", "name": "101동" },
    { "clientId": "building-102", "name": "102동" }
  ],
  "units": [
    { "buildingClientId": "building-101", "unitNumber": "201", "displayName": "201호", "floor": 2, "status": "ACTIVE" },
    { "buildingClientId": "building-101", "unitNumber": "202", "displayName": "202호", "floor": 2, "status": "ACTIVE" },
    { "buildingClientId": "building-102", "unitNumber": "301", "displayName": "301호", "floor": 3, "status": "ACTIVE" },
    { "buildingClientId": "building-102", "unitNumber": "302", "displayName": "302호", "floor": 3, "status": "VACANT" }
  ],
  "bankAccounts": [
    {
      "bankCode": "SAMPLE_BANK",
      "bankName": "예시은행",
      "accountNumber": "0001234567890",
      "holderName": "홍길동",
      "isPrimary": true
    }
  ],
  "feeItems": [
    { "itemName": "일반관리비", "defaultAmount": 15000 },
    { "itemName": "청소용역비", "defaultAmount": 8000 },
    { "itemName": "엘리베이터비", "defaultAmount": 25300 },
    { "itemName": "기타", "defaultAmount": 1700 }
  ]
}
```

동 없음 요청은 `basicInfo.hasBuildings: false`, `buildings: []`로 보내고 모든 세대의 `buildingClientId`를 생략하거나 null로 보냅니다. Server는 이 경우 동을 만들지 않고 모든 세대의 `building_id`를 NULL로 저장합니다.

### 성공 응답

첫 저장은 `201 Created`이며 DB 커밋이 성공한 뒤 응답합니다. 같은 요청의 성공 결과 재반환과 결과 조회는 `200 OK`이고 같은 응답 객체를 사용합니다.

```json
{
  "requestId": "7f0c8c26-33d9-4bb3-8ca7-2c7c99e7f0ef",
  "property": {
    "id": "f5405dd1-42ea-4279-9302-812ffcc2d21b",
    "name": "성내빌라",
    "hasBuildings": true,
    "status": "ACTIVE"
  },
  "membership": {
    "id": "6114debb-fdf5-4e92-ac9d-ea665f7e13ed",
    "role": "ADMIN",
    "status": "ACTIVE"
  },
  "summary": {
    "buildingCount": 2,
    "unitCount": 4,
    "bankAccountCount": 1,
    "feeItemCount": 4,
    "monthlyDefaultAmount": 50000
  },
  "createdAt": "2026-10-05T03:00:00Z"
}
```

ID는 Server가 생성한 UUID, `createdAt`은 UTC ISO 8601 시각입니다. 응답은 등록 당시 결과의 스냅샷이며 계좌번호 원문, 예금주 이름, 요청 본문이나 인증정보를 포함하지 않습니다. 이후 데이터나 역할이 바뀌어도 이 스냅샷을 현재 조회 / 권한 검증 대신 사용하지 않습니다. Client는 `property.id`로 관리대상을 선택하고 관리자 진입 화면으로 이동합니다. 구체적인 화면 URL은 Client 라우팅 구현에서 정합니다.

### 중복 방지와 결과 조회

같은 요청의 재시도에는 같은 `requestId`와 본문을 사용합니다. 최종 제출 / 입력 잠금 / 재로그인 처리는 [Client 등록 설계](../client/docs/propertyRegistration.md)에 정의합니다.

| 요청 상황 | 처리 |
| --- | --- |
| 해당 사용자 / ID의 성공 결과 없음 | 전체 검증과 트랜잭션 저장 수행, 성공 시 201 |
| 같은 사용자 / ID, 같은 정규화한 본문, 저장 완료 | 추가 저장 없이 기존 성공 결과 200 |
| 같은 사용자 / ID, 다른 정규화한 본문, 저장 완료 | `409 / REGISTRATION_REQUEST_CONFLICT` |
| 같은 사용자 / ID의 저장이 진행 중 | 같은 키를 직렬 처리, 제한 시간 안에 완료되면 기존 결과 반환, 계속 처리 중이면 `409 / REGISTRATION_IN_PROGRESS` |

중복 방지 범위는 인증된 `userId + requestId`입니다. 다른 사용자의 같은 ID는 결과 접근 권한을 주지 않습니다. 다른 ID로 같은 이름 / 주소를 제출한 요청까지 같은 등록으로 추측해 합치지 않습니다.

비교 대상은 `requestId`를 제외한 전체 정규화 본문입니다. JSON 객체 키 순서와 선택 값의 생략 / null 등 정규화 후 같은 표현은 동일하게 처리하고, 배열 순서는 표시 순서이므로 비교에 포함합니다. 중복 방지의 영속 저장과 동시성 제어는 [Server 등록 설계](../server/docs/propertyRegistration.md)를 따릅니다. 실패 트랜잭션은 성공 결과도 남기지 않습니다.

#### 결과 조회

| 항목 | 계약 |
| --- | --- |
| Method | `GET` |
| Path | `/api/property-registrations/{requestId}` |
| 인증 | `Authorization: Bearer <Access Token>` |
| 성공 | 200, 저장 성공 응답과 같은 스냅샷 |
| 성공 결과 없음 | `404 / REGISTRATION_NOT_FOUND` |
| requestId 형식 오류 | `400 / INVALID_REQUEST` |

조회는 인증된 사용자가 제출한 성공 결과만 반환합니다. 다른 사용자의 ID도 404로 처리하고, 요청자의 현재 관리대상 접근권한이 해제되었으면 `403 / ACCESS_DENIED`로 거부합니다. 저장 당시 관리소장 역할을 현재 권한으로 복구하지 않습니다.

404는 조회 시점에 커밋된 성공 결과가 없다는 뜻입니다. 아직 진행 중인 요청이나 롤백된 요청을 별도로 판별하는 상태 조회가 아닙니다. 404 또는 처리 중 응답에서는 새 ID로 바꾸지 않고 동일 ID / 본문으로 재시도해, 늦게 완료되는 첫 요청과 중복 생성을 막습니다. 네트워크 장애로 조회 자체가 실패하면 결과 확인 전까지 새 등록 요청을 만들지 않습니다.

### 오류 응답

기존 인증 오류의 `code`, `message`를 유지하고 이 API의 입력 검증 오류에는 선택적인 `errors` 배열을 추가합니다. 배열 경로의 인덱스는 0부터 시작합니다. 실제 입력값이나 계좌번호 원문, 토큰, SQL, 내부 예외는 오류에 포함하지 않습니다.

```json
{
  "code": "INVALID_REQUEST",
  "message": "등록 정보를 확인해주세요.",
  "errors": [
    {
      "field": "units[0].buildingClientId",
      "reason": "INVALID_REFERENCE",
      "message": "등록할 동을 선택해주세요."
    }
  ]
}
```

`errors[].reason`은 `REQUIRED`, `INVALID_TYPE`, `INVALID_FORMAT`, `TOO_LONG`, `OUT_OF_RANGE`, `DUPLICATE`, `INVALID_REFERENCE`, `INVALID_COMBINATION`을 사용합니다. 필수 누락 / 빈 배열은 REQUIRED, 동 이름 / 동 내부 세대번호 중복은 DUPLICATE, 기본 계좌 0개 / 2개 이상이나 동 없음에서의 동 정보는 INVALID_COMBINATION으로 구분합니다. 잘못된 JSON 등 필드를 식별할 수 없는 오류에는 `errors`를 생략합니다.

| HTTP | code | 발생 조건 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | JSON / 타입 / 필수 / 길이 / 범위 오류, 동 참조 / 중복 / 기본 계좌 조건 오류, 계약 밖 필드 |
| 404 | `REGISTRATION_NOT_FOUND` | GET에서 본인에게 속한 커밋된 성공 결과 없음 |
| 409 | `REGISTRATION_REQUEST_CONFLICT` | 이미 성공한 requestId를 다른 본문에 재사용 |
| 409 | `REGISTRATION_IN_PROGRESS` | 동일 사용자 / ID의 요청이 계속 처리 중 |
| 503 | `REGISTRATION_SERVICE_UNAVAILABLE` | 업무 DB 접근 장애 / 일시 저장 장애 |

`INVALID_REQUEST`의 기본 메시지는 `등록 정보를 확인해주세요.`, `REGISTRATION_NOT_FOUND`는 `등록 결과를 찾을 수 없습니다.`, `REGISTRATION_REQUEST_CONFLICT`는 `이미 사용한 등록 요청입니다.`, `REGISTRATION_IN_PROGRESS`는 `등록을 처리하고 있습니다.`를 사용합니다.

`UNSUPPORTED_MEDIA_TYPE`는 `JSON 형식으로 요청해주세요.`, `INTERNAL_SERVER_ERROR`는 `요청을 처리하지 못했습니다.`, `REGISTRATION_SERVICE_UNAVAILABLE`는 `등록 서비스를 일시적으로 사용할 수 없습니다.`를 사용합니다. 인증 오류 메시지는 기존 인증 기준을 유지합니다.

공통 인증 / 오류 계약도 적용합니다. 500 / 503이나 통신 오류만으로 DB 미저장을 단정하지 않습니다. 커밋 전 저장 오류는 전체 롤백하지만 커밋 후 응답 작성 / 전달 실패까지 되돌리는 계약은 아닙니다. 결과가 불명확하면 결과 조회 또는 같은 ID / 본문 재시도를 사용합니다.

Client의 필드별 오류 연결과 공통 전송 변경 범위는 [Client 등록 설계](../client/docs/propertyRegistration.md)를 따릅니다.

## 4. 관련 구현 설계

- [Client 관리대상 등록 설계](../client/docs/propertyRegistration.md): 화면 구성, 단계 이동, 초안 복원과 최종 제출 / 오류 처리.
- [Server 관리대상 등록 설계](../server/docs/propertyRegistration.md): 검증 책임, 트랜잭션, 저장 초기값, 계좌번호 보호와 중복 방지.
- [도메인 규칙](domainRules.md): 확정된 등록 정책과 후속 검토 범위.
- [ERD](erd.md): 테이블 / 컬럼 / 관계와 등록 성공 결과의 데이터 설계.

검증 항목과 자동 테스트 위치는 각 영역의 구현 설계에서 관리합니다. Server 구현과 Client 등록 화면의 구현 상태는 구분합니다.
