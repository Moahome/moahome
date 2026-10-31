'use client';

import { useContext } from 'react';
import { Button } from '@/shared/ui/button';
import { ListCard } from '@/shared/ui/list-card';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { AppInstallContext } from '../../model/appInstallContext';
import styles from './appInstallSetting.module.css';

/** 배너를 닫은 뒤에도 관리자·주민 설정에서 모바일 설치를 다시 시작할 수 있습니다. */
export function AppInstallSetting() {
  const installation = useContext(AppInstallContext);

  if (!installation?.available) return null;

  return (
    <ListCard>
      <div
        className={styles.item}
      >
        <span
          className={styles.icon}
          aria-hidden
        >
          <ServiceIcon
            name={'download'}
          />
        </span>
        <div
          className={styles.copy}
        >
          <h3>
            모아홈 앱
          </h3>
          <p>
            {installation.installed ? '모아홈을 앱으로 사용하고 있어요.' : '홈 화면에 추가하고 더 빠르게 시작하세요.'}
          </p>
        </div>
        <Button
          disabled={installation.installed}
          loading={installation.busy}
          onClick={() => void installation.install()}
        >
          {installation.installed ? '설치됨' : '앱 설치'}
        </Button>
      </div>
    </ListCard>
  );
}
