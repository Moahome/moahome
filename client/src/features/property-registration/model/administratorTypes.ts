export interface AdministratorDraft {
  residenceType: '' | 'RESIDENT' | 'EXTERNAL';
  name: string;
  phone: string;
  phoneConsent?: boolean;
  unitClientId: string;
}
