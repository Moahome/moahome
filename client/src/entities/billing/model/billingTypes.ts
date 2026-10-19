import type { FeeItemCode } from '../constants/feeItemOptionsTypes';

export interface BillingItem {
  id: string;
  code: FeeItemCode | null;
  name: string;
  amount: string;
}

export interface BillingTemplate {
  id: string;
  effectiveMonth: string;
  items: BillingItem[];
  reason: string | null;
  changedAt: string;
}

export interface BillingSettings {
  propertyId: string;
  currentMonth: string;
  firstBillingMonth: string;
  nextBillingDate: string;
  revisionId: string;
  current: BillingTemplate;
  scheduled: BillingTemplate | null;
  managementStarted?: boolean;
}

export interface BillingCharge {
  id: string;
  unitId: string;
  building: string;
  room: string;
  displayName: string | null;
  representativeName: string | null;
  items: BillingItem[];
}

export interface BillingMonth {
  propertyId: string;
  hasBuildings: boolean;
  month: string;
  billingDate: string;
  dueDate: string;
  status: 'ISSUED' | 'SCHEDULED' | 'NOT_BILLED';
  baseAmount: string;
  charges: BillingCharge[];
}

export interface BillingPeriod {
  month: string;
  billingDate: string;
  dueDate: string;
  unitCount: number;
  totalAmount: string;
  confirmedAt: string;
}
