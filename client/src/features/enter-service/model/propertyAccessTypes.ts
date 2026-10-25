export interface PropertyAccessGuardOptions {
  userId: string | undefined;
  propertyId: string;
  routeKey: string;
  area: 'management' | 'resident';
}
