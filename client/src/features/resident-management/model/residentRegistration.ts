import { ApiError } from '@/shared/api';

/** 국내 번호는 +82로 변환하고 국제 번호는 유지합니다. 선택 입력의 공백은 연락처 없음으로 처리합니다. */
export function normalizeResidentPhone(input: string): string | null {
  const phone = input.trim();
  if (!phone) return null;
  if (phone.length > 64 || !/^\+?[0-9 ()-]+$/.test(phone)) throw new Error('INVALID_PHONE');
  const digits = phone.replace(/[ ()-]/g, '');
  if (/^0[1-9][0-9]{7,9}$/.test(digits)) return `+82${digits.slice(1)}`;
  if (/^\+[1-9][0-9]{3,14}$/.test(digits)) return digits;
  throw new Error('INVALID_PHONE');
}

/** 서버 오류 원문을 출력하지 않고 업무 오류·결과 불명·연락처 저장 불가를 구분합니다. */
export function getResidentRegistrationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';
    if (error.status === 403) return '주민을 등록할 권한이 없어요.';
    if (error.code === 'DUPLICATE_RESIDENT') return '이름과 연락처가 같은 주민이 이미 있어요. 기존 주민을 확인해주세요.';
    if (error.code === 'RESIDENT_RESTORE_REQUIRED') return '삭제된 명부에 이름과 연락처가 같은 주민이 있어요. 기존 주민을 확인해주세요.';
    if (error.code === 'REGISTRATION_CONFLICT') return '이미 사용된 등록 요청이에요. 주민 목록에서 등록 결과를 확인해주세요.';
    if (error.code === 'INVALID_UNIT') return '등록할 세대를 다시 선택해주세요.';
    if (error.code === 'INVALID_REQUEST') return '입력한 주민 정보를 확인해주세요.';
    if (error.code === 'PHONE_SECURITY_UNAVAILABLE') return '연락처를 안전하게 저장할 수 없어요. 관리자에게 문의해주세요.';
  }

  return '등록 결과를 확인하지 못했어요. 같은 정보로 다시 시도하거나 주민 목록을 확인해주세요.';
}
