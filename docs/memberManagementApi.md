# 참여자 역할·초대 관리 API

상태: 2026-10-17 구현. 정책은 [도메인 규칙](domainRules.md#확정-정책-주민-역할관리소장-인계와-초대-2026-10-17), 저장 구조는 [ERD](erd.md#56-property_members), 화면은 [Client 설계](../client/docs/memberManagement.md), 트랜잭션은 [Server 설계](../server/docs/memberManagement.md)를 기준으로 합니다.

## 공통 계약

대상별 경로는 `/api/properties/{propertyId}/members`입니다. Bearer 인증과 현재 정상 계정·활성 관리대상의 관리소장 권한을 매 요청 확인합니다. 금지된 대상은 403이며 UUID 오류는 400입니다. 모든 응답은 `Cache-Control: no-store`입니다. 역할은 ADMIN / MANAGER / RESIDENT입니다.

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

인계는 대상 잠금 아래 기존 관리소장을 MANAGER로 먼저 flush한 뒤 대상 참여자를 ADMIN으로 변경합니다. 둘 중 하나라도 실패하면 전체를 롤백합니다. 인계 후 기존 관리소장의 관리자 관리·주민 목록·입금 관리 요청은 403이며 현재 권한으로 다시 진입합니다.

초대 승인·철회는 revision으로 오래된 상태를 거부합니다. 승인된 초대의 같은 승인 재요청과 철회된 초대의 같은 철회 재요청은 중복 변경하지 않습니다. 주민은 초대코드 없이 별도 가입 요청으로 연결합니다. 다른 주민과 이미 연결된 계정, 다른 계정과 연결된 주민, 활성 역할 충돌은 덮어쓰지 않습니다.

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

주민 상세에서는 초대코드를 만들지 않습니다. `/api/properties/{propertyId}/membership-requests`에서 주민 가입을 처리합니다.

| Method | 경로 | 권한·요청 | 결과 |
| --- | --- | --- | --- |
| GET | `/options` | 정상 로그인 계정 | propertyId/propertyName과 세대 ID·표시명만 반환, 주민 정보 없음 |
| POST | 기본 경로 | 정상 로그인 계정, `{unitId,phone}` | `{id,status:PENDING}`, 접근권한 생성 없음 |
| GET | 기본 경로 | 현재 ADMIN / MANAGER | 신청·해당 세대 명부 후보 목록 |
| POST | `/{requestId}/approve` | ADMIN / MANAGER, `{residentId,expectedUpdatedAt}` | 명부 연결·RESIDENT 참여·승인 이력·역할 이벤트 저장 후 목록 |
| POST | `/{requestId}/reject` | ADMIN / MANAGER, `{expectedUpdatedAt}` | 거절 이력 보존 후 목록 |

신청에는 실명·세대 관계를 입력받지 않고 관리자가 명부의 현재 세대 주민을 선택합니다. 동일 계정·세대의 대기 재신청은 기존 요청을 반환합니다. 다른 계정과 연결된 명부·다른 주민에 연결된 계정·기존 관리자 역할과의 충돌은 자동 병합하지 않습니다. 신청 목록에는 계정 표시명·세대·연락처 끝 4자리·신청 시각·상태와 해당 세대 주민 후보만 제공합니다. 부담당자의 승인 권한은 전체 주민 명부 조회권한을 의미하지 않습니다.

주민 수정 API의 선택 필드 `serviceRole`·`expectedServiceRole`을 함께 보내면 일반 주민 정보와 역할을 같은 트랜잭션에서 변경합니다. 둘 다 생략하면 기존 수정과 같습니다. ADMIN 변경은 전용 인계만 허용합니다.

## 기존 관리소장 본인 계정 연결

`PUT /api/properties/{propertyId}/members/me/resident`는 현재 정상 로그인 관리소장 본인만 연결한다. 본문의 주민 ID와 화면에서 선택한 현재 세대 ID는 필수 UUID이며 계정 ID·역할 등 계약 밖 필드는 400으로 거부한다. 주민·세대는 같은 대상의 미삭제 현재 관계여야 한다. 다른 계정에 연결된 주민, 다른 주민에 연결된 계정, 확인 후 바뀐 세대와 활성 역할 충돌은 409로 거부한다.

성공은 204·Cache-Control: no-store이다. 기존 ADMIN 참여와 대표 여부·주민 구분·이름·연락처는 변경하지 않는다. 가입 신청·새 참여·역할 변경 이력도 생성하지 않는다. 계정 연결과 resident_account_links의 출처 기록은 단일 트랜잭션이며 후반 기록 실패 시 연결도 롤백한다. 같은 본인·주민·현재 세대 관계의 재요청은 같은 성공을 반환하며 이력을 중복 생성하지 않는다. 새 현재 관계는 별도 명시적 연결이 필요하다.

저장 후 목록을 다시 조회하면 현재 참여와 연결 출처가 일치하는 주민에 serviceRole=ADMIN, signupStatus=APPROVED가 표시된다. 기존 대상 전체를 이름·전화번호로 자동 연결하거나 기존 주민을 소급 생성하지 않는다. 주민이 아직 없다면 기존 주민 등록으로 명부를 준비한 뒤 본인을 명시적으로 선택한다.
