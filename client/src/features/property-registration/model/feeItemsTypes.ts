import type { FeeItemCode } from '@/entities/billing';

export interface FeeItemDraft {
  clientId: string;
  itemCode: FeeItemCode | null;
  itemName: string;
  defaultAmount: string;
}

export type FeeItemErrors = Partial<Record<'itemCode' | 'itemName' | 'defaultAmount', string>>;
