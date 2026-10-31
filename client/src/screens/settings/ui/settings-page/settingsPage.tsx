'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  clearPropertyQueries,
  forgetRecentProperty,
  useManagementContext
} from '@/features/enter-service';
import { LeavePropertyButton } from '@/features/leave-property';
import { AppInstallSetting } from '@/features/app-install';
import { Button } from '@/shared/ui/button';
import { ListCard } from '@/shared/ui/list-card';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { BankAccountEditor } from '../_components/bank-account-editor/bankAccountEditor';
import styles from './settingsPage.module.css';

/** 현재 역할에 맞는 설정과 본인의 나가기 흐름을 조합합니다. */
export function SettingsPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <section
      className={styles.page}
      aria-labelledby={'settings-title'}
    >
      <ListHeader
        menu={''}
        title={'설정'}
        titleId={'settings-title'}
        description={context.data ? `${context.data.name}의 이용 설정을 관리합니다.` : '이용 설정을 관리합니다.'}
      />
      <section
        className={styles.group}
        aria-label={'설정 항목'}
      >
        <AppInstallSetting />
        <ListCard>
          <div
            className={styles.item}
          >
            <span
              className={styles.icon}
              aria-hidden
            >
              <ServiceIcon
                name={'building'}
              />
            </span>
            <div
              className={styles.copy}
            >
              <h3>
                빌라·공동주택 등록 및 참여
              </h3>
              <p>
                새로운 빌라·공동주택을 등록하거나 주민으로 참여하세요.
              </p>
            </div>
            <Button
              onClick={() => router.push('/properties/add')}
            >
              등록 및 참여
            </Button>
          </div>
        </ListCard>
        {context.data && context.data.role !== 'RESIDENT' && (
          <ListCard>
            <div
              className={styles.item}
            >
              <span
                className={styles.icon}
                aria-hidden
              >
                <ServiceIcon
                  name={'wallet'}
                />
              </span>
              <div
                className={styles.copy}
              >
                <h3>
                  관리계좌
                </h3>
                <p>
                  통장 등록, 기본 납부계좌 설정, 사용 상태를 관리하세요.
                </p>
              </div>
              <Button
                onClick={() => {
                  if (window.matchMedia('(max-width: 767px)').matches) {
                    router.push(`/manage/${propertyId}/settings/accounts`);
                    return;
                  }
                  setSaved(false); setAccountOpen(true);
                }}
              >
                계좌 관리
              </Button>
            </div>
          </ListCard>
        )}
        {context.data && session.data && (
          <ListCard>
            <div
              className={styles.item}
            >
              <span
                className={styles.icon}
                aria-hidden
              >
                <ServiceIcon
                  name={'home'}
                />
              </span>
              <div
                className={styles.copy}
              >
                <h3>
                  {context.data.name}
                  {' '}
                  나가기
                </h3>
                <p>
                  서비스 이용만 종료할지, 실제 퇴거로 나갈지 선택하세요.
                </p>
              </div>
              <LeavePropertyButton
                propertyId={propertyId}
                propertyName={context.data.name}
                role={context.data.role}
                residentEligible={context.data.residentEligible}
                onLeft={async () => {
                  forgetRecentProperty(session.data.id, propertyId);
                  try {
                    await clearPropertyQueries(queryClient, session.data.id, propertyId);
                  } finally {
                    router.replace('/start');
                  }
                }}
              />
            </div>
          </ListCard>
        )}
      </section>
      {accountOpen && (
        <BankAccountEditor
          propertyId={propertyId}
          onClose={() => setAccountOpen(false)}
          onSaved={() => { setSaved(true); }}
        />
      )}
      {saved && (
        <Toast
          message={'계좌 정보를 변경했어요.'}
          onClose={() => setSaved(false)}
        />
      )}
    </section>
  );
}
