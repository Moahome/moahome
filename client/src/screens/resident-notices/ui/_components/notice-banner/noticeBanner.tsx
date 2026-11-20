import { ListHeader } from '@/shared/ui/list-header';
import styles from './noticeBanner.module.css';

/** 주민 시안의 밝은 건물 배너를 공통 제목과 장식으로 구성합니다. */
export function NoticeBanner() {
  return (
    <div
      className={styles.banner}
    >
      <ListHeader
        menu={''}
        title={'공지사항'}
        titleId={'resident-notices-title'}
        description={'우리 건물의 새로운 소식과 안내를 확인하세요.'}
        className={styles.heading}
      />
      <div
        className={styles.neighborhood}
        aria-hidden={'true'}
      >
        <span
          className={styles['building-back']}
        />
        <span
          className={styles['building-front']}
        />
        <span
          className={styles['building-side']}
        />
        <span
          className={styles.garden}
        />
      </div>
    </div>
  );
}
