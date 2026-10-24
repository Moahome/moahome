import { ListHeader } from '@/shared/ui/list-header';
import { StateMessage } from '@/shared/ui/state-message';
import styles from './comingSoonPage.module.css';

/** 미구현 메뉴도 관리 레이아웃 안에서 현재 메뉴와 준비 상태를 안내합니다. */
export function ComingSoonPage({ title, menu }: { title: string; menu: string }) {
  return (
    <section
      className={styles.page}
    >
      <ListHeader
        menu={menu}
        title={title}
        titleId={'coming-soon-title'}
        description={`${title} 기능을 준비하고 있습니다.`}
      />
      <StateMessage
        variant={'coming-soon'}
        description={'더 편리하게 이용하실 수 있도록 준비하고 있어요.'}
      />
    </section>
  );
}
