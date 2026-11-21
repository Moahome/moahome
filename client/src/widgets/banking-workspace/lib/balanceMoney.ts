import { formatWon } from '@/shared/lib/format';
/** 미설정 잔액은 0원으로 표시하지 않고 입력 필요 상태로 구분합니다. */
export const formatBalanceMoney = (value: string | bigint | null) => value === null ? '설정 필요' : formatWon(value);
