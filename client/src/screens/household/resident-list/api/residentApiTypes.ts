import type { ResidentSignupStatus } from '@/entities/resident';

export interface ResidentRow {
  id: string;
  name: string;
  phoneLast4: string | null;
  unitId: string | null;
  buildingId: string | null;
  unitNumber: string | null;
  relationType: string | null;
  representative: boolean;
  signupStatus: ResidentSignupStatus;
  serviceRole?: 'ADMIN' | 'MANAGER' | 'RESIDENT' | 'CONFLICT' | null;
}

export interface ResidentList {
  propertyId: string;
  hasBuildings: boolean;
  buildings: {
    id: string;
    name: string;
  }[];
  residents: ResidentRow[];
}
