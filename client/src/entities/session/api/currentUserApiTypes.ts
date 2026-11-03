export interface CurrentUser {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  canCreateProperty: boolean;
  systemRole: 'USER' | 'ADMIN';
  status: 'ACTIVE';
}
