export interface OpeningUnit {
  unitId: string;
  label: string;
  buildingId?: string | null;
  buildingName?: string | null;
  receivable: string;
  credit: string;
  originMonth: string | null;
  responsibility: string | null;
}

export interface InitialBalanceDetail {
  targetId: string;
  label: string;
  previousDate: string | null;
  newDate: string | null;
  previousAmount: string | null;
  newAmount: string | null;
  previousBillingMonth?: string | null;
  newBillingMonth?: string | null;
  generatedMonths?: string[] | null;
}

export interface InitialBalanceHistory {
  id: string;
  kind: 'HANDOVER' | 'BUILDING' | 'ACCOUNT';
  previousDate: string | null;
  newDate: string | null;
  details: InitialBalanceDetail[];
  reason: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
}

export interface InitialBalanceInput {
  id: string;
  revision: number;
  cutoffDate: string;
  reason: string;
  accounts: { accountId: string; amount: string }[];
}

export interface OpeningWorkspace {
  correctionDeadline?: string | null;
  initialCorrectionAllowed?: boolean;
  corrections?: InitialBalanceHistory[];
  propertyId: string;
  asOf: string;
  managementStarted: boolean;
  cutoffDate: string | null;
  firstBillingMonth: string | null;
  batch: OpeningBatch | null;
  units: OpeningUnit[];
  accounts: {
    accountId: string;
    label: string;
    bankCode?: string;
    initialBalance?: boolean;
    amount: string;
  }[];
  history: OpeningBatch[];
}

export interface OpeningBatch {
  id: string;
  revision: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELED';
  cutoffDate: string;
  firstBillingMonth: string;
  confirmedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
}

export interface OpeningInput {
  batchId: string | null;
  revision: number | null;
  cutoffDate: string;
  firstBillingMonth: string;
  units: Pick<OpeningUnit, 'unitId' | 'receivable' | 'credit' | 'originMonth' | 'responsibility'>[];
  accounts: {
    accountId: string;
    amount: string;
  }[];
}
