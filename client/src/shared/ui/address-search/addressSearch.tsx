'use client';

import {
  ModalCloseButton,
  ClientModal
} from '@/shared/ui/client-modal';

import { LoadingState } from '@/shared/ui/state-message';

import {
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { loadPostcodeService } from '@/shared/lib/postcode';

import styles from './addressSearch.module.css';

/** 폼 위에 주소 검색을 열고 선택한 주소만 전달하며 닫기·실패에는 기존 입력을 유지합니다. */
export function AddressSearch({
  onSelect,
  onClose,
  inline = false,
}: {
  onSelect: (address: string, buildingName: string) => void;
  onClose?: () => void;
  inline?: boolean;
}) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const container = containerRef.current;

    loadPostcodeService().then((service) => {
      if (!active || !container)
        return;

      container.replaceChildren();
      new service.Postcode({
        width: '100%',
        height: '100%',
        oncomplete: (data) => {
          if (!active)
            return;

          const address = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;

          if (!(address || data.address)?.trim()) {
            setHasError(true);

            return;
          }

          onSelect(address || data.address, data.buildingName || '');
        },
      }).embed(container);
      setIsLoading(false);
    }).catch(() => {
      if (!active)
        return;

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

  const content = (
    <>
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
    </>
  );

  if (inline)
    return (
      <div
        className={styles.inline}
        role={'region'}
        aria-label={'주소 검색'}
      >
        {content}
      </div>
    );

  return (
    <ClientModal
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={() => onClose?.()}
    >
      <header
        className={styles.header}
      >
        <h2
          id={titleId}
        >
          주소 검색
        </h2>
        <ModalCloseButton
          aria-label={'주소 검색 닫기'}
          onClick={onClose}
        />
      </header>
      {content}
    </ClientModal>
  );
}
