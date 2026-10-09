/** 문자열·BigInt는 숫자로 변환하지 않아 큰 정수와 음수의 자릿수를 그대로 표시합니다. */
export function formatInteger(value: string | bigint | number): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError('안전한 정수만 숫자 형식으로 표시할 수 있습니다.');
  }

  const integer = String(value);
  if (!/^-?[0-9]+$/.test(integer)) throw new TypeError('정수만 표시할 수 있습니다.');

  return integer.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, ',');
}

/** 원 단위 정수 표시를 공유하며 금액의 허용 범위와 합계 검증은 사용하는 업무 모델에서 처리합니다. */
export function formatWon(value: string | bigint | number): string {
  return `${formatInteger(value)}원`;
}
