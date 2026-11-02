import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  PREVIEW_MENU,
  PREVIEW_PHONE_ACTIONS,
  PREVIEW_PHONE_NAVIGATION,
  PREVIEW_STATS,
  PREVIEW_TASKS,
  PREVIEW_TRANSACTIONS,
} from '../../_constants/previewData';
import { BrandLogo } from '../brand-logo/brandLogo';
import styles from './productPreview.module.css';

/** 실제 관리소장 메뉴와 대시보드 구성을 예시 자료로 보여주며 미구현 기능을 현재 기능처럼 표시하지 않습니다. */
function DashboardPreview() {
  return (
    <div
      className={styles.dashboard}
    >
      <div
        className={styles['preview-topbar']}
      >
        <span
          className={styles['preview-property']}
        >
          우리빌라
          <ServiceIcon
            name={'chevron'}
            direction={'down'}
          />
        </span>
        <span
          className={styles['preview-profile']}
        >
          <ServiceIcon
            name={'bell'}
          />
          <span
            className={styles.avatar}
          >
            김
          </span>
          <span>
            김모아
          </span>
        </span>
      </div>
      <aside
        className={styles['preview-sidebar']}
      >
        <div
          className={styles['sidebar-brand']}
        >
          <BrandLogo
            compact
            variant={'sidebar'}
          />
        </div>
        <div
          className={styles['preview-menu']}
        >
          {PREVIEW_MENU.map(({ icon, label, expandable }, index) => (
            <div
              className={styles['menu-group']}
              key={label}
            >
              <div
                className={index === 0 ? styles['active-menu'] : undefined}
              >
                <ServiceIcon
                  name={icon}
                />
                <span>
                  {label}
                </span>
                {expandable && (
                  <ServiceIcon
                    name={'chevron'}
                    direction={'right'}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <span
          className={styles['sidebar-bottom']}
        >
          <ServiceIcon
            name={'chevron'}
            direction={'left'}
          />
        </span>
      </aside>
      <div
        className={styles['preview-workspace']}
      >
        <div
          className={styles['preview-content']}
        >
          <small
            className={styles['preview-breadcrumb']}
          >
            모아홈
          </small>
          <h3>
            대시보드
          </h3>
          <p>
            우리빌라의 관리 현황을 한눈에 확인하세요.
          </p>
          <div
            className={styles['preview-controls']}
          >
            <span>
              2026년 11월
              <ServiceIcon
                name={'chevron'}
                direction={'down'}
              />
            </span>
            <small>
              방금 조회
              <ServiceIcon
                name={'reset'}
              />
            </small>
          </div>
          <div
            className={styles['preview-stats']}
          >
            {PREVIEW_STATS.map(({ icon, label, amount, note, tone }) => (
              <div
                className={styles[`${tone}-stat`]}
                key={label}
              >
                <span
                  className={styles['stat-icon']}
                >
                  <ServiceIcon
                    name={icon}
                  />
                </span>
                <span>
                  {label}
                  <strong>
                    {amount}
                    <span>
                      원
                    </span>
                  </strong>
                  <small>
                    {note}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <div
            className={styles['preview-overview']}
          >
            <section
              className={styles['preview-panel']}
            >
              <h4>
                현재 처리할 업무
                <small>
                  현재 기준
                </small>
              </h4>
              {PREVIEW_TASKS.map(({ label, count }) => (
                <div
                  className={styles['task-row']}
                  key={label}
                >
                  <span>
                    {label}
                  </span>
                  <b>
                    {count}
                    건
                  </b>
                  <ServiceIcon
                    name={'chevron'}
                  />
                </div>
              ))}
            </section>
            <section
              className={styles['preview-panel']}
            >
              <h4>
                세대 납부 현황
              </h4>
              <div
                className={styles['payment-status']}
              >
                <div
                  className={styles['payment-donut']}
                >
                  <strong>
                    24세대
                  </strong>
                  <small>
                    수납 대상
                  </small>
                </div>
                <div
                  className={styles['payment-legend']}
                >
                  <span>
                    <i />
                    납부완료
                    {' '}
                    <b>
                      19세대
                    </b>
                  </span>
                  <span>
                    <i />
                    미납
                    {' '}
                    <b>
                      5세대
                    </b>
                  </span>
                  <span>
                    <i />
                    선입금 보유
                    {' '}
                    <b>
                      2세대
                    </b>
                  </span>
                </div>
                <small>
                  완납 세대 비율 79.2%
                </small>
              </div>
            </section>
            <section
              className={styles['preview-panel']}
            >
              <h4>
                통장별 잔액
              </h4>
              <div
                className={styles['account-row']}
              >
                <ServiceIcon
                  name={'bank'}
                />
                <span>
                  운영 통장
                  <small>
                    하나은행 ····1234
                  </small>
                </span>
                <b>
                  1,980,000원
                </b>
              </div>
              <div
                className={styles['account-row']}
              >
                <ServiceIcon
                  name={'bank'}
                />
                <span>
                  예비비 통장
                  <small>
                    신한은행 ····5678
                  </small>
                </span>
                <b>
                  250,000원
                </b>
              </div>
              <div
                className={styles['account-total']}
              >
                <span>
                  전체 통장 잔액
                </span>
                <b>
                  2,230,000원
                </b>
              </div>
            </section>
          </div>
          <div
            className={styles['preview-activity']}
          >
            <section
              className={styles['preview-panel']}
            >
              <h4>
                최근 통장 거래
                <small>
                  전체 내역 ›
                </small>
              </h4>
              <table
                className={styles['preview-table']}
              >
                <thead>
                  <tr>
                    <th>
                      거래일시
                    </th>
                    <th>
                      내용
                    </th>
                    <th>
                      금액
                    </th>
                    <th>
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_TRANSACTIONS.map(({ date, label, amount, status }) => (
                    <tr
                      key={label}
                    >
                      <td>
                        {date}
                      </td>
                      <td>
                        {label}
                      </td>
                      <td>
                        {amount}
                      </td>
                      <td>
                        <span
                          className={status === '확정' ? styles['paid-badge'] : styles['partial-badge']}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section
              className={styles['preview-panel']}
            >
              <h4>
                최근 6개월 관리비 현황
              </h4>
              <div
                className={styles['trend-legend']}
              >
                <span>
                  청구액
                </span>
                <span>
                  납부반영액
                </span>
              </div>
              <div
                className={styles['preview-trend']}
              >
                {[['06', 65, 60], ['07', 74, 68], ['08', 68, 64], ['09', 85, 75], ['10', 80, 72], ['11', 90, 71]].map(([month, billed, applied]) => (
                  <div
                    key={month}
                  >
                    <span
                      style={{
                        height: `${billed}%`
                      }}
                    />
                    <span
                      style={{
                        height: `${applied}%`
                      }}
                    />
                    <small>
                      {month}
                      월
                    </small>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResidentPreview() {
  return (
    <div
      className={styles['phone-screen']}
    >
      <div
        className={styles['phone-header']}
      >
        <BrandLogo
          compact
          variant={'phone'}
        />
        <ServiceIcon
          name={'bell'}
        />
      </div>
      <h3>
        안녕하세요, 김모아님
      </h3>
      <div
        className={styles['property-selector']}
      >
        우리빌라
        {' '}
        <ServiceIcon
          name={'chevron'}
          direction={'down'}
        />
      </div>
      <div
        className={styles['mobile-bill']}
      >
        <div>
          이번 달 관리비
          {' '}
          <span>
            납부완료
          </span>
        </div>
        <strong>
          50,000
          <span>
            원
          </span>
        </strong>
        <small>
          납부기한 2026.10.25
        </small>
      </div>
      <div
        className={styles['phone-actions']}
      >
        {PREVIEW_PHONE_ACTIONS.map(({ icon, label }) => (
          <div
            key={label}
          >
            <span>
              <ServiceIcon
                name={icon}
              />
            </span>
            {label}
          </div>
        ))}
      </div>
      <div
        className={styles['phone-notices']}
      >
        <h4>
          공지사항
          {' '}
          <small>
            더보기 ›
          </small>
        </h4>
        <p>
          · 10월 관리비가 부과되었습니다.
          <small>
            10.01
          </small>
        </p>
        <p>
          · 주차 공간 이용 안내
          <small>
            09.28
          </small>
        </p>
        <p>
          · 공용 공간 청소 일정 안내
          <small>
            09.20
          </small>
        </p>
      </div>
      <div
        className={styles['phone-navigation']}
      >
        {PREVIEW_PHONE_NAVIGATION.map(({ icon, label }) => (
          <span
            key={label}
          >
            <ServiceIcon
              name={icon}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProductPreview() {
  return (
    <figure
      className={styles['product-figure']}
    >
      <div
        className={styles['device-stage']}
        aria-hidden={'true'}
      >
        <div
          className={styles['preview-handwriting']}
        >
          우리 집 관리가
          <br />
          더 쉬워집니다.
          <span />
        </div>
        <div
          className={styles.laptop}
        >
          <div
            className={styles['laptop-screen']}
          >
            <span
              className={styles.webcam}
            />
            <DashboardPreview />
          </div>
          <div
            className={styles['laptop-base']}
          >
            <span />
          </div>
        </div>
        <div
          className={styles.phone}
        >
          <span
            className={styles['phone-notch']}
          />
          <ResidentPreview />
        </div>
      </div>
      <figcaption>
        관리소장과 주민을 잇는 모아홈
        {' '}
        <span>
          · 금액은 예시이며 주민 관리비 화면은 준비 중입니다.
        </span>
      </figcaption>
    </figure>
  );
}
