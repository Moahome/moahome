'use client';

import { LoadingState } from '@/shared/ui/state-message';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { loadPostcodeService } from '../../../lib/postcodeService';
import styles from './addressSearch.module.css';

/** 폼 위에 주소 검색을 열고 선택한 주소만 전달하며 닫기·실패에는 기존 입력을 유지합니다. */
export function AddressSearch({
  onSelect,
  onClose,
}: {
  onSelect: (address: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();

    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let active = true;
    const container = containerRef.current;

    loadPostcodeService().then((service) => {
      if (!active || !container) return;

      container.replaceChildren();
      new service.Postcode({
        width: '100%',
        height: '100%',
        oncomplete: (data) => {
          if (!active) return;

          const address = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;

          if (!(address || data.address)?.trim()) {
            setHasError(true);
            return;
          }

          onSelect(address || data.address);
        },
      }).embed(container);
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;

      setIsLoading(false);
      setHasError(true);
    });

    return () => {
      active = false;
      container?.replaceChildren();
    };
  }, [attempt, onSelect]);

  /** 실패한 검색을 다시 불러오며 닫지 않아도 입력 폼의 값은 그대로 둡니다. */
  function retrySearch() {
    setHasError(false);
    setIsLoading(true);
    setAttempt((previous) => previous + 1);
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={'address-search-title'}
      onCancel={(event) => {
        event.preventDefault();
        // 검색창의 Escape가 부모 등록창까지 닫아 작성 중인 입력을 지우지 않게 합니다.
        event.stopPropagation();
        onClose();
      }}
    >
      <header
        className={styles.header}
      >
        <h2
          id={'address-search-title'}
        >
          주소 검색
        </h2>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'주소 검색 닫기'}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      {isLoading && (
        <LoadingState
          title={'주소 검색을 불러오고 있어요.'}
          layout={'inline'}
        />
      )}
      {hasError && (
        <div
          className={styles.message}
          role={'alert'}
        >
          <p>
            주소 검색을 불러오지 못했어요. 다시 시도해주세요.
          </p>
          <Button
            className={styles['retry-button']}
            onClick={retrySearch}
          >
            다시 시도
          </Button>
        </div>
      )}
      <div
        ref={containerRef}
        className={styles['search-container']}
        hidden={isLoading || hasError}
      />
    </dialog>
  );
}
