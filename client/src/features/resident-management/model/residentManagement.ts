import { ApiError } from '@/shared/api';

/** 서버 원문과 개인정보를 그대로 노출하지 않고 수정·삭제·번호 공개의 업무 오류를 안내합니다. */
export function getResidentManagementError(error: unknown) {
  if (!(error instanceof ApiError)) return '처리하지 못했어요. 입력을 확인하고 다시 시도해주세요.';
  const messages: Record<string, string> = {
    RESIDENT_NOT_FOUND: '주민 정보가 없거나 삭제되었어요. 주민 목록에서 다시 확인해주세요.',
    RESIDENT_CHANGED: '다른 작업으로 주민 정보가 변경되었어요. 취소 후 최신 정보를 다시 확인해주세요.',
    REPRESENTATIVE_REQUIRED: '남은 주민 중 새 대표를 선택해주세요.',
    INVALID_REPRESENTATIVE: '같은 동·호수의 다른 주민을 대표로 선택해주세요.',
    CONTACT_REQUIRED_FOR_REQUEST: '가입 신청이 연결된 주민은 연락처를 비울 수 없어요.',
    DUPLICATE_RESIDENT: '이름과 연락처가 같은 주민이 이미 있어요. 기존 주민을 확인해주세요.',
    RESIDENT_RESTORE_REQUIRED: '삭제된 명부에 이름과 연락처가 같은 주민이 있어요.',
    INVALID_UNIT: '등록된 동·호수를 다시 선택해주세요.',
    INVALID_REQUEST: '입력한 주민 정보를 확인해주세요.',
    PHONE_SECURITY_UNAVAILABLE: '연락처를 처리할 수 없어요. 서버의 연락처 설정을 확인해주세요.',
    ACCESS_DENIED: '주민 정보를 관리할 관리소장 권한이 없어요.'
  };
  if (Object.hasOwn(messages, error.code)) return messages[error.code];
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';

  return '처리 결과를 확인하지 못했어요. 다시 시도하거나 최신 정보를 확인해주세요.';
}

/** 국내 휴대폰은 읽기 쉬운 표기로 보이며 국제번호는 서버가 정규화한 번호를 유지합니다. */
export function formatResidentPhone(phone: string) {
  const local = phone.startsWith('+82') ? `0${phone.slice(3)}` : phone;

  return local.replace(/^(01\d)(\d{3,4})(\d{4})$/, '$1-$2-$3');
}
