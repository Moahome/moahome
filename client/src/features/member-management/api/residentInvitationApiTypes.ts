export interface ResidentInvitation {
  id: string;
  residentId: string;
  name: string;
  unitLabel: string;
  phoneLast4: string | null;
  status: 'ISSUED' | 'EXPIRED' | 'CHANGE_REQUESTED' | 'APPROVED' | 'REVOKED' | 'REJECTED';
  revision: number;
  expiresAt: string;
  requestedName: string | null;
  requestedPhoneLast4: string | null;
  phoneAction: 'KEEP' | 'SET' | 'REMOVE' | null;
}
export interface ResidentInvitationWorkspace {
  propertyId: string;
  invitations: ResidentInvitation[];
}
export interface IssuedResidentInvitation {
  id: string;
  token: string;
  expiresAt: string;
}
export interface ResidentInvitationPreview {
  propertyId: string;
  propertyName: string;
  name: string;
  unitLabel: string;
  phoneLast4: string | null;
  status: 'ISSUED' | 'CHANGE_REQUESTED' | 'APPROVED';
  expiresAt: string;
  revision: number;
}
export interface ResidentJoinOptions {
  propertyId: string;
  propertyName: string;
  units: { unitId: string; label: string }[];
}
export interface ResidentInvitationAcceptance {
  token: string;
  correction: boolean;
  name?: string;
  phoneAction?: 'KEEP' | 'SET' | 'REMOVE';
  phone?: string;
}
export interface ResidentJoinSubmission {
  code: string;
  unitId: string;
  name: string;
  phone: string | null;
}

export interface ResidentInvitationResult { status: string; }
export interface ResidentJoinResult { id: string; status: string; }

export interface ResidentInvitationShare {
  id: string;
  token: string | null;
  expiresAt: string;
}
