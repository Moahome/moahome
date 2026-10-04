"use client";

import type { RefObject } from "react";
import styles from "./startNoticeDialog.module.css";

export function StartNoticeDialog({
  dialogRef,
  title,
  message,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  message: string;
}) {
  return (
    <dialog
      ref={dialogRef}
      className={styles["notice-dialog"]}
      aria-labelledby="notice-title"
      aria-describedby="notice-description"
    >
      <h2
        id="notice-title"
      >
        {title}
      </h2>
      <p
        id="notice-description"
      >
        {message}
      </p>
      <form
        method="dialog"
      >
        <button
          type="submit"
        >
          확인
        </button>
      </form>
    </dialog>
  );
}
