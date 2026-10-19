export type ReportColumn = {
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
};

export type ReportValue = string | bigint;

export type ReportSummary = {
  label: string;
  value: ReportValue;
};

/** 첨부 지출 내역서의 제목·요약·표·합계 배치를 모든 조회 보고서에 동일하게 적용합니다. */
export type ReportDefinition = {
  title: string;
  description: string;
  sheet: string;
  columns: readonly ReportColumn[];
  rows: readonly (readonly ReportValue[])[];
  summary: readonly ReportSummary[];
  total?: readonly ReportValue[];
  note: string;
};
