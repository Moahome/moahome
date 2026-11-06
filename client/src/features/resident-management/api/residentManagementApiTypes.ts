import type { ResidentSignupStatus } from '@/entities/resident';

export interface ResidentDetail {
  id: string;
  propertyId: string;
  name: string;
  phoneLast4: string | null;
  phoneConsent?: boolean;
  unitId: string | null;
  buildingId: string | null;
  buildingName: string | null;
  unitNumber: string | null;
  relationType: string | null;
  representative: boolean;
  currentRepresentativeId?: string | null;
  signupStatus: ResidentSignupStatus;
  serviceRole?: 'ADMIN' | 'MANAGER' | 'RESIDENT' | 'CONFLICT' | null;
  createdAt: string;
  updatedAt: string;
  hasLinkedRequests: boolean;
  representativeCandidates: {
    id: string;
    name: string;
  }[];
}

export interface ResidentUpdateInput {
  designateRepresentative?: boolean;
  expectedRepresentativeResidentId?: string | null;
  name: string;
  unitId: string;
  relationType: string;
  phoneConsent?: boolean;
  phoneAction: 'KEEP' | 'REPLACE' | 'REMOVE';
  phone: string | null;
  replacementResidentId: string | null;
  expectedUpdatedAt: string;
  serviceRole?: 'MANAGER' | 'RESIDENT';
  expectedServiceRole?: 'MANAGER' | 'RESIDENT';
}

export interface ResidentPhoneResponse {
  phone: string | null;
}
