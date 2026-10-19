import type { Option } from '@/shared/lib/options';
import type { ResidentSignupStatus } from './residentOptionsTypes';

export const RESIDENT_RELATION_OPTIONS: readonly Option[] = [
  {
    value: 'OWNER',
    label: '소유주'
  },
  {
    value: 'TENANT',
    label: '임차인'
  },
  {
    value: 'FAMILY',
    label: '가족'
  },
  {
    value: 'OTHER',
    label: '기타'
  }
];

export const RESIDENT_SIGNUP_OPTIONS: readonly Option<ResidentSignupStatus>[] = [
  {
    value: 'APPROVED',
    label: '가입 완료'
  },
  {
    value: 'NOT_JOINED',
    label: '미가입'
  },
  {
    value: 'PENDING',
    label: '승인 대기'
  }
];
