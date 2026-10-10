import type { RefObject } from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './unitListHeader.module.css';

export function UnitListHeader({
  titleRef,
  hasBuildings,
  canAdd,
  onManageBuildings,
  onAutomaticAdd,
  onAdd,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>;
  hasBuildings: boolean;
  canAdd: boolean;
  onManageBuildings: () => void;
  onAutomaticAdd: () => void;
  onAdd: () => void;
}) {
  return (
    <header
      className={styles.heading}
    >
      <div>
        <p
          className={styles.eyebrow}
        >
          세대 관리
        </p>
        <h1
          id={'unit-list-title'}
          ref={titleRef}
          tabIndex={-1}
        >
          세대 목록
        </h1>
        <p
          className={styles.description}
        >
          등록된 세대를 확인하고 세대 정보를 관리하세요.
        </p>
      </div>
      <div
        className={styles.actions}
        data-has-buildings={hasBuildings}
      >
        {hasBuildings && (
          <Button
            variant={'outline'}
            onClick={onManageBuildings}
          >
            동 관리
          </Button>
        )}
        <Button
          variant={'outline'}
          disabled={!canAdd}
          onClick={onAutomaticAdd}
        >
          세대 자동 입력
        </Button>
        <Button
          className={styles.add}
          disabled={!canAdd}
          onClick={onAdd}
          leadingIcon={(
            <ServiceIcon
              name={'plus'}
            />
          )}
        >
          세대 추가
        </Button>
      </div>
    </header>
  );
}
