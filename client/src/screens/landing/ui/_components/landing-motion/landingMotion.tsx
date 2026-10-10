'use client';

import {
  useEffect,
  useRef,
  type ReactNode
} from 'react';
import styles from './landingMotion.module.css';

export function LandingMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const revealElements = root.querySelectorAll<HTMLElement>('[data-reveal]');
    const preview = root.querySelector<HTMLElement>('figure');
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.revealState = 'visible';
          revealObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12
      },
    );

    const previewObserver = new IntersectionObserver(([entry]) => {
      if (preview) preview.dataset.motionVisible = String(entry.isIntersecting);
    });

    function updateMotionPreference() {
      revealObserver.disconnect();
      revealElements.forEach((element) => {
        if (motionQuery.matches) {
          delete element.dataset.revealState;
          return;
        }
        if (element.dataset.revealState === 'visible') return;
        element.dataset.revealState = 'pending';
        revealObserver.observe(element);
      });
    }

    updateMotionPreference();
    if (preview) previewObserver.observe(preview);
    motionQuery.addEventListener('change', updateMotionPreference);

    return () => {
      revealObserver.disconnect();
      previewObserver.disconnect();
      motionQuery.removeEventListener('change', updateMotionPreference);
      revealElements.forEach((element) => {
        delete element.dataset.revealState;
      });
      if (preview) delete preview.dataset.motionVisible;
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={styles.page}
      id={'top'}
    >
      {children}
    </div>
  );
}
