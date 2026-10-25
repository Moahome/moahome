import type { FeeItemCode } from '../constants/feeItemOptionsTypes';

export interface BillingItem {
  id: string;
  code: FeeItemCode | null;
  name: string;
  amount: string;
}

export type BillingMode = 'ALL' | 'BUILDING';

export interface BillingBuilding {
  id: string;
  name: string;
}

export interface BillingBuildingItems {
  buildingId: string;
  items: BillingItem[];
}

export interface BillingTemporaryItem extends BillingItem {
  month?: string;
  buildingId: string | null;
  note: string;
}

export interface BillingPlan {
  mode: BillingMode;
  items: BillingItem[];
  buildingItems: BillingBuildingItems[];
  temporaryMode: BillingMode;
  temporaryItems: BillingTemporaryItem[];
}

export interface BillingSettingsChange extends BillingPlan {
  temporaryMonth?: string;
  requestId?: string;
}

export interface BillingTemplate extends Partial<BillingPlan> {
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
  hasBuildings?: boolean;
  buildings?: BillingBuilding[];
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
