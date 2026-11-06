/** 선택 번호를 공통 국내·국제 형식으로 정리하고 잘못된 번호는 저장 전에 거부합니다. */
export function normalizeResidentPhone(input: string): string | null {
  const phone = input.trim();
  if (!phone) return null;
  if (phone.length > 64 || !/^\+?[0-9 ()-]+$/.test(phone)) throw new Error('INVALID_PHONE');
  const digits = phone.replace(/[ ()-]/g, '');
  if (/^0[1-9][0-9]{7,9}$/.test(digits)) return `+82${digits.slice(1)}`;
  if (/^\+[1-9][0-9]{3,14}$/.test(digits)) return digits;
  throw new Error('INVALID_PHONE');
}

/** 기존 번호의 동의를 이어받고 명시적인 미동의·철회 상태는 번호 유무와 무관하게 존중합니다. */
export function hasExistingPhoneConsent(resident: { phoneLast4: string | null; phoneConsent?: boolean }): boolean {
  // 동의 필드 도입 전 API의 저장 번호는 사전 동의 완료라는 사용자 확인 범위입니다.
  // 새 API가 false를 반환하면 이 호환 처리를 적용하지 않으며 최종 저장은 서버 동의 기록으로 검증합니다.
  return Boolean(resident.phoneLast4) && (resident.phoneConsent ?? true);
}
