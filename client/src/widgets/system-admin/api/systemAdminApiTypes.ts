export interface SystemMember {
  id: string;
  displayName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWAL_PENDING' | 'WITHDRAWN';
  systemRole: 'USER' | 'ADMIN';
  canCreateProperty: boolean;
  createdAt: string;
}
export interface SystemMembers {
  users: SystemMember[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}
export interface MemberSearch {
  query: string;
  administrators: boolean;
  page: number;
  size: number;
}
export type AdminCommand = {
  kind: 'permission';
  requestId: string;
  allowed: boolean;
  expectedAllowed: boolean;
} | {
  kind: 'promotion';
  requestId: string;
};
