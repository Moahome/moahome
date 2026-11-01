import { ListHeader } from '@/shared/ui/list-header';
import { OpeningBalances } from '../_components/opening-balances/openingBalances';
import styles from './openingUploadPage.module.css';

/** 직접 접근·새로고침에도 조회한 인계 초안으로 파일을 선택하며 모바일 복귀는 공통 헤더에 맡깁니다. */
export function BillingOpeningUploadPage({ propertyId }: { propertyId: string }) {
  return (
    <section
      className={styles.page}
    >
      <ListHeader
        menu={'기존 잔액 인계'}
        title={'엑셀 업로드'}
        titleId={'opening-upload-page-title'}
        description={'양식을 내려받아 작성한 파일을 업로드해주세요.'}
      />
      <OpeningBalances
        propertyId={propertyId}
        uploadPage
      />
    </section>
  );
}
