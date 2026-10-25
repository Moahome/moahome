import type { BillingSettingsChange } from '@/entities/billing';
import type { BILLING_TABS } from './billing';

export interface ScheduledSettings extends BillingSettingsChange {
  month: string;
  reason: string;
}

export type BillingTab = typeof BILLING_TABS[number]['id'];
