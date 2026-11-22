import type { BalancePanel } from '../model/balancePanelTypes';
export const PANEL_TITLES: Record<BalancePanel, string> = {
  account: '통장 상세',
  initial: '초기 잔액 정정',
  history: '정정 내역',
  opening: '기준 잔고 확인',
  chart: '동별 입금·지출 비교',
  difference: '잔고 차이 내역',
  settlement: '외부 부담금 정산',
  assignment: '입금 귀속 동 확인'
};

export const BANKING_DIRECTION_OPTIONS = [{
  value: 'ALL',
  label: '전체'
}, {
  value: 'INCOME',
  label: '입금'
}, {
  value: 'EXPENSE',
  label: '출금'
}, {
  value: 'CANCELED',
  label: '취소 내역'
}] as const;
export const BANKING_PAGE_SIZES = [10, 20, 50] as const;
export const BANKING_STATUS_OPTIONS = [{
  value: 'ALL',
  label: '모든 상태'
}, {
  value: 'PENDING',
  label: '확인 필요'
}, {
  value: 'CONFIRMED',
  label: '처리 완료'
}, {
  value: 'ON_HOLD',
  label: '보류'
}];

export const BANKING_PROCESSING_OPTIONS = [{
  value: 'ALL',
  label: '처리 내용 전체'
}, {
  value: 'UNCLASSIFIED',
  label: '입금 분류 필요'
}, {
  value: 'HOUSEHOLD',
  label: '세대 수납 예정'
}, {
  value: 'SHARED',
  label: '동별 입금'
}, {
  value: 'OTHER',
  label: '기타 입금'
}, {
  value: 'EXPENSE',
  label: '지출'
}, {
  value: 'TRANSFER',
  label: '계좌 간 이체'
}] as const;
export const BANKING_VIEW_TITLES = {
  transactions: '통장 거래',
  expenses: '지출 내역',
  upload: '거래내역 가져오기'
};
export const BANKING_VIEW_DESCRIPTIONS = {
  transactions: '통장 거래를 확인하고 입금은 세대에, 출금은 각 동에 연결합니다.',
  expenses: '각 동에서 부담한 지출을 확인합니다.',
  upload: '은행 거래 파일을 확인한 뒤 선택한 거래를 저장합니다.'
};

export const BANKING_VIEW_WITHOUT_BUILDINGS_DESCRIPTIONS = {
  ...BANKING_VIEW_DESCRIPTIONS,
  transactions: '통장 거래를 확인하고 세대 입금과 관리대상 지출을 관리합니다.',
  expenses: '관리대상에서 부담한 지출을 확인합니다.'
};

export const BALANCE_SORT_OPTIONS = [{
  value: 'name',
  label: '동 이름순'
}, {
  value: 'high',
  label: '잔고 높은 순'
}, {
  value: 'low',
  label: '잔고 낮은 순'
}];

export const BALANCE_FILTER_OPTIONS = [{
  value: 'ALL',
  label: '전체'
}, {
  value: 'NEEDS_OPENING',
  label: '시작 잔고 필요'
}, {
  value: 'NEGATIVE',
  label: '잔고 부족'
}];

export const BALANCE_LEDGER_DIRECTION_OPTIONS = [{
  value: 'ALL',
  label: '전체'
}, {
  value: 'INCOME',
  label: '입금'
}, {
  value: 'EXPENSE',
  label: '출금'
}];

export const BALANCE_LEDGER_KIND_OPTIONS = [{
  value: 'LATEST',
  label: '최근순'
}, {
  value: 'OLDEST',
  label: '오래된순'
}];

export const BALANCE_SETTLEMENT_FILTER_OPTIONS = [{
  value: 'UNRECOVERED',
  label: '미회수'
}, {
  value: 'ACTIVE',
  label: '정산 대상'
}, {
  value: 'EXCLUDED',
  label: '정산에서 제외'
}, {
  value: 'ALL',
  label: '전체 내역'
}];

export const COMMON_BANK_IMPORT_SUPPORT = {
  enabled: true,
  extensions: ['.xlsx'],
  message: '지원 형식: .xlsx'
};

export const BANK_UPLOAD_TEMPLATE_URL = '/bankUploadTemplate.xlsx';

export const COMMON_BANK_UPLOAD_GUIDE = [
  '첫 행은 거래일 · 거래시간 · 입금자·거래내용 · 입금액 · 출금액 · 거래 후 잔액 · 메모 순서로 유지해주세요.',
  '거래일과 입금자·거래내용은 필수입니다. 거래일은 YYYY-MM-DD 형식으로 입력해주세요.',
  '입금액과 출금액 중 한 곳에만 0원보다 큰 정수 금액을 입력해주세요.',
  '거래시간 · 거래 후 잔액 · 메모는 선택입니다. 은행 자료에 값이 있으면 그대로 입력해주세요.',
  '거래시간은 HH:mm:ss 형식으로 입력하고 수식은 사용하지 마세요.'
] as const;
