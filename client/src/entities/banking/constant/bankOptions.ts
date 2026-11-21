import type { BankOption } from './bankOptionsTypes';

// 금융결제원 대표코드를 문자열로 유지하며 화면에는 은행명만 표시합니다.
// 출처: https://e-giro.giro.or.kr/service/jadongbatch/guideJadongInfo.do
export const BANK_OPTIONS = [
  {
    value: '004',
    label: '국민은행',
    iconSrc: '/banks/bank004.png',
    searchKeywords: ['KB', 'KB국민은행']
  },
  {
    value: '088',
    label: '신한은행',
    iconSrc: '/banks/bank088.png',
    searchKeywords: ['Shinhan']
  },
  {
    value: '020',
    label: '우리은행',
    iconSrc: '/banks/bank020.png',
    searchKeywords: ['Woori']
  },
  {
    value: '081',
    label: '하나은행',
    iconSrc: '/banks/bank081.png',
    searchKeywords: ['Hana', 'KEB하나']
  },
  {
    value: '011',
    label: '농협은행',
    iconSrc: '/banks/bank011.png',
    searchKeywords: ['NH', 'NH농협은행']
  },
  {
    value: '003',
    label: '기업은행',
    iconSrc: '/banks/bank003.png',
    searchKeywords: ['IBK', 'IBK기업은행']
  },
  {
    value: '090',
    label: '카카오뱅크',
    iconSrc: '/banks/bank090.png',
    searchKeywords: ['Kakao', '카카오']
  },
  {
    value: '089',
    label: '케이뱅크',
    iconSrc: '/banks/bank089.png',
    searchKeywords: ['Kbank', '케이']
  },
  {
    value: '092',
    label: '토스뱅크',
    iconSrc: '/banks/bank092.png',
    searchKeywords: ['Toss', '토스']
  },
  {
    value: '002',
    label: '산업은행',
    iconSrc: '/banks/bank002.png',
    searchKeywords: ['KDB', 'KDB산업은행']
  },
  {
    value: '007',
    label: '수협은행',
    iconSrc: '/banks/bank007.png',
    searchKeywords: ['Sh', 'Sh수협은행']
  },
  {
    value: '023',
    label: 'SC제일은행',
    iconSrc: '/banks/bank023.png',
    searchKeywords: ['SC', '스탠다드차타드']
  },
  {
    value: '027',
    label: '한국씨티은행',
    iconSrc: '/banks/bank027.png',
    searchKeywords: ['Citi', '씨티은행']
  },
  {
    value: '031',
    label: '아이엠뱅크',
    iconSrc: '/banks/bank031.png',
    searchKeywords: ['iM', 'iM뱅크', '대구은행', 'DGB']
  },
  {
    value: '032',
    label: '부산은행',
    iconSrc: '/banks/bank032.png',
    searchKeywords: ['BNK부산은행']
  },
  {
    value: '034',
    label: '광주은행',
    iconSrc: '/banks/bank034.png',
    searchKeywords: ['JB광주은행']
  },
  {
    value: '035',
    label: '제주은행',
    iconSrc: '/banks/bank035.png',
    searchKeywords: ['Jeju']
  },
  {
    value: '037',
    label: '전북은행',
    iconSrc: '/banks/bank037.png',
    searchKeywords: ['JB전북은행']
  },
  {
    value: '039',
    label: '경남은행',
    iconSrc: '/banks/bank039.png',
    searchKeywords: ['BNK경남은행']
  },
  {
    value: '012',
    label: '지역농축협',
    iconSrc: '/banks/bank012.png',
    searchKeywords: ['NH', '농협', '지역농협', '지역축협']
  },
  {
    value: '045',
    label: '새마을금고',
    iconSrc: '/banks/bank045.png',
    searchKeywords: ['MG', '금고']
  },
  {
    value: '048',
    label: '신협중앙회',
    iconSrc: '/banks/bank048.png',
    searchKeywords: ['CU', '신협']
  },
  {
    value: '064',
    label: '산림조합중앙회',
    iconSrc: '/banks/bank064.png',
    searchKeywords: ['산림조합', 'SJ']
  },
  {
    value: '071',
    label: '우체국',
    iconSrc: '/banks/bank071.png',
    searchKeywords: ['우체국예금', 'Post']
  },
] as const satisfies readonly BankOption[];
