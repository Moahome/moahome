export interface ResidentNoticeContext {
  propertyId: string;
  name: string;
}

export interface ResidentNoticeSummary {
  id: string;
  title: string;
  important: boolean;
  createdAt: string;
}

export interface ResidentNoticeList {
  propertyId: string;
  importantItems: ResidentNoticeSummary[];
  items: ResidentNoticeSummary[];
  page: number;
  pageCount: number;
  total: number;
}

export interface ResidentNoticeDetail extends ResidentNoticeSummary {
  propertyId: string;
  content: string;
  authorName: string;
}
