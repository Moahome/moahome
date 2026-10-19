export interface RegistrationOptions {
  propertyId: string;
  hasBuildings: boolean;
  buildings: {
    id: string;
    name: string;
  }[];
  units: {
    id: string;
    buildingId: string | null;
    unitNumber: string;
    status: string;
  }[];
}

export interface ResidentRegistrationInput {
  requestId: string;
  name: string;
  phone: string | null;
  unitId: string;
  relationType: string;
}

export interface ResidentRegistrationResponse {
  id: string;
  propertyId: string;
  unitId: string;
  representative: boolean;
}
