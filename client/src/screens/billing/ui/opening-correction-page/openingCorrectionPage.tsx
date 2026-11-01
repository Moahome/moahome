import { ListHeader } from '@/shared/ui/list-header';
import { OpeningBalances } from '../_components/opening-balances/openingBalances';
import styles from './openingCorrectionPage.module.css';

/** 모바일 초기 정정은 독립 페이지에서 입력하고 공통 헤더로 원래 인계 화면에 복귀합니다. */
export function BillingOpeningCorrectionPage({ propertyId }: { propertyId: string }) {
  return (
    <section
      className={styles.page}
    >
      <ListHeader
        menu={'기존 잔액 인계'}
        title={'초기 기준 정정'}
        titleId={'opening-correction-page-title'}
        description={'초기 기준일과 통장별 시작 금액을 정정합니다.'}
      />
      <OpeningBalances
        propertyId={propertyId}
        correctionPage
      />
    </section>
  );
}
