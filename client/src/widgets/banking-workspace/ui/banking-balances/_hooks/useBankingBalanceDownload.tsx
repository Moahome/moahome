'use client';

import type {
  RefObject,
  Dispatch,
  SetStateAction
} from 'react';
import type { BalanceWorkspace } from '../../../api/bankingBalanceApiTypes';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AccountBalance } from '@/widgets/banking-workspace/api/bankingBalanceApiTypes';

import { useCallback } from 'react';
import type { useManagementContext } from '@/features/enter-service';
import type { useReportDownload } from '@/shared/ui/report-download';
import { getBankingWorkspace } from '../../../api/bankingApi';
import { getBankingBalances } from '../../../api/bankingBalanceApi';
import type { BalanceBuilding } from '../../../api/bankingBalanceApiTypes';
import { BalanceDownload } from '../../_components/balance-download/balanceDownload';
import type { BalanceReportSnapshot } from '../../../model/balanceReportTypes';
interface UseBankingBalanceDownloadOptions {
  exportBusyRef: RefObject<boolean>;
  data: BalanceWorkspace;
  query: UseQueryResult<BalanceWorkspace, Error>;
  context: ReturnType<typeof useManagementContext>;
  setExporting: Dispatch<SetStateAction<boolean>>;
  propertyId: string;
  month: string;
  startMonth: string;
  openDownload: ReturnType<typeof useReportDownload>['openDownload'];
  downloadButton: RefObject<HTMLButtonElement | null>;
  balanceQuery: URLSearchParams;
  selectedAccount: AccountBalance | undefined;
  selectedBuilding: BalanceBuilding | undefined;
  setNotice: Dispatch<SetStateAction<{
    message: string;
    tone: 'success' | 'error';
  } | null>>;
}

/** 통장 BalanceDownload 책임의 처리와 재시도 흐름을 분리합니다. */
export function useBankingBalanceDownload({
  exportBusyRef,
  data,
  query,
  context,
  setExporting,
  propertyId,
  month,
  startMonth,
  openDownload,
  downloadButton,
  balanceQuery,
  selectedAccount,
  selectedBuilding,
  setNotice
}: UseBankingBalanceDownloadOptions) {

  const download = useCallback(async () => {
    if (exportBusyRef.current || !data || query.isFetching || query.isError || !context.data?.name)
      return;
    exportBusyRef.current = true;
    setExporting(true);
    try {
      const [banking, balances] = await Promise.all([
        getBankingWorkspace(propertyId),
        data.accountId ? getBankingBalances(propertyId, month, undefined, undefined, startMonth) : Promise.resolve(data)
      ]);
      const snapshot: BalanceReportSnapshot = {
        propertyId,
        propertyName: context.data.name,
        month,
        startMonth,
        generatedAt: new Date().toISOString(),
        banking,
        balances
      };
      openDownload({
        focusTarget: downloadButton.current,
        pageHref: `/manage/${propertyId}/banking/balances/download?${balanceQuery}`,
        render: (presentation, onClose) => (
          <BalanceDownload
            data={snapshot}
            presentation={presentation}
            initialAccountId={selectedAccount?.id ?? ''}
            initialBuildingId={selectedBuilding?.id ?? ''}
            onClose={onClose}
          />
        )
      });
    } catch {
      setNotice({
        message: '다운로드 자료를 불러오지 못했어요. 다시 시도해주세요.',
        tone: 'error'
      });
    } finally {
      exportBusyRef.current = false;
      setExporting(false);
    }
  }, [exportBusyRef, data, query, context, setExporting, propertyId, month, startMonth, openDownload, downloadButton, balanceQuery, selectedAccount, selectedBuilding, setNotice]);

  return {
    download
  };
}
