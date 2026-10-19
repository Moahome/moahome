export type MemberRole = 'ADMIN' | 'MANAGER' | 'RESIDENT';

export interface MemberWorkspace {
  propertyId: string;
  members: {
    memberId: string;
    name: string;
    residentId: string | null;
    role: MemberRole;
  }[];
  invitations: {
    id: string;
    revision: number;
    status: string;
    role: MemberRole;
    residentId: string | null;
    residentName: string | null;
    requesterName: string | null;
    expiresAt: string;
  }[];
}

export interface IssuedInvitation {
  id: string;
  code: string;
  expiresAt: string;
}

export interface InvitationRequestResponse {
  propertyName: string;
  status: string;
}
