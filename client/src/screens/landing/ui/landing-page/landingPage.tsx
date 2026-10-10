import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  AUDIENCE_ITEMS,
  BENEFITS,
  BRAND_POINTS,
  FAQ_ITEMS,
  MANAGEMENT_STEPS,
  ROLES,
} from '../_constants/landingContent';
import { BrandLogo } from '../_components/brand-logo/brandLogo';
import { LandingHeader } from '../_components/landing-header/landingHeader';
import { LandingMotion } from '../_components/landing-motion/landingMotion';
import { ProductPreview } from '../_components/product-preview/productPreview';
import styles from './landingPage.module.css';

export function LandingPage() {
  return (
    <LandingMotion>
      <a
        className={styles['skip-link']}
        href={'#main'}
      >
        본문으로 바로가기
      </a>
      <LandingHeader />

      <main
        id={'main'}
      >
        <section
          className={styles.hero}
          aria-labelledby={'hero-title'}
        >
          <div
            className={styles['hero-glow']}
            aria-hidden={'true'}
          />
          <div
            className={`${styles.container} ${styles['hero-inner']}`}
          >
            <div
              className={styles['hero-copy']}
            >
              <p
                className={styles.eyebrow}
              >
                소규모 공동주택 관리비 통합 플랫폼
              </p>
              <h1
                id={'hero-title'}
              >
                우리 집 관리,
                <br />
                이제
                {' '}
                <span>
                  모아홈
                </span>
                에서
                <br
                  className={styles['hero-mobile-break']}
                />
                {' '}
                쉽고 투명하게
              </h1>
              <p
                className={styles['hero-description']}
              >
                주민은 관리비를 쉽게 확인하고,
                <br />
                관리자는 부과·수납·지출을 간편하게,
                <br />
                회계까지 하나로 연결되는 우리 집 관리.
              </p>
              <div
                className={styles['role-highlights']}
              >
                {ROLES.map(({ icon, title, summary }, index) => (
                  <a
                    href={`#role-${index}`}
                    className={styles['role-highlight']}
                    key={title}
                  >
                    <span
                      className={`${styles['icon-bubble']} ${index === 1 ? styles['teal-bubble'] : ''}`}
                    >
                      <ServiceIcon
                        name={icon}
                      />
                    </span>
                    <span>
                      <strong>
                        {title}
                      </strong>
                      <small>
                        {summary}
                      </small>
                    </span>
                  </a>
                ))}
              </div>
              <a
                className={styles['intro-button']}
                href={'#service'}
              >
                서비스 소개 보기
                {' '}
                <ServiceIcon
                  name={'arrow'}
                />
              </a>
              <p
                className={styles['hero-note']}
              >
                <span />
                {' '}
                함께 만드는 더 좋은 우리 집
              </p>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section
          className={`${styles.container} ${styles['benefits-section']}`}
          id={'features'}
          aria-label={'모아홈의 주요 기능'}
        >
          <div
            className={styles.benefits}
          >
            {BENEFITS.map(({ icon, title, description }) => (
              <article
                className={styles.benefit}
                data-reveal
                key={title}
              >
                <span
                  className={styles['icon-bubble']}
                >
                  <ServiceIcon
                    name={icon}
                  />
                </span>
                <div>
                  <h2>
                    {title}
                  </h2>
                  <p>
                    {description}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <div
            className={styles['brand-statement']}
            data-reveal
          >
            <p>
              “ 함께 만드는
              {' '}
              <span>
                더 좋은 우리 집, 모아홈
              </span>
              {' '}
              ”
            </p>
            <ul>
              {BRAND_POINTS.map((text) => (
                <li
                  key={text}
                >
                  <span>
                    <ServiceIcon
                      name={'check'}
                    />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className={`${styles.container} ${styles.section}`}
          id={'service'}
          aria-labelledby={'service-title'}
        >
          <div
            className={styles['section-heading']}
            data-reveal
          >
            <p
              className={styles.eyebrow}
            >
              하나의 서비스, 연결되는 일상
            </p>
            <h2
              id={'service-title'}
            >
              주민부터 관리자까지,
              <br
                className={styles['mobile-break']}
              />
              {' '}
              모두에게 쉬운 관리
            </h2>
            <p>
              따로 관리하던 정보를 모아, 같은 내역을 함께 확인해요.
            </p>
          </div>
          <div
            className={styles['service-cards']}
          >
            {ROLES.map(({ icon, title, description, items }, index) => (
              <article
                className={styles['service-card']}
                data-reveal
                id={`role-${index}`}
                key={title}
              >
                <span
                  className={`${styles['icon-bubble']} ${index === 1 ? styles['teal-bubble'] : ''}`}
                >
                  <ServiceIcon
                    name={icon}
                  />
                </span>
                <h3>
                  {title}
                </h3>
                <p>
                  {description}
                </p>
                <ul>
                  {items.map((item) => (
                    <li
                      key={item}
                    >
                      <ServiceIcon
                        name={'check'}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div
            className={styles['connection-flow']}
            data-reveal
            aria-label={'관리비 업무 연결 흐름'}
          >
            {MANAGEMENT_STEPS.map((step, index) => (
              <span
                key={step}
              >
                <b>
                  <small>
                    0
                    {index + 1}
                  </small>
                  {step}
                </b>
                {index < MANAGEMENT_STEPS.length - 1 && (
                  <ServiceIcon
                    name={'arrow'}
                  />
                )}
              </span>
            ))}
          </div>
        </section>

        <section
          className={styles['audience-section']}
          id={'audience'}
          aria-labelledby={'audience-title'}
        >
          <div
            className={`${styles.container} ${styles['audience-inner']}`}
          >
            <div
              className={styles['section-heading']}
              data-reveal
            >
              <p
                className={styles.eyebrow}
              >
                우리 주택에 꼭 맞게
              </p>
              <h2
                id={'audience-title'}
              >
                작은 주택의 관리도,
                <br />
                체계적일 수 있도록
              </h2>
              <p>
                복잡한 도구 대신, 우리에게 필요한 관리.
                <br />
                모아홈은 소규모 공동주택에서 시작합니다.
              </p>
            </div>
            <div
              className={styles['audience-cards']}
            >
              {AUDIENCE_ITEMS.map(({ title, text, icon }) => (
                <article
                  data-reveal
                  key={title}
                >
                  <span
                    className={styles['icon-bubble']}
                  >
                    <ServiceIcon
                      name={icon}
                    />
                  </span>
                  <div>
                    <h3>
                      {title}
                    </h3>
                    <p>
                      {text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className={`${styles.container} ${styles.section} ${styles['faq-section']}`}
          id={'faq'}
          aria-labelledby={'faq-title'}
        >
          <div
            className={styles['section-heading']}
            data-reveal
          >
            <p
              className={styles.eyebrow}
            >
              궁금한 점이 있으신가요?
            </p>
            <h2
              id={'faq-title'}
            >
              자주 묻는 질문
            </h2>
          </div>
          <div
            className={styles['faq-list']}
          >
            {FAQ_ITEMS.map(({ question, answer }) => (
              <details
                className={styles['faq-item']}
                data-reveal
                key={question}
              >
                <summary>
                  <span>
                    {question}
                  </span>
                  <ServiceIcon
                    name={'chevron'}
                    direction={'down'}
                  />
                </summary>
                <p>
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer
        className={styles.footer}
      >
        <div
          className={`${styles.container} ${styles['footer-inner']}`}
        >
          <BrandLogo
            variant={'footer'}
          />
          <p>
            소규모 공동주택을 위한 더 쉬운 관리.
            <br />
            <span>
              ©
              {' '}
              {new Date().getFullYear()}
              {' '}
              MoaHome.
            </span>
          </p>
          <a
            href={'#top'}
          >
            맨 위로
            {' '}
            <ServiceIcon
              name={'arrow'}
            />
          </a>
        </div>
      </footer>
    </LandingMotion>
  );
}
