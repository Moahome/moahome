import styles from "../landingPage.module.css";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`${styles.brand} ${compact ? styles["compact-brand"] : ""}`}
    >
      <svg viewBox="0 0 44 48" fill="none" aria-hidden="true">
        <path
          d="M3 20 22 4l19 16v23H29V25l-7-6-7 6v18H3Z"
          className={styles["logo-house"]}
        />
        <path
          d="m22 4 19 16-8 6-11-9L11 26l-8-6Z"
          className={styles["logo-roof"]}
        />
        <path d="M16 38a6 6 0 0 1 12 0v5H16Z" className={styles["logo-door"]} />
      </svg>
      <span>
        <strong>모아홈</strong>
        {!compact && (
          <span className={styles["brand-tagline"]}>
            함께 만드는 더 좋은 우리 집
          </span>
        )}
      </span>
    </span>
  );
}
