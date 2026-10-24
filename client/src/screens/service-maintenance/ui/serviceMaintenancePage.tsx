import { StateMessage } from '@/shared/ui/state-message';
import styles from './serviceMaintenancePage.module.css';

/** 운영자가 명시적으로 점검을 켠 경우에만 루트에서 업무 화면 대신 표시합니다. */
export function ServiceMaintenancePage() {
  return (
    <main
      className={styles.page}
    >
      <StateMessage
        variant={'maintenance'}
        description={'점검이 끝난 뒤 다시 방문해 주세요. 이용에 불편을 드려 죄송합니다.'}
      />
    </main>
  );
}
