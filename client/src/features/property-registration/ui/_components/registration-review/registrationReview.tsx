'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { formatWon } from '@/shared/lib/format';
import type {
  RegistrationDraft,
  RegistrationStep
} from '../../../model/registrationDraft';
import type { RegistrationResult } from '../../../api/registrationApi';
import { getFeeItemsTotal } from '../../../model/feeItems';
import {
  getFloorLabel,
  getUnitLabel,
  type UnitDraft
} from '../../../model/unitSetup';
import {
  getSortedBuildings,
  getSortedUnits
} from '../../_utils/setupSorting';
import { SetupProgress } from '../setup-progress/setupProgress';
import {
  RegistrationIcon,
  type RegistrationIconName
} from '../registration-icon/registrationIcon';
import styles from './registrationReview.module.css';

export type SubmissionStatus = 'idle' | 'submitting' | 'checking' | 'unknown' | 'complete';

/** 저장 전에는 초안 요약과 수정 이동을 제공하고 성공 응답을 확인한 뒤에만 완료를 표시합니다. */
export function RegistrationReview({ draft, status, result, message, canRetry, onEdit, onPrevious, onSubmit, onCheck, onRetry, onClose }: {
  draft: RegistrationDraft;
  status: SubmissionStatus;
  result: RegistrationResult | null;
  message: string;
  canRetry: boolean;
  onEdit: (step: RegistrationStep) => void;
  onPrevious: () => void;
  onSubmit: () => void;
  onCheck: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const complete = status === 'complete' && result !== null;
  const locked = status !== 'idle';
  const busy = status === 'submitting' || status === 'checking';
  const units = getSortedUnits(draft.units, draft.buildings, draft.basicInfo.hasBuildings === true);
  // 동별 상세에는 정렬된 호수만 모아 보여주고 선택 가능한 카드 모양을 사용하지 않습니다.
  const unitGroups = draft.basicInfo.hasBuildings
    ? getSortedBuildings(draft.buildings).map((building) => ({
      id: building.clientId,
      name: building.name,
      units: units.filter((unit) => unit.buildingClientId === building.clientId)
    }))
    : [{
      id: 'no-building',
      name: '동 없음',
      units
    }];
  const firstUnit = units[0];
  const firstUnitLabel = firstUnit ? `${draft.buildings.find((building) => building.clientId === firstUnit.buildingClientId)?.name ?? ''} ${getUnitLabel(firstUnit)}`.trim() : '';
  const hasDraft = draft.units.length > 0 && draft.feeItems.length > 0;
  const title = complete ? '설정이 완료되었습니다' : '등록 정보를 확인해주세요';
  const propertyName = result?.property.name ?? draft.basicInfo.name;

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, [complete]);

  return (
    <main
      className={styles.page}
    >
      <div
        className={styles['mobile-navigation']}
      >
        {!locked && (
          <Button
            variant={'ghost'}
            iconOnly
            aria-label={'관리비 항목 설정으로 돌아가기'}
            onClick={onPrevious}
            leadingIcon={(
              <RegistrationIcon
                name={'back'}
              />
            )}
          />
        )}
        <span>
          초기 설정
        </span>
        <span
          className={styles['mobile-step']}
        >
          <strong>
            5
          </strong>
          {' '}
          / 5
        </span>
      </div>
      <header
        className={styles['setup-heading']}
      >
        <h1>
          {propertyName}
          {' '}
          초기 설정
        </h1>
        <p>
          관리 운영에 필요한 정보를 설정해주세요.
        </p>
      </header>
      <SetupProgress
        currentStep={5}
        complete={complete}
        mobileCountInHeader
      />
      <section
        className={styles.card}
        aria-labelledby={'registration-review-title'}
        aria-busy={busy}
      >
        <header
          className={styles.intro}
        >
          <span
            className={styles['intro-icon']}
            data-complete={complete}
            aria-hidden={'true'}
          >
            <RegistrationIcon
              name={complete ? 'check' : 'receipt'}
            />
          </span>
          <h2
            id={'registration-review-title'}
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h2>
          <p>
            {complete ? `${propertyName}의 관리대상과 초기 설정 정보를 저장했어요.` : '입력한 정보를 확인한 뒤 관리 시작하기를 눌러주세요.'}
          </p>
        </header>
        {hasDraft && (
          <div
            className={styles.summary}
          >
            <h3>
              등록 정보
            </h3>
            <ReviewRow
              label={'관리대상'}
              regionLabel={'관리대상 요약'}
              icon={'building'}
              locked={locked}
              editLabel={'관리대상 수정'}
              onEdit={() => onEdit('basic')}
              toggleName={'관리대상 상세'}
              detailsId={'review-property-details'}
              summary={(
                <>
                  <strong>
                    {propertyName}
                  </strong>
                  <span
                    className={styles['summary-line']}
                  >
                    {draft.basicInfo.address}
                    {' '}
                    {draft.basicInfo.addressDetail}
                  </span>
                </>
              )}
            >
              <dl
                className={styles['info-list']}
              >
                <div>
                  <dt>
                    관리대상 이름
                  </dt>
                  <dd>
                    {propertyName}
                  </dd>
                </div>
                <div>
                  <dt>
                    주소
                  </dt>
                  <dd>
                    {draft.basicInfo.address}
                  </dd>
                </div>
                <div>
                  <dt>
                    상세주소
                  </dt>
                  <dd>
                    {draft.basicInfo.addressDetail || '미입력'}
                  </dd>
                </div>
                <div>
                  <dt>
                    건물 유형
                  </dt>
                  <dd>
                    {draft.basicInfo.propertyType || '미선택'}
                  </dd>
                </div>
                <div>
                  <dt>
                    동 구분
                  </dt>
                  <dd>
                    {draft.basicInfo.hasBuildings ? '동 있음' : '동 없음'}
                  </dd>
                </div>
              </dl>
            </ReviewRow>
            <ReviewRow
              label={'동·세대'}
              regionLabel={'동·세대 요약'}
              icon={'units'}
              locked={locked}
              editLabel={'동·세대 수정'}
              onEdit={() => onEdit('units')}
              toggleName={'세대 목록'}
              detailsId={'review-unit-list'}
              fullWidthDetails
              summary={(
                <>
                  <strong>
                    {draft.basicInfo.hasBuildings ? `${draft.buildings.length}개 동 · ` : '동 없음 · '}
                    총
                    {' '}
                    {units.length}
                    세대
                  </strong>
                  <span
                    className={styles['summary-line']}
                  >
                    {firstUnitLabel}
                    {units.length > 1 ? ` 외 ${units.length - 1}세대` : ''}
                  </span>
                </>
              )}
            >
              <div
                className={styles['unit-groups']}
              >
                {unitGroups.map((group) => (
                  <section
                    key={group.id}
                    className={styles['unit-group']}
                    aria-label={`${group.name} 세대 목록`}
                  >
                    <header
                      className={styles['unit-group-heading']}
                    >
                      <h4>
                        {group.name}
                      </h4>
                      <span>
                        {group.units.length}
                        세대
                      </span>
                    </header>
                    {groupReviewUnitsByFloor(group.units).map((floorGroup) => (
                      <ul
                        key={floorGroup.floor ?? 'no-floor'}
                        className={styles.units}
                        aria-label={`${floorGroup.floor === null ? '층 미입력' : getFloorLabel(floorGroup.floor)} 세대 목록`}
                        data-columns={Math.min(floorGroup.units.length, 4)}
                        data-wide-labels={floorGroup.units.some((unit) => Array.from(getUnitLabel(unit)).length > 10)}
                      >
                        {floorGroup.units.map((unit) => (
                          <li
                            key={unit.clientId}
                          >
                            {getUnitLabel(unit)}
                          </li>
                        ))}
                      </ul>
                    ))}
                    {group.units.length === 0 && (
                      <p>
                        등록된 세대가 없습니다.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            </ReviewRow>
            <ReviewRow
              label={'관리계좌'}
              regionLabel={'관리계좌 요약'}
              icon={'bank'}
              locked={locked}
              editLabel={'관리계좌 수정'}
              onEdit={() => onEdit('account')}
              toggleName={'관리계좌 상세'}
              detailsId={'review-account-details'}
              summary={(
                <>
                  <strong>
                    {draft.bankAccount.bankName}
                    {' '}
                    ····
                    {draft.bankAccount.accountNumber.slice(-4)}
                  </strong>
                  <span
                    className={styles['summary-line']}
                  >
                    예금주
                    {' '}
                    {draft.bankAccount.holderName}
                  </span>
                </>
              )}
            >
              <dl
                className={styles['info-list']}
              >
                <div>
                  <dt>
                    은행
                  </dt>
                  <dd>
                    {draft.bankAccount.bankName}
                  </dd>
                </div>
                <div>
                  <dt>
                    계좌번호
                  </dt>
                  <dd>
                    ····
                    {draft.bankAccount.accountNumber.slice(-4)}
                  </dd>
                </div>
                <div>
                  <dt>
                    예금주
                  </dt>
                  <dd>
                    {draft.bankAccount.holderName}
                  </dd>
                </div>
                <div>
                  <dt>
                    계좌 구분
                  </dt>
                  <dd>
                    공용 관리계좌 · 기본 계좌
                  </dd>
                </div>
              </dl>
            </ReviewRow>
            <ReviewRow
              label={'세대당 월 기본 관리비'}
              regionLabel={'관리비 요약'}
              icon={'coins'}
              locked={locked}
              editLabel={'관리비 항목 수정'}
              onEdit={() => onEdit('fees')}
              toggleName={'관리비 항목'}
              detailsId={'review-fee-details'}
              summary={(
                <>
                  <strong
                    className={styles.amount}
                  >
                    {formatWon(result?.summary.monthlyDefaultAmount ?? getFeeItemsTotal(draft.feeItems))}
                  </strong>
                  <span
                    className={styles['summary-line']}
                  >
                    {draft.feeItems.length}
                    개 항목이 설정되어 있습니다.
                  </span>
                </>
              )}
            >
              <table
                className={styles.fees}
              >
                <caption>
                  세대당 월 기본 관리비 항목별 금액
                </caption>
                <thead>
                  <tr>
                    <th
                      scope={'col'}
                    >
                      항목
                    </th>
                    <th
                      scope={'col'}
                    >
                      금액
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.feeItems.map((item) => (
                    <tr
                      key={item.clientId}
                    >
                      <th
                        scope={'row'}
                      >
                        {item.itemName}
                      </th>
                      <td>
                        {formatWon(item.defaultAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReviewRow>
          </div>
        )}
        {!hasDraft && result && (
          <div
            className={styles['result-summary']}
          >
            <strong>
              {result.property.name}
            </strong>
            <p>
              {result.summary.buildingCount}
              개 동 ·
              {' '}
              {result.summary.unitCount}
              세대
            </p>
            <p>
              세대당 월 기본 관리비
              {formatWon(result.summary.monthlyDefaultAmount)}
            </p>
          </div>
        )}
        {status === 'idle' && (
          <aside
            className={styles.notice}
          >
            <RegistrationIcon
              name={'info'}
            />
            <p>
              관리 시작하기를 누르면 전체 정보가 저장됩니다. 저장 전까지 수정할 수 있어요.
            </p>
          </aside>
        )}
        {message && (
          <p
            className={styles.message}
            role={status === 'idle' || status === 'unknown' ? 'alert' : 'status'}
          >
            {message}
          </p>
        )}
        <footer
          className={styles.actions}
        >
          {status === 'idle' && (
            <>
              <Button
                variant={'outline'}
                onClick={onPrevious}
              >
                이전
              </Button>
              <Button
                onClick={onSubmit}
              >
                관리 시작하기
              </Button>
            </>
          )}
          {busy && (
            <Button
              loading
            >
              {status === 'submitting' ? '저장 중이에요' : '등록 결과를 확인하고 있어요'}
            </Button>
          )}
          {status === 'unknown' && (
            <>
              <Button
                variant={'outline'}
                onClick={onCheck}
              >
                등록 결과 확인
              </Button>
              {canRetry && (
                <Button
                  onClick={onRetry}
                >
                  같은 정보로 다시 시도
                </Button>
              )}
            </>
          )}
          {complete && (
            <Button
              onClick={onClose}
            >
              확인
            </Button>
          )}
        </footer>
      </section>
    </main>
  );
}

/** 동 안의 실제 층별 세대를 모아 다음 층이 남은 열을 채우지 않게 하고, 층 미입력은 호수로 추측하지 않습니다. */
function groupReviewUnitsByFloor(units: UnitDraft[]) {
  const floors = new Map<number | null, UnitDraft[]>();
  for (const unit of units) {
    const entries = floors.get(unit.floor) ?? [];
    entries.push(unit);
    floors.set(unit.floor, entries);
  }

  // 지하부터 지상으로 표시하며 각 층의 호수 정렬은 기존 목록 순서를 유지합니다.
  return Array.from(floors, ([floor, entries]) => ({
    floor,
    units: entries
  })).sort((left, right) => {
    if (left.floor === right.floor) return 0;
    if (left.floor === null) return 1;
    if (right.floor === null) return -1;

    return left.floor - right.floor;
  });
}

/** 요약 전체는 실제 펼치기 버튼으로 만들고 오른쪽 수정 동작은 독립된 버튼으로 두어 펼침 상태와 분리합니다. */
function ReviewRow({
  label,
  regionLabel,
  icon,
  locked,
  editLabel,
  onEdit,
  summary,
  toggleName,
  detailsId,
  fullWidthDetails = false,
  children,
}: {
  label: string;
  regionLabel: string;
  icon: RegistrationIconName;
  locked: boolean;
  editLabel: string;
  onEdit: () => void;
  summary: ReactNode;
  toggleName: string;
  detailsId: string;
  fullWidthDetails?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className={styles.row}
      aria-label={regionLabel}
    >
      <div
        className={styles['row-header']}
      >
        <Button
          variant={'ghost'}
          className={styles['row-toggle']}
          aria-label={`${toggleName} ${expanded ? '접기' : '펼치기'}`}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((previous) => !previous)}
        >
          <span
            className={styles.icon}
            data-icon={icon}
            aria-hidden={'true'}
          >
            <RegistrationIcon
              name={icon}
            />
          </span>
          <span
            className={styles['row-copy']}
          >
            <span
              className={styles['row-label']}
            >
              {label}
            </span>
            <span
              className={styles.details}
            >
              {summary}
            </span>
          </span>
          <span
            className={styles['row-controls']}
            aria-hidden={'true'}
          >
            <span
              className={styles.chevron}
            >
              <RegistrationIcon
                name={'down'}
              />
            </span>
          </span>
        </Button>
        {!locked && (
          <Button
            variant={'text'}
            size={'sm'}
            className={styles['row-edit']}
            aria-label={editLabel}
            onClick={onEdit}
          >
            수정
          </Button>
        )}
      </div>
      {/* 닫는 애니메이션 동안 남은 상세 내용의 포커스와 읽기를 즉시 차단합니다. */}
      <div
        id={detailsId}
        className={styles['accordion-content']}
        data-expanded={expanded}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div
          className={styles['accordion-inner']}
        >
          <div
            className={styles['accordion-body']}
            data-full-width={fullWidthDetails}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
