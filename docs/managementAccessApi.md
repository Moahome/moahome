# 관리 영역 접근 API

작성일: 2026-10-09. **상태: Server 조회 API와 Client 연결 구현.** 기존 테이블을 읽으며 Migration을 추가하지 않았습니다.

관리자 진입의 확정 정책은 [도메인 규칙](domainRules.md#로그인-이후-진입-기준), 조회할 데이터는 [ERD](erd.md#56-property_members)를 따릅니다. 화면과 이동은 [Client 서비스 진입 설계](../client/docs/serviceEntry.md), 공통 레이아웃은 [Client 관리 레이아웃 설계](../client/docs/managementLayout.md), 내부 조회는 [Server 관리 영역 접근 설계](../server/docs/managementAccess.md)에서 관리합니다.

## 1. 목적과 범위

이 API는 로그인한 사용자가 현재 관리할 수 있는 관리대상 목록과, 특정 관리대상 관리 영역에 진입할 수 있는 현재 권한을 제공합니다. 등록 요청 ID나 등록 당시의 성공 응답으로 현재 관리 권한을 대신하지 않습니다.

| API | 용도 |
| --- | --- |
| `GET /api/users/me/managed-properties` | 로그인 후 기본 목적지 결정과 최근 선택 대상의 유효성 확인 |
| `GET /api/properties/{propertyId}/management-context` | 직접 주소 접근, 새로고침과 선택 대상 변경 시 해당 관리대상의 현재 권한 확인 |

주민 홈, 가입 요청, 승인 대기 조회, 대시보드 통계와 업무 데이터 조회는 이 계약에 포함하지 않습니다. 관리 영역 진입을 허용하는 것이 개별 업무의 모든 권한을 허용한다는 의미는 아닙니다.

## 2. 공통 인증과 조회 기준

- 기존 Bearer Access Token 인증을 사용합니다. 사용자 ID와 역할은 요청 입력으로 받지 않으며 인증된 계정을 기준으로 조회합니다. 토큰 전달·재발급과 공통 인증 오류는 [JWT 인증 설계](securityDesign.md)를 따릅니다.
- 정상 계정인지 확인한 뒤 현재 유효한 관리대상 참여를 조회합니다. `users.system_role`은 관리대상 권한을 대신하지 않습니다.
- 조회 대상은 `property_members.user_id`가 인증된 사용자이고, `role`이 `ADMIN` 또는 `MANAGER`, `status`가 `ACTIVE`, `ended_at`과 `deleted_at`이 NULL인 참여입니다. 연결된 `properties`도 `ACTIVE`이고 `deleted_at`이 NULL이어야 합니다.
- 응답의 역할과 이름은 현재 참여와 관리대상에서 읽습니다. `property_registration_results.response_snapshot`이나 브라우저의 최근 기록을 읽어 권한을 부여하지 않습니다.
- 두 API 모두 `Cache-Control: no-store`로 응답합니다. 조회에 별도의 관리대상 토큰이나 완료 토큰을 발급하지 않습니다.
- 계좌번호, 예금주, 주소, 주민 정보, 세대 목록과 인증정보는 응답하지 않습니다.

아래 JSON과 엔드포인트는 구현한 응답 계약입니다.

## 3. 본인의 관리 가능한 관리대상 목록

`GET /api/users/me/managed-properties`

요청 본문, 사용자 ID와 역할 필터를 받지 않습니다. 이번 범위는 본인의 관리자 영역 대상만 조회하므로 페이지네이션을 추가하지 않습니다.

### 성공 응답

`200 OK`

```json
{
  "properties": [
    {
      "propertyId": "f5405dd1-42ea-4279-9302-812ffcc2d21b",
      "name": "예시빌라",
      "role": "ADMIN"
    }
  ]
}
```

| 필드 | 형식 | 의미 |
| --- | --- | --- |
| `properties` | 배열 | 현재 관리할 수 있는 관리대상 목록 |
| `properties[].propertyId` | UUID 문자열 | 관리대상 식별자 |
| `properties[].name` | 비어 있지 않은 문자열 | 현재 관리대상 이름 |
| `properties[].role` | `ADMIN` / `MANAGER` | 해당 관리대상의 현재 참여 역할 |

목록의 첫 번째 대상을 기본 진입에 사용할 수 있도록 `properties.created_at` 오름차순, 같은 시각이면 `properties.id` 오름차순으로 정렬합니다. 응답의 역할값 순서나 브라우저의 이름 정렬로 기본 대상을 다시 정하지 않습니다.

대상이 없으면 `200`과 빈 배열을 반환합니다.

```json
{
  "properties": []
}
```

빈 배열은 **현재 관리할 수 있는 대상이 없다**는 뜻입니다. 주민 참여나 승인 대기 요청이 없다는 뜻으로 확장하지 않습니다. 조회 장애를 빈 배열로 반환하지 않습니다.

### 오류

| HTTP | 코드 / 구분 | 의미 |
| --- | --- | --- |
| 401 | 기존 인증 오류 | 인증이 없거나 Access Token / 세션을 사용할 수 없음 |
| 403 | `ACCOUNT_UNAVAILABLE` | 인증 계정이 현재 이용 불가 |
| 500 | `INTERNAL_SERVER_ERROR` | 목록 조회 등 내부 처리 실패 |
| 503 | `AUTH_SERVICE_UNAVAILABLE` | 인증 / 정상 계정 확인에 필요한 저장소 장애 |

## 4. 특정 관리대상의 현재 관리 권한

`GET /api/properties/{propertyId}/management-context`

`propertyId`는 관리대상 UUID입니다. 등록의 중복 방지용 `requestId`나 참여 레코드의 ID를 넣지 않습니다.

### 성공 응답

`200 OK`

```json
{
  "propertyId": "f5405dd1-42ea-4279-9302-812ffcc2d21b",
  "name": "예시빌라",
  "role": "ADMIN"
}
```

필드의 의미는 목록 항목과 같습니다. 요청한 관리대상과 현재 관리 권한을 모두 확인한 경우에만 반환합니다. 목록을 확인한 뒤 권한이 바뀌었으면 이 API의 현재 조회 결과를 적용합니다.

### 오류

| HTTP | 코드 / 구분 | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | `propertyId`가 UUID 형식이 아님 |
| 401 | 기존 인증 오류 | 인증이 없거나 Access Token / 세션을 사용할 수 없음 |
| 403 | `ACCOUNT_UNAVAILABLE` | 인증 계정이 현재 이용 불가 |
| 403 | `ACCESS_DENIED` | 해당 관리대상에 현재 유효한 관리 권한이 없음 |
| 500 | `INTERNAL_SERVER_ERROR` | 현재 관리 권한 조회 등 내부 처리 실패 |
| 503 | `AUTH_SERVICE_UNAVAILABLE` | 인증 / 정상 계정 확인에 필요한 저장소 장애 |

문법상 유효한 UUID라도 존재하지 않는 관리대상, 다른 사용자의 관리대상, 주민 역할만 가진 대상, 비활성·삭제·종료된 참여는 동일하게 `ACCESS_DENIED`로 거부합니다. 오류에 관리대상 이름이나 다른 사용자의 소속을 포함하지 않습니다.

오류 응답은 기존 `code`, `message` 구조를 사용합니다. 예를 들어 접근 거부는 다음 형태입니다.

```json
{
  "code": "ACCESS_DENIED",
  "message": "접근 권한이 없습니다."
}
```

## 5. 기존 API와 관계

`GET /api/users/me`의 본인 정보 응답과 세션 토큰 형식은 변경하지 않습니다. 관리대상별 목록과 권한을 JWT에 추가하지 않습니다.

[관리대상 등록 API](propertyRegistrationApi.md)는 입력 검증, 전체 저장과 본인이 제출한 등록 결과를 담당합니다. 등록 완료 표시 이후 관리자 영역으로 이동할 때는 이 문서의 현재 관리 권한 조회를 거칩니다. 기존 등록 결과 조회가 성공했더라도 주민 역할만 남아 있다면 관리자 영역에는 진입할 수 없습니다.

최근 선택 정보는 Client의 편의 정보입니다. 이 API가 최근 선택을 저장하거나 신뢰하지 않습니다. 관련 보관 / 폐기 기준은 [Client 서비스 진입 설계](../client/docs/serviceEntry.md#4-최근-선택-기록)를 참조합니다.

## 6. 참여 중복과 역할 충돌

현재 Migration에는 일반 참여의 유일성 제약이 없습니다. 동일 대상·역할의 중복 행은 한 항목으로 반환합니다. 같은 대상의 현재 관리자 역할이 서로 다르면 임의의 역할을 고르지 않고 `500 INTERNAL_SERVER_ERROR`로 실패합니다. 충돌 행의 정리와 역할 우선순위 정책은 후속으로 확정하며 이번 조회에서 데이터나 제약을 변경하지 않습니다.
