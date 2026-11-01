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

export interface OpeningWorkspace {
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
