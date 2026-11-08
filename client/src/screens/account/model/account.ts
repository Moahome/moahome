import { getTextLength } from '@/shared/lib/format';

/** 서버의 계정 표시 이름과 동일하게 앞뒤 공백을 제외한 1~50 Unicode 코드 포인트를 허용합니다. */
export function getDisplayNameError(value: string): string {
  const length = getTextLength(value);
  if (length === 0) return '이름을 입력해주세요.';
  if (length > 50) return '이름은 50자 이내로 입력해주세요.';
  return '';
}

/** 프로필 파일의 형식·크기는 진입 화면에서 검사하고 픽셀 처리·크롭은 공통 모달에 위임합니다. */
export function getProfileImageError(file: File): string {
  if (!['image/png', 'image/jpeg'].includes(file.type)) return 'PNG 또는 JPEG 사진을 선택해주세요.';
  if (file.size === 0 || file.size > 5 * 1024 * 1024) return '사진은 5MB 이하로 선택해주세요.';
  return '';
}
