'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import { FileDropzone } from '@/shared/ui/file-dropzone';
import { Button } from '@/shared/ui/button';
import { SummaryCard } from '@/shared/ui/summary-card';
import { Pagination } from '@/shared/ui/pagination';
import {
  Input,
  Dropdown
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { useResidentImport } from './_hooks/useResidentImport';
import {
  ImportTable,
  IMPORT_STATUS_LABELS
} from './_components/import-table/importTable';
import { downloadResult } from './_utils/downloadResult';
import styles from './residentImportPage.module.css';

/** 업로드·검증·완료를 같은 독립 페이지에서 제공하고 현재 관리소장에게만 명부 처리 UI를 표시합니다. */
export function ResidentImportPage({
  propertyId
}: {
  propertyId: string
}) {
  const router = useRouter();
  const session = useSession();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const controller = useResidentImport(propertyId);
  const { result, selected, busy, error, completed, attempted } = controller;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rows = result?.rows ?? [];
  const available = rows.filter((row) => row.status === 'READY');
  const filtered = rows.filter((row) => (!filter || row.status === filter) && `${row.name} ${row.building} ${row.unitNumber} ${row.phoneLast4 ?? ''}`.includes(query.trim()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  let step = 1;
  if (result) step = 2;
  if (completed) step = 3;
  const title = ['주민 엑셀 업로드', '업로드 데이터 확인', '주민 등록 완료'][step - 1];
  let saveLabel = `선택한 주민 등록 (${selected.length}명)`;
  if (attempted) saveLabel = '같은 요청으로 다시 시도';
  if (busy === 'save') saveLabel = '등록 중…';
  const listPath = `/manage/${propertyId}/residents`;

  if (!context.isSuccess) {
    return (
      <p
        role={'status'}
      >
        등록 권한을 확인하고 있어요.
      </p>
    );
  }
  if (context.data.role !== 'ADMIN') {
    return (
      <p
        role={'alert'}
      >
        주민을 등록할 관리소장 권한이 없어요.
      </p>
    );
  }

  /** 새 파일의 결과에 이전 검색·페이지 조건이 적용되지 않도록 표시 상태를 초기화합니다. */
  function upload(file?: File) {
    if (!file || busy) return;
    setPage(1)
    setQuery('')
    setFilter('');
    void controller.upload(file);
  }


  return (
    <section
      className={styles.page}
      aria-labelledby={'resident-import-title'}
    >
      <header
        className={styles.header}
      >
        <p>
          주민 관리
        </p>
        <h1
          id={'resident-import-title'}
        >
          {title}
        </h1>
        <p>
          {completed ? '행별 등록 결과를 확인해주세요.' : '엑셀 파일로 주민을 한 번에 등록하세요.'}
        </p>
      </header>
      <ol
        className={styles.steps}
        aria-label={'일괄 등록 단계'}
      >
        {['파일 업로드', '데이터 검증', '등록 완료'].map((label, index) => (
          <li
            key={label}
            aria-current={step === index + 1 ? 'step' : undefined}
            data-done={step > index + 1}
          >
            <span>
              {step > index + 1 ? '✓' : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {error && (
        <Toast
          key={error.id}
          message={error.message}
          tone={'error'}
          duration={6000}
          onClose={controller.dismissError}
        />
      )}
      {!result && (
        <div
          className={styles.card}
        >
          <h2>
            엑셀 파일 업로드
          </h2>
          <FileDropzone
            label={'엑셀 파일 업로드 영역'}
            inputLabel={'주민 엑셀 파일'}
            accept={'.xlsx'}
            description={'.xlsx · 최대 5MB · 1,000명'}
            busy={Boolean(busy)}
            onFile={upload}
          />
          <a
            className={styles['template-link']}
            href={'/residentImportTemplate.xlsx'}
            download={'주민 업로드 양식.xlsx'}
          >
            엑셀 양식 다운로드
          </a>
          <div
            className={styles.guide}
          >
            <h3>
              작성 안내
            </h3>
            <ul>
              <li>
                첫 행은 동 · 호수 · 이름 · 주민 구분 · 연락처 순서로 유지해주세요.
              </li>
              <li>
                이름·동·호수는 필수이며 연락처와 주민 구분은 선택입니다.
              </li>
              <li>
                주민 구분은 소유주·임차인·가족·기타 중 하나로 입력하며 비워두면 기타로 등록합니다.
              </li>
              <li>
                등록된 세대에 연결하며 동 없는 관리대상은 동 칸을 비워주세요.
              </li>
              <li>
                호수와 연락처의 앞자리 0을 유지하고 수식은 사용하지 마세요.
              </li>
              <li>
                오류·중복은 제외하며 같은 세대의 최초 등록 주민만 대표가 됩니다.
              </li>
            </ul>
          </div>
        </div>
      )}
      {result && (
        <>
          <div
            className={styles['file-info']}
          >
            <strong>
              {controller.filename}
            </strong>
            <Button
              variant={'outline'}
              onClick={() => {
                controller.reset();
                setPage(1);
                setQuery('');
                setFilter('');
              }}
              disabled={Boolean(busy)}
            >
              {completed ? '새로 등록하기' : '다른 파일 업로드'}
            </Button>
          </div>
          {completed && (
            <p
              className={styles.complete}
              role={'status'}
            >
              주민
              {rows.filter((row) => row.status === 'SUCCESS').length}
              명의 등록이 완료되었습니다.
            </p>
          )}
          <div
            className={styles.summary}
          >
            {[
              {
                label: '전체',
                value: rows.length,
                tone: 'primary' as const,
                icon: 'person' as const
              },
              {
                label: completed ? '등록 성공' : '등록 가능',
                value: rows.filter((row) => row.status === (completed ? 'SUCCESS' : 'READY')).length,
                tone: 'success' as const,
                icon: 'check' as const
              },
              {
                label: '중복 제외',
                value: rows.filter((row) => row.status === 'DUPLICATE').length,
                tone: 'warning' as const,
                icon: 'person' as const
              },
              {
                label: '오류',
                value: rows.filter((row) => row.status === 'ERROR').length,
                tone: 'danger' as const,
                icon: 'close' as const
              }
            ].map((card) => (
              <SummaryCard
                key={card.label}
                label={card.label}
                value={card.value}
                tone={card.tone}
                unit={'건'}
                icon={(
                  <ServiceIcon
                    name={card.icon}
                  />
                )}
              />
            ))}
          </div>
          <div
            className={styles.card}
          >
            <div
              className={styles.filters}
            >
              <Input
                label={'주민 검색'}
                placeholder={'이름, 동·호수, 연락처 끝 4자리'}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
              <Dropdown
                label={'처리 상태'}
                clearable={false}
                value={filter}
                onChange={(value) => {
                  setFilter(value);
                  setPage(1);
                }}
                options={[{
                  value: '',
                  label: '전체'
                }, ...Object.entries(IMPORT_STATUS_LABELS).filter(([value]) => completed ? value !== 'READY' : ['READY','DUPLICATE','ERROR'].includes(value)).map(([value,label]) => ({
                  value,
                  label
                }))]}
              />
              <Dropdown
                label={'페이지당 주민 수'}
                clearable={false}
                value={String(pageSize)}
                onChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
                options={[10,20,50].map((value) => ({
                  value: String(value),
                  label: `${value}명씩 보기`
                }))}
              />
            </div>
            {!completed && (
              <label
                className={styles['select-all']}
              >
                <input
                  type={'checkbox'}
                  checked={Boolean(available.length) && selected.length === available.length}
                  disabled={Boolean(busy) || attempted || !available.length}
                  onChange={(event) => controller.setSelected(event.target.checked ? available.map((row) => row.rowNumber) : [])}
                />
                등록 가능한 주민 전체 선택 (
                {selected.length}
                명)
              </label>
            )}
            <ImportTable
              rows={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
              selected={selected}
              completed={completed}
              disabled={Boolean(busy) || attempted}
              onSelect={(rowNumber) => controller.setSelected((previous) => previous.includes(rowNumber) ? previous.filter((number) => number !== rowNumber) : [...previous, rowNumber])}
            />
            <Pagination
              label={'엑셀 주민 목록 페이지'}
              unit={'명'}
              total={filtered.length}
              page={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
          <p
            className={styles.note}
          >
            {completed ? `선택하지 않은 행 ${rows.filter((row) => row.status === 'NOT_SELECTED').length}건 · 오류·중복 행은 등록하지 않았어요.` : '오류·중복 행은 등록하지 않습니다. 선택한 주민은 엑셀의 위쪽 행부터 등록합니다.'}
          </p>
        </>
      )}
      <footer
        className={styles.actions}
      >
        {result && !completed && (
          <Button
            loading={busy === 'save'}
            disabled={Boolean(busy) || !selected.length}
            onClick={() => void controller.save()}
          >
            {saveLabel}
          </Button>
        )}
        {result && completed && (
          <Button
            variant={'outline'}
            onClick={() => downloadResult(rows)}
          >
            결과 CSV 다운로드
          </Button>
        )}
        <Button
          variant={'outline'}
          disabled={Boolean(busy)}
          onClick={() => router.replace(listPath)}
        >
          주민 목록
        </Button>
      </footer>
    </section>
  );
}
