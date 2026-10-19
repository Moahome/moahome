export interface ManagementProperty {
  propertyId: string;
  name: string;
  role: 'ADMIN' | 'MANAGER';
}

export interface ManagedPropertiesResponse {
  properties: unknown;
}
