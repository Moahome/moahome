import Link from "next/link";
import { getKakaoLoginErrorMessage, KakaoLoginButton } from "@/features/kakao-login";
import { BrandMark } from "@/shared/ui/brand-mark";
import { NeighborhoodIllustration } from "@/shared/ui/neighborhood-illustration";
import { LoginFooter } from "./_components/loginFooter";
import styles from "./loginPage.module.css";

export function LoginPage({ errorCode }: { errorCode?: string }) {
  const errorMessage = getKakaoLoginErrorMessage(errorCode);

  return (
    <div
      className={styles.page}
    >
      <a
        className={styles["skip-link"]}
        href="#login"
      >
        로그인으로 바로가기
      </a>
      <header
        className={styles.header}
      >
        <Link
          href="/"
          className={styles.brand}
          aria-label="모아홈 홈으로"
        >
          <BrandMark />
          <span>
            모아홈
          </span>
        </Link>
        <p>
          우리의 공간이 더 특별해지는, 모아홈
        </p>
      </header>

      <main
        className={styles.main}
      >
        <section
          className={styles.introduction}
          aria-labelledby="brand-title"
        >
          <div
            className={styles["intro-copy"]}
          >
            <h1
              id="brand-title"
            >
              <span
                className={styles["mobile-brand-mark"]}
              >
                <BrandMark />
              </span>
              모아홈
            </h1>
            <p
              className={styles.tagline}
            >
              함께 만드는 더 좋은 우리 집
            </p>
            <p
              className={styles.description}
            >
              아파트와 빌라의 관리비 조회부터
              <br />
              공동체 관리까지, 모아홈이 더 편리한
              <br />
              주거 생활을 도와드립니다.
            </p>
            <p
              className={styles["mobile-description"]}
            >
              관리비 조회와 관리 업무를 시작해보세요.
            </p>
          </div>
          <div
            className={styles.neighborhood}
          >
            <p
              className={styles["neighbor-note"]}
            >
              좋은 이웃,
              <br />
              <span>
                더 좋은 일상
              </span>
              <svg
                viewBox="0 0 38 30"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m6 4-4 11M20 10l-9 12M34 20l-13 7"
                />
              </svg>
            </p>
            <NeighborhoodIllustration />
          </div>
        </section>

        <div
          className={styles["login-area"]}
        >
          <section
            className={styles["login-card"]}
            id="login"
            aria-labelledby="login-title"
          >
            <div
              className={styles["card-heading"]}
            >
              <h2
                id="login-title"
              >
                로그인
              </h2>
              <p>
                관리비 조회와 관리 업무를 시작해보세요.
              </p>
            </div>
            {errorMessage && (
              <p
                className={styles["login-error"]}
                role="alert"
              >
                {errorMessage}
              </p>
            )}
            <KakaoLoginButton />
            <div
              className={styles["service-intro"]}
            >
              <div
                className={styles.divider}
              >
                <span>
                  또는
                </span>
              </div>
              <Link
                href="/#service"
                className={styles["intro-link"]}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="5"
                    y="3"
                    width="14"
                    height="18"
                    rx="3"
                  />
                  <path
                    d="M9 8h6M9 12h6M9 16h3"
                  />
                </svg>
                서비스 소개 보기
              </Link>
            </div>
            <p
              className={styles["invitation-note"]}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                />
                <path
                  d="M12 11v6M12 7v.5"
                />
              </svg>
              <span>
                초대받은 주민은 로그인 후 초대코드로 참여할 수 있어요.
              </span>
            </p>
          </section>
          <LoginFooter />
        </div>
      </main>
    </div>
  );
}
