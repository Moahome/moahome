import type { ExpenseAccountOption } from '../model/allocationTypes';

/** 관리대상 생성 전의 지출 초안은 확정된 기본 비용 코드를 사용하며 운영 화면은 서버 목록을 우선합니다. */
export const DEFAULT_EXPENSE_ACCOUNTS: readonly ExpenseAccountOption[] = [
  {
    code: '801',
    name: '일반관리비'
  },
  {
    code: '802',
    name: '청소비'
  },
  {
    code: '803',
    name: '엘리베이터비'
  },
  {
    code: '804',
    name: '수도전기료'
  },
  {
    code: '805',
    name: '모아홈비'
  },
  {
    code: '806',
    name: '수선비'
  },
  {
    code: '807',
    name: '정화조비'
  },
  {
    code: '808',
    name: '통신비'
  },
  {
    code: '809',
    name: '지급수수료'
  },
  {
    code: '810',
    name: '소모품'
  },
  {
    code: '812',
    name: '보험료'
  },
  {
    code: '813',
    name: '잡비'
  }
];
