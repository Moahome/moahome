'use client';

import {
  useEffect,
  useRef
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { RegistrationDraft } from '../../../model/registrationDraft';
import {
  getAdministratorError,
  type AdministratorDraft
} from '../../../model/administrator';
import { AdministratorProfile } from '../administrator-profile/administratorProfile';
import { SetupProgress } from '../setup-progress/setupProgress';
import styles from './administratorSetup.module.css';

/** 다른 등록 단계와 같은 단일 카드에서 담당자 초안을 편집하고 다음 단계로 전달합니다. */
export function AdministratorSetup({ draft, onChange, onPrevious, onNext }: {
  draft: RegistrationDraft;
  onChange: (profile: AdministratorDraft) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const valid = !getAdministratorError(draft.administrator, draft.units);

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, []);

  return (
    <main
      className={styles.page}
    >
      <div
        className={styles['mobile-navigation']}
      >
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'동·세대 설정으로 돌아가기'}
          onClick={onPrevious}
          leadingIcon={(
            <ServiceIcon
              name={'chevron'}
              direction={'left'}
            />
          )}
        />
        <span>
          초기 설정
        </span>
      </div>
      <header
        className={styles['setup-heading']}
      >
        <h1>
          {draft.basicInfo.name}
          {' '}
          초기 설정
        </h1>
        <p>
          관리 운영에 필요한 정보를 설정해주세요.
        </p>
      </header>
      <SetupProgress
        currentStep={3}
      />
      <section
        className={styles.card}
        aria-labelledby={'administrator-setup-title'}
      >
        <header
          className={styles.intro}
        >
          <span
            className={styles.illustration}
          >
            <ServiceIcon
              name={'users'}
            />
          </span>
          <div
            className={styles['intro-copy']}
          >
            <h2
              id={'administrator-setup-title'}
              ref={headingRef}
              tabIndex={-1}
            >
              관리 담당자 설정
            </h2>
            <p>
              이곳을 등록하는 본인이 관리소장으로 지정됩니다.
            </p>
          </div>
        </header>
        <form
          onSubmit={(event) => { event.preventDefault(); if (valid) onNext(); }}
        >
          <AdministratorProfile
            profile={draft.administrator}
            units={draft.units}
            buildings={draft.buildings}
            hasBuildings={draft.basicInfo.hasBuildings === true}
            onChange={onChange}
          />
          <footer
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              size={'lg'}
              onClick={onPrevious}
            >
              이전
            </Button>
            <Button
              type={'submit'}
              size={'lg'}
              disabled={!valid}
              trailingIcon={(
                <ServiceIcon
                  name={'chevron'}
                  direction={'right'}
                />
              )}
            >
              다음
            </Button>
          </footer>
        </form>
      </section>
    </main>
  );
}
