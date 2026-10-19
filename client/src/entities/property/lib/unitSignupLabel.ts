import type { UnitResidentSummary } from '../model/unitResidentsTypes';

/** 목록과 상세의 가입 완료/등록 인원 표기를 공유하고 권한 없음은 실제 0명과 구분합니다. */
export function getUnitSignupLabel(summary?: UnitResidentSummary | null) {
  return summary ? `${summary.approved}/${summary.total} 명` : '—';
}
