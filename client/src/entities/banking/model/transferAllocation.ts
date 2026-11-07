import type { TransferAllocationPart } from './transferAllocationTypes';

/** 동별 이체금액은 전액을 한 번만 귀속하며 빈 행·0원은 이동 대상에서 제외합니다. */
export function calculateTransferAllocation(total: string, input: readonly TransferAllocationPart[], required: boolean, limits?: Readonly<Record<string, string | null>>) {
  const allocations = input.filter((part) => part.amount !== '' && part.amount !== '0');
  if (allocations.some((part) => !/^[0-9]{1,15}$/.test(part.amount) || BigInt(part.amount) <= BigInt(0))
    || new Set(allocations.map((part) => part.buildingId)).size !== allocations.length) return {
    allocations: [],
    error: '동별 이체금액을 확인해주세요.'
  };
  if (!required && !allocations.length) return {
    allocations,
    error: ''
  };
  // 동의 전체 자산이나 입금 통장 잔고가 아니라 출금 통장에 있는 해당 동의 몫만 이동할 수 있습니다.
  if (limits !== undefined) {
    for (const part of allocations) {
      const limit = limits[part.buildingId];
      if (limit == null) return {
        allocations: [],
        error: '출금 통장의 동별 보유금을 먼저 확인해주세요.'
      };
      if (BigInt(part.amount) > (BigInt(limit) > BigInt(0) ? BigInt(limit) : BigInt(0))) return {
        allocations: [],
        error: '동별 이체금액이 출금 통장의 보유금을 초과합니다.'
      };
    }
  }
  const sum = allocations.reduce((value, part) => value + BigInt(part.amount), BigInt(0));
  return {
    allocations,
    error: sum === BigInt(total) ? '' : '동별 이체금액의 합계를 전체 이체금액과 맞춰주세요.'
  };
}
