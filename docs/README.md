# 공통 문서

프로젝트 공통 문서를 다섯 가지 큰 주제로 나눕니다. 화면·브라우저 처리는 [Client 문서](../client/docs/), 저장·트랜잭션·동시성은 [Server 문서](../server/docs/)에서 관리합니다.

| 폴더 | 내용 |
| --- | --- |
| [domain](domain/) | 프로젝트 개요·업무 규칙·ERD |
| [api](api/) | Client·Server 공통 요청·응답·오류 계약 |
| [development](development/) | 개발 환경·인증·보안 |
| [operations](operations/) | 운영·배포·서버 이관 |
| [plans](plans/) | 기능 기획·검토안 |

## 도메인

- [프로젝트 개요와 현재 구현 상태](domain/projectOverview.md)
- [도메인 규칙](domain/domainRules.md)
- [ERD](domain/erd.md)

## API

- [본인 프로필 조회·이름·사진 변경과 삭제](api/userProfileApi.md)
- [관리대상 등록](api/propertyRegistrationApi.md) · [관리 영역 접근](api/managementAccessApi.md)
- [세대 관리](api/unitManagementApi.md) · [주민 관리](api/residentManagementApi.md) · [참여자·가입](api/memberManagementApi.md)
- [관리비 부과](api/billingApi.md) · [수납](api/paymentApi.md) · [손익계산서](api/incomeStatementApi.md) · [계정별 원장](api/accountLedgerApi.md) · [계정과목 설정](api/accountingAccountsApi.md) · [미지급 비용·지급 연결](api/payableApi.md)
- [통장 관리](api/bankingManagement.md) · [월별 정산](api/monthlySettlementApi.md) · [대시보드](api/dashboardApi.md)
- [시스템 관리 API](api/systemAdministration.md)

## 개발·보안

- [개발 환경](development/developmentGuide.md)
- [JWT 인증·보안](development/securityDesign.md)

## 운영·배포

- [운영 배포 순서·Migration 점검·장애 대응 규칙](operations/deploymentRules.md)
- [배포 계획과 진행 상태](operations/deploymentPlan.md)
- [서버 이관 계획](operations/ec2MigrationPlan.md)
- [Server 배포 실행·검증](../server/docs/deploymentGuide.md)

## 기획

- [관리대상 생성 권한과 시스템 관리 개발 계획](plans/systemAdministration.md)
- [관리비 부과 변경 기획](plans/billingSettings.md)
- [건물별 공지·주민 안내 기획](plans/residentCommunication.md) · [공지사항 화면·편집기 우선 기획](plans/residentCommunication.md#공지사항-우선-기획)
- [초기 설정 주민 명부·전화번호 동의 구현 범위](plans/residentRegistrationSetup.md)
- [회계·정산과 손익계산서 확정 범위·개발 계획](plans/accountingSettlement.md)
- [기본 계정 코드·통장 입출금 연결 설계](plans/accountingSettlement.md#31-기본-계정-코드)
- [Client 손익계산서 화면·원천 상세·다운로드](../client/docs/incomeStatement.md)
