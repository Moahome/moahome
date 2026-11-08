# 시스템 관리 API

상태: 2026-11-03 구현, 운영 미배포. [권한 정책](../domain/domainRules.md#플랫폼-권한과-관리대상-권한), [저장 구조](../domain/erd.md#시스템-관리-권한과-변경-이력-2026-11-03)를 따릅니다.

인증된 정상 계정의 **현재 DB 시스템 역할이 ADMIN**인 경우에만 사용할 수 있습니다. 생성 권한을 받은 일반 회원이나 관리대상의 ADMIN / MANAGER 역할만으로는 접근할 수 없습니다. 모든 응답은 `Cache-Control: no-store`입니다. 시스템 관리자 권한은 관리대상 생성 권한이나 개별 관리대상의 자료 접근권한을 자동으로 부여하지 않습니다.

| Method | 경로 | 요청·응답 |
| --- | --- | --- |
| GET | `/api/system-admin/users` | `query` 닉네임 부분 일치 또는 전체 계정 UUID, `administrators` 기본 false, `page` 기본 1, `size` 기본 20·최대 100. `{users,page,pageSize,total,pageCount}` |
| GET | `/api/system-admin/users/{userId}` | 회원 상세 |
| POST | `/api/system-admin/users/{userId}/creation-permission` | `{requestId,allowed,expectedAllowed}` → 현재 회원 상세 |
| POST | `/api/system-admin/users/{userId}/promotion` | `{requestId}` → 현재 회원 상세 |

회원 상세는 `{id,displayName,status,systemRole,canCreateProperty,createdAt}`입니다. `status`는 ACTIVE / SUSPENDED / WITHDRAWAL_PENDING / WITHDRAWN, `systemRole`은 USER / ADMIN이며 삭제된 계정은 목록·상세에서 제외합니다. 2026-11-08 추가한 탈퇴 유예 계정은 조회에 포함하며 변경 대상은 정상 계정만 허용합니다. 회원 목록은 가입 시각 내림차순·ID 오름차순입니다. 소셜 식별자·연락처·계좌 정보는 반환하지 않습니다.

`requestId`는 변경 시 생성한 UUID입니다. 같은 처리자·대상·동작·요청 값으로 재전송하면 이미 완료한 변경을 다시 적용하지 않고 현재 회원 정보를 반환합니다. 생성 권한의 같은 요청은 최초 `expectedAllowed`도 같아야 합니다. 이후 다른 요청으로 회수한 권한을 과거 요청 재시도로 다시 열지 않습니다. 다른 내용의 UUID 재사용은 `409 / ADMIN_REQUEST_CONFLICT`, 조회 당시의 생성 권한과 다르면 `409 / ADMIN_STATE_CONFLICT`입니다. 관리자 승격은 생성 권한을 유지하며 관리자 역할 해제 API는 제공하지 않습니다.

오류는 `{code,message}`입니다. 미인증은 401, 시스템 역할 부족은 `403 / ACCESS_DENIED`, 계정 이용 불가는 `403 / ACCOUNT_UNAVAILABLE`, 없는 대상은 `404 / ADMIN_USER_NOT_FOUND`, 잘못된 입력은 `400 / INVALID_ADMIN_REQUEST`, 저장 장애는 `503 / ADMIN_SERVICE_UNAVAILABLE`입니다. 권한 변경과 감사 기록은 같은 트랜잭션으로 처리합니다.

`GET /api/users/me`에 boolean `canCreateProperty`를 추가합니다. 서버는 시스템 역할과 독립적으로 반환합니다. 새 관리대상의 기본 정보 검증·은행 양식 지원 조회·파일 미리보기·최종 저장에서 현재 생성 허용 여부를 검사하며 미허용은 `403 / PROPERTY_CREATION_NOT_ALLOWED`입니다. 성공한 기존 등록 요청의 결과 조회·동일 본문 재시도는 현재 관리대상 접근권한으로 처리합니다. [등록 API](propertyRegistrationApi.md)를 참조합니다.
