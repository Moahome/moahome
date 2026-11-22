/** 동 유무를 아직 조회하지 못했을 때는 소속을 추측하지 않는 중립적인 열 이름을 사용합니다. */
export function getUnitColumnLabel(hasBuildings: boolean | undefined): string {
  if (hasBuildings === undefined)
    return '세대';

  return hasBuildings ? '동·호수' : '호수';
}
