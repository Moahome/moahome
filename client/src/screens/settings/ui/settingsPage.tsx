'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import { Button } from '@/shared/ui/button';
import { ListCard } from '@/shared/ui/list-card';
import { Toast } from '@/shared/ui/toast';
import { BankAccountEditor } from './_components/bank-account-editor/bankAccountEditor';
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
      <h1
        id={'settings-title'}
      >
        설정
      </h1>
      <ListCard>
        <div
          className={styles.item}
        >
          <div>
            <h2>
              등록 및 참여
            </h2>
            <p>
              새로운 곳을 등록하거나 받은 초대코드로 참여하세요.
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
            <div>
              <h2>
                관리계좌
              </h2>
              <p>
                통장을 추가하고 기본 납부계좌와 사용 상태를 관리하세요.
              </p>
            </div>
            <Button
              onClick={() => { setSaved(false); setAccountOpen(true); }}
            >
              계좌 관리
            </Button>
          </div>
        </ListCard>
      )}
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
