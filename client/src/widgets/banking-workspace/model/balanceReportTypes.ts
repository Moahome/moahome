import type { BankingWorkspaceData } from '../api/bankingApiTypes';
import type { BalanceWorkspace } from '../api/bankingBalanceApiTypes';

export interface BalanceReportSnapshot {
  propertyId: string;
  month: string;
  generatedAt: string;
  banking: Pick<BankingWorkspaceData, 'accounts'>;
  balances: BalanceWorkspace;
}
