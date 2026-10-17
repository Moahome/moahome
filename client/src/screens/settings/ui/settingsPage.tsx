'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import { ListCard } from '@/shared/ui/list-card';
import styles from './settingsPage.module.css';

/** 임시 설정은 요청한 추가·참여 진입 버튼만 제공하며 가입·역할 업무를 조합하지 않습니다. */
export function SettingsPage() {
  const router = useRouter();

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
    </section>
  );
}
