import type { TransferAllocationPart } from '@/entities/banking';

export interface ManualBankTransferInput {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: string;
  note?: string;
  allocations: TransferAllocationPart[];
}

export interface ManualTransferFunds {
  propertyId: string;
  accountId: string;
  date: string;
  accountAvailable: string | null;
  buildings: { buildingId: string; available: string | null }[];
}

export interface ManualBankTransferResult { propertyId: string; }
