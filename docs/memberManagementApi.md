# 참여자 역할·초대 관리 API

2026-10-25 상태: 기존 절은 이전 전 계약을 설명합니다. [Redis 이전 변경 계약](#redis-이전의-변경-계약-2026-10-25)은 새 확정 요구사항과 작업 중인 코드의 방향이며, 검증·배포 완료를 의미하지 않습니다. 기한·저장소·restore의 충돌은 후속 변경 계약을 우선합니다.

기준일: 2026-10-24. 아래 경로·본문·응답은 현재 구현된 계약입니다. [전체 공유·개인 지정 주민 초대 정책](domainRules.md#주민-참여-흐름)을 코드·링크 전달과 이름 필수·연락처 선택 가입에 반영했습니다. 외부 부담당자 초대와 역할·인계의 기존 동작은 유지합니다. 저장 구조는 [ERD](erd.md#56-property_members), 화면은 [Client 설계](../client/docs/memberManagement.md), 트랜잭션은 [Server 설계](../server/docs/memberManagement.md)를 기준으로 합니다.

## 공통 계약

대상별 경로는 `/api/properties/{propertyId}/members`입니다. Bearer 인증과 현재 정상 계정·활성 관리대상의 관리자 권한을 매 요청 확인합니다. 관리자 승격·외부 관리자 초대 승인·관리소장 인계는 별도로 ADMIN을 요구합니다. 금지된 대상은 403이며 UUID 오류는 400입니다. 모든 응답은 `Cache-Control: no-store`입니다. 역할은 ADMIN / MANAGER / RESIDENT입니다.

| Method | 경로 | 요청 | 결과 |
| --- | --- | --- | --- |
| GET | 대상별 기본 경로 | 없음 | 참여자·초대 목록 |
| PUT | `/me/resident` | `{residentId,expectedUnitId}` | 본인 명부 연결·204 |
| PUT | `/{memberId}/role` | `{role,expectedRole}` | 최신 목록 |
| PUT | `/residents/{residentId}/role` | `{role,expectedRole}` | 204 |
| POST | `/{memberId}/transfer` | `{role:"ADMIN",expectedRole}` | 204 |
| DELETE | `/{memberId}` | 없음 | 미거주 부담당자의 참여 종료·최신 목록 |
| POST | `/invitations` | `{residentId:null}` (외부 부담당자 전용) | 최초 초대코드 |
| POST | `/invitations/{id}/approve` | `{revision}` | 승인 후 최신 목록 |
| POST | `/invitations/{id}/revoke` | `{revision}` | 철회 후 최신 목록 |

초대 신청은 대상별 관리자 API와 분리한 `POST /api/member-invitations/request`에 `{code}`를 보냅니다. 정상 로그인 계정만 신청하며 응답은 `{propertyName,status:"REQUESTED"}`입니다. 신청만으로 접근권한을 부여하지 않습니다. 코드 원문은 URL·로그·저장소에 보관하지 않습니다.

## 응답

목록은 `{propertyId,members,invitations}`입니다.

- Member: `{memberId,name,residentId,role}`. name은 연결된 현재 주민 이름 또는 계정 표시명입니다. 외부 관리자의 residentId는 null이며 주민 명부를 생성하지 않습니다.
- Invitation: `{id,revision,status,role,residentId,residentName,requesterName,expiresAt}`. status는 ISSUED / REQUESTED / APPROVED / REVOKED / EXPIRED입니다. requesterName은 신청 계정의 표시명이며 실명 확인을 의미하지 않습니다.
- 발급 응답: `{id,code,expiresAt}`. 코드는 무작위 32자리 URL 안전 문자열이며 발급 후 1일 동안 유효합니다. 목록으로 코드 원문을 다시 조회할 수 없습니다.

주민 목록·상세의 `serviceRole`은 현재 연결 계정의 역할 또는 null입니다. 기존 서로 다른 활성 역할이 충돌하면 `CONFLICT`를 표시하며 임의로 하나를 선택하지 않습니다. 주민 구분·대표·가입 상태와 별도 필드입니다.

## 역할 변경·인계

역할 변경은 예상 역할과 현재 역할이 일치해야 하며 일반 변경에서 ADMIN을 지정·해제하지 않습니다. 주민 상세에서는 계정 연결·가입 승인을 검증합니다. 미거주 부담당자는 주민 역할 대신 접근 종료를 사용합니다.

인계는 대상 잠금 아래 기존 관리소장을 MANAGER로 먼저 flush한 뒤 대상 참여자를 ADMIN으로 변경합니다. 둘 중 하나라도 실패하면 전체를 롤백합니다. 인계 후 기존 관리소장은 MANAGER로 일반 관리 업무를 계속 사용하며, 관리자 승격·외부 관리자 초대 승인·다시 인계하는 요청은 403으로 거부합니다.

외부 부담당자 초대 승인·철회는 revision으로 오래된 상태를 거부합니다. 승인된 초대의 같은 승인 재요청과 철회된 초대의 같은 철회 재요청은 중복 변경하지 않습니다. 주민 초대는 아래 별도 API를 사용하며 외부 초대 API에 주민 ID를 보내 사용할 수 없습니다. 다른 주민과 이미 연결된 계정, 다른 계정과 연결된 주민, 활성 역할 충돌은 덮어쓰지 않습니다.

## 오류

공통 형식은 `{code,message}`이며 입력 원문·SQL·개인정보·코드를 포함하지 않습니다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | 잘못된 UUID·역할·본문 |
| 409 | INVALID_INVITATION | 만료·사용 중·철회된 코드 또는 유효하지 않은 신청 |
| 409 | MEMBER_ACCOUNT_REQUIRED | 계정 연결·승인이 필요 |
| 409 | MEMBER_ROLE_CONFLICT | 예상 역할·신청 버전 불일치, 자기 역할 변경, 관리소장 일반 변경 또는 기존 연결 충돌 |
| 409 | MEMBER_RESIDENT_REQUIRED | 현재 주민·세대 연결이 필요 |
| 404 | MEMBER_NOT_FOUND | 다른 대상·없는 참여자·초대 |
| 403 | ACCESS_DENIED / ACCOUNT_UNAVAILABLE | 현재 권한·계정 거부 |
| 409 / 503 | PAYMENT_CONFLICT / PAYMENT_SERVICE_UNAVAILABLE | 기존 공통 업무 오류 처리기의 DB 충돌·장애 코드 재사용 |

주민용 홈·대량 초대·권한 복구는 후속 범위입니다.


## 주민 가입 요청

현재 `/api/properties/{propertyId}/membership-requests`에서 유효한 공통 초대코드·필수 이름·실제 세대·선택 연락처로 신청합니다. 연락처 생략·null·빈 입력은 연락처 없음으로 처리합니다.

| Method | 경로 | 권한·요청 | 결과 |
| --- | --- | --- | --- |
| POST | `/options` | 정상 로그인 계정, `{token:공통코드}` | propertyId/propertyName과 세대 ID·표시명만 반환, 주민 정보 없음 |
| GET | `/unlinked-residents` | 현재 ADMIN / MANAGER | 계정 미연결 주민 전원의 가입 업무용 최소 목록 |
| POST | 기본 경로 | 정상 로그인 계정, `{unitId,name,phone,code}` | `{id,status:PENDING}`, 접근권한 생성 없음 |
| GET | 기본 경로 | 현재 ADMIN / MANAGER | 신청·해당 세대 명부 후보 목록 |
| POST | `/{requestId}/approve` | ADMIN / MANAGER, `{residentId,expectedUpdatedAt}` | 명부 연결·RESIDENT 참여·승인 이력·역할 이벤트 저장 후 목록 |
| POST | `/{requestId}/reject` | ADMIN / MANAGER, `{expectedUpdatedAt}` | 거절 이력 보존 후 목록 |

신청 이름은 필수이고 세대 관계 유형은 입력받지 않습니다. 관리자가 명부의 현재 세대 주민을 선택합니다. 동일 계정·세대의 대기 재신청은 기존 요청을 반환합니다. 다른 계정과 연결된 명부·다른 주민에 연결된 계정·기존 관리자 역할과의 충돌은 자동 병합하지 않습니다. 신청 목록에는 계정 표시명 `requesterName`과 신청 이름 `applicantName`을 구분하고 세대·선택 연락처 끝 네 자리·시각·상태·주민 후보를 제공합니다. 과거 이름 없는 신청과 연락처 미등록은 null입니다. 관리소장과 부담당자는 같은 주민 명부 업무 권한을 사용합니다.

주민 수정 API의 선택 필드 `serviceRole`·`expectedServiceRole`을 함께 보내면 일반 주민 정보와 역할을 같은 트랜잭션에서 변경합니다. 둘 다 생략하면 기존 수정과 같습니다. ADMIN 변경은 전용 인계만 허용합니다.

### 가입 요청 대상 미연결 주민 조회

`GET /api/properties/{propertyId}/membership-requests/unlinked-residents`는 Bearer 인증·현재 정상 계정·활성 관리대상·ADMIN 또는 MANAGER 참여를 확인하고 `Cache-Control: no-store`로 응답합니다.

응답은 `{propertyId,residents}`이며 각 행은 `{residentId,name,phoneLast4,buildingName,unitNumber,relationType}`입니다. 전화번호는 끝 네 자리 또는 null, 동·현재 세대·주민 구분이 없으면 해당 값은 null입니다. 원문·암호문·HMAC·계정 ID는 조회·반환하지 않습니다.

조회는 같은 관리대상의 미삭제 주민 중 실제 `user_id IS NULL`인 전원을 이름·ID 순으로 반환합니다. 현재 세대가 없거나 삭제됐어도 행을 제외하지 않습니다. `NOT_JOINED`는 미연결과 다르며 이름·전화번호가 같은 신청자를 추측해 연결하지 않습니다. 서버 검색·페이지 파라미터는 없고 Client에서 공용 동·호수 숫자순 정렬을 적용하고 검색·필터링한 뒤 페이지로 나눕니다. 같은 세대는 이름·ID 순이고 소속 없는 주민은 마지막입니다.

이 API는 가입 요청 화면용 조회입니다. 부관리자도 일반 명부·연락처 조회·수정 API를 사용할 수 있습니다. 실제 신청과 승인·거절은 기존 기본 경로의 계약을 유지하고 승인 관리 화면에서 사용합니다.

## 기존 관리소장 본인 계정 연결

`PUT /api/properties/{propertyId}/members/me/resident`는 현재 정상 로그인 관리자(ADMIN / MANAGER) 본인만 연결한다. 본문의 주민 ID와 화면에서 선택한 현재 세대 ID는 필수 UUID이며 계정 ID·역할 등 계약 밖 필드는 400으로 거부한다. 주민·세대는 같은 대상의 미삭제 현재 관계여야 한다. 다른 계정에 연결된 주민, 다른 주민에 연결된 계정, 확인 후 바뀐 세대와 활성 역할 충돌은 409로 거부한다.

성공은 204·Cache-Control: no-store이다. 기존 ADMIN / MANAGER 참여와 대표 여부·주민 구분·이름·연락처는 변경하지 않는다. 가입 신청·새 참여·역할 변경 이력도 생성하지 않는다. 계정 연결과 resident_account_links의 출처 기록은 단일 트랜잭션이며 후반 기록 실패 시 연결도 롤백한다. 같은 본인·주민·현재 세대 관계의 재요청은 같은 성공을 반환하며 이력을 중복 생성하지 않는다. 새 현재 관계는 별도 명시적 연결이 필요하다.

저장 후 목록을 다시 조회하면 현재 참여와 연결 출처가 일치하는 주민에 `serviceRole`은 현재 `ADMIN` 또는 `MANAGER`, `signupStatus`는 `APPROVED`가 표시된다. 기존 대상 전체를 이름·전화번호로 자동 연결하거나 기존 주민을 소급 생성하지 않는다. 주민이 아직 없다면 기존 주민 등록으로 명부를 준비한 뒤 본인을 명시적으로 선택한다.

## 주민 초대 발급과 전달

모두 Bearer 인증과 `Cache-Control: no-store`를 사용합니다. 관리 경로의 기본 주소는 `/api/properties/{propertyId}/resident-invitations`입니다.

| Method | 경로 | 요청·권한 | 결과 |
| --- | --- | --- | --- |
| GET | 기본 경로 | ADMIN / MANAGER | `{propertyId,invitations}` |
| POST | `/shared-code` | ADMIN / MANAGER | 공통 코드 발급·재발급 |
| DELETE | `/shared-code` | ADMIN / MANAGER | 현재 공통 코드 폐기 |
| POST | `/residents/{residentId}` | ADMIN / MANAGER·현재 미연결 주민·유효 세대 | 개인 코드 발급·재발급 |
| POST | `/{id}/share` | ADMIN / MANAGER·미사용·유효 초대 | 같은 개인 코드·링크 다시 전달 |
| POST | `/{id}/restore` | ADMIN / MANAGER·`{token}`·현재 초대와 일치 | 과거 개인 초대 원문 보호 저장 |
| POST | `/{id}/revoke` | ADMIN / MANAGER·`{revision}` | 미완료 개인 초대 철회 |
| POST | `/{id}/approve` | ADMIN / MANAGER·`{revision}` | 정정 내용 반영·가입 승인 |
| POST | `/{id}/reject` | ADMIN / MANAGER·`{revision}` | 정정 거절 |

발급 응답은 `{id,token,expiresAt}`입니다. token은 표시용 코드이며 공통 `B-XXXX-XXXX-XXXX`, 개인 `R-XXXX-XXXX-XXXX` 형식입니다. 혼동하는 문자를 제외한 60비트 난수를 사용하고 서버는 대소문자와 구분자를 정규화해 SHA-256 해시로 검증합니다. 공통 코드는 해시만 저장하고, 개인 코드는 재전달용 암호문을 함께 보호 저장합니다. 목록에는 원문·암호문을 반환하지 않습니다. 재발급은 미사용 이전 코드를 철회하고 새 24시간 코드를 발급합니다. 정정 검토 중에는 재발급으로 요청을 지우지 않고 충돌을 반환합니다.

`POST /{id}/share`는 요청 본문 없이 같은 `{id,token,expiresAt}`을 반환합니다. 현재 관리자 권한·명부 버전·관계·미사용 상태·만료를 다시 확인하고, 코드·최초 만료 시각·revision을 변경하지 않습니다. 암호문을 보관하지 않았던 기존 초대는 `token:null`로 반환하며 기존 링크를 자동 폐기하지 않습니다. 사용자가 보관한 원문을 `POST /{id}/restore`에 `{token}`으로 보내면 기존 해시와 대조해 암호문을 복원합니다. 다른 코드·다른 대상·만료·사용된 초대는 거부합니다. 초대 ID·코드·발급/만료 시각은 유지하며 재발급이나 권한 부여를 하지 않습니다. 원문이 없는 경우에는 자동 재발급하지 않습니다. 수락·정정 제출·철회 이후에는 다시 전달할 수 없습니다.

목록 행은 `{id,residentId,name,unitLabel,phoneLast4,status,revision,expiresAt,requestedName,requestedPhoneLast4,phoneAction}`입니다. 상태는 ISSUED / EXPIRED / CHANGE_REQUESTED / APPROVED / REVOKED / REJECTED입니다. 연락처 원문을 응답하지 않습니다. 승인된 초대의 철회로 이미 부여한 권한을 제거하지 않습니다.

### 주민 코드 확인과 가입

| Method | 경로 | 요청 | 결과 |
| --- | --- | --- | --- |
| POST | `/api/resident-invitations/shared-options` | `{token:공통코드}` | `{propertyId,propertyName,units}` |
| POST | `/api/resident-invitations/preview` | `{token:개인코드}` | `{propertyName,name,unitLabel,phoneLast4,status,expiresAt,revision}` |
| POST | `/api/resident-invitations/accept` | `{token,correction:false}` | `{status:APPROVED}` |
| POST | 같은 accept 경로 | `{token,correction:true,name,phoneAction,phone?}` | `{status:CHANGE_REQUESTED}` |

phoneAction은 KEEP / SET / REMOVE입니다. SET일 때만 phone을 필수로 받고 보호 저장합니다. 일반 확인 수락에는 정정 입력을 보내지 않습니다. 개인 코드 사용은 한 계정만 가능하며 같은 계정의 완료 재시도는 기존 결과를 반환합니다. 다른 계정 재사용·연결 충돌·발급 뒤 명부 변경·24시간 만료를 거부합니다. 만료 전 접수한 정정 요청은 만료 후에도 검토할 수 있습니다.

가입 링크는 같은 코드의 fragment를 사용합니다. HTTP 요청 URL·쿼리·Referrer에 원문을 보내지 않으며 Client가 코드를 자동 검증해 공통 가입 폼 또는 개인 정보 확인으로 바로 연결합니다. 코드를 직접 전달받았을 때만 코드 입력 화면을 사용합니다. 메시지 공유는 기기 공유·문장 복사이며 문자·알림톡 자동 발송 API는 이번 범위에 없습니다.

주민 역할 변경은 ADMIN / MANAGER가 요청할 수 있으나 RESIDENT → MANAGER 승격은 ADMIN만 가능합니다. MANAGER의 동일 요청은 403이며 명부·참여·이벤트를 변경하지 않습니다.

## Redis 이전의 변경 계약 (2026-10-25)

기존 URL·요청 DTO·성공 필드는 유지하는 설계입니다. 정책은 [도메인 규칙](domainRules.md#초대-인증서비스-복귀역할-변경의-후속-확정-방향-2026-10-25)을 참조하며 기간 표를 중복 정의하지 않습니다. Server의 Redis 이전은 앞선 구현 요청으로 작업 중이고, 아래 오류·호환성 검증까지 완료한 API 배포로 보지 않습니다.

| 기존 API | 변경할 의미 |
| --- | --- |
| 주민 공통 발급·shared-options·최종 가입 신청 | Redis 생성·존재·대상·해시·기한 검증 필수. 여러 주민 신청 후에도 키 유지 |
| 개인 발급·share | DB 출처와 Redis 암호문 함께 검증. 같은 코드·최초 expiresAt 유지. 새로 열어도 기한 미연장 |
| 개인 restore | 기존 `{token}` 요청 경로는 호환용 유지. 현재 Redis 검증값과 일치할 때만 같은 코드 재전달. Redis 유실·철회·만료를 DB 해시로 복원 금지 |
| 개인 preview·accept | 미사용이면 Redis 필수. 동일 수락 계정의 APPROVED/CHANGE_REQUESTED 완료 재시도는 DB 결과로 확인 가능 |
| 개인 수락·정정 제출 | DB 업무 저장과 사용 상태 커밋 뒤 키 삭제. 코드와 fragment 링크 모두 추가 사용 종료 |
| 외부 `/api/member-invitations/request` | 신규 신청은 Redis 필수. REQUESTED 커밋 후 키 삭제. 같은 계정 재시도는 기존 `{propertyName,status:"REQUESTED"}` |
| 외부 초대 목록·approve | 접수된 REQUESTED를 코드 만료로 EXPIRED 처리하지 않음. 기한 내 접수한 요청은 코드 없이 이후 검토 가능 |
| 공유/개인/외부 철회·재발급 | DB 철회 확정 후 이전 키 삭제. 키 삭제 실패여도 DB 상태로 재사용 차단 |

이전 전 share의 `token:null`·DB 암호문 복구 흐름은 변경됩니다. 새 발급 개인 초대의 유효 Redis 암호문을 찾지 못하면 성공처럼 null을 주지 않고 재발급을 안내합니다. 기존 미사용 DB 전용 코드는 배포 전환에서 철회하며 과거 접수·완료 결과는 유지합니다.

| HTTP | code | Client 처리 |
| --- | --- | --- |
| 400 | INVALID_INVITATION | 미사용 Redis 검증값 없음·만료·철회·소진·대상 불일치. 새 초대 요청 안내 |
| 503 | INVITATION_SERVICE_UNAVAILABLE | Redis 연결/명령 장애. 현재 입력 유지·재시도. 만료로 단정하지 않음 |
| 기존 상태 | 기존 계정·연결 충돌·명부 변경 오류 | 기존 업무 계약 유지 |

이전 오류 표의 INVALID_INVITATION 409는 실제 `PaymentExceptionHandler`의 `INVALID_` 접두사 처리인 400과 달랐으므로 실제 계약과 맞춥니다. 503 추가는 작업 중인 변경입니다. 모든 응답은 no-store이며 토큰·암호문·SQL·개인정보를 오류에 포함하지 않습니다. DB 커밋 후 Redis 삭제 실패를 가입 실패 503으로 바꾸지 않습니다. 실패 유형과 영구 상태를 구분한 재시도는 [Server 정합성 설계](../server/docs/memberManagement.md#db와-redis의-확정-순서)를 따릅니다.
