/** 등록 입력과 분리한 현재 세대의 주민 명부 요약입니다. 주민 목록과 같은 가입 판정을 사용합니다. */
export interface UnitResidentSummary {
  representativeName: string | null;
  total: number;
  approved: number;
  pending: number;
  notJoined: number;
}
