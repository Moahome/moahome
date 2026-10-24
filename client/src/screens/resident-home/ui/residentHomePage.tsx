'use client';

import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/entities/session';
import { useResidentProperties } from '@/features/enter-service';
import { ServiceHeader } from '@/widgets/service-header';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Button } from '@/shared/ui/button';
import { ApiError } from '@/shared/api';
import { RequestError } from '@/shared/ui/server-connection-error';
import styles from './residentHomePage.module.css';

/** 로그인과 본인의 현재 주민 참여를 확인한 뒤 임시 주민 홈만 표시합니다. */
export function ResidentHomePage() {
  const router = useRouter();
  const session = useSession();
  const properties = useResidentProperties(session.data?.id);
  const failure = session.error ?? properties.error;
  const denied = failure instanceof ApiError && (failure.status === 401 || failure.code === 'ACCOUNT_UNAVAILABLE');
  useEffect(() => { if (denied) router.replace('/login'); }, [denied, router]);
  const waiting = denied || session.isPending || session.isFetching || (Boolean(session.data) && (properties.isPending || properties.isFetching));
  return (
    <div>
      <ServiceHeader
        homeHref={'/resident'}
        homeLabel={'주민 홈'}
      />
      <main
        className={styles.page}
      >
        <ListHeader
          menu={'모아홈'}
          title={'주민 홈'}
          titleId={'resident-home-title'}
          description={'우리 집 소식을 만나는 공간입니다.'}
        />
        {waiting ? (
          <LoadingState
            title={'주민 참여 정보를 확인하고 있어요.'}
          />
        ) : failure ? (
          <RequestError
            error={failure}
            onRetry={() => void (session.isSuccess ? properties : session).refetch({
              cancelRefetch: false
            })}
          />
        ) : properties.data?.length ? (
          <>
            <section
              className={styles.welcome}
              aria-label={'가입한 곳'}
            >
              <ServiceIcon
                name={'home'}
              />
              <div>
                <h2>
                  모아홈에 오신 것을 환영해요
                </h2>
                <p>
                  주민 가입이 완료되었어요.
                </p>
              </div>
            </section>
            <ul
              className={styles.properties}
            >
              {properties.data.map((property) => (
                <li
                  key={property.propertyId}
                >
                  <ServiceIcon
                    name={'building'}
                  />
                  <strong>
                    {property.name}
                  </strong>
                  <span>
                    참여 중
                  </span>
                </li>
              ))}
            </ul>
            <StateMessage
              variant={'coming-soon'}
              title={'주민 서비스를 준비하고 있어요'}
              description={'현재는 가입한 곳을 확인할 수 있는 임시 주민 홈입니다.'}
            />
          </>
        ) : (
          <section
            className={styles.placeholder}
          >
            <h2>
              아직 가입한 곳이 없어요
            </h2>
            <p>
              초대를 받았다면 참여를 진행해주세요. 신청한 경우 관리자 승인을 기다려주세요.
            </p>
            <Button
              onClick={() => router.push('/start')}
            >
              참여하기
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
