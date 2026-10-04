"use client";

import { StartIcon } from "../start-icon/startIcon";
import styles from "./pendingRequestCard.module.css";

export function PendingRequestCard({
  onSelect,
}: {
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={styles["pending-card"]}
      onClick={onSelect}
    >
      <span
        className={styles["pending-icon"]}
      >
        <StartIcon
          name="clock"
        />
      </span>
      <span
        className={styles["pending-copy"]}
      >
        <strong>
          승인 대기 중인 요청
        </strong>
        <span>
          가입 요청 후 관리자의 승인을 기다리는 경우 여기에서 확인할 수 있어요.
        </span>
      </span>
      <StartIcon
        name="chevron"
      />
    </button>
  );
}
