import type {
  AccountGroup,
  AccountingAccountSetting
} from '../api/accountingAccountApiTypes';

export const ACCOUNT_GROUP_LABELS: Record<AccountGroup, string> = {
  ASSET: '자산',
  LIABILITY: '부채',
  OPERATING_REVENUE: '영업수익',
  OTHER_REVENUE: '영업외수익',
  OPERATING_EXPENSE: '영업비용',
  OTHER_EXPENSE: '영업외비용'
};

export function getAccountType(group: AccountGroup) {
  if (group === 'ASSET') return '자산';
  if (group === 'LIABILITY') return '부채';
  return group.endsWith('REVENUE') ? '수익' : '비용';
}

/** 확정된 기본·추가 과목 보호 규칙을 상세 버튼과 입력 잠금에서 함께 사용합니다. */
export function getAccountPermissions(account: AccountingAccountSetting, canManage: boolean) {
  return {
    editName: canManage && !account.defaultAccount,
    editClassification: canManage && !account.defaultAccount && !account.used,
    changeStatus: canManage && (!account.defaultAccount || account.group.endsWith('EXPENSE')),
    delete: canManage && !account.defaultAccount && !account.used
  };
}

export function acceptsAccountCode(group: AccountGroup, code: string) {
  if (group === 'ASSET') return /^1\d{2}$/.test(code);
  if (group === 'LIABILITY') return /^2\d{2}$/.test(code);
  if (group === 'OTHER_REVENUE') return /^[49]\d{2}$/.test(code);
  return group.endsWith('REVENUE') ? /^4\d{2}$/.test(code) : /^8\d{2}$/.test(code);
}
