import type { FeeItemCode } from '@/entities/billing';
import type { BankAccountDraft } from '../model/bankAccountTypes';
import type { BasicInfo } from '../model/basicInfoTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../model/unitSetupTypes';

export interface RegistrationRequest {
  requestId: string;
  administrator?: {
    residenceType: 'RESIDENT' | 'EXTERNAL';
    name?: string;
    phone?: string;
    buildingClientId?: string | null;
    unitNumber?: string;
  };
  basicInfo: BasicInfo;
  buildings: BuildingDraft[];
  units: Omit<UnitDraft, 'clientId'>[];
  bankAccounts: BankAccountDraft[];
  feeItems: {
    itemCode: FeeItemCode | null;
    itemName: string;
    defaultAmount: number;
  }[];
  openingBalances?: {
    cutoffDate: string;
    firstBillingMonth: string;
    units: {
      buildingClientId: string | null;
      unitNumber: string;
      receivable: string;
      credit: string;
    }[];
    accounts: {
      accountIndex: number;
      amount: string;
    }[];
    cashCutoffDate: string | null;
    buildings: {
      buildingClientId: string;
      amount: string;
    }[];
  };
}

export interface RegistrationResult {
  requestId: string;
  property: {
    id: string;
    name: string;
    hasBuildings: boolean;
    status: 'ACTIVE';
  };
  membership: {
    id: string;
    role: 'ADMIN';
    status: 'ACTIVE';
  };
  summary: {
    buildingCount: number;
    unitCount: number;
    bankAccountCount: number;
    feeItemCount: number;
    monthlyDefaultAmount: number;
  };
  createdAt: string;
  managementStart?: {
    cutoffDate: string;
    firstBillingMonth: string;
    cashCutoffDate: string | null;
  };
}
