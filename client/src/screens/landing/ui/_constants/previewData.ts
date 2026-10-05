import type { LandingIconName } from '../_components/landingIcon';

type PreviewMenuItem = {
  icon: LandingIconName;
  label: string;
};

export const PREVIEW_MENU = [
  {
    icon: 'home',
    label: '대시보드'
  },
  {
    icon: 'people',
    label: '세대 관리'
  },
  {
    icon: 'receipt',
    label: '관리비 부과'
  },
  {
    icon: 'wallet',
    label: '입금 관리'
  },
  {
    icon: 'arrow',
    label: '통장 거래'
  },
  {
    icon: 'receipt',
    label: '지출 관리'
  },
  {
    icon: 'chart',
    label: '회계'
  },
  {
    icon: 'shield',
    label: '정산 / 마감'
  },
  {
    icon: 'notice',
    label: '공지'
  },
] as const satisfies readonly PreviewMenuItem[];

export const PREVIEW_PAYMENTS = [
  {
    date: '10.14',
    unit: '201호',
    amount: '60,000원',
    status: '납부완료'
  },
  {
    date: '10.14',
    unit: '302호',
    amount: '60,000원',
    status: '납부완료'
  },
  {
    date: '10.13',
    unit: '602호',
    amount: '30,000원',
    status: '일부납부'
  },
] as const;

export const PREVIEW_SCHEDULES = [
  {
    day: '05',
    label: '관리비 부과'
  },
  {
    day: '15',
    label: '1차 납부 안내'
  },
  {
    day: '20',
    label: '미납 세대 확인'
  },
  {
    day: '28',
    label: '관리비 정산'
  },
] as const;

export const PREVIEW_PHONE_ACTIONS = [
  {
    icon: 'wallet',
    label: '납부계좌'
  },
  {
    icon: 'receipt',
    label: '상세내역'
  },
  {
    icon: 'chart',
    label: '지난 내역'
  },
] as const satisfies readonly PreviewMenuItem[];

export const PREVIEW_PHONE_NAVIGATION = [
  {
    icon: 'home',
    label: '홈'
  },
  {
    icon: 'receipt',
    label: '관리비'
  },
  {
    icon: 'bell',
    label: '공지'
  },
  {
    icon: 'people',
    label: '내 정보'
  },
] as const satisfies readonly PreviewMenuItem[];
