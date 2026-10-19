'use client';

import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  useEffect,
  useRef,
  useState
} from 'react';
import { getResidentExport } from '../../../api/residentExportApi';
import type { ResidentExportRow } from '../../../api/residentExportApiTypes';
import { downloadResidents } from './_utils/downloadResidents';
import styles from './residentExportPreview.module.css';

interface PreviewRow {
  name: string;
  maskedPhone: string;
  unitLabel: string;
  index: number;
}

/** 웹·모바일 미리보기에서는 연락처 끝 네 자리만 표시하고 엑셀 파일에는 전체 번호를 포함합니다. */
export function ResidentExportPreview({
  propertyId,
  residentIds,
  presentation = 'modal',
  onClose
}: {
  propertyId: string;
  residentIds: readonly string[];
  presentation?: 'modal' | 'page';
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ResidentExportRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const activeRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    let active = true;
    // 전체 연락처는 React Query 캐시를 통하지 않고 현재 미리보기 컴포넌트 상태에만 둡니다.
    void getResidentExport(propertyId, residentIds).then((result) => {
      if (active) setRows(result);
    }).catch((error: unknown) => {
      if (!active) return;
      setFailed(true);
      setNotice(getExportError(error));
    });

    return () => {
      active = false;
      activeRef.current = false;
    };
  }, [propertyId, residentIds, retry]);

  /** 미리보기의 전체 주민에 연락처를 포함해 파일을 만들고 중복 클릭·이탈 후 저장을 막습니다. */
  async function download() {
    if (!rows?.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    try {
      await downloadResidents(rows, () => activeRef.current);
    } catch {
      if (activeRef.current) setNotice('엑셀 다운로드에 실패했어요. 다시 시도해주세요.');
    } finally {
      busyRef.current = false;
      if (activeRef.current) setBusy(false);
    }
  }

  const content = (
    <>
      <header
        className={styles.header}
      >
        <div>
          <h2
            id={'resident-export-title'}
            tabIndex={-1}
            ref={titleRef}
          >
            엑셀 다운로드
          </h2>
          <p>
            주민명·연락처·동·호수를 확인하고 다운로드하세요.
          </p>
        </div>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            iconOnly
            aria-label={'엑셀 다운로드 닫기'}
            disabled={busy}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        )}
      </header>
      {!rows && !failed && (
        <p
          className={styles.state}
          role={'status'}
        >
          다운로드할 주민 정보를 불러오고 있어요.
        </p>
      )}
      {failed && (
        <div
          className={styles.state}
        >
          <p>
            미리보기를 불러오지 못했어요.
          </p>
          <Button
            variant={'outline'}
            onClick={() => {
              setFailed(false);
              setNotice('');
              setRetry((value) => value + 1);
            }}
          >
            다시 시도
          </Button>
        </div>
      )}
      {rows && (
        <>
          <p
            className={styles.summary}
          >
            총
            {' '}
            {rows.length.toLocaleString()}
            명 · 처음
            {' '}
            {Math.min(rows.length, 5)}
            명 미리보기
          </p>
          <DataTable<PreviewRow>
            label={'주민 엑셀 미리보기'}
            rows={rows.slice(0, 5).map((row, index) => ({
              // 표에는 마스킹한 번호만 전달하고 원문은 파일 생성에만 사용합니다.
              name: row.name,
              maskedPhone: row.phone ? `**** ${row.phone.slice(-4)}` : '—',
              unitLabel: row.unitLabel,
              index
            }))}
            getRowKey={(row) => String(row.index)}
            columns={[
              {
                key: 'name',
                header: '주민명',
                align: 'center',
                render: (row) => row.name
              },
              {
                key: 'maskedPhone',
                header: '연락처',
                align: 'center',
                render: (row) => row.maskedPhone
              },
              {
                key: 'unitLabel',
                header: '동·호수',
                align: 'center',
                render: (row) => row.unitLabel
              }
            ]}
            minWidth={420}
            emptyState={'다운로드할 주민이 없어요.'}
          />
          <p
            className={styles.description}
          >
            현재 검색·필터에 해당하는 전체 주민을 다운로드합니다. 연락처는 엑셀 파일에만 전체 번호로 포함됩니다.
          </p>
        </>
      )}
      <footer
        className={styles.actions}
      >
        <Button
          variant={'outline'}
          tone={'neutral'}
          disabled={busy}
          onClick={onClose}
        >
          {presentation === 'modal' ? '닫기' : '주민 목록'}
        </Button>
        <Button
          variant={'outline'}
          tone={'excel'}
          loading={busy}
          disabled={!rows?.length}
          onClick={() => void download()}
          leadingIcon={(
            <ServiceIcon
              name={'excel'}
            />
          )}
        >
          {busy ? '다운로드 중…' : '엑셀 다운로드'}
        </Button>
      </footer>
      {notice && (
        <Toast
          key={`${retry}-${notice}`}
          tone={'error'}
          message={notice}
          onClose={() => setNotice('')}
        />
      )}
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-labelledby={'resident-export-title'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'resident-export-title'}
      initialFocusRef={titleRef}
      busy={busy}
      onClose={onClose}
    >
      {content}
    </ClientModal>
  );
}

/** 내보내기의 실패는 고정 안내만 사용하고 권한·삭제·연락처 보안 설정 오류를 구분합니다. */
function getExportError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';
    if (error.status === 403) return '엑셀을 다운로드할 관리소장 권한이 없어요.';
    if (error.code === 'RESIDENT_NOT_FOUND') return '주민 정보가 변경되었어요. 주민 목록에서 다시 확인해주세요.';
    if (error.code === 'PHONE_SECURITY_UNAVAILABLE') return '연락처를 처리할 수 없어요. 서버의 연락처 설정을 확인해주세요.';
  }
  return '미리보기를 불러오지 못했어요. 다시 시도해주세요.';
}
