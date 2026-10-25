import Link from 'next/link';
import { StateMessage } from '@/shared/ui/state-message';
import styles from './notFoundPage.module.css';

/** 존재하지 않는 URL의 404를 업무 데이터 조회 실패와 별도 문구로 안내합니다. */
export function NotFoundPage() {
  return (
    <main
      className={styles.page}
    >
      <StateMessage
        variant={'not-found'}
        description={'주소가 올바른지 확인해 주세요.'}
        actions={(
          <Link
            href={'/start'}
          >
            홈으로 돌아가기
          </Link>
        )}
      />
    </main>
  );
}
