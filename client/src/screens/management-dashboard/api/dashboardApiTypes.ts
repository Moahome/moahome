import type {
  BalanceWorkspace,
  BankingWorkspaceData
} from '@/widgets/banking-workspace';
import type { PreviewLedger } from '@/widgets/payment-workspace';

export interface DashboardSnapshot {
  propertyId: string;
  propertyName: string;
  month: string;
  businessDate: string;
  generatedAt: string;
  banking: BankingWorkspaceData;
  balances: BalanceWorkspace;
  payments: PreviewLedger & { propertyId: string };
  tasks: {
    income: number;
    expenses: number;
    joinRequests: number;
    invitationChanges: number;
    external: number;
    duplicates: number;
  };
}
