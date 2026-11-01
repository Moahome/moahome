import { useSession } from '@/entities/session';
import {
  useCallback,
  useMemo,
  useState
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMonthRange } from '@/shared/lib/month-range';
import { getReportPeriodLabel } from '@/shared/lib/pdf-report';
import { Dropdown } from '@/shared/ui/form-controls';
import { ReportDownload } from '@/shared/ui/report-download';
import { getBankingBalances } from '../../../api/bankingBalanceApi';
import type { BalanceReportSnapshot } from '../../../model/balanceReportTypes';
import {
  createBalanceReportWorkbook,
  getBalanceReportDocument,
  getBalanceReportBuildingOptions,
  getBalanceReportAccountOptions
} from '../../../model/balanceReport';

/** 잔고 화면에서 동별 입출금 명세를 출력하며 동·계좌 선택과 미확인 잔액 조회를 같은 범위로 유지합니다. */
export function BalanceDownload({ data, initialAccountId = '', initialBuildingId = '', onClose }: {
  data: BalanceReportSnapshot; initialAccountId?: string; initialBuildingId?: string; onClose: () => void;
}) {
  const session = useSession();
  const startMonth = data.startMonth ?? data.month;
  const period = formatMonthRange({
    startMonth,
    endMonth: data.month
  });
  const filenamePeriod = startMonth === data.month ? data.month : `${startMonth}_${data.month}`;
  const [buildingId, setBuildingId] = useState(initialBuildingId);
  const [accountId, setAccountId] = useState(initialAccountId);
  const needsAccountBalance = Boolean(accountId) && data.balances.buildings.every((building) => building.accountBalances === undefined);
  const accountBalances = useQuery({
    queryKey: ['balance-download-account-balances', session.data?.id, data.propertyId, data.month, startMonth, data.generatedAt, accountId],
    queryFn: ({ signal }) => getBankingBalances(data.propertyId, data.month, accountId, signal, startMonth),
    enabled: needsAccountBalance,
    staleTime: Infinity,
    gcTime: 0,
    retry: false
  });
  const effectiveData = useMemo(() => needsAccountBalance && accountBalances.data ? {
    ...data,
    balances: accountBalances.data
  } : data, [data, needsAccountBalance, accountBalances.data]);
  const buildings = getBalanceReportBuildingOptions(data);
  const accounts = getBalanceReportAccountOptions(data);
  const buildingLabel = buildings.find((row) => row.id === buildingId)?.label ?? '전체 동';
  const accountLabel = accounts.find((row) => row.id === accountId)?.label ?? '전체 계좌';
  const document = useMemo(() => getBalanceReportDocument(effectiveData, buildingId, accountId), [effectiveData, buildingId, accountId]);
  const createWorkbook = useCallback(() => createBalanceReportWorkbook(effectiveData, buildingId, accountId), [effectiveData, buildingId, accountId]);
  const createPdf = useCallback(() => import('../../../model/balanceReportPdf').then((module) => module.createBalanceReportPdf(effectiveData, buildingId, accountId)), [effectiveData, buildingId, accountId]);
  const suffix = [buildingId ? buildingLabel : '', accountId ? accountLabel : ''].filter(Boolean).map((label) => label.replace(/[\\/:*?"<>|]/g, '_')).join('_');
  const propertyFilename = data.propertyName.replace(/[\\/:*?"<>|]/g, '_');
  const failed = needsAccountBalance && (accountBalances.isError || (accountBalances.data !== undefined && accountBalances.data.accountId !== accountId));

  return (
    <ReportDownload
      title={`${period} 동별 입출금 내역`}
      description={'선택한 기간의 동별 입금·지출과 잔액을 확인하고 내려받으세요.'}
      filename={`${propertyFilename}_동별입출금내역_${filenamePeriod}${suffix ? `_${suffix}` : ''}`}
      sourceKey={`${data.generatedAt}:${startMonth}:${data.month}:${buildingId}:${accountId}:${accountBalances.dataUpdatedAt}`}
      documents={[document]}
      highlights={['기초 잔액', '입금 합계', '지출 합계', '월말 잔액'].map((label, index) => ({
        label,
        value: index === 1 ? document.total?.[5] ?? '' : index === 2 ? document.total?.[6] ?? '' : document.summary.find((item) => item.label === label)?.value ?? ''
      }))}
      scopeLabel={`${buildingLabel} · ${accountLabel} · ${getReportPeriodLabel(data)}`}
      createWorkbook={createWorkbook}
      createPdf={createPdf}
      pending={needsAccountBalance && accountBalances.isPending}
      error={failed ? '선택한 계좌의 잔액을 불러오지 못했어요.' : ''}
      onRetry={() => void accountBalances.refetch()}
      onClose={onClose}
      renderFilters={(busy) => (
        <>
          <Dropdown
            label={'조회 동'}
            value={buildingId}
            disabled={busy}
            options={[{
              value: '',
              label: '전체 동'
            }, ...buildings.map((row) => ({
              value: row.id,
              label: row.label
            }))]}
            onChange={setBuildingId}
          />
          <Dropdown
            label={'조회 계좌'}
            value={accountId}
            disabled={busy}
            options={[{
              value: '',
              label: '전체 계좌'
            }, ...accounts.map((row) => ({
              value: row.id,
              label: row.label
            }))]}
            onChange={setAccountId}
          />
        </>
      )}
    />
  );
}
