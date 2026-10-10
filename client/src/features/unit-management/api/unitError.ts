import { ApiError } from '@/shared/api';

/** 서버 오류 코드를 고정 안내로 바꾸며 내부 오류·개인정보 원문은 화면에 노출하지 않습니다. */
export function getUnitManagementError(error: unknown) {
  if (!(error instanceof ApiError)) return '정보를 처리하지 못했어요. 다시 시도해주세요.';
  if (error.code === 'DUPLICATE_BUILDING') return '이미 등록된 동 이름이에요. 동 이름을 확인해주세요.';
  if (error.code === 'DUPLICATE_UNIT') return '이미 등록된 호수가 포함되어 있어요. 목록을 다시 확인해주세요.';
  if (error.code === 'INVALID_REQUEST') return '동과 세대 정보를 확인해주세요.';
  if (error.code === 'UNIT_NOT_FOUND') return '대상을 찾을 수 없어요. 목록을 새로 확인해주세요.';
  if (error.code === 'UNIT_NOT_EDITABLE') return '현재 수정할 수 없는 세대예요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';
  if (error.status === 403) return '세대를 관리할 권한이 없어요.';

  return '정보를 처리하지 못했어요. 다시 시도해주세요.';
}
