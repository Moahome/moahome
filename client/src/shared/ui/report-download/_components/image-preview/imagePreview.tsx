import {
  useEffect,
  useRef,
  useState
} from 'react';
import { StateMessage } from '@/shared/ui/state-message';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './imagePreview.module.css';

/** 실제 내려받는 PNG를 페이지별로 보여주고 이미지가 바뀌거나 창을 닫으면 Object URL을 해제합니다. */
export function ImagePreview({ images }: { images: readonly Blob[] }) {
  const [page, setPage] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const next = URL.createObjectURL(images[page]);
    if (image.current) image.current.src = next;
    return () => URL.revokeObjectURL(next);
  }, [images, page, retry]);

  return (
    <div
      className={styles.preview}
    >

      <p
        className={styles.description}
      >
        {images.length === 1 ? 'PNG 이미지 1장으로 저장합니다.' : `총 ${images.length}장의 PNG 이미지를 ZIP 파일로 저장합니다.`}
      </p>
      {failed && (
        <StateMessage
          variant={'review-required'}
          layout={'inline'}
          role={'alert'}
          title={'이미지 미리보기를 표시하지 못했어요'}
          actions={(
            <Button
              variant={'outline'}
              onClick={() => { setFailed(false); setRetry((value) => value + 1); }}
            >
              다시 시도
            </Button>
          )}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 실제 PNG Blob을 그대로 미리봅니다. */}
      <img
        key={page}
        hidden={failed}
        onError={() => setFailed(true)}
        ref={image}
        className={styles.image}
        alt={`이미지 ${page + 1}페이지 미리보기`}
      />
      <div
        className={styles.toolbar}
      >
        <span>
          PNG ·
          {page + 1}
          {' '}
          /
          {images.length}
          페이지
        </span>
        <div>
          <Button
            variant={'outline'}
            size={'sm'}
            iconOnly
            aria-label={'이미지 이전 페이지'}
            disabled={page === 0}
            onClick={() => { setFailed(false); setPage(page - 1); }}
          >
            <ServiceIcon
              name={'chevron'}
              direction={'left'}
            />
          </Button>
          <Button
            variant={'outline'}
            size={'sm'}
            iconOnly
            aria-label={'이미지 다음 페이지'}
            disabled={page === images.length - 1}
            onClick={() => { setFailed(false); setPage(page + 1); }}
          >
            <ServiceIcon
              name={'chevron'}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}
