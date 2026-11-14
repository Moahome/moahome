export interface NoticeSummary {
  id: string;
  number: number;
  title: string;
  important: boolean;
  createdAt: string;
  views: number;
}

export interface NoticeList {
  propertyId: string;
  items: NoticeSummary[];
  total: number;
  page: number;
  pageCount: number;
}

export interface NoticeDetail extends NoticeSummary {
  propertyId: string;
  content: string;
  updatedAt: string;
  version: number;
  canEdit: boolean;
  authorName: string;
}

export interface NoticeSaveRequest {
  requestId: string;
  expectedVersion: number;
  title: string;
  content: string;
  important: boolean;
}

export interface NoticePageProps {
  propertyId: string;
  noticeId?: string;
  mode?: 'list' | 'create' | 'detail' | 'edit';
}

export interface NoticeDraft {
  key: string;
  title: string;
  content: string;
  important: boolean;
  savedAt: string;
  submission: { id: string; request: NoticeSaveRequest } | null;
}


export type NoticeAsset = { id: string; name: string; size: number; data: string };
