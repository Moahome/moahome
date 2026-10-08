import type { Option } from '@/shared/lib/options';

// 금융결제원 대표코드를 문자열로 유지하며 화면에는 은행명만 표시합니다.
// 출처: https://e-giro.giro.or.kr/service/jadongbatch/guideJadongInfo.do
export const BANK_OPTIONS = [
  {
    value: '004',
    label: '국민은행'
  },
  {
    value: '088',
    label: '신한은행'
  },
  {
    value: '020',
    label: '우리은행'
  },
  {
    value: '081',
    label: '하나은행'
  },
  {
    value: '011',
    label: '농협은행'
  },
  {
    value: '003',
    label: '기업은행'
  },
  {
    value: '090',
    label: '카카오뱅크'
  },
  {
    value: '089',
    label: '케이뱅크'
  },
  {
    value: '092',
    label: '토스뱅크'
  },
  {
    value: '002',
    label: '산업은행'
  },
  {
    value: '007',
    label: '수협은행'
  },
  {
    value: '023',
    label: 'SC제일은행'
  },
  {
    value: '027',
    label: '한국씨티은행'
  },
  {
    value: '031',
    label: '아이엠뱅크'
  },
  {
    value: '032',
    label: '부산은행'
  },
  {
    value: '034',
    label: '광주은행'
  },
  {
    value: '035',
    label: '제주은행'
  },
  {
    value: '037',
    label: '전북은행'
  },
  {
    value: '039',
    label: '경남은행'
  },
  {
    value: '012',
    label: '지역농축협'
  },
  {
    value: '045',
    label: '새마을금고'
  },
  {
    value: '048',
    label: '신협중앙회'
  },
  {
    value: '064',
    label: '산림조합중앙회'
  },
  {
    value: '071',
    label: '우체국'
  },
] as const satisfies readonly Option[];
