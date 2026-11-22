'use client';

import {
  PageCancelButton,
  ModalCloseButton,
  ClientModal
} from '@/shared/ui/client-modal';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { AddressSearch } from '@/shared/ui/address-search';

import { Input } from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  loadKakaoMaps,
  searchNoticeLocations
} from '../../../../lib/kakaoMap';
import type { NoticeLocation } from '../../../../model/noticeLocationTypes';
import styles from './noticeLocation.module.css';

/** 저장 좌표에 마커를 표시하며 창 크기 변경·모달 닫기 때 지도 DOM과 관찰자를 정리합니다. */
function LocationMap({
  location
}: { location: NoticeLocation }) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const {
    latitude,
    longitude
  } = location;

  useEffect(() => {
    const element = container.current;
    if (!element)
      return;
    let disposed = false;
    let disposeMap: (() => void) | undefined;
    void loadKakaoMaps().then((maps) => {
      if (disposed)
        return;
      const position = new maps.LatLng(latitude, longitude);
      const map = new maps.Map(element, {
        center: position,
        level: 3,
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        keyboardShortcuts: true
      });
      map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      const marker = new maps.Marker({
        map,
        position
      });
      const observer = new ResizeObserver(() => {
        const center = map.getCenter();
        map.relayout();
        map.setCenter(center);
      });
      observer.observe(element);
      disposeMap = () => {
        observer.disconnect();
        marker.setMap(null);
        element.replaceChildren();
      };
      setState('ready');
    }).catch(() => {
      if (!disposed)
        setState('error');
    });

    return () => {
      disposed = true;
      disposeMap?.();
    };
  }, [latitude, longitude, attempt]);

  return (
    <div
      className={styles['map-frame']}
    >
      <div
        ref={container}
        className={styles.map}
        role={'region'}
        tabIndex={0}
        aria-label={`${location.address} 위치 지도`}
      />
      {state !== 'ready' && (
        <div
          className={styles['map-message']}
          role={'status'}
        >
          <ServiceIcon
            name={'location'}
            size={28}
          />
          <span>
            {state === 'error' ? '지도를 불러오지 못했어요.' : '지도를 불러오고 있어요.'}
          </span>
          {state === 'error' && (
            <Button
              size={'sm'}
              variant={'outline'}
              onClick={() => {
                setState('loading');
                setAttempt((value) => value + 1);
              }}
            >
              다시 시도
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** 작성·열람에 같은 장소 카드를 사용하고 외부 길찾기 주소는 저장된 값으로만 구성합니다. */
export function NoticeLocationCard({
  location,
  disabled,
  onEdit,
  onRemove
}: {
  location: NoticeLocation;
  disabled?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const titleId = useId();

  return (
    <section
      className={styles.location}
      aria-labelledby={titleId}
    >
      <div
        className={styles.heading}
      >
        <h3
          id={titleId}
        >
          <ServiceIcon
            name={'location'}
            size={18}
          />
          장소 안내
        </h3>
        {onEdit && <span>
          선택 사항
        </span>}
      </div>
      <div
        className={styles.card}
      >
        <LocationMap
          key={`${location.latitude}:${location.longitude}`}
          location={location}
        />
        <div
          className={styles.details}
        >
          <div
            className={styles.address}
          >
            <strong>
              {location.name}
            </strong>
            <p>
              {location.address}
            </p>
          </div>
          <div
            className={styles.actions}
          >
            {onEdit && (
              <>
                <Button
                  variant={'ghost'}
                  tone={'success'}
                  size={'sm'}
                  iconOnly
                  aria-label={'장소 수정'}
                  disabled={disabled}
                  onClick={onEdit}
                >
                  <ServiceIcon
                    name={'pen'}
                    size={18}
                  />
                </Button>
                <Button
                  variant={'ghost'}
                  tone={'danger'}
                  size={'sm'}
                  iconOnly
                  aria-label={'장소 삭제'}
                  disabled={disabled}
                  onClick={onRemove}
                >
                  <ServiceIcon
                    name={'trash'}
                    size={18}
                  />
                </Button>
              </>
            )}
            {!onEdit && (
              <a
                className={styles.directions}
                href={`https://map.kakao.com/link/to/${encodeURIComponent(location.name)},${location.latitude},${location.longitude}`}
                target={'_blank'}
                rel={'noopener noreferrer'}
                referrerPolicy={'no-referrer'}
              >
                <ServiceIcon
                  name={'location'}
                  size={18}
                />
                길찾기
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 공통 주소 검색의 결과를 선택하면 좌표를 조회하고 확인한 장소만 공지에 반영합니다. */
export function NoticeLocationPicker({
  initialLocation,
  disabled,
  onConfirm,
  onClose
}: {
  initialLocation: NoticeLocation | null;
  disabled: boolean;
  onConfirm: (location: NoticeLocation) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const active = useRef(true);
  const searching = useRef(false);
  const [chosenAddress, setChosenAddress] = useState({
    address: initialLocation?.address ?? '',
    name: initialLocation?.name ?? ''
  });
  const [findingAddress, setFindingAddress] = useState(!initialLocation);
  const [selection, setSelection] = useState<NoticeLocation | null>(initialLocation);
  const [name, setName] = useState(initialLocation?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);

  /** 선택한 주소만 좌표로 변환하며 닫힌 창에 늦게 도착한 결과와 중복 선택은 반영하지 않습니다. */
  const selectAddress = useCallback(async (address: string, buildingName: string) => {
    if (searching.current || disabled)
      return;
    setChosenAddress({
      address,
      name: buildingName
    });
    searching.current = true;
    setFindingAddress(false);
    setBusy(true);
    setMessage('');
    setSelection(null);
    try {
      const found = await searchNoticeLocations(address);
      if (!active.current)
        return;
      const location = found.find((item) => item.address === address) ?? found[0];
      if (!location) {
        setMessage('선택한 주소의 위치를 찾지 못했어요. 다른 주소를 검색해주세요.');

        return;
      }
      setSelection({
        ...location,
        address
      });
      setName(buildingName || location.name);
    } catch {
      if (active.current)
        setMessage('지도 위치를 불러오지 못했어요. 다시 시도해주세요.');
    } finally {
      searching.current = false;
      if (active.current)
        setBusy(false);
    }
  }, [disabled]);

  return (
    <ClientModal
      className={styles.picker}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(event) => {
        // 장소명 입력의 Enter가 상위 공지 작성 form을 제출하지 않게 합니다.
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <header
        className={styles['picker-heading']}
      >
        <h2
          id={titleId}
        >
          {initialLocation ? '장소 수정' : '지도 추가'}
        </h2>
        <ModalCloseButton
          aria-label={'닫기'}
          onClick={onClose}
        />
      </header>
      <p
        className={styles.description}
      >
        주소를 검색하고 지도에서 위치를 확인해주세요.
      </p>
      {findingAddress && (
        <AddressSearch
          inline
          onSelect={selectAddress}
        />
      )}
      {!findingAddress && (
        <div
          className={styles.search}
        >
          <Input
            label={'주소'}
            value={chosenAddress.address}
            readOnly
          />
          <Button
            variant={'outline'}
            disabled={busy || disabled}
            onClick={() => setFindingAddress(true)}
          >
            주소 변경
          </Button>
        </div>
      )}
      {busy && (
        <p
          className={styles.description}
          role={'status'}
        >
          지도 위치를 불러오고 있어요.
        </p>
      )}
      {message && (
        <div
          className={styles['search-error']}
        >
          <p
            className={styles.description}
            role={'status'}
          >
            {message}
          </p>
          <Button
            variant={'outline'}
            size={'sm'}
            disabled={disabled}
            onClick={() => void selectAddress(chosenAddress.address, chosenAddress.name)}
          >
            다시 시도
          </Button>
        </div>
      )}
      {selection && !findingAddress && (
        <div
          className={styles.preview}
        >
          <LocationMap
            key={`${selection.latitude}:${selection.longitude}`}
            location={selection}
          />
          <Input
            label={'장소명'}
            value={name}
            maxLength={100}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      )}
      <footer
        className={styles['picker-actions']}
      >
        <PageCancelButton
          variant={'outline'}
          onClick={onClose}
        >
          취소
        </PageCancelButton>
        <Button
          disabled={disabled || busy || findingAddress || !selection || !name.trim()}
          onClick={() => {
            if (!disabled && !searching.current && !findingAddress && selection && name.trim())
              onConfirm({
                ...selection,
                name: name.trim()
              });
          }}
        >
          {initialLocation ? '적용' : '추가'}
        </Button>
      </footer>
    </ClientModal>
  );
}
