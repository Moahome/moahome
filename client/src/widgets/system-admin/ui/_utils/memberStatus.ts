import type { SystemMember } from '../../api/systemAdminApiTypes';

/** 유예 중인 계정도 목록을 조회할 수 있도록 계정 상태별 표시를 공유합니다. */
export function getMemberStatusLabel(status: SystemMember['status']): string {
  return {
    ACTIVE: '정상',
    SUSPENDED: '이용 제한',
    WITHDRAWAL_PENDING: '탈퇴 유예',
    WITHDRAWN: '탈퇴'
  }[status];
}
