import type { BillingPeriod } from '@/entities/billing';

export interface BillingHistoryResponse {
  propertyId: string;
  periods: BillingPeriod[];
}
