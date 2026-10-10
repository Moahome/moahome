'use client';

import { useRef } from 'react';
import {
  getFloorLabel,
  getUnitLabel,
  type UnitDraft
} from '../../model/unitForm';
import { UNIT_STATUS_OPTIONS } from '../../constants/propertyOptions';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './unitDetail.module.css';

/** 목록의 현재 세대 정보를 보여주고 수정 입력과 한 세대 삭제 확인으로 연결합니다. */
export function UnitDetail({
  unit,
  buildingName,
  hasBuildings,
  onEdit,
  onDelete,
  busy = false,
  onClose,
  presentation = 'modal',
}: {
  unit: UnitDraft;
  buildingName?: string;
  hasBuildings: boolean;
  onEdit: () => void;
  onDelete: () => void;
  busy?: boolean;
  onClose: () => void;
  presentation?: 'modal' | 'page';
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const unitLabel = getUnitLabel({
    ...unit,
    displayName: null
  });
  const identity = `${hasBuildings ? `${buildingName ?? '—'} ` : ''}${unitLabel}`;
  const statusLabel = UNIT_STATUS_OPTIONS.find((option) => option.value === unit.status)?.label ?? '비활성';

  const fields = [
    ...(hasBuildings ? [{
      label: '동',
      value: buildingName ?? '—'
    }] : []),
    {
      label: '호수',
      value: unitLabel
    },
    {
      label: '세대 별칭',
      value: unit.displayName || '—'
    },
    {
      label: '층',
      value: unit.floor === null ? '—' : getFloorLabel(unit.floor)
    },
    // 주민 조회가 연결되기 전에는 미확인 정보를 0명이나 임의의 이름으로 표시하지 않습니다.
    {
      label: '등록 주민',
      value: '—'
    },
    {
      label: '대표 주민',
      value: '—'
    },
  ];

  const Title = presentation === 'page' ? 'h1' : 'h2';
  const content = (
    <>
      <header
        className={styles.header}
      >
        <div>
          <p>
            세대 상세
          </p>
          <Title
            id={'unit-detail-title'}
          >
            {identity}
          </Title>
        </div>
        {presentation === 'modal' && (
          <Button
            ref={closeRef}
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'세대 상세 닫기'}
            disabled={busy}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        )}
      </header>
      <span
        className={styles.status}
        data-status={unit.status}
      >
        {statusLabel}
      </span>
      <dl
        className={styles.fields}
      >
        {fields.map((field) => (
          <div
            key={field.label}
          >
            <dt>
              {field.label}
            </dt>
            <dd>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      <footer
        className={styles.actions}
      >
        <Button
          variant={'outline'}
          tone={'neutral'}
          onClick={onClose}
          disabled={busy}
        >
          {presentation === 'page' ? '목록으로' : '닫기'}
        </Button>
        <Button
          variant={'outline'}
          tone={'success'}
          onClick={onEdit}
          disabled={busy || unit.status === 'INACTIVE'}
        >
          수정
        </Button>
        <Button
          variant={'outline'}
          tone={'danger'}
          onClick={onDelete}
          disabled={busy}
        >
          삭제
        </Button>
      </footer>
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'unit-detail-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      initialFocusRef={closeRef}
      onClose={onClose}
      busy={busy}
      className={styles.dialog}
      aria-labelledby={'unit-detail-title'}
    >
      {content}
    </ClientModal>
  );
}
