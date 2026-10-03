import { BrandMark } from "@/shared/ui/brand-mark";
import styles from "../landingPage.module.css";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`${styles.brand} ${compact ? styles["compact-brand"] : ""}`}
    >
      <BrandMark />
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
