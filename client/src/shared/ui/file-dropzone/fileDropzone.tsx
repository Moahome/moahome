'use client';

import {
  useRef,
  useState
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  LoadingState,
  StateIllustration
} from '@/shared/ui/state-message';
import styles from './fileDropzone.module.css';

/** 기존 주민 업로드의 파일 선택·드래그 표시를 공유하고 파일 검증은 호출 화면에 맡깁니다. */
export function FileDropzone({ label, inputLabel, accept, description, busy = false, disabled = false, onFile }: {
  label: string;
  inputLabel: string;
  accept: string;
  description: string;
  busy?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  /** 자식 요소 사이를 지나도 강조가 깜박이지 않게 하고 영역 이탈과 드롭에서 해제합니다. */
  function resetDrag() {
    dragDepth.current = 0;
    setDragging(false);
  }

  function upload(file?: File) {
    if (!file || busy || disabled) return;
    onFile(file);
  }

  return (
    <>
      <div
        className={styles.dropzone}
        role={'region'}
        aria-label={label}
        aria-busy={busy}
        data-disabled={disabled}
        data-dragging={dragging && !busy && !disabled}
        onDragEnter={(event) => {
          event.preventDefault();
          if (busy || disabled || !event.dataTransfer.types.includes('Files')) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = busy || disabled ? 'none' : 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          resetDrag();
          upload(event.dataTransfer.files[0]);
        }}
      >
        {busy ? (
          <LoadingState
            title={'파일을 확인하고 있어요.'}
          />
        ) : (
          <StateIllustration
            variant={'file-upload'}
            layout={'inline'}
          />
        )}
        <strong>
          {dragging && !busy && !disabled ? '여기에 놓으면 파일 검증을 시작해요.' : '엑셀 파일을 여기에 놓거나 파일을 선택해주세요.'}
        </strong>
        <p>
          {description}
        </p>
        <Button
          variant={'outline'}
          tone={'excel'}
          leadingIcon={(
            <ServiceIcon
              name={'excel'}
            />
          )}
          onClick={() => input.current?.click()}
          loading={busy}
          disabled={disabled}
        >
          {busy ? '검증 중…' : '파일 선택'}
        </Button>
      </div>
      <input
        ref={input}
        className={styles['file-input']}
        type={'file'}
        accept={accept}
        aria-label={inputLabel}
        disabled={busy || disabled}
        onChange={(event) => {
          upload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </>
  );
}
