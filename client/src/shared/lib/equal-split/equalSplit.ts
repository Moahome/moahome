/** 참고용 균등 분담액을 정수로 계산하고 원 단위 내림·올림의 합계 차이를 보존합니다. */
export function calculateEqualSplit(amount: string, count: string) {
  if (!/^[0-9]{1,15}$/.test(amount) || !/^[0-9]{1,9}$/.test(count)) return null;
  const total = BigInt(amount);
  const units = BigInt(count);
  if (units === BigInt(0)) return null;
  const lower = total / units;
  const remainder = total % units;
  const upper = remainder === BigInt(0) ? lower : lower + BigInt(1);

  return {
    total,
    units,
    exact: remainder === BigInt(0),
    lower,
    upper,
    lowerTotal: lower * units,
    upperTotal: upper * units,
    shortage: remainder,
    excess: upper * units - total
  };
}
