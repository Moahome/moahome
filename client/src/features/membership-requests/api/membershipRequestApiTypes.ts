export interface SignupRequest {
  id: string;
  unitId: string;
  unitLabel: string;
  requesterName: string;
  phoneLast4: string;
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

export interface SignupOptions {
  propertyId: string;
  propertyName: string;
  units: {
    unitId: string;
    label: string;
  }[];
}

export interface SignupRequestResponse {
  id: string;
  status: string;
}
