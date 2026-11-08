/** 개발 미리보기는 생성 진입만 숨길 수 있으며 실제 권한이 없는 계정의 생성을 열어주지 않습니다. */
export function canShowPropertyCreation(allowed: boolean, preview: string | null) {
  return allowed && !(process.env.NODE_ENV === 'development' && preview === 'disabled');
}
