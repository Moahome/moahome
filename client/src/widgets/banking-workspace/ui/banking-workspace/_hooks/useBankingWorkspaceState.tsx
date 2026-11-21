'use client';

import { type TransferAllocationPart } from '@/entities/banking';
import { useSearchParams } from 'next/navigation';
import {
  useRef,
  useState
} from 'react';
import type {
  BankingPreview,
  BankingTransaction,
  ExpenseDraft
} from '../../../api/bankingApiTypes';
import type { BankReceiptDraft as ReceiptDraft } from '@/entities/banking';

/** 통장 Filters 상태를 한 책임으로 관리합니다. */
export function useBankingFilters(searchParams: ReturnType<typeof useSearchParams>) {

  const [requestedAccountId, setAccountId] = useState(() => searchParams.get('account') ?? 'ALL');

  const [direction, setDirection] = useState(() => ['INCOME', 'EXPENSE', 'CANCELED'].includes(searchParams.get('direction') ?? '') ? searchParams.get('direction')! : 'ALL');

  const [status, setStatus] = useState(() => ['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(searchParams.get('status') ?? '') ? searchParams.get('status')! : 'ALL');

  const [processing, setProcessing] = useState('ALL');

  const [building, setBuilding] = useState('ALL');

  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);

  const [pageSize, setPageSize] = useState(10);

  const [selection, setSelection] = useState<{ scope: string;
ids: string[] } | null>(null);

  return {
    requestedAccountId,
    setAccountId,
    direction,
    setDirection,
    status,
    setStatus,
    processing,
    setProcessing,
    building,
    setBuilding,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    selection,
    setSelection
  };
}

/** 통장 UploadDraft 상태를 한 책임으로 관리합니다. */
export function useBankingUploadDraft() {

  const [transferRows, setTransferRows] = useState<string[]>([]);

  const [transferAllocations, setTransferAllocations] = useState<Record<string, TransferAllocationPart[]>>({});

  const [transferAccounts, setTransferAccounts] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<BankingPreview | null>(null);

  const [file, setFile] = useState<File | null>(null);

  const [replacingFile, setReplacingFile] = useState(false);

  const [excluded, setExcluded] = useState<string[]>([]);

  const [expenses, setExpenses] = useState<Record<string, ExpenseDraft>>({});

  const [receipts, setReceipts] = useState<Record<string, ReceiptDraft>>({});

  const [editingId, setEditingId] = useState<string | null>(null);

  return {
    transferRows,
    setTransferRows,
    transferAllocations,
    setTransferAllocations,
    transferAccounts,
    setTransferAccounts,
    preview,
    setPreview,
    file,
    setFile,
    replacingFile,
    setReplacingFile,
    excluded,
    setExcluded,
    expenses,
    setExpenses,
    receipts,
    setReceipts,
    editingId,
    setEditingId
  };
}

/** 통장 Dialogs 상태를 한 책임으로 관리합니다. */
export function useBankingDialogs() {

  const [transferDetail, setTransferDetail] = useState<BankingTransaction | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [deleteError, setDeleteError] = useState('');

  const [manualOpen, setManualOpen] = useState(false);

  const [manualExpenseOpen, setManualExpenseOpen] = useState(false);

  const [detail, setDetail] = useState<{ id: string;
kind: 'receipt' | 'expense' } | null>(null);

  return {
    transferDetail,
    setTransferDetail,
    deleteOpen,
    setDeleteOpen,
    deleteError,
    setDeleteError,
    manualOpen,
    setManualOpen,
    manualExpenseOpen,
    setManualExpenseOpen,
    detail,
    setDetail
  };
}

/** 통장 Feedback 상태를 한 책임으로 관리합니다. */
export function useBankingFeedback(view: 'transactions' | 'expenses' | 'upload', searchParams: ReturnType<typeof useSearchParams>) {

  const [busy, setBusy] = useState(false);

  const busyRef = useRef(false);

  const [notice, setNotice] = useState<{ id: number;
message: string;
tone: 'success' | 'error' } | null>(() => (
  (view === 'transactions' && searchParams.get('imported') === '1') || (view === 'transactions' && ['1', 'transfer'].includes(searchParams.get('registered') ?? '')) ? {
    id: 0,
    message: searchParams.get('registered') === 'transfer' ? '계좌 간 이체를 등록했어요.' : searchParams.get('registered') === '1' ? '지출을 등록했어요.' : '선택한 거래를 저장했어요.',
    tone: 'success'
  } : null
));

  return {
    busy,
    setBusy,
    busyRef,
    notice,
    setNotice
  };
}
