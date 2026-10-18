import {
  BankingBalances,
  type BalancePanel
} from '@/widgets/banking-workspace';

/** 잔고 상세의 조회·저장 내용을 기존 모달과 공유하는 모바일 페이지입니다. */
export function BankingBalancePanelPage({ propertyId, panel }: {
  propertyId: string;
  panel: BalancePanel;
}) {
  return (
    <BankingBalances
      propertyId={propertyId}
      panel={panel}
    />
  );
}
