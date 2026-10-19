export interface WebSession {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresAt: string;
  csrfToken: string;
}
