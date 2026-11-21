import type { BalancePanel } from '../../../model/balancePanelTypes';
import type { ReactNode } from 'react';
import type { BalanceWorkspace } from '../../../api/bankingBalanceApiTypes';
import type { Action } from '../../../model/balancePanelTypes';
export type OpeningDraftState = {
  cutoff: string;
  amounts: Record<string, string>;
  reason: string;
  editing: boolean;
  revisions: Record<string, number>;
  requestId: string;
};
export type BalanceActionDialogProps = {
  action: Action;
  data: BalanceWorkspace;
  propertyId: string;
  onClose: () => void;
  onSaved: (message: string, keepOpen?: boolean) => Promise<void>;
  presentation?: 'modal' | 'page';
  openingSelector?: ReactNode;
  openingAccountId?: string;
  openingDraft?: OpeningDraftState;
  onOpeningDraftChange?: (draft: OpeningDraftState) => void;
};
export interface BalanceAccountContentProps {
  targetId: string | null;
  data: BalanceWorkspace;
  userId: string | undefined;
  propertyId: string;
  month: string;
  accountId: string;
  openPanel: (kind: BalancePanel, id?: string) => void;
  onEdit: (id: string) => void;
  onTransactions: (id: string) => void;
}

export interface BalanceAccountEditorProps {
  editingAccountId: string | null;
  propertyId: string;
  onClose: () => void;
  onSaved: () => void;
}
