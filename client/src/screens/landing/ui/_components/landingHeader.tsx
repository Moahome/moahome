"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NAVIGATION_ITEMS } from "../_constants/landingContent";
import { BrandLogo } from "./brandLogo";
import { LandingIcon } from "./landingIcon";
import styles from "./landingHeader.module.css";

function LoginLink({ onClick }: { onClick?: () => void }) {
  return (
    <div
      className={styles["login-area"]}
    >
      <Link
        href="/login"
        onClick={onClick}
      >
        로그인
      </Link>
    </div>
  );
}

export function LandingHeader() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    const closeOnDesktop = () => {
      if (!mobileQuery.matches) dialogRef.current?.close();
    };
    mobileQuery.addEventListener("change", closeOnDesktop);
    return () => mobileQuery.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  function openMenu() {
    dialogRef.current?.showModal();
    setIsMenuOpen(true);
    closeButtonRef.current?.focus();
  }

  function closeMenu() {
    dialogRef.current?.close();
  }

  return (
    <header
      className={styles.header}
    >
      <div
        className={styles["header-inner"]}
      >
        <a
          href="#top"
          className={styles["brand-link"]}
          aria-label="모아홈 처음으로"
        >
          <BrandLogo />
        </a>
        <nav
          className={styles.navigation}
          aria-label="주요 메뉴"
        >
          {NAVIGATION_ITEMS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
            >
              {label}
            </a>
          ))}
        </nav>
        <div
          className={styles["desktop-login"]}
        >
          <LoginLink />
        </div>
        <button
          className={styles["menu-toggle"]}
          type="button"
          onClick={openMenu}
          aria-label="메뉴 열기"
          aria-expanded={isMenuOpen}
          aria-controls="landing-mobile-menu"
          aria-haspopup="dialog"
        >
          <LandingIcon
            name="menu"
          />
        </button>
      </div>
      <dialog
        ref={dialogRef}
        className={styles["mobile-dialog"]}
        id="landing-mobile-menu"
        aria-labelledby="mobile-menu-title"
        onClose={() => setIsMenuOpen(false)}
      >
        <button
          className={styles["drawer-backdrop"]}
          type="button"
          onClick={closeMenu}
          aria-label="메뉴 바깥 영역을 눌러 닫기"
          tabIndex={-1}
        />
        <div
          className={styles["drawer-panel"]}
        >
          <div
            className={styles["drawer-heading"]}
          >
            <a
              href="#top"
              onClick={closeMenu}
              aria-label="모아홈 처음으로"
            >
              <BrandLogo
                compact
                variant="drawer"
              />
            </a>
            <button
              ref={closeButtonRef}
              className={styles["menu-close"]}
              type="button"
              onClick={closeMenu}
              aria-label="메뉴 닫기"
            >
              <LandingIcon
                name="close"
              />
            </button>
          </div>
          <h2
            id="mobile-menu-title"
            className={styles["drawer-title"]}
          >
            모아홈 둘러보기
          </h2>
          <nav
            className={styles["drawer-navigation"]}
            aria-label="모바일 주요 메뉴"
          >
            {NAVIGATION_ITEMS.map(({ href, label }, index) => (
              <a
                key={href}
                href={href}
                onClick={closeMenu}
              >
                <span>
                  <small>
                    0
                    {index + 1}
                  </small>
                  {label}
                </span>
                <LandingIcon
                  name="arrow"
                />
              </a>
            ))}
          </nav>
          <div
            className={styles["drawer-login"]}
          >
            <LoginLink
              onClick={closeMenu}
            />
            <p>
              카카오로 모아홈을 시작해보세요.
            </p>
          </div>
          <p
            className={styles["drawer-tagline"]}
          >
            함께 만드는
            <br />
            <strong>
              더 좋은 우리 집, 모아홈
            </strong>
          </p>
        </div>
      </dialog>
    </header>
  );
}
