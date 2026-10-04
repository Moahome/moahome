"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CurrentUser } from "@/entities/session";
import { LogoutButton } from "@/features/logout";
import { StartAvatar } from "../start-avatar/startAvatar";
import { StartIcon } from "../start-icon/startIcon";
import styles from "./startMobileMenu.module.css";

/** 모바일 계정 메뉴를 모달로 열고 화면 크기 변경과 닫기 시 배경 스크롤을 복구합니다. */
export function StartMobileMenu({
  user,
}: {
  user: Pick<CurrentUser, "displayName" | "profileImageUrl">;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const animationsRef = useRef<Animation[]>([]);
  const isClosingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 640px)");

    function closeOnDesktop() {
      if (!mobileQuery.matches) {
        dialogRef.current?.close();
      }
    }

    mobileQuery.addEventListener("change", closeOnDesktop);
    return () => {
      mobileQuery.removeEventListener("change", closeOnDesktop);
      animationsRef.current.forEach((animation) => animation.cancel());
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  /** 화면 오른쪽 밖에서 진입하며, 도중에 닫으면 현재 위치에서 이어서 퇴장합니다. */
  function animateMenu(isEntering: boolean) {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    if (!panel || !backdrop) {
      return null;
    }

    // 취소 전에 현재 위치를 읽어 열림 도중 닫아도 패널과 배경이 갑자기 튀지 않게 합니다.
    const startTransform = isEntering ? "translateX(100%)" : getComputedStyle(panel).transform;
    const startOpacity = isEntering ? "0" : getComputedStyle(backdrop).opacity;
    animationsRef.current.forEach((animation) => animation.cancel());
    const options: KeyframeAnimationOptions = {
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : (isEntering ? 320 : 220),
      easing: isEntering ? "cubic-bezier(0.22, 1, 0.36, 1)" : "cubic-bezier(0.4, 0, 1, 1)",
      fill: "both",
    };
    const panelAnimation = panel.animate([
      { transform: startTransform },
      { transform: isEntering ? "translateX(0)" : "translateX(100%)" },
    ], options);
    const backdropAnimation = backdrop.animate([
      { opacity: startOpacity },
      { opacity: isEntering ? "1" : "0" },
    ], options);
    animationsRef.current = [panelAnimation, backdropAnimation];

    return panelAnimation;
  }

  /** 모달을 표시한 프레임 안에서 이동을 시작하고 포커스 이동으로 인한 스크롤을 막습니다. */
  function openMenu() {
    dialogRef.current?.showModal();
    setIsOpen(true);
    animateMenu(true);
    closeButtonRef.current?.focus({ preventScroll: true });
  }

  /** 퇴장 모션이 끝날 때까지 모달과 스크롤 잠금을 유지합니다. */
  function closeMenu() {
    if (isClosingRef.current || !dialogRef.current?.open) {
      return;
    }

    isClosingRef.current = true;
    const animation = animateMenu(false);

    if (!animation) {
      dialogRef.current.close();
      return;
    }

    void animation.finished.then(() => dialogRef.current?.close()).catch(() => {
      // 데스크톱 전환이나 컴포넌트 해제로 취소되면 해당 경로가 닫기와 스크롤 복구를 처리합니다.
    });
  }

  /** Escape와 화면 전환을 포함한 모든 닫기 경로에서 모션과 열린 상태를 정리합니다. */
  function finishClose() {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current = [];
    isClosingRef.current = false;
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={styles["menu-trigger"]}
        aria-label={`${user.displayName}님 메뉴 열기`}
        aria-expanded={isOpen}
        aria-controls="start-mobile-menu"
        aria-haspopup="dialog"
        onClick={openMenu}
      >
        <StartAvatar
          user={user}
        />
      </button>
      <dialog
        ref={dialogRef}
        id="start-mobile-menu"
        className={styles.dialog}
        aria-labelledby="start-mobile-menu-title"
        onClose={finishClose}
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
      >
        <button
          ref={backdropRef}
          type="button"
          className={styles.backdrop}
          tabIndex={-1}
          aria-label="메뉴 바깥 영역을 눌러 닫기"
          onClick={closeMenu}
        />
        <div
          ref={panelRef}
          className={styles.panel}
        >
          <div
            className={styles.heading}
          >
            <h2
              id="start-mobile-menu-title"
            >
              메뉴
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles["close-button"]}
              aria-label="메뉴 닫기"
              onClick={closeMenu}
            >
              <StartIcon
                name="close"
              />
            </button>
          </div>
          <div
            className={styles.account}
          >
            <StartAvatar
              user={user}
            />
            <div>
              <strong>
                {user.displayName}
                님
              </strong>
              <p>
                모아홈에 오신 것을 환영해요.
              </p>
            </div>
          </div>
          <nav
            className={styles.navigation}
            aria-label="모바일 주요 메뉴"
          >
            <Link
              href="/start"
              onClick={closeMenu}
            >
              시작 화면
              <StartIcon
                name="chevron"
              />
            </Link>
          </nav>
          <div
            className={styles.footer}
          >
            <LogoutButton
              variant="menu"
            />
          </div>
        </div>
      </dialog>
    </>
  );
}
