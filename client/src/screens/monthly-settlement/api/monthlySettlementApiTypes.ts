import type {
  BalanceWorkspace,
  BankingWorkspaceData
} from '@/widgets/banking-workspace';
import type { PreviewLedger } from '@/widgets/payment-workspace';

export interface MonthlySettlementSnapshot {
  propertyId: string;
  month: string;
  generatedAt: string;
  banking: BankingWorkspaceData;
  balances: BalanceWorkspace;
  payments: PreviewLedger & { propertyId: string };
}
