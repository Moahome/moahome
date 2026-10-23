'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import { Button } from '@/shared/ui/button';
import { ListCard } from '@/shared/ui/list-card';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { BankAccountEditor } from '../_components/bank-account-editor/bankAccountEditor';
import styles from './settingsPage.module.css';

/** 등록·참여 진입과 관리소장의 기존 관리계좌 정보 정정을 제공합니다. */
export function SettingsPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
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
        description={'관리대상과 계좌 등 기본 설정을 관리합니다.'}
      />
      <section
        className={styles.group}
        aria-label={'설정 항목'}
      >
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
                관리대상 등록 및 참여
              </h3>
              <p>
                새로운 관리대상을 등록하거나 주민으로 참여하세요.
              </p>
            </div>
            <Button
              onClick={() => router.push('/properties/add')}
            >
              등록 및 참여
            </Button>
          </div>
        </ListCard>
        {context.data?.role === 'ADMIN' && (
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
