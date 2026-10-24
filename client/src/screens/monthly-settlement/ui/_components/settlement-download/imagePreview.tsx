import {
  useEffect,
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './settlementDownload.module.css';

/** 실제 내려받는 PNG를 페이지별로 보여주고 이미지가 바뀌거나 창을 닫으면 Object URL을 해제합니다. */
export function ImagePreview({ images }: { images: readonly Blob[] }) {
  const [page, setPage] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(images[page]);
    if (image.current) image.current.src = next;
    return () => URL.revokeObjectURL(next);
  }, [images, page]);

  return (
    <div>
      <div
        className={styles['pdf-toolbar']}
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
            onClick={() => setPage(page - 1)}
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
            onClick={() => setPage(page + 1)}
          >
            <ServiceIcon
              name={'chevron'}
            />
          </Button>
        </div>
      </div>
      <p
        className={styles['image-description']}
      >
        {images.length === 1 ? 'PNG 이미지 1장으로 저장합니다.' : `총 ${images.length}장의 PNG 이미지를 ZIP 파일로 저장합니다.`}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 실제 PNG Blob을 그대로 미리봅니다. */}
      <img
        key={page}
        ref={image}
        className={styles['report-image']}
        alt={`이미지 ${page + 1}페이지 미리보기`}
      />
    </div>
  );
}
