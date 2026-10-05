import type { Option } from '@/shared/lib/options';

// 표시 목록을 한곳에서 관리하며 Server의 선택 문자열 계약에 유형별 제한을 추가하지 않습니다.
export const PROPERTY_TYPE_OPTIONS = [
  {
    value: '빌라',
    label: '빌라'
  },
  {
    value: '아파트',
    label: '아파트'
  },
  {
    value: '공동주택',
    label: '공동주택'
  },
  {
    value: '기타',
    label: '기타'
  },
] as const satisfies readonly Option[];

// false도 유효한 동 구분 선택이며 미선택(null)과 구분합니다.
export const BUILDING_PRESENCE_OPTIONS = [
  {
    value: false,
    label: '동 없음',
    description: '한 동으로만 구성된 건물이에요.'
  },
  {
    value: true,
    label: '동 있음',
    description: '101동, 102동처럼 동이 있어요.'
  },
] as const satisfies readonly Option<boolean>[];

// 초기 등록에서는 사용중·공실만 선택하며 비활성화는 등록 이후의 미정 정책과 구분합니다.
export const UNIT_STATUS_OPTIONS = [
  {
    value: 'ACTIVE',
    label: '사용중'
  },
  {
    value: 'VACANT',
    label: '공실'
  },
] as const satisfies readonly Option[];
