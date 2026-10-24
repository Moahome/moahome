import { ListHeader } from '@/shared/ui/list-header';
import { StateMessage } from '@/shared/ui/state-message';
import styles from './managementDashboardPage.module.css';

/** 대시보드 업무 기능이 제공되기 전에는 임시 데이터 대신 준비 상태를 안내합니다. */
export function ManagementDashboardPage() {
  return (
    <section
      className={styles.page}
    >
      <ListHeader
        menu={'모아홈'}
        title={'대시보드'}
        titleId={'dashboard-title'}
        description={'관리 현황을 한눈에 확인하는 공간입니다.'}
      />
      <StateMessage
        variant={'coming-soon'}
        description={'더 편리하게 이용하실 수 있도록 준비하고 있어요.'}
      />
    </section>
  );
}
