# 본인 프로필 API

상태: 2026-11-08 로컬 구현. 본인 정보 조회·이름 수정, 비공개 S3 프로필 사진 변경·삭제, 회원 탈퇴 유예·복구를 제공합니다. 운영 서버 배포 완료를 의미하지 않습니다.

## 인증과 응답

`/api/users/me` 하위 API는 기존 Access Token Bearer와 정상 계정 검증을 사용합니다. Refresh 쿠키만으로 접근할 수 없습니다. 아래 계정 복구 API는 재인증한 복구 전용 쿠키를 사용합니다. 모든 정상·업무 오류 응답은 `Cache-Control: no-store`입니다. 인증·재발급 오류는 [보안 설계](../development/securityDesign.md)를 따릅니다.

프로필 조회·수정의 성공 응답은 같은 본인 정보입니다.

| 필드 | 내용 |
| --- | --- |
| `id` | 인증된 계정 UUID |
| `displayName` | 계정 표시 이름 |
| `profileImageUrl` | 기존 소셜 이미지 URL, 본인 이미지 API 상대 URL 또는 null. 본인 API 주소는 아래의 Bearer 이미지 조회로 표시 |
| `systemRole` | 플랫폼 역할 USER / ADMIN |
| `status` | 정상 계정 ACTIVE |
| `canCreateProperty` | 플랫폼 역할과 별도로 부여하는 생성 권한 |

관리대상별 역할·주민 명부·전화번호·소셜 식별자·이메일은 응답하지 않습니다. 본인 프로필은 특정 관리대상의 관리자 또는 주민 참여를 요구하지 않습니다.

## 표시 이름 수정

```http
PATCH /api/users/me
Authorization: Bearer ...
Content-Type: application/json
```

```json
{ "displayName": "모아 사용자" }
```

`displayName`은 문자열 필수이며 공통 `TextValues.strip`으로 앞뒤 공백을 제거한 뒤 1~50 Unicode 코드 포인트를 허용합니다. 사용자 ID는 Bearer에서 결정하며 요청의 이름 외 필드를 이미지·권한·생성 허용 변경에 사용하지 않습니다.

계정 행의 기존 비관적 잠금 아래 최신 상태를 다시 확인하고 같은 트랜잭션에서 이름만 저장합니다. 현재 이미지·플랫폼 역할·생성 권한·주민 명부 이름·주민 소속은 유지합니다. 같은 이름의 재저장은 같은 결과를 반환하며 별도 생성이나 이력 추가를 하지 않습니다. 변경한 이름은 다음 소셜 로그인에서도 제공자의 닉네임으로 덮어쓰지 않습니다.

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | 누락·공백·길이 초과 또는 읽을 수 없는 JSON |
| 401 | 기존 인증 오류 | Bearer 없음·만료·세션 종료 |
| 403 | ACCOUNT_UNAVAILABLE | 계정 없음·정지·탈퇴 |
| 503 | AUTH_SERVICE_UNAVAILABLE | 조회·저장소 일시 장애 |

Client는 성공 응답으로 현재 계정 캐시를 갱신해 조회 화면·상단 프로필·모바일 메뉴의 이름을 함께 반영합니다. 저장 실패에는 입력을 유지하고 성공으로 표시하지 않습니다. 화면 구성은 [Client 서비스 진입](../../client/docs/serviceEntry.md#내-정보-2026-11-08)을 참조합니다.

## 이름·사진 함께 저장

`PUT /api/users/me/profile`, `Content-Type: multipart/form-data`

| 필드 | 내용 |
| --- | --- |
| `displayName` | 위의 이름 수정과 동일한 필수 문자열 |
| `image` | 선택 PNG/JPEG 파일. 최대 5MiB, 1,600만 픽셀 이하 |
| `removeImage` | boolean. true이면 사진 연결을 제거. image와 동시 지정 금지 |

사진을 지정하지 않고 removeImage=false이면 현재 사진을 유지합니다. 성공 응답은 본인 정보 JSON입니다. 이름과 사진 참조는 같은 트랜잭션에서 변경하며 다른 계정 ID·S3 키·버킷·외부 URL을 입력받지 않습니다. 사진 저장은 512px 이내 PNG로 정규화합니다. 파일명·원본 메타데이터는 저장하지 않습니다. 사진 삭제 후 profileImageUrl은 null입니다. 기존 소셜 사진을 제거할 때는 소셜 제공자의 원본을 삭제하지 않습니다.

현재 Client는 선택 후 공통 원형 크롭 미리보기에서 적용한 512×512 PNG를 전송합니다. 원형 마스크는 화면 표현이며 실제 저장 파일은 정사각형입니다. API는 Client 크롭만 신뢰하지 않고 파일을 다시 검증·재인코딩합니다.

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | 이름 입력 오류 |
| 400 | INVALID_PROFILE_IMAGE | 미지원·손상·형식 위장·과도한 해상도 또는 사진과 삭제 동시 지정 |
| 413 | PROFILE_IMAGE_TOO_LARGE | 파일·multipart 크기 제한 초과 |
| 503 | PROFILE_IMAGE_UNAVAILABLE | S3 미설정·인증·통신·파일 처리 장애 |

401·403과 DB 장애는 위의 공통 오류를 사용합니다. 저장 실패에는 Client가 이름·사진 선택을 유지합니다. S3·DB 간 확정 순서와 실패 시 객체 정리의 한계는 [Server 구현](../../server/docs/userProfile.md)을 따릅니다.

## 본인 사진 바이트 조회

`GET /api/users/me/profile-image?v=<version>`

S3 사진은 profileImageUrl에 이 상대 주소를 반환합니다. Client는 공통 인증 API의 `responseType: 'blob'`으로 읽어 메모리 Blob URL로 표시합니다. 주소에 Access Token을 넣거나 버킷을 공개하지 않습니다. 성공은 `image/png`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`입니다. 실패 본문은 JSON입니다.

`v`는 Client의 이미지 캐시 구분용이며 파일 선택 권한이 아닙니다. 서버는 항상 Bearer 계정의 현재 DB 사진을 조회합니다. 사진 연결이 없거나 S3가 NoSuchKey로 응답하면 404 PROFILE_IMAGE_NOT_FOUND입니다. S3 장애·접근 거부는 503 PROFILE_IMAGE_UNAVAILABLE이며 ListBucket 권한이 없는 실행 계정에는 없는 객체도 S3가 403으로 응답할 수 있습니다. 기존 외부 소셜 이미지 주소는 이 API를 통해 프록시하지 않습니다.

## 회원 탈퇴 사전 확인·신청

정책은 [회원 탈퇴와 복구](../domain/domainRules.md#회원-탈퇴와-복구-2026-11-08)를 따릅니다. 두 요청 모두 정상 계정의 Bearer를 요구하며 계정 ID를 입력받지 않습니다.

`GET /api/users/me/withdrawal`

```json
{
  "userId": "인증 계정 UUID",
  "canWithdraw": false,
  "managedProperties": [{ "id": "관리대상 UUID", "name": "인계할 곳" }]
}
```

현재 관리소장인 미삭제 참여만 반환합니다. 목록이 비면 canWithdraw=true이며 이 결과는 사전 안내입니다.

`POST /api/users/me/withdrawal`, JSON `{ "confirmed": true }`

confirmed 누락·false는 400 INVALID_REQUEST입니다. 서버는 대상·사용자 잠금 아래 계정과 인계를 다시 확인하고 30일 유예를 시작합니다. 성공 200은 `{ "requestedAt": "ISO 시각", "recoverableUntil": "ISO 시각" }`이며 현재 Refresh 쿠키를 만료시킵니다. 신청 전 모든 기기의 Access/Refresh 인증은 DB 인증 버전 증가로 즉시 무효화합니다. Client는 성공 후 계정 캐시를 지우고 로그인 페이지로 이동합니다.

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 409 | ACCOUNT_HANDOVER_REQUIRED | 현재 관리소장인 곳이 있어 먼저 인계 필요 |
| 409 | ACCOUNT_PARTICIPATION_CHANGED | 잠금 대기 중 참여 대상이 바뀜. 사전 조회 후 재시도 |
| 401·403 | 기존 인증·계정 오류 | 유효한 정상 계정 인증 없음 |
| 503 | AUTH_SERVICE_UNAVAILABLE | DB 등 저장소 일시 장애 |

실패 시 탈퇴 성공으로 표시하지 않습니다. 409에는 사전 정보를 다시 조회합니다.

## 계정 복구 조회·실행

`GET /api/auth/web/account-recovery`, `POST /api/auth/web/account-recovery`

탈퇴 유예 중 같은 카카오 계정의 로그인 검증을 마치면 OAuth 콜백은 10분짜리 **복구 전용** HttpOnly Refresh 쿠키를 발급하고 `/account/recovery`로 이동시킵니다. 일반 로그인 쿠키나 Bearer로 대체할 수 없습니다. 복구 전용 세션은 일반 업무 API·토큰 재발급에 사용할 수 없습니다.

GET은 허용된 Origin과 쿠키를 검증한 뒤 다음을 반환합니다.

```json
{
  "state": "PENDING",
  "displayName": "모아 사용자",
  "requestedAt": "ISO 시각",
  "recoverableUntil": "ISO 시각",
  "csrfToken": "복구 세션의 CSRF 토큰"
}
```

POST는 본문 없이 GET에서 받은 `X-CSRF-TOKEN`, 허용 Origin, 같은 쿠키를 요구합니다. 기한 직전까지만 유예를 취소하며 새 일반 로그인 쿠키로 교체하고 204를 반환합니다. Client는 이전 캐시를 비우고 `/start`를 새로 엽니다. 예전 기기의 토큰은 복구 후에도 계속 무효입니다.

DB 복구 후 쿠키 발급이 실패하면 같은 짧은 복구 증명으로 재시도할 수 있습니다. 이때 GET은 state=RESTORED, 두 시각=null을 반환하며 POST가 새 일반 세션 발급을 다시 시도합니다. 정상 복구가 완료된 일반 쿠키로 복구 API를 호출하면 403입니다.

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 401 | 기존 세션 오류 | 복구 쿠키 없음·만료·무효 |
| 403 | ACCESS_DENIED·CSRF 관련 기존 오류 | 일반 세션, Origin·CSRF 검증 거부 |
| 410 | ACCOUNT_RECOVERY_EXPIRED | 30일 기한 만료 또는 최종 삭제 |
| 503 | AUTH_SERVICE_UNAVAILABLE | DB·Redis 일시 장애. 복구 증명 유효 시 재시도 |

유예 계정으로 일반 재발급·업무 API를 호출하면 403 ACCOUNT_RECOVERY_REQUIRED 또는 기존 계정 오류입니다. 기한이 지난 계정은 정리 작업이 늦어져도 복구할 수 없습니다. 개인정보 정리의 S3 실패·재처리는 [Server 구현](../../server/docs/userProfile.md)을 참조합니다.
