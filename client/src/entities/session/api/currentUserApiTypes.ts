export interface CurrentUser {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  systemRole: 'USER' | 'ADMIN';
  status: 'ACTIVE';
}
