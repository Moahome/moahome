const PROPERTY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 경로 식별자의 형식만 검사하며 대상의 존재나 접근 권한을 판단하지 않습니다. */
export function isPropertyId(value: unknown): value is string {
  return typeof value === 'string' && PROPERTY_ID_PATTERN.test(value);
}

export function getManagementDashboardPath(propertyId: string) {
  return `/manage/${propertyId}/dashboard`;
}
