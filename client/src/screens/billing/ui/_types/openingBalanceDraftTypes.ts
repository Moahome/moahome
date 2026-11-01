import type { OpeningWorkspace } from '@/features/billing-management';

/** 모바일 업로드 왕복 동안만 유지하는 계정·관리대상·서버 버전별 편집 상태입니다. */
export type OpeningBalanceDraft = Pick<OpeningWorkspace, 'units' | 'accounts'> & {
  propertyId: string;
  owner?: string;
  batchId: string | null;
  revision: number | null;
  cutoff: string;
  first: string;
  dirty: boolean;
  editId: string | null;
  version: number;
  message?: string;
};
