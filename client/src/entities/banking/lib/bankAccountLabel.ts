import type { BankAccountLabelSource } from '../model/bankAccountTypes';

/** 모든 화면에서 통장 이름을 우선하고 이름이 없으면 은행명·끝 네 자리만 표시합니다. */
export function getBankAccountLabel(account?: BankAccountLabelSource): string {
  if (!account) return '통장 미확인';

  const alias = account.alias?.trim();
  if (alias) return alias;

  const last4 = account.last4 ?? account.accountNumber?.replace(/[ -]/g, '').slice(-4);
  if (account.bankName && last4) return `${account.bankName} ${last4}`;

  // 은행·별칭이 분리되지 않은 기존 API 라벨도 같은 표시 규칙으로 읽으며 원본 응답은 변경하지 않습니다.
  const label = account.label?.trim() ?? '';
  const legacy = label.match(/^(.*?)\s+[·.…*•]+(\d{4})(?:\s+·\s+(.+))?$/);
  if (legacy) return legacy[3]?.trim() || `${legacy[1]} ${legacy[2]}`;

  return label || account.bankName || '통장';
}
