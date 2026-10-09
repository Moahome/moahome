import type { Option } from '@/shared/lib/options';

// 공통 등록 API의 FeeItemCode와 같은 값을 사용하며 표시 이름과 안내만 화면에 제공합니다.
export const FEE_ITEM_OPTIONS = [
  {
    value: 'GENERAL_MANAGEMENT',
    label: '일반관리비',
    description: '관리 운영에 드는 기본 비용'
  },
  {
    value: 'CLEANING',
    label: '청소비',
    description: '계단·복도 등 공용 공간 청소'
  },
  {
    value: 'ELEVATOR_MAINTENANCE',
    label: '승강기 유지비',
    description: '엘리베이터 점검·유지관리'
  },
  {
    value: 'COMMON_ELECTRICITY',
    label: '공용 전기료',
    description: '계단 조명·공용 설비 등의 전기 사용'
  },
  {
    value: 'COMMON_WATER',
    label: '공용 수도료',
    description: '공용 공간에서 사용하는 수도'
  },
  {
    value: 'SEPTIC_TANK_CLEANING',
    label: '정화조 청소비',
    description: '정화조 청소·오물 처리 비용'
  },
  {
    value: 'WASTE_DISPOSAL',
    label: '생활폐기물 처리비',
    description: '공용 생활 쓰레기 수거·처리 비용'
  },
] as const satisfies readonly Option[];

export type FeeItemCode = typeof FEE_ITEM_OPTIONS[number]['value'];
