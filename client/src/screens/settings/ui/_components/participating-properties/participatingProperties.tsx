'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getManagementDashboardPath } from '@/entities/property';
import { useParticipatingProperties } from '@/features/enter-service';
import {
  InvitationCodeForm,
  MEMBER_ROLE_LABELS
} from '@/features/member-management';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ListCard } from '@/shared/ui/list-card';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import styles from './participatingProperties.module.css';

/** 현재 계정의 참여를 조회하고 선택한 역할의 화면으로 이동합니다. 실제 접근 권한은 목적지에서 다시 확인합니다. */
export function ParticipatingProperties({ userId, currentPropertyId, onClose, presentation = 'modal' }: {
  userId: string;
  currentPropertyId?: string;
  onClose?: () => void;
  presentation?: 'modal' | 'page';
}) {
  const router = useRouter();
  const properties = useParticipatingProperties(userId);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [invitationKey, setInvitationKey] = useState(0);
  // 부담당자는 관리자 참여에 속하므로 주민으로 바꾸지 않고 같은 관리 그룹 안에 실제 역할을 표시합니다.
  const groups = [
    {
      title: '관리 중인 곳',
      rows: properties.data?.filter((property) => property.role !== 'RESIDENT') ?? []
    },
    {
      title: '주민으로 참여 중인 곳',
      rows: properties.data?.filter((property) => property.role === 'RESIDENT') ?? []
    }
  ].filter((group) => group.rows.length > 0);
  let content;

  if (properties.isPending) {
    content = (
      <LoadingState
        title={'참여 중인 곳을 확인하고 있어요.'}
      />
    );
  } else if (properties.isError) {
    content = (
      <RequestError
        error={properties.error}
        retrying={properties.isFetching}
        onRetry={() => void properties.refetch({
          cancelRefetch: false
        })}
      />
    );
  } else if (properties.data.length === 0) {
    content = (
      <StateMessage
        layout={'inline'}
        title={'아직 참여 중인 곳이 없어요.'}
        description={'위에서 초대코드로 참여를 신청해주세요.'}
      />
    );
  } else {
    content = (
      <div
        className={styles.groups}
      >
        {groups.map((group) => (
          <section
            key={group.title}
            className={styles.group}
            aria-label={group.title}
          >
            <h3>
              {group.title}
            </h3>
            <ul
              className={styles.list}
              aria-label={group.title}
            >
              {group.rows.map((property) => (
                <li
                  key={property.propertyId}
                >
                  <Button
                    variant={'outline'}
                    className={styles.property}
                    disabled={invitationBusy || property.propertyId === currentPropertyId}
                    aria-current={property.propertyId === currentPropertyId ? 'true' : undefined}
                    onClick={() => {
                      onClose?.();
                      router.push(property.role === 'RESIDENT'
                        ? `/resident?propertyId=${property.propertyId}`
                        : getManagementDashboardPath(property.propertyId));
                    }}
                  >
                    <span
                      className={styles.icon}
                      aria-hidden
                    >
                      <ServiceIcon
                        name={'building'}
                      />
                    </span>
                    <span
                      className={styles.identity}
                    >
                      <span
                        className={styles.name}
                      >
                        {property.name}
                      </span>
                      <span
                        className={styles.role}
                      >
                        {MEMBER_ROLE_LABELS[property.role]}
                        {property.propertyId === currentPropertyId && ' · 현재 선택'}
                      </span>
                    </span>
                    {property.propertyId !== currentPropertyId && (
                      <span
                        aria-hidden
                      >
                        <ServiceIcon
                          name={'chevron'}
                          direction={'right'}
                          size={18}
                        />
                      </span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  const body = (
    <div
      className={styles.content}
    >
      <section
        className={styles.invitation}
        aria-label={'초대코드로 참여'}
      >
        <h3>
          초대코드로 참여
        </h3>
        <InvitationCodeForm
          key={`${userId}:${invitationKey}`}
          compactEntry
          onBusyChange={setInvitationBusy}
          onComplete={() => {
            setInvitationKey((value) => value + 1);
            void properties.refetch({
              cancelRefetch: false
            });
          }}
        />
      </section>
      {content}
    </div>
  );

  if (presentation === 'page') return (
    <ListCard>
      {body}
    </ListCard>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'participating-properties-title'}
      onClose={() => onClose?.()}
      busy={invitationBusy}
    >
      <header
        className={styles.header}
      >
        <h2
          id={'participating-properties-title'}
        >
          참여 중인 곳
        </h2>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'참여 중인 곳 닫기'}
          onClick={onClose}
          disabled={invitationBusy}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <div
        className={styles.body}
      >
        {body}
      </div>
    </ClientModal>
  );
}
