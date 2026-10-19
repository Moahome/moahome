export type BalanceBuilding = {
  id: string;
  label: string;
  active: boolean;
  startBalance: string | null;
  income: string;
  expense: string;
  balance: string | null;
  status: 'READY' | 'OPENING_REQUIRED';
  openingBalance?: string | null;
  openingRevision?: number;
};

export type BalanceEntry = {
  id: string;
  buildingId: string;
  date: string;
  time: string | null;
  label: string;
  income: string;
  expense: string;
  paymentId?: string | null;
  accountId?: string | null;
};

export type ExternalExpense = {
  accountId?: string;
  transactionId?: string;
  transactionAmount?: string;
  id: string;
  label: string;
  expenseName: string;
  date: string;
  amount: string;
  received: string;
  remaining: string;
  excluded?: boolean;
  decisionRevision?: number;
  recoveries: {
    id: string;
    paymentId: string;
    date: string;
    payer: string;
    amount: string;
  }[];
};

export type BalanceIncome = {
  accountId?: string;
  id: string;
  transactionId: string | null;
  date: string;
  payer: string;
  amount: string;
  available: string;
  kind: 'HOUSEHOLD' | 'OTHER';
  linkedBuildingId?: string | null;
  linkedUnitLabel?: string | null;
};

export type AccountBalance = {
  id: string;
  label: string;
  status: string;
  balance: string | null;
  asOf: string | null;
  openingDate?: string | null;
  openingBalance?: string | null;
  openingRevision?: number;
  calculatedBalance?: string | null;
  calculationBasisDate?: string | null;
};

export type BalanceWorkspace = {
  accounts?: AccountBalance[];
  legacyOpening?: {
    cutoffDate: string;
    buildings: {
      buildingId: string;
      amount: string;
    }[];
  } | null;
  accountId?: string | null;
  propertyId: string;
  month: string;
  cutoffDate: string | null;
  bankBalance: string | null;
  bankAsOf: string | null;
  buildings: BalanceBuilding[];
  entries: BalanceEntry[];
  externals: ExternalExpense[];
  incomes: BalanceIncome[];
  pending: {
    id: string;
    date: string;
    label: string;
    direction: string;
    amount: string;
  }[];
};

export interface CashOpeningInput {
  accountId?: string;
  cutoffDate: string;
  buildings: {
    buildingId: string;
    amount: string;
  }[];
}

export interface CashOpeningCorrectionInput {
  id: string;
  accountId?: string;
  cutoffDate: string;
  buildings: {
    buildingId: string;
    amount: string;
    revision: number;
  }[];
}

export interface CashIncomeInput {
  paymentId: string;
  buildingId: string;
}

export interface ExternalSettlementInput {
  id: string;
  allocationId: string;
  paymentId: string;
  amount: string;
}

export interface ExternalSettlementDecisionInput {
  id: string;
  allocationId: string;
  excluded: boolean;
  revision: number;
}
