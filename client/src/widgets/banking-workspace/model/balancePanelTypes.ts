export type Action = {
  kind: 'opening' | 'settlement' | 'assignment' | 'difference';
  id?: string;
};
export type BalancePanel = Action['kind'] | 'chart' | 'account' | 'initial' | 'history';
