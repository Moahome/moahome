'use client';

import {
  useEffect,
  useRef
} from 'react';
import { Button } from '@/shared/ui/button';
import {
  Input,
  Radio
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { RegistrationDraft } from '../../../model/registrationDraft';
import {
  getAdministratorError,
  type AdministratorDraft
} from '../../../model/administrator';
import { AdministratorProfile } from '../administrator-profile/administratorProfile';
import { AdministratorUnitFields } from '../administrator-unit-fields/administratorUnitFields';
import { SetupProgress } from '../setup-progress/setupProgress';
import styles from './administratorSetup.module.css';

/** 다른 등록 단계와 같은 단일 카드에서 담당자 초안을 편집하고 다음 단계로 전달합니다. */
export function AdministratorSetup({ draft, previewOnly = true, onChange, onPrevious, onNext }: {
  draft: RegistrationDraft;
  previewOnly?: boolean;
  onChange: (profile: AdministratorDraft) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const profile = draft.administrator;
  const hasBuildings = draft.basicInfo.hasBuildings === true;
  const selectedUnit = draft.units.find((unit) => unit.clientId === profile.unitClientId);
  const valid = previewOnly
    ? Boolean(profile.name.trim() && profile.residenceType && (profile.residenceType === 'EXTERNAL' || selectedUnit))
    : !getAdministratorError(profile, draft.units);

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
        {previewOnly && (
          <p
            className={styles.preview}
          >
            화면 미리보기입니다. 실제 등록은 저장하지 않아요.
          </p>
        )}
        <form
          onSubmit={(event) => { event.preventDefault(); if (valid) onNext(); }}
        >
          {!previewOnly && (
            <AdministratorProfile
              profile={profile}
              units={draft.units}
              buildings={draft.buildings}
              hasBuildings={hasBuildings}
              onChange={onChange}
            />
          )}
          {previewOnly && (
            <div
              className={styles.fields}
            >
              <div
                className={styles['field-row']}
              >
                <Input
                  label={'담당자 이름'}
                  value={profile.name}
                  required
                  maxLength={50}
                  autoComplete={'name'}
                  onChange={(event) => onChange({
                    ...profile,
                    name: event.target.value
                  })}
                />
                <Input
                  label={'담당자 연락처'}
                  value={profile.phone}
                  maxLength={64}
                  type={'tel'}
                  autoComplete={'tel'}
                  onChange={(event) => onChange({
                    ...profile,
                    phone: event.target.value
                  })}
                />
              </div>
              <fieldset
                className={styles.residence}
              >
                <legend>
                  거주 구분
                  <span
                    aria-hidden={'true'}
                  >
                    *
                  </span>
                </legend>
                <div
                  className={styles['field-row']}
                >
                  <Radio
                    name={'manager-residence-preview'}
                    variant={'card'}
                    label={'거주자'}
                    description={'주민 목록에 본인을 함께 등록합니다.'}
                    checked={profile.residenceType === 'RESIDENT'}
                    onChange={() => onChange({
                      ...profile,
                      residenceType: 'RESIDENT'
                    })}
                  />
                  <Radio
                    name={'manager-residence-preview'}
                    variant={'card'}
                    label={'외부 관리자'}
                    description={'주민 목록에 등록하지 않습니다.'}
                    checked={profile.residenceType === 'EXTERNAL'}
                    onChange={() => onChange({
                      ...profile,
                      residenceType: 'EXTERNAL',
                      unitClientId: ''
                    })}
                  />
                </div>
              </fieldset>
              {profile.residenceType === 'RESIDENT' && (
                <div
                  className={styles['field-row']}
                >
                  <AdministratorUnitFields
                    units={draft.units}
                    buildings={draft.buildings}
                    hasBuildings={hasBuildings}
                    unitClientId={profile.unitClientId}
                    onChange={(unitClientId) => onChange({
                      ...profile,
                      unitClientId
                    })}
                  />
                </div>
              )}
            </div>
          )}
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
