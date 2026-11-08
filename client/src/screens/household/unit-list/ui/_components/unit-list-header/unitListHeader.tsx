import type { RefObject } from 'react';
import { ListHeader } from '@/shared/ui/list-header';

export function UnitListHeader({
  titleRef,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <ListHeader
      menu={'세대 관리'}
      title={'세대 목록'}
      description={'등록된 세대를 확인하고 세대 정보를 관리하세요.'}
      titleId={'unit-list-title'}
      titleRef={titleRef}
    />
  );
}
