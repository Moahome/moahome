export interface RegistrationResident {
  clientId: string;
  unitClientId: string;
  name: string;
  phone: string;
  phoneConsent: boolean;
  relationType: 'OWNER' | 'TENANT' | 'FAMILY' | 'OTHER';
}

export interface RegistrationResidentImportRow {
  rowNumber: number;
  buildingClientId: string | null;
  unitNumber: string;
  name: string;
  phone: string | null;
  phoneConsent: boolean;
  relationType: RegistrationResident['relationType'];
  status: 'READY' | 'ERROR' | 'DUPLICATE';
  reason: string;
}
