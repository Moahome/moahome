import {
  calculateExpenseAllocation,
  calculateTransferAllocation
} from '@/entities/banking';
import type {
  RegistrationBankChoice,
  RegistrationBankDraft,
  RegistrationBankRow
} from './registrationBankTypes';
import type {
  BuildingDraft,
  UnitDraft
} from './unitSetupTypes';
import type { OpeningBalancesDraft } from './openingBalancesTypes';
import type { RegistrationAccount } from './bankAccountTypes';
import type {
  RegistrationBankDistribution,
  RegistrationBankImportRequest,
  RegistrationManualTransactionRequest
} from '../api/registrationBankApiTypes';
import { normalizeAccountNumber } from './bankAccount';

/** 이름만으로 주민을 추정하지 않고 유일하게 일치하는 동·호수 표기만 초기 추천에 사용합니다. */
export function createRegistrationBankChoice(row: RegistrationBankRow, units: UnitDraft[], buildings: BuildingDraft[]): RegistrationBankChoice {
  const normalize = (value: string) => value.replace(/[\s동호-]/g, '').toLocaleLowerCase();
  const matches = row.autoMatchEligible ? units.filter((unit) => normalize(`${buildings.find((building) => building.clientId === unit.buildingClientId)?.name ?? ''}${unit.unitNumber}`) === normalize(row.payer)) : [];
  return {
    included: true,
    transfer: false,
    receipt: {
      kind: matches.length === 1 ? 'HOUSEHOLD' : 'AUTO',
      unitId: matches.length === 1 ? matches[0].clientId : '',
      category: '',
      note: ''
    },
    expense: {
      category: row.direction === 'EXPENSE' ? row.payer : '',
      note: '',
      mode: !buildings.length && row.direction === 'EXPENSE' ? 'PROPERTY' : 'EQUAL',
      saveAsRule: false,
      allocations: buildings.length === 1 ? [{
        buildingId: buildings[0].clientId,
        label: buildings[0].name,
        amount: row.amount,
        percentage: null
      }] : []
    }
  };
}

/** 저장 대상 전체를 검증하므로 필터·페이지 밖의 미완료 거래도 누락하지 않습니다. */
export function getRegistrationBankError(draft: RegistrationBankDraft, cutoffDate: string, units: UnitDraft[], buildings: BuildingDraft[]) {
  const selected = draft.rows.filter((row) => draft.choices[row.id]?.included);
  if (!selected.length) return '';
  if (!draft.content) return '새로고침 후에는 은행 원본 파일을 다시 선택해주세요.';
  for (const row of selected) {
    const choice = draft.choices[row.id];
    if (choice.transfer) {
      if (!choice.transferAccountId) return `${row.payer}: 이체한 상대 관리 통장을 선택해주세요.`;
      const transfer = calculateTransferAllocation(row.amount, choice.transferAllocations ?? [], buildings.length > 0);
      if (transfer.error) return `${row.payer}: ${transfer.error}`;
      if (transfer.allocations.some((part) => !buildings.some((building) => building.clientId === part.buildingId))) return '이체할 동을 다시 선택해주세요.';
      continue;
    }
    const receipt = choice.receipt;
    if (row.direction === 'INCOME') {
      if (receipt.kind === 'HOUSEHOLD' && !units.some((unit) => unit.clientId === receipt.unitId)) return `${row.payer}: 수납 세대를 선택해주세요.`;
      if (receipt.kind === 'AUTO' && row.date <= cutoffDate) return `${row.payer}: 기준일까지 입금의 세대 또는 입금 용도를 확인해주세요.`;
      if (receipt.kind === 'OTHER' && !receipt.category.trim()) return `${row.payer}: 기타 입금 항목을 입력해주세요.`;
      if (receipt.kind !== 'SHARED') continue;
    }
    if (choice.expense.allocations.some((share) => share.buildingId && !buildings.some((building) => building.clientId === share.buildingId))) return `${row.payer}: 삭제되거나 변경된 동을 다시 선택해주세요.`;
    const allocation = calculateExpenseAllocation(row.amount, choice.expense, row.direction === 'INCOME' ? 'income' : 'expense');
    if (allocation.error) return `${row.payer}: ${allocation.error}`;
  }
  return '';
}

/** 활성 입력 방식의 원본·입출금과 변경된 통장·세대 참조를 최종 제출 전에 확인합니다. */
export function getRegistrationHistoryError(opening: OpeningBalancesDraft, accounts: RegistrationAccount[], units: UnitDraft[], buildings: BuildingDraft[]) {
  for (const account of accounts) {
    if (opening.startMethods?.[account.clientId] !== 'UPLOAD') continue;
    const file = opening.bankImports?.[account.clientId];
    if (!file) return '은행 거래내역 파일을 선택해주세요.';
    if (!file.content) return '새로고침 후에는 은행 원본 파일을 다시 선택해주세요.';
    if (!file.rows.some((row) => file.choices[row.id]?.included)) return '가져올 입금·출금을 한 건 이상 선택해주세요.';
    if (getRegistrationBankBalance(file, opening.cutoffDate) === null) return '통장 기준일의 마감 잔액을 확인할 수 있는 파일을 선택해주세요. 파일에 잔액이 없으면 직접 입력을 사용해주세요.';
    if (file.bankCode !== account.bankCode || normalizeAccountNumber(file.accountNumber) !== normalizeAccountNumber(account.accountNumber)) return '통장 정보가 변경되었습니다. 은행 파일을 다시 선택해주세요.';
    if (accounts.length < 2 && file.rows.some((row) => file.choices[row.id]?.included && file.choices[row.id].transfer)) return '계좌 간 이체는 통장이 두 개 이상 필요합니다. 해당 거래의 설정을 다시 확인해주세요.';
    if (file.rows.some((row) => {
      const choice = file.choices[row.id];
      return choice?.included && choice.transfer && (!choice.transferAccountId || choice.transferAccountId === account.clientId || !accounts.some((candidate) => candidate.clientId === choice.transferAccountId));
    })) return '이체한 상대 관리 통장을 다시 선택해주세요.';
    const error = getRegistrationBankError(file, opening.cutoffDate, units, buildings);
    if (error) return error;
  }
  for (const record of opening.manualTransactions ?? []) {
    const account = accounts.find((entry) => entry.clientId === record.accountClientId);
    if (!account || opening.startMethods?.[account.clientId] === 'UPLOAD') continue;
    if (!/^[0-9]{1,15}$/.test(record.amount) || BigInt(record.amount) <= BigInt(0) || !record.payer.trim() || !record.date) return '수기로 입력한 입출금의 날짜·금액·입금자 또는 지출명을 확인해주세요.';
    if (record.direction === 'INCOME' && record.purpose === 'HOUSEHOLD' && !units.some((unit) => unit.clientId === record.unitClientId)) return '수기로 입력한 입금의 세대를 다시 선택해주세요.';
    if (record.allocation) {
      if (record.allocation.allocations.some((share) => share.buildingId && !buildings.some((building) => building.clientId === share.buildingId))) return '수기로 입력한 거래의 배분 동을 다시 확인해주세요.';
      const split = calculateExpenseAllocation(record.amount, record.allocation, record.direction === 'INCOME' ? 'income' : 'expense');
      if (split.error) return split.error;
    }
  }
  return '';
}

/** 수기 입출금은 현재 직접 입력을 선택한 통장의 초안만 최종 계약으로 변환합니다. */
export function createRegistrationManualTransactions(opening: OpeningBalancesDraft, accounts: RegistrationAccount[], units: UnitDraft[]): RegistrationManualTransactionRequest[] {
  return (opening.manualTransactions ?? []).flatMap((record) => {
    const accountIndex = accounts.findIndex((account) => account.clientId === record.accountClientId);
    if (accountIndex < 0 || opening.startMethods?.[record.accountClientId] === 'UPLOAD') return [];
    return [{
      id: record.id,
      accountIndex,
      direction: record.direction,
      date: record.date,
      amount: record.amount,
      payer: record.payer,
      purpose: record.purpose,
      ...(record.unitClientId ? {
        unitIndex: units.findIndex((unit) => unit.clientId === record.unitClientId)
      } : {}),
      ...(record.category ? {
        category: record.category
      } : {}),
      ...(record.note ? {
        note: record.note
      } : {}),
      ...(record.allocation ? {
        allocation: distribution(record.amount, record.allocation, record.direction === 'INCOME' ? 'income' : 'expense')
      } : {})
    }];
  });
}

/** 복원한 파일 목록은 구조를 다시 확인하고 원본 바이트는 현재 메모리의 초안을 정리할 때만 유지합니다. */
export function restoreRegistrationBankDraft(value: unknown, preserveFile: boolean): RegistrationBankDraft | null {
  const draft = value as RegistrationBankDraft | null;
  if (!draft || typeof draft.fileName !== 'string' || typeof draft.bankCode !== 'string' || typeof draft.accountNumber !== 'string'
    || !draft.period || typeof draft.period.from !== 'string' || typeof draft.period.to !== 'string'
    || !Array.isArray(draft.rows) || draft.rows.length > 5000 || !draft.rows.every((row) => row && typeof row.id === 'string'
      && typeof row.date === 'string' && typeof row.payer === 'string' && /^[0-9]{1,15}$/.test(row.amount)
      && (row.balance === null || /^-?[0-9]{1,15}$/.test(row.balance)) && ['INCOME', 'EXPENSE'].includes(row.direction)
      && typeof row.autoMatchEligible === 'boolean') || !draft.choices) return null;
  for (const row of draft.rows) {
    const choice = draft.choices[row.id];
    if (!choice || typeof choice.included !== 'boolean' || typeof choice.transfer !== 'boolean' || !choice.receipt
      || (choice.transferAccountId !== undefined && typeof choice.transferAccountId !== 'string')
      || (choice.transferAllocations !== undefined && (!Array.isArray(choice.transferAllocations) || choice.transferAllocations.some((part) => !part || typeof part.buildingId !== 'string' || typeof part.amount !== 'string')))
      || !['AUTO', 'HOUSEHOLD', 'OTHER', 'SHARED'].includes(choice.receipt.kind)
      || [choice.receipt.unitId, choice.receipt.category, choice.receipt.note].some((field) => typeof field !== 'string')
      || !choice.expense || !['EQUAL', 'RATIO', 'AMOUNT', 'PROPERTY'].includes(choice.expense.mode)
      || (choice.expense.accountCode != null && !/^8\d{2}$/.test(choice.expense.accountCode))
      || typeof choice.expense.category !== 'string' || typeof choice.expense.note !== 'string'
      || !Array.isArray(choice.expense.allocations) || choice.expense.allocations.some((share) => !share || typeof share.label !== 'string'
        || typeof share.amount !== 'string' || !(share.buildingId === null || typeof share.buildingId === 'string')
        || !(share.percentage === null || typeof share.percentage === 'string'))) return null;
  }
  return {
    ...draft,
    content: preserveFile && typeof draft.content === 'string' ? draft.content : ''
  };
}

/** 파일 바이트와 선택 식별자만 제출하고 거래 일시·금액은 최종 저장 때 Server가 원본에서 다시 읽습니다. */
export function createRegistrationBankImports(opening: OpeningBalancesDraft, accounts: RegistrationAccount[], units: UnitDraft[]): RegistrationBankImportRequest[] {
  return accounts.flatMap((account, accountIndex) => {
    if (opening.startMethods?.[account.clientId] !== 'UPLOAD') return [];
    const draft = opening.bankImports?.[account.clientId];
    if (!draft) return [];
    const rows = draft.rows.filter((row) => draft.choices[row.id]?.included).map((row) => {
      const choice = draft.choices[row.id];
      if (choice.transfer) return {
        id: row.id,
        transfer: true,
        transferAccountIndex: accounts.findIndex((candidate) => candidate.clientId === choice.transferAccountId),
        ...(choice.transferAllocations?.length ? {
          transferAllocations: calculateTransferAllocation(row.amount, choice.transferAllocations, true).allocations.map((part) => ({
            buildingClientId: part.buildingId,
            amount: part.amount
          }))
        } : {})
      };
      const receipt = choice.receipt;
      if (row.direction === 'EXPENSE') return {
        id: row.id,
        transfer: false,
        expense: distribution(row.amount, choice.expense, 'expense')
      };
      if (receipt.kind === 'HOUSEHOLD') return {
        id: row.id,
        transfer: false,
        unitIndex: units.findIndex((unit) => unit.clientId === receipt.unitId)
      };
      if (receipt.kind === 'OTHER') return {
        id: row.id,
        transfer: false,
        incomeCategory: receipt.category.trim(),
        ...(receipt.note.trim() ? {
          incomeNote: receipt.note.trim()
        } : {})
      };
      if (receipt.kind === 'SHARED') return {
        id: row.id,
        transfer: false,
        incomeCategory: choice.expense.category.trim(),
        incomeAllocation: distribution(row.amount, choice.expense, 'income')
      };
      return {
        id: row.id,
        transfer: false
      };
    });
    return rows.length ? [{
      accountIndex,
      fileName: draft.fileName,
      content: draft.content,
      rows
    }] : [];
  });
}

/** 화면 선택과 무관한 파일 원본에서 기준일의 마지막 잔액을 찾으며 동시간·순서 불명확 값은 확정하지 않습니다. */
export function getRegistrationBankBalance(draft: RegistrationBankDraft | undefined, cutoffDate: string): string | null {
  const rows = draft?.rows.filter((row) => row.date === cutoffDate).sort((left, right) => (right.time ?? '').localeCompare(left.time ?? '')) ?? [];
  if (!rows.length || (rows.length > 1 && (!rows.every((row) => row.time) || rows[0].time === rows[1].time))) return null;
  return rows[0].balance !== null && /^[0-9]{1,15}$/.test(rows[0].balance) ? rows[0].balance : null;
}

function distribution(amount: string, expense: RegistrationBankChoice['expense'], purpose: 'income' | 'expense'): RegistrationBankDistribution {
  const result = calculateExpenseAllocation(amount, expense, purpose);
  return {
    category: expense.category.trim(),
    ...(purpose === 'expense' && expense.accountCode ? {
      accountCode: expense.accountCode
    } : {}),
    note: expense.note.trim() || null,
    mode: expense.mode,
    saveAsRule: purpose === 'expense' && expense.saveAsRule,
    allocations: result.allocations.map((share) => ({
      buildingClientId: share.buildingId,
      label: share.label,
      amount: share.amount,
      percentage: share.percentage
    }))
  };
}
