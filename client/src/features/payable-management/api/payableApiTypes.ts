export interface PayablePayment {
  id: string;
  expenseId: string;
  date: string;
  amount: string;
  status: 'ACTIVE' | 'CANCELED';
  path: string;
}

export interface PayableItem {
  id: string;
  date: string;
  name: string;
  counterparty: string;
  memo: string | null;
  accountId: string;
  payableAccountId: string;
  buildingId: string | null;
  amount: string;
  paid: string;
  remaining: string;
  status: 'REGISTERED' | 'CANCELED';
  payments: PayablePayment[];
}

export interface PayableCandidate {
  expenseId: string;
  date: string;
  name: string;
  amount: string;
  accountId: string;
  buildingId: string | null;
  path: string;
}

export interface PayableWorkspace {
  propertyId: string;
  hasBuildings: boolean;
  canManage: boolean;
  accounts: { id: string; code: string; name: string; active?: boolean }[];
  buildings: { id: string; name: string; active: boolean }[];
  items: PayableItem[];
  candidates: PayableCandidate[];
}

export interface CreatePayableRequest {
  id: string;
  date: string;
  name: string;
  counterparty: string;
  memo: string;
  amount: string;
  accountId: string;
  buildingId: string | null;
}
