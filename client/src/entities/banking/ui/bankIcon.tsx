import Image from 'next/image';
import { BANK_OPTIONS } from '../constants/bankOptions';

/** 은행 식별 아이콘은 로컬 자산을 사용하고 접근 가능한 이름은 함께 표시하는 은행명에서 제공합니다. */
export function BankIcon({
  bankCode,
}: {
  bankCode: string;
}) {
  const bank = BANK_OPTIONS.find((option) => option.value === bankCode);
  if (!bank) return null;

  return (
    <Image
      src={bank.iconSrc}
      alt={''}
      width={32}
      height={32}
      unoptimized
      draggable={false}
      aria-hidden={'true'}
    />
  );
}
