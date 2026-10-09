/** 사용자별 목록 캐시를 등록 성공 후에도 같은 키로 갱신합니다. */
export function getManagedPropertiesQueryKey(userId: string | undefined) {
  return ['managed-properties', userId] as const;
}
