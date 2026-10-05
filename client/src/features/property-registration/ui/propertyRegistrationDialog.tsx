'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import {
  BUILDING_PRESENCE_OPTIONS,
  PROPERTY_TYPE_OPTIONS
} from '@/entities/property';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  Dropdown,
  Input,
  Radio
} from '@/shared/ui/form-controls';
import { HomeIllustration } from '@/shared/ui/home-illustration';
import { validateBasicInfo } from '../api/basicInfoApi';
import {
  getBasicInfoErrors,
  getTextLength,
  normalizeBasicInfo,
  type BasicInfoDraft
} from '../model/basicInfo';
import {
  discardBasicInfoDraft,
  restoreBasicInfoDraft,
  saveBasicInfoDraft
} from '../model/basicInfoDraft';
import { AddressSearch } from './_components/address-search/addressSearch';
import { RegistrationIcon } from './_components/registration-icon/registrationIcon';
import styles from './propertyRegistrationDialog.module.css';

/** 오류 코드를 안전한 화면 안내로 바꾸고 서버 응답 원문을 노출하지 않습니다. */
function getValidationError(error: unknown) {
  if (!(error instanceof ApiError)) return '기본 정보를 확인하지 못했어요. 다시 시도해주세요.';
  if (error.code === 'INVALID_REQUEST') return '입력한 기본 정보를 확인해주세요.';
  if (error.code === 'ACCESS_DENIED') return '기본 정보를 확인할 권한이 없어요.';
  if (error.code === 'INVALID_RESPONSE') return '검증 결과를 확인하지 못했어요. 다시 시도해주세요.';

  return '서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.';
}

/** PC 모달과 모바일 전체 화면에서 같은 기본 정보와 검증 흐름을 사용합니다. */
export function PropertyRegistrationDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const detailRef = useRef<HTMLInputElement>(null);
  const requestInFlight = useRef(false);
  const activeRef = useRef(false);
  const [draft, setDraft] = useState(() => restoreBasicInfoDraft(userId));
  const [isSearching, setIsSearching] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const errors = getBasicInfoErrors(draft);
  const canContinue = Object.keys(errors).length === 0;
  const nameLength = getTextLength(draft.name);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    activeRef.current = true;
    dialog?.showModal();
    titleRef.current?.focus({
      preventScroll: true
    });
    document.body.style.overflow = 'hidden';

    return () => {
      // 이탈한 폼의 검증 응답은 무시하고 취소·로그아웃 뒤에는 입력 초안을 남기지 않습니다.
      activeRef.current = false;
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      discardBasicInfoDraft();
    };
  }, []);

  useEffect(() => {
    saveBasicInfoDraft(userId, draft);
  }, [userId, draft]);

  /** 입력 수정은 이전 검증 성공 표시를 해제하며 현재 사용자의 입력 초안만 갱신합니다. */
  function updateDraft<K extends keyof BasicInfoDraft>(field: K, value: BasicInfoDraft[K]) {
    setDraft((previous) => ({
      ...previous,
      [field]: value
    }));
    setIsValidated(false);
    setErrorMessage('');
  }

  const selectAddress = useCallback((address: string) => {
    setDraft((previous) => ({
      ...previous,
      address
    }));
    setIsValidated(false);
    setErrorMessage('');
    setIsSearching(false);
    // 주소 검색 다이얼로그가 닫힌 다음 상세주소로 이동해 바로 입력할 수 있게 합니다.
    requestAnimationFrame(() => detailRef.current?.focus());
  }, []);

  /** 기본 검증만 호출하고 실패에는 입력을 유지합니다. 후속 설정 전에는 저장 완료를 표시하지 않습니다. */
  async function submitBasicInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canContinue || requestInFlight.current) return;

    requestInFlight.current = true;
    setIsValidating(true);
    setErrorMessage('');
    setIsValidated(false);

    try {
      const basicInfo = await validateBasicInfo(normalizeBasicInfo(draft));

      if (!activeRef.current) return;

      setDraft({
        ...basicInfo,
        addressDetail: basicInfo.addressDetail ?? '',
        propertyType: basicInfo.propertyType ?? '',
      });
      setIsValidated(true);
    } catch (error) {
      if (!activeRef.current) return;

      // 인증·계정 오류에만 초안을 폐기하고 로그인으로 이동하며 통신 실패는 입력을 유지합니다.
      if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_UNAVAILABLE')) {
        discardBasicInfoDraft();
        router.replace('/login');
        return;
      }

      setErrorMessage(getValidationError(error));
    } finally {
      requestInFlight.current = false;
      if (activeRef.current) setIsValidating(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={'property-registration-title'}
      aria-describedby={'property-registration-description'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className={styles['mobile-navigation']}
      >
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'등록 취소하고 돌아가기'}
          onClick={onClose}
          leadingIcon={(
            <RegistrationIcon
              name={'back'}
            />
          )}
        />
        <span>
          관리할 곳 등록
        </span>
      </div>
      <Button
        className={styles['close-button']}
        variant={'ghost'}
        size={'sm'}
        iconOnly
        aria-label={'관리할 곳 등록 닫기'}
        onClick={onClose}
        leadingIcon={(
          <RegistrationIcon
            name={'close'}
          />
        )}
      />
      <header
        className={styles.intro}
      >
        <div
          className={styles.illustration}
        >
          <HomeIllustration
            kind={'create'}
            showAction={false}
          />
        </div>
        <h1
          ref={titleRef}
          id={'property-registration-title'}
          tabIndex={-1}
        >
          관리할 곳 등록
        </h1>
        <p
          id={'property-registration-description'}
        >
          빌라 또는 공동주택의 기본 정보를 입력해주세요.
          <br />
          세대와 관리비 정보는 다음 단계에서 설정할 수 있어요.
        </p>
      </header>
      <form
        className={styles.form}
        onSubmit={submitBasicInfo}
        noValidate
        aria-busy={isValidating}
      >
        <fieldset
          className={styles.fields}
          disabled={isValidating}
        >
          <Input
            id={'property-name'}
            name={'name'}
            label={'관리대상 이름'}
            required
            placeholder={'예) 성내빌라'}
            description={'주민에게 표시되는 이름입니다.'}
            value={draft.name}
            onChange={(event) => updateDraft('name', event.target.value)}
            error={nameLength > 50 ? errors.name : undefined}
            trailingContent={`${nameLength}/50`}
          />
          <div
            className={styles['address-group']}
          >
            <label
              htmlFor={'property-address'}
              className={styles.label}
            >
              주소
              <span
                className={styles.required}
                aria-hidden={'true'}
              >
                *
              </span>
            </label>
            <div
              className={styles['address-row']}
            >
              <Input
                id={'property-address'}
                name={'address'}
                required
                readOnly
                value={draft.address}
                placeholder={'주소를 검색해주세요.'}
                leadingIcon={(
                  <RegistrationIcon
                    name={'search'}
                  />
                )}
                onClick={() => setIsSearching(true)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;

                  event.preventDefault();
                  setIsSearching(true);
                }}
                error={draft.address ? errors.address : undefined}
                aria-haspopup={'dialog'}
              />
              <Button
                variant={'outline'}
                className={styles['search-button']}
                onClick={() => setIsSearching(true)}
                aria-haspopup={'dialog'}
              >
                주소 검색
              </Button>
            </div>
            <Input
              ref={detailRef}
              id={'property-address-detail'}
              name={'addressDetail'}
              aria-label={'상세주소'}
              placeholder={'상세주소를 입력해주세요. (예: 101동 201호)'}
              value={draft.addressDetail}
              onChange={(event) => updateDraft('addressDetail', event.target.value)}
              error={errors.addressDetail}
            />
          </div>
          <Dropdown
            id={'property-type'}
            name={'propertyType'}
            label={'건물 유형'}
            description={'해당하는 건물 유형을 선택해주세요. (선택사항)'}
            placeholder={'건물 유형을 선택해주세요'}
            options={PROPERTY_TYPE_OPTIONS}
            value={draft.propertyType}
            onChange={(value) => updateDraft('propertyType', value)}
            error={errors.propertyType}
          />
          <fieldset
            className={styles['building-group']}
          >
            <legend
              className={styles.label}
            >
              동 구분이 있나요?
              <span
                className={styles.required}
                aria-hidden={'true'}
              >
                *
              </span>
            </legend>
            <div
              className={styles['building-choices']}
            >
              {BUILDING_PRESENCE_OPTIONS.map((option) => (
                <Radio
                  key={String(option.value)}
                  variant={'card'}
                  name={'hasBuildings'}
                  value={String(option.value)}
                  label={option.label}
                  description={option.description}
                  checked={draft.hasBuildings === option.value}
                  required
                  onChange={() => updateDraft('hasBuildings', option.value)}
                />
              ))}
            </div>
          </fieldset>
        </fieldset>
        <aside
          className={styles.notice}
        >
          <RegistrationIcon
            name={'info'}
          />
          <p>
            등록 후 동·세대, 관리계좌, 관리비 항목을 순서대로 설정할 수 있어요.
            <span
              className={styles['notice-continuation']}
            >
              지금 입력하는 정보는 나중에 언제든 수정할 수 있습니다.
            </span>
          </p>
        </aside>
        {errorMessage && (
          <p
            className={styles.error}
            role={'alert'}
          >
            {errorMessage}
          </p>
        )}
        {isValidated && (
          <p
            className={styles['validation-result']}
            role={'status'}
          >
            기본 정보를 확인했어요. 동·세대 설정 화면은 준비 중이에요.
            <br />
            입력한 정보는 아직 저장되지 않았어요.
          </p>
        )}
        <div
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            size={'lg'}
            className={styles['cancel-button']}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type={'submit'}
            size={'lg'}
            className={styles['continue-button']}
            disabled={!canContinue}
            loading={isValidating}
            trailingIcon={(
              <RegistrationIcon
                name={'next'}
              />
            )}
          >
            {isValidating ? '확인 중…' : '등록하고 계속'}
          </Button>
        </div>
      </form>
      {isSearching && (
        <AddressSearch
          onSelect={selectAddress}
          onClose={() => setIsSearching(false)}
        />
      )}
    </dialog>
  );
}
