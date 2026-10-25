export interface ManagementProperty {
  propertyId: string;
  name: string;
  role: 'ADMIN' | 'MANAGER';
}

export interface ManagedPropertiesResponse {
  properties: unknown;
}

export interface ResidentProperty {
  propertyId: string;
  name: string;
  role: 'RESIDENT';
}

export interface ResidentPropertiesResponse {
  properties: ResidentProperty[];
}

export interface PropertyAccessContext {
  propertyId: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'RESIDENT';
  residentEligible: boolean;
}
