'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import Image from 'next/image';
import { ClientModal } from '@/shared/ui/client-modal';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import type {
  NoticeAssetReader,
  NoticeAssetUploader,
  NoticeAsset
} from '../../model/noticeAssetTypes';
import styles from './noticeAttachments.module.css';


/** 첨부파일은 공지 본문과 같은 저장 요청에 포함해 게시·수정·초안 복구 시 함께 보존합니다. */
export function NoticeAttachments({ readAsset, uploadAsset, content, onChange, onBusyChange, disabled = false }: {
  readAsset: NoticeAssetReader;
  uploadAsset?: NoticeAssetUploader;
  content: string;
  onBusyChange?: (busy: boolean) => void;
  onChange?: (content: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const document = JSON.parse(content);
  const files: NoticeAsset[] = Array.isArray(document.files) ? document.files : [];

  /** 허용 용량 안에서 파일을 읽고 성공한 파일만 목록에 추가합니다. */
  async function add(selected: FileList | null) {
    if (!selected || !uploadAsset || uploadLock.current || disabled || !onChange) return;
    if (files.length + selected.length > 10 || Array.from(selected).some((file) => file.size > 20 * 1024 * 1024)) {
      setError('첨부파일은 최대 10개, 파일당 20MB까지 선택할 수 있어요.');
      return;
    }
    uploadLock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const added = [];
      // 각 파일을 독립적으로 저장하며 성공한 항목부터 반영해 후속 업로드 실패에도 잃지 않습니다.
      for (const file of Array.from(selected)) {
        added.push(await uploadAsset!(file, false));
        onChange(JSON.stringify({
          ...document,
          files: [...files, ...added]
        }));
      }
      const next = JSON.stringify({
        ...document,
        files: [...files, ...added]
      });
      onChange(next);
    } catch { setError('파일을 읽지 못했어요. 다시 선택해주세요.'); }
    finally { uploadLock.current = false; setBusy(false); onBusyChange?.(false); if (input.current) input.current.value = ''; }
  }

  /** 인증된 파일 응답만 다운로드하며 예전 Base64 첨부도 그대로 열 수 있게 유지합니다. */
  async function download(file: NoticeAsset) {
    if (busy) return;
    setBusy(true);
    let url: string | null = null;
    try {
      const blob = file.data.startsWith('data:') ? await (await fetch(file.data)).blob() : await readAsset(file.data);
      url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
    } catch { setError('파일을 다운로드하지 못했어요. 다시 시도해주세요.'); }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url!), 30_000); setBusy(false); }
  }

  if (!onChange && files.length === 0) return null;

  return (
    <section
      className={styles.attachments}
      aria-label={'첨부파일'}
      data-read-only={!onChange}
    >
      <div
        className={styles.heading}
      >
        <h3>
          <ServiceIcon
            name={'paperclip'}
            size={22}
          />
          첨부파일
        </h3>
        {files.length > 0 && (
          <span
            className={styles.count}
          >
            {files.length}
            건
          </span>
        )}
        {onChange && (
          <Button
            variant={'outline'}
            disabled={disabled || busy}
            loading={busy}
            leadingIcon={(
              <ServiceIcon
                name={'plus'}
              />
            )}
            onClick={() => input.current?.click()}
          >
            파일 첨부
          </Button>
        )}
      </div>
      {onChange && (
        <input
          ref={input}
          type={'file'}
          multiple
          hidden
          aria-label={'첨부파일 선택'}
          onChange={(event) => void add(event.target.files)}
        />
      )}
      <ul>
        {files.map((file) => (
          <li
            key={file.id}
          >
            {!/\.(png|jpe?g|webp|gif)$/i.test(file.name) && (
              <span
                className={styles['file-icon']}
                data-pdf={/\.pdf$/i.test(file.name)}
                aria-hidden={'true'}
              >
                <ServiceIcon
                  name={'document'}
                  size={30}
                />
                {/\.pdf$/i.test(file.name) && (
                  <small>
                    PDF
                  </small>
                )}
              </span>
            )}
            {/\.(png|jpe?g|webp|gif)$/i.test(file.name) && (
              <AttachmentPreview
                file={file}
                readAsset={readAsset}
              />
            )}
            <span
              className={styles.name}
            >
              {file.name}
              {' '}
              <small>
                (
                {Math.ceil(file.size / 1024)}
                KB)
              </small>
            </span>
            {onChange ? (
              <Button
                variant={'outline'}
                tone={'danger'}
                size={'sm'}
                disabled={disabled || busy}
                aria-label={`${file.name} 제거`}
                onClick={() => onChange(JSON.stringify({
                  ...document,
                  files: files.filter((entry) => entry.id !== file.id)
                }))}
              >
                제거
              </Button>
            ) : (
              <Button
                variant={'ghost'}
                size={'sm'}
                iconOnly
                disabled={busy}
                aria-label={`${file.name} 다운로드`}
                title={'다운로드'}
                onClick={() => void download(file)}
              >
                <ServiceIcon
                  name={'download'}
                  size={20}
                />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <Toast
          message={error}
          tone={'error'}
          onClose={() => setError('')}
        />
      )}
    </section>
  );
}

/** 첨부 이미지도 인증해서 읽은 썸네일과 확대 보기를 제공하며 화면 종료 시 임시 URL을 해제합니다. */
function AttachmentPreview({ file, readAsset }: { file: NoticeAsset; readAsset: NoticeAssetReader }) {
  const [image, setImage] = useState<{ reference: string; url: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    if (file.data.startsWith('data:')) return;
    void readAsset(file.data, controller.signal).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImage({
        reference: file.data,
        url: objectUrl
      });
    }).catch(() => {});
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.data, readAsset]);
  const source = file.data.startsWith('data:') ? file.data : image?.reference === file.data ? image.url : null;
  if (!source) return (
    <span
      className={styles['preview-loading']}
    >
      이미지 불러오는 중
    </span>
  );
  return (
    <>
      <button
        type={'button'}
        className={styles.thumbnail}
        aria-label={`${file.name} 미리보기`}
        onClick={() => setExpanded(true)}
      >
        <Image
          src={source}
          alt={file.name}
          width={64}
          height={64}
          unoptimized
        />
      </button>
      {expanded && (
        <ClientModal
          className={styles.preview}
          aria-label={`${file.name} 미리보기`}
          onClose={() => setExpanded(false)}
          closeOnOutsideClick
        >
          <div
            className={styles['preview-heading']}
          >
            <strong>
              {file.name}
            </strong>
            <Button
              variant={'outline'}
              tone={'neutral'}
              onClick={() => setExpanded(false)}
            >
              닫기
            </Button>
          </div>
          <Image
            src={source}
            alt={file.name}
            width={1200}
            height={900}
            unoptimized
          />
        </ClientModal>
      )}
    </>
  );
}
