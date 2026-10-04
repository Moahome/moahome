"use client";

import Image from "next/image";
import Link from "next/link";
import type { CurrentUser } from "@/entities/session";
import { BrandMark } from "@/shared/ui/brand-mark";
import { StartIcon } from "../start-icon/startIcon";
import styles from "./startHeader.module.css";

export function StartHeader({
  user,
  onNotify,
}: {
  user: Pick<CurrentUser, "displayName" | "profileImageUrl">;
  onNotify: () => void;
}) {
  return (
    <header
      className={styles.header}
    >
      <Link
        href="/start"
        className={styles.brand}
        aria-label="모아홈 시작 화면으로"
      >
        <BrandMark />
        <span>
          모아홈
        </span>
      </Link>
      <div
        className={styles["header-actions"]}
      >
        <button
          type="button"
          className={styles["notification-button"]}
          aria-label="알림"
          onClick={onNotify}
        >
          <StartIcon
            name="bell"
          />
        </button>
        <details
          className={styles.profile}
        >
          <summary
            aria-label={`${user.displayName}님 계정 정보`}
          >
            <span
              className={styles.avatar}
            >
              {user.profileImageUrl ? (
                <Image
                  src={user.profileImageUrl}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                />
              ) : (
                <StartIcon
                  name="person"
                />
              )}
            </span>
            <span
              className={styles["profile-name"]}
            >
              {user.displayName}
              님
            </span>
            <span
              className={styles["profile-chevron"]}
            >
              <StartIcon
                name="chevron"
              />
            </span>
          </summary>
          <div
            className={styles["profile-panel"]}
          >
            <strong>
              {user.displayName}
              님
            </strong>
            <p>
              모아홈에 오신 것을 환영해요.
            </p>
          </div>
        </details>
      </div>
    </header>
  );
}
