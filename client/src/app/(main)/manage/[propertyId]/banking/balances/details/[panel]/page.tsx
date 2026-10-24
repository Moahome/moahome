import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BankingBalancePanelPage } from '@/screens/banking/balance-panel';

const PANEL_TITLES = {
  account: '통장 상세',
  check: '은행 잔액 직접 확인',
  checks: '은행 잔액 확인 이력',
  opening: '기준 잔고 확인',
  chart: '동별 입금·지출 비교',
  difference: '잔고 차이 내역',
  settlement: '외부 부담금 정산',
  assignment: '입금 귀속 동 확인'
};

type Props = PageProps<'/manage/[propertyId]/banking/balances/details/[panel]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { panel } = await params;
  return {
    title: PANEL_TITLES[panel as keyof typeof PANEL_TITLES] ?? '잔고 상세'
  };
}

export default async function Page({ params }: Props) {
  const { propertyId, panel } = await params;
  if (!Object.hasOwn(PANEL_TITLES, panel)) notFound();
  return (
    <BankingBalancePanelPage
      propertyId={propertyId}
      panel={panel as keyof typeof PANEL_TITLES}
    />
  );
}
