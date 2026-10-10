import {
  PREVIEW_MENU,
  PREVIEW_PAYMENTS,
  PREVIEW_PHONE_ACTIONS,
  PREVIEW_PHONE_NAVIGATION,
  PREVIEW_SCHEDULES,
} from '../../_constants/previewData';
import { BrandLogo } from '../brand-logo/brandLogo';
import { LandingIcon } from '../landing-icon/landingIcon';
import styles from './productPreview.module.css';

function DashboardPreview() {
  return (
    <div
      className={styles.dashboard}
    >
      <aside
        className={styles['preview-sidebar']}
      >
        <BrandLogo
          compact
          variant={'sidebar'}
        />
        <div
          className={styles['preview-menu']}
        >
          {PREVIEW_MENU.map(({ icon, label }, index) => (
            <div
              key={label}
              className={index === 0 ? styles['active-menu'] : undefined}
            >
              <LandingIcon
                name={icon}
              />
              {label}
            </div>
          ))}
        </div>
        <span
          className={styles['sidebar-bottom']}
        >
          함께 만드는 더 좋은 우리 집
        </span>
      </aside>
      <div
        className={styles['preview-workspace']}
      >
        <div
          className={styles['preview-topbar']}
        >
          <span>
            우리빌라
            {' '}
            <LandingIcon
              name={'chevron'}
            />
          </span>
          <span>
            <LandingIcon
              name={'bell'}
            />
            {' '}
            <span
              className={styles.avatar}
            >
              김
            </span>
            {' '}
            김모아 대표
          </span>
        </div>
        <div
          className={styles['preview-content']}
        >
          <h3>
            안녕하세요, 김모아님
            {' '}
            <span
              className={styles['greeting-dot']}
            />
          </h3>
          <p>
            2026년 10월 관리 현황입니다.
          </p>
          <div
            className={styles['preview-stats']}
          >
            <div>
              <span
                className={styles['stat-icon']}
              >
                <LandingIcon
                  name={'receipt'}
                />
              </span>
              <span>
                총 청구액
                <strong>
                  1,200,000
                  <span>
                    원
                  </span>
                </strong>
                <small>
                  이번 달 관리비
                </small>
              </span>
            </div>
            <div
              className={styles['teal-stat']}
            >
              <span
                className={styles['stat-icon']}
              >
                <LandingIcon
                  name={'wallet'}
                />
              </span>
              <span>
                수납액
                <strong>
                  950,000
                  <span>
                    원
                  </span>
                </strong>
                <small>
                  수납률 79.2%
                </small>
              </span>
            </div>
            <div
              className={styles['danger-stat']}
            >
              <span
                className={styles['stat-icon']}
              >
                !
              </span>
              <span>
                미수금
                <strong>
                  250,000
                  <span>
                    원
                  </span>
                </strong>
                <small>
                  미수율 20.8%
                </small>
              </span>
            </div>
          </div>
          <div
            className={styles['preview-columns']}
          >
            <div>
              <div
                className={styles['preview-panel']}
              >
                <h4>
                  <LandingIcon
                    name={'check'}
                  />
                  {' '}
                  처리할 일이 있어요
                  {' '}
                  <small>
                    전체보기 ›
                  </small>
                </h4>
                <div
                  className={styles['task-row']}
                >
                  <span
                    className={styles['danger-stat']}
                  >
                    <LandingIcon
                      name={'notice'}
                    />
                  </span>
                  <div>
                    <b>
                      미납 세대
                    </b>
                    <small>
                      관리비가 아직 납부되지 않았어요.
                    </small>
                  </div>
                  <em>
                    5세대 ›
                  </em>
                </div>
                <div
                  className={styles['task-row']}
                >
                  <span
                    className={styles['warning-stat']}
                  >
                    <LandingIcon
                      name={'clock'}
                    />
                  </span>
                  <div>
                    <b>
                      입금 확인 필요
                    </b>
                    <small>
                      입금 내역을 확인해 주세요.
                    </small>
                  </div>
                  <em>
                    3건 ›
                  </em>
                </div>
                <div
                  className={styles['task-row']}
                >
                  <span>
                    <LandingIcon
                      name={'people'}
                    />
                  </span>
                  <div>
                    <b>
                      가입 승인 요청
                    </b>
                    <small>
                      새로운 이웃이 기다리고 있어요.
                    </small>
                  </div>
                  <em>
                    1건 ›
                  </em>
                </div>
              </div>
              <div
                className={styles['preview-panel']}
              >
                <h4>
                  <LandingIcon
                    name={'wallet'}
                  />
                  {' '}
                  최근 입금
                  {' '}
                  <small>
                    전체보기 ›
                  </small>
                </h4>
                <table
                  className={styles['preview-table']}
                >
                  <thead>
                    <tr>
                      <th>
                        날짜
                      </th>
                      <th>
                        세대
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
                    {PREVIEW_PAYMENTS.map((payment) => (
                      <tr
                        key={payment.unit}
                      >
                        <td>
                          {payment.date}
                        </td>
                        <td>
                          {payment.unit}
                        </td>
                        <td>
                          {payment.amount}
                        </td>
                        <td>
                          <span
                            className={
                              payment.status === '일부납부'
                                ? styles['partial-badge']
                                : styles['paid-badge']
                            }
                          >
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div
                className={styles['preview-panel']}
              >
                <h4>
                  <LandingIcon
                    name={'receipt'}
                  />
                  {' '}
                  이번 달 일정
                </h4>
                {PREVIEW_SCHEDULES.map(({ day, label }) => (
                  <div
                    className={styles['schedule-row']}
                    key={day}
                  >
                    <span>
                      10.
                      {day}
                      <small>
                        이번 달
                      </small>
                    </span>
                    <i />
                    <b>
                      {label}
                    </b>
                  </div>
                ))}
              </div>
              <div
                className={styles['preview-panel']}
              >
                <h4>
                  <LandingIcon
                    name={'notice'}
                  />
                  {' '}
                  공지사항
                </h4>
                <p
                  className={styles['preview-notice']}
                >
                  · 10월 관리비가 부과되었습니다.
                </p>
                <p
                  className={styles['preview-notice']}
                >
                  · 주차 공간 이용 안내
                </p>
                <p
                  className={styles['preview-notice']}
                >
                  · 공용 공간 청소 일정 안내
                </p>
              </div>
            </div>
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
        <LandingIcon
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
        <LandingIcon
          name={'chevron'}
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
              <LandingIcon
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
            <LandingIcon
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
        주민과 관리자를 연결하는 모아홈
        {' '}
        <span>
          · 서비스 화면 예시
        </span>
      </figcaption>
    </figure>
  );
}
