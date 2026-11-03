'use client';
import type { ReactNode } from 'react';
import { ListHeader } from '@/shared/ui/list-header';
import { MemberEditor } from '../_components/member-editor/memberEditor';
import { SystemAdminShell } from '../_components/system-admin-shell/systemAdminShell';
import styles from './systemAdminMemberDetail.module.css';
export function SystemAdminMemberDetail({ userId, header }: { userId: string; header: ReactNode }) {
  return (
    <SystemAdminShell
      header={header}
    >
      <div
        className={styles.page}
      >
        <ListHeader
          menu={'시스템 관리'}
          title={'회원 상세'}
          titleId={'admin-member-detail-title'}
          description={'회원의 현재 권한을 확인하고 변경합니다.'}
        />
        <section
          className={styles.card}
        >
          <MemberEditor
            userId={userId}
          />
        </section>
      </div>
    </SystemAdminShell>
  );
}
