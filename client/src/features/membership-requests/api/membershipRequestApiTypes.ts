export interface SignupRequest {
  id: string;
  unitId: string;
  unitLabel: string;
  requesterName: string;
  applicantName?: string | null;
  phoneLast4: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  requestedAt: string;
  updatedAt: string;
  candidates: {
    residentId: string;
    name: string;
  }[];
}

export interface SignupWorkspace {
  propertyId: string;
  requests: SignupRequest[];
}

export interface UnlinkedResident {
  residentId: string;
  name: string;
  phoneLast4: string | null;
  buildingName: string | null;
  unitNumber: string | null;
  relationType: 'OWNER' | 'TENANT' | 'FAMILY' | 'OTHER' | null;
}

export interface UnlinkedResidents {
  propertyId: string;
  residents: UnlinkedResident[];
}
