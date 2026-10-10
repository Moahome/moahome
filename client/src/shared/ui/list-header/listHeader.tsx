import type {
  ReactNode,
  RefObject
} from 'react';
import styles from './listHeader.module.css';

/** 목록의 제목 영역을 공유하고 화면별 행동은 오른쪽 버튼 영역으로 전달합니다. */
export function ListHeader({
  menu,
  title,
  description,
  titleId,
  titleRef,
  actions,
  actionsClassName,
}: {
  menu: string;
  title: string;
  description: string;
  titleId: string;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  actions?: ReactNode;
  actionsClassName?: string;
}) {
  return (
    <header
      className={styles.header}
    >
      <div>
        <p
          className={styles.menu}
        >
          {menu}
        </p>
        <h1
          id={titleId}
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
        >
          {title}
        </h1>
        <p
          className={styles.description}
        >
          {description}
        </p>
      </div>
      {actions && (
        <div
          className={[styles.actions, actionsClassName].filter(Boolean).join(' ')}
        >
          {actions}
        </div>
      )}
    </header>
  );
}
