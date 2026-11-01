/** 첫 HTML의 표시 전에 실행해 같은 탭의 재방문·OAuth 복귀에서 스플래시가 깜빡이지 않게 합니다. */
export const MOBILE_SPLASH_BOOTSTRAP = `(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  let show = mobile && !reducedMotion.matches && location.pathname !== '/login/callback';
  try {
    if (sessionStorage.getItem('moahome.mobile-splash.seen') === '1') show = false;
    if (mobile) sessionStorage.setItem('moahome.mobile-splash.seen', '1');
  } catch {
    // 저장소 차단 시에도 현재 문서에서만 한 번 표시하고 화면 진입을 막지 않습니다.
  }
  if (!show) return;
  root.dataset.mobileSplash = 'active';
  let fallback;
  function finish() {
    root.dataset.mobileSplash = 'done';
    clearTimeout(fallback);
    document.removeEventListener('animationend', onAnimationEnd);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', finish);
    reducedMotion.removeEventListener('change', finish);
  }
  function onAnimationEnd(event) {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-mobile-splash-overlay')) finish();
  }
  function onVisibilityChange() {
    if (document.hidden) finish();
  }
  document.addEventListener('animationend', onAnimationEnd);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', finish);
  reducedMotion.addEventListener('change', finish);
  // CSS·초기 스크립트 일부가 실패해도 로딩 화면이 서비스 위에 남지 않게 제한합니다.
  fallback = setTimeout(finish, 3500);
})();`;
