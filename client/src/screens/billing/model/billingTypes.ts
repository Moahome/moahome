import type { BillingItem } from '@/entities/billing';
import type { BILLING_TABS } from './billing';

export interface ScheduledSettings {
  month: string;
  items: BillingItem[];
  reason: string;
}

export type BillingTab = typeof BILLING_TABS[number]['id'];
