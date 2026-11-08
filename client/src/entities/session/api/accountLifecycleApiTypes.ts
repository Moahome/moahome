export interface WithdrawalStatus {
  userId: string;
  canWithdraw: boolean;
  managedProperties: { id: string; name: string }[];
}

export interface WithdrawalReceipt {
  requestedAt: string;
  recoverableUntil: string;
}

export interface AccountRecovery {
  state: 'PENDING' | 'RESTORED';
  displayName: string;
  requestedAt: string | null;
  recoverableUntil: string | null;
  csrfToken: string;
}
