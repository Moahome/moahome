'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent
} from 'react';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { Toast } from '@/shared/ui/toast';
import { getImageCrop } from '../model/imageCrop';
import type { CropOffset } from '../model/imageCropTypes';
import styles from './imageCropDialog.module.css';

/** 선택 파일을 서버에 보내지 않고 원형으로 미리보며 이동·확대 후 정사각 PNG로 적용합니다. */
export function ImageCropDialog({ file, onApply, onClose }: {
  file: File;
  onApply: (image: Blob) => void;
  onClose: () => void;
}) {
  const id = useId();
  const stage = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const mounted = useRef(true);
  const exporting = useRef(false);
  const [loaded, setLoaded] = useState<{ file: File; bitmap: ImageBitmap; url: string } | null>(null);
  const [loadFailure, setLoadFailure] = useState<File | null>(null);
  const [viewport, setViewport] = useState(280);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({
    x: 0,
    y: 0
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const image = loaded?.file === file ? loaded : null;
  const crop = image ? getImageCrop(image.bitmap, viewport, zoom, offset) : null;

  useEffect(() => {
    let active = true;
    let bitmap: ImageBitmap | undefined;
    let url: string | undefined;
    mounted.current = true;
    void createImageBitmap(file, {
      imageOrientation: 'from-image'
    }).then((decoded) => {
      bitmap = decoded;
      if (!active) { decoded.close(); return; }
      if (decoded.width * decoded.height > 16_000_000) {
        decoded.close();
        throw new Error('사진 해상도가 너무 커요. 작은 사진을 선택해주세요.');
      }
      url = URL.createObjectURL(file);
      setLoaded({
        file,
        bitmap: decoded,
        url
      });
    }).catch((failure: unknown) => {
      if (!active) return;
      setLoadFailure(file);
      setError(failure instanceof Error && failure.message.startsWith('사진 해상도')
        ? failure.message : '사진을 읽을 수 없어요. 다른 사진을 선택해주세요.');
    });
    return () => {
      active = false;
      mounted.current = false;
      bitmap?.close();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setViewport(entry.contentRect.width));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  /** 표시 배율과 같은 경계를 사용해 마우스·터치·키보드 이동 모두 빈 공간을 드러내지 않습니다. */
  function move(dx: number, dy: number) {
    if (!image || busy) return;
    setOffset((previous) => getImageCrop(image.bitmap, viewport, zoom, {
      x: previous.x + dx,
      y: previous.y + dy
    }).offset);
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  /** 원형은 표시 마스크이며 같은 영역의 사각 PNG를 만들어 다른 원형 아바타에서도 재사용합니다. */
  async function apply() {
    if (!image || !crop || exporting.current) return;
    exporting.current = true;
    setBusy(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('사진을 준비하지 못했어요. 다시 시도해주세요.');
      context.drawImage(image.bitmap, crop.sourceX, crop.sourceY, crop.sourceSize, crop.sourceSize, 0, 0, 512, 512);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('사진을 준비하지 못했어요. 다시 시도해주세요.');
      if (mounted.current) onApply(blob);
    } catch {
      if (mounted.current) setError('사진을 준비하지 못했어요. 다시 시도해주세요.');
    } finally {
      exporting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <ClientModal
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      busy={busy}
    >
      <div
        className={styles.header}
      >
        <h2
          id={`${id}-title`}
        >
          사진 편집
        </h2>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'사진 편집 닫기'}
          disabled={busy}
          onClick={onClose}
        >
          <ServiceIcon
            name={'close'}
          />
        </Button>
      </div>
      <p
        id={`${id}-help`}
        className={styles.description}
      >
        사진을 움직이거나 확대해 원 안에 맞춰주세요.
      </p>
      <div
        ref={stage}
        className={styles.stage}
        role={'group'}
        aria-label={'사진 위치 조정'}
        aria-describedby={`${id}-help`}
        tabIndex={0}
        onPointerDown={(event) => {
          if (!image || busy || !event.isPrimary || event.button !== 0) return;
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const previous = pointer.current;
          if (previous?.id !== event.pointerId) return;
          move(event.clientX - previous.x, event.clientY - previous.y);
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY
          };
        }}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onLostPointerCapture={() => { pointer.current = null; }}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-10, 0],
            ArrowRight: [10, 0],
            ArrowUp: [0, -10],
            ArrowDown: [0, 10]
          };
          const direction = directions[event.key];
          if (!direction) return;
          event.preventDefault();
          move(...direction);
        }}
      >
        {image && crop ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- 크롭 좌표와 동일한 배율로 로컬 파일을 표시합니다. */}
            <img
              className={styles.image}
              src={image.url}
              alt={''}
              draggable={false}
              style={{
                width: crop.width,
                height: crop.height,
                transform: `translate(-50%, -50%) translate(${crop.offset.x}px, ${crop.offset.y}px)`
              }}
            />
            <span
              className={styles.mask}
              aria-hidden
            />
          </>
        ) : loadFailure === file ? (
          <StateMessage
            variant={'review-required'}
            title={'사진을 불러오지 못했어요.'}
          />
        ) : (
          <LoadingState
            title={'사진을 준비하고 있어요.'}
          />
        )}
      </div>
      <div
        className={styles.controls}
      >
        <label
          htmlFor={`${id}-zoom`}
        >
          확대
        </label>
        <input
          id={`${id}-zoom`}
          type={'range'}
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          disabled={!image || busy}
          onChange={(event) => {
            const next = Number(event.target.value);
            setZoom(next);
            if (image) setOffset(getImageCrop(image.bitmap, viewport, next, offset).offset);
          }}
        />
        <Button
          variant={'text'}
          size={'sm'}
          disabled={!image || busy}
          onClick={() => { setZoom(1); setOffset({
            x: 0,
            y: 0
          }); }}
        >
          초기화
        </Button>
      </div>
      <div
        className={styles.actions}
      >
        <Button
          variant={'outline'}
          disabled={busy}
          onClick={onClose}
        >
          취소
        </Button>
        <Button
          loading={busy}
          disabled={!image}
          onClick={() => void apply()}
        >
          적용
        </Button>
      </div>
      {error && (
        <Toast
          tone={'error'}
          message={error}
          onClose={() => setError('')}
        />
      )}
    </ClientModal>
  );
}
