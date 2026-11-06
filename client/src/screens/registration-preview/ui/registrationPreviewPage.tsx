'use client';

import { useState } from 'react';
import {
  ResidentSetup,
  type RegistrationResident
} from '@/features/property-registration';
import { Button } from '@/shared/ui/button';
import styles from './registrationPreviewPage.module.css';

/** 실제 등록 컴포넌트를 가상 명부로 조작하는 개발 전용 화면이며 관리대상 등록 요청은 보내지 않습니다. */
export function RegistrationPreviewPage() {
  const [hasBuildings, setHasBuildings] = useState(true);
  const [residents, setResidents] = useState<RegistrationResident[]>([]);
  const [notice, setNotice] = useState('');
  const buildings = hasBuildings ? [{
    clientId: 'building-a',
    name: '101동'
  }, {
    clientId: 'building-b',
    name: '102동'
  }] : [];
  const units = ['101', '102', '201', '202'].flatMap((unitNumber, index) => (hasBuildings ? buildings : [{
    clientId: null
  }]).map((building) => ({
    clientId: `${building.clientId ?? 'none'}-${index}`,
    buildingClientId: building.clientId,
    unitNumber,
    displayName: null,
    floor: Math.floor(index / 2) + 1,
    status: 'ACTIVE' as const
  })));
  const administrator = {
    residenceType: 'RESIDENT' as const,
    name: '김모아',
    phone: '',
    phoneConsent: false,
    unitClientId: units[0].clientId
  };
  return (
    <div
      className={styles.preview}
    >
      <div
        className={styles.toolbar}
      >
        <div>
          <strong>
            모아홈
          </strong>
          <span>
            초기 설정 디자인 미리보기
          </span>
        </div>
        <div>
          <Button
            variant={'outline'}
            size={'sm'}
            onClick={() => { setHasBuildings(!hasBuildings); setResidents([]); }}
          >
            {hasBuildings ? '동 없음 보기' : '동 있음 보기'}
          </Button>
          <Button
            variant={'outline'}
            size={'sm'}
            onClick={() => setResidents([{
              clientId: 'example-1',
              unitClientId: units[1].clientId,
              name: '이하늘',
              phone: '',
              phoneConsent: false,
              relationType: 'TENANT'
            }, {
              clientId: 'example-2',
              unitClientId: units[2].clientId,
              name: '박우리',
              phone: '',
              phoneConsent: false,
              relationType: 'OWNER'
            }])}
          >
            예시 주민
          </Button>
          <Button
            variant={'ghost'}
            size={'sm'}
            onClick={() => { setResidents([]); setNotice(''); }}
          >
            초기화
          </Button>
        </div>
      </div>
      {notice && (
        <p
          className={styles.notice}
          role={'status'}
        >
          {notice}
        </p>
      )}
      <ResidentSetup
        key={String(hasBuildings)}
        propertyName={'모아빌라'}
        hasBuildings={hasBuildings}
        buildings={buildings}
        units={units}
        administrator={administrator}
        residents={residents}
        onChange={setResidents}
        onPrevious={() => setNotice('실제 설정에서는 동·세대 및 담당자 단계로 이동합니다.')}
        onNext={() => setNotice('실제 설정에서는 관리계좌 및 잔고 단계로 이동합니다.')}
      />
    </div>
  );
}
