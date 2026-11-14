# 주민 공지 접근 처리

정책과 요청·응답·재시도는 [공지사항 API](../../docs/api/noticeApi.md#주민-공개와-건물-링크-관리), 테이블은 [ERD](../../docs/domain/erd.md#02-현재-전화번호-정책)를 따릅니다. 이 문서는 서버 내부의 저장·잠금·키 처리를 설명합니다.

ResidentNoticeService는 기존 공지 Repository·파일 저장소와 ManagementAccessService를 재사용합니다. 링크 발급·회수는 기존 공지의 관리대상 advisory lock을 획득한 후 현재 관리 권한을 다시 검증합니다. 활성 링크는 PostgreSQL 부분 UNIQUE 인덱스로 보호하며 DB 업무 변경은 동일 트랜잭션에 커밋합니다. 회수된 발급 ID를 새 발급에 재사용하지 않습니다.

NoticeLinkTokens는 링크 UUID와 SecureRandom 난수, 공지 전용 도메인 문자열 `moahome:notice-access:v1:`을 기존 계좌 보안 HMAC 키에 결합합니다. DB에는 난수와 발급 토큰의 SHA-256만 저장합니다. 토큰·세션 원문이나 개인정보는 로그에 남기지 않습니다. 별도 환경 변수를 추가하지 않으며 기존 `ACCOUNT_HMAC_KEY_BASE64` 설정이 발급·다시 복사에 필요합니다. 다른 도메인의 HMAC 결과와 호환되지 않습니다.

링크 검증은 발급 당시 해시를 상수 시간 비교합니다. 따라서 HMAC 키를 교체해도 전달된 링크를 자동 회수하지 않습니다. 키 교체 뒤 재구성한 값이 해시와 다르면 관리자 응답에 token=null을 반환해 복사를 차단하고 회수·재발급을 안내합니다. 다른 토큰으로 기존 링크를 조용히 교체하지 않습니다. 키 유출 사고에는 키 교체와 별도로 활성 링크 회수를 수행해야 합니다.

교환 성공 시 별도 SecureRandom 세션을 만들고 `moahome:notice-access:session:{SHA-256(session)}` Redis 키에 링크 UUID를 계약의 TTL로 저장합니다. Redis 쓰기가 실패하면 쿠키를 반환하지 않습니다. 응답 유실 후 재교환으로 임시 세션이 더 생길 수 있으나 읽기 권한만 보유하고 만료 시 제거됩니다. 업무 데이터나 조회수의 중복 반영은 없습니다. 영속 링크·공개 상태의 원본은 PostgreSQL입니다.

모든 읽기는 Redis 세션 → PostgreSQL의 활성 링크·미삭제 건물 → 같은 건물의 미삭제 공지 순으로 확인합니다. 파일은 메타데이터의 관리대상·연결 공지와 현재 JSON의 이미지·첨부 참조를 확인한 뒤 기존 NoticeAssetStorage(공통 S3Storage 어댑터)를 호출합니다. 공지 삭제·링크 회수와 이미 진행 중인 요청의 응답은 원자적으로 취소하지 않습니다. 이후 시작한 요청을 차단하며 이미 수신한 자료의 원격 삭제를 보장하지 않습니다.

SecurityConfig는 주민 GET 경로와 세션 교환 POST만 기존 Bearer 요구에서 제외합니다. 주민 세션은 관리자 Principal을 만들지 않습니다. 교환 POST는 JSON과 기존 WebAuthSupport의 명시적 Origin 허용 목록을 검증합니다. OpenAPI도 주민 쿠키와 관리자 Bearer를 별도 인증 수단으로 표현합니다. 엣지별 요청 제한·이상 접근 탐지는 이번 구현 범위가 아닙니다.

ResidentNoticePersistenceTest는 격리된 실제 PostgreSQL·Redis로 기존 스키마 업그레이드·글별 공개 구분 제거·기존·신규 공지 열람·동시 발급·재시도·롤백·건물 범위·파일 제거·만료·회수를 확인합니다. SecurityIntegrationTest는 Origin·쿠키 속성·관리자 API 차단을 검증합니다. 전체 Migration의 빈 DB 검증은 기존 영속성 검사와 함께 수행합니다. 운영 Migration 적용은 배포 점검에서 별도로 확인해야 합니다.

글별 공개 설정은 후속 사용자 정정으로 제거했습니다. `V20261114045931__remove_notice_publication_setting.sql`은 이미 적용된 이전 Migration을 수정하지 않고 공개 컬럼·인덱스를 제거합니다. 목록·상세·파일은 같은 건물·미삭제·현재 파일 참조만 검증합니다.
