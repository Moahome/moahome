import { BrandMark } from "@/shared/ui/brand-mark";
import styles from "./brandLogo.module.css";

type BrandLogoProps = {
  compact?: boolean;
  variant?: "header" | "drawer" | "sidebar" | "phone" | "footer";
};

export function BrandLogo({
  compact = false,
  variant = "header",
}: BrandLogoProps) {
  return (
    <span
      className={`${styles.brand} ${styles[`${variant}-brand`]} ${compact ? styles["compact-brand"] : ""}`}
    >
      <BrandMark />
      <span>
        <strong>
          모아홈
        </strong>
        {!compact && (
          <span
            className={styles["brand-tagline"]}
          >
            함께 만드는 더 좋은 우리 집
          </span>
        )}
      </span>
    </span>
  );
}
