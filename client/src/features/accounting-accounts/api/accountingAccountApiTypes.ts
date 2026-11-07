export type AccountGroup = 'ASSET' | 'LIABILITY' | 'OPERATING_REVENUE' | 'OTHER_REVENUE' | 'OPERATING_EXPENSE' | 'OTHER_EXPENSE';

export interface AccountingAccountSetting {
  id: string;
  code: string;
  name: string;
  group: AccountGroup;
  defaultAccount: boolean;
  active: boolean;
  used: boolean;
  revision: number;
}

export interface AccountingAccountsWorkspace {
  propertyId: string;
  canManage: boolean;
  accounts: AccountingAccountSetting[];
}

export interface CreateAccountingAccountRequest {
  name: string;
  group: AccountGroup;
  code?: string;
}

export interface CreateAccountingAccountResponse {
  id: string;
}

export interface EditAccountingAccountRequest extends CreateAccountingAccountRequest {
  code: string;
  expectedRevision: number;
}

export interface AccountingAccountChange {
  revision: number;
  name: string;
  code: string;
  group: AccountGroup;
  active: boolean;
  deletedAt: string | null;
  changedAt: string;
}
