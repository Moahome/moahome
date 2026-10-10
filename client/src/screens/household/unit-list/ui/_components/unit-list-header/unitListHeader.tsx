import type { RefObject } from 'react';
import { ListHeader } from '@/shared/ui/list-header';
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
    <ListHeader
      menu={'세대 관리'}
      title={'세대 목록'}
      description={'등록된 세대를 확인하고 세대 정보를 관리하세요.'}
      titleId={'unit-list-title'}
      titleRef={titleRef}
      actions={(
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
      )}
    />
  );
}
