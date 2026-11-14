import type {
  NavigationHistoryEntry,
  NavigationHistoryRecord,
  NavigationHistoryReturn
} from './navigationHistoryTypes';

const HISTORY_KEY = 'moahome.navigation.history';
const MAX_ENTRIES = 50;
const RETURN_QUERY_KEYS = ['month', 'account', 'buildingId', 'tab', 'propertyId', 'startMonth', 'endMonth', 'startDate', 'endDate', 'target'];
let activeHistory: NavigationHistoryRecord | null = null;
let returning: NavigationHistoryReturn | null = null;
let tracking = false;

/** 초대 fragment·인증 정보·검색어를 복사하지 않고 복귀 경로와 허용된 조회 참조값만 보관합니다. */
function getNavigationUrl(href = window.location.href) {
  const url = new URL(href);
  const query = new URLSearchParams();
  for (const key of RETURN_QUERY_KEYS) {
    const value = url.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  url.search = query.toString();
  url.hash = '';

  return url.href;
}

/** Next.js와 드로어의 상태를 유지하면서 앱이 직접 관찰한 방문 위치만 읽습니다. */
function getEntry(): NavigationHistoryEntry | null {
  const entry = window.history.state?.moahomeNavigation;
  if (!entry || typeof entry.id !== 'string' || !Number.isInteger(entry.position) || entry.position < 0) return null;

  return entry;
}

/** 주소만 보관하며 저장소를 사용할 수 없으면 현재 문서의 메모리 기록으로 제한합니다. */
function saveHistory() {
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(activeHistory));
  } catch {
    // 저장소 차단·용량 초과는 화면 이동을 막지 않습니다. 새 문서에서는 지정된 복귀 경로를 사용합니다.
  }
}

/** 새로고침 이후에도 같은 탭에서 관찰한 기록만 복원하고 불명확한 기록은 사용하지 않습니다. */
function restoreHistory(): NavigationHistoryRecord | null {
  try {
    const record = JSON.parse(window.sessionStorage.getItem(HISTORY_KEY) ?? 'null');
    if (!record || typeof record.id !== 'string' || !Number.isInteger(record.start) || record.start < 0
      || !Array.isArray(record.urls) || record.urls.length === 0 || record.urls.length > MAX_ENTRIES
      || !record.urls.every((url: unknown) => typeof url === 'string'
        && new URL(url).origin === window.location.origin && getNavigationUrl(url) === url)) return null;

    return record;
  } catch {
    return null;
  }
}

/** 현재 항목이 관찰한 주소와 일치해야 기록 간 거리를 신뢰할 수 있습니다. */
function getPosition() {
  const entry = getEntry();
  if (!activeHistory || entry?.id !== activeHistory.id) return null;
  if (activeHistory.urls[entry.position - activeHistory.start] !== getNavigationUrl()) return null;

  return entry.position;
}

/** push/replace를 관찰해 브라우저 이동·새로고침과 일치하는 앱 탐색 기록을 유지합니다. */
export function trackNavigationHistory() {
  // 앱 전체 수명의 관찰자이므로 Strict Mode의 공급자 재마운트에서도 한 번만 설치합니다.
  if (tracking) return;
  tracking = true;
  const history = window.history;
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  activeHistory = restoreHistory();

  /** 외부 문서·추적 전 항목에 진입하면 이전 탭 기록을 추측하지 않고 현재 항목부터 시작합니다. */
  function ensurePosition() {
    const position = getPosition();
    if (position !== null) return position;
    activeHistory = {
      id: crypto.randomUUID(),
      start: 0,
      urls: [getNavigationUrl()]
    };
    originalReplace.call(history, {
      ...history.state,
      moahomeNavigation: {
        id: activeHistory.id,
        position: 0
      }
    }, '');
    saveHistory();

    return 0;
  }

  let observedPosition = ensurePosition();
  let restoringPosition = false;

  /** 새 이동은 앞으로 가기 기록을 버리고, 같은 주소의 드로어 임시 항목도 실제 한 칸으로 셉니다. */
  const pushState: History['pushState'] = (data, unused, url) => {
    const position = ensurePosition() + 1;
    const record = activeHistory!;
    originalPush.call(history, {
      ...data,
      moahomeNavigation: {
        id: record.id,
        position
      }
    }, unused, url);
    record.urls = record.urls.slice(0, position - record.start);
    record.urls.push(getNavigationUrl());
    if (record.urls.length > MAX_ENTRIES) {
      record.urls.shift();
      record.start++;
    }
    observedPosition = position;
    saveHistory();
  };

  /** 대체 이동은 같은 위치의 주소만 갱신해 상세 저장·필터 변경을 새 방문으로 세지 않습니다. */
  const replaceState: History['replaceState'] = (data, unused, url) => {
    const position = ensurePosition();
    const record = activeHistory!;
    originalReplace.call(history, {
      ...data,
      moahomeNavigation: {
        id: record.id,
        position
      }
    }, unused, url);
    record.urls[position - record.start] = getNavigationUrl();
    observedPosition = position;
    saveHistory();
  };

  /** 복구 가능한 화면 이탈은 Next.js가 경로를 복원하기 전에 확인하고 취소하면 원래 이력 위치로 되돌립니다. */
  function confirmHistoryNavigation(event: PopStateEvent) {
    const target = getEntry();
    if (!target || target.id !== activeHistory?.id) return;
    if (restoringPosition) { restoringPosition = false; return; }
    if (target.position === observedPosition) return;
    // 공통 헤더 뒤로가기는 호출 시 이미 확인했으므로 같은 이동에서 다시 묻지 않습니다.
    if (!returning && !window.dispatchEvent(new Event('moahome:before-navigation', {
      cancelable: true
    }))) {
      event.stopImmediatePropagation();
      restoringPosition = true;
      history.go(observedPosition - target.position);
      return;
    }
    observedPosition = target.position;
  }

  /** 기존 항목으로 이동한 뒤 누락된 복귀 조건만 대체해 월·탭과 방문 위치를 함께 보존합니다. */
  function finishReturning() {
    const pending = returning;
    returning = null;
    if (!pending || pending.mode === 'previous') return;
    const restored = new URL(window.location.href);
    const destination = new URL(pending.href, restored);
    const requiredQuery = new URLSearchParams(destination.search);
    if (restored.origin !== destination.origin || restored.pathname !== destination.pathname) return;
    // 지정된 월·탭을 우선하고 실제 이전 URL의 검색·필터·fragment는 그대로 유지합니다.
    for (const [key, value] of restored.searchParams) {
      if (!requiredQuery.has(key)) destination.searchParams.append(key, value);
    }
    destination.hash ||= restored.hash;
    if (destination.href === restored.href) return;
    // 같은 이벤트의 Next.js 복원이 대체 이동을 덮어쓰지 않도록 다음 이벤트 루프에서 요청합니다.
    window.setTimeout(() => pending.onReplace(`${destination.pathname}${destination.search}${destination.hash}`), 0);
  }

  /** 브라우저가 직접 추가하는 fragment 이력은 거리를 추측하지 않고 새 관찰 구간으로 분리합니다. */
  function resetOnHashChange() {
    activeHistory = null;
    ensurePosition();
  }

  history.pushState = pushState;
  history.replaceState = replaceState;
  window.addEventListener('popstate', confirmHistoryNavigation, true);
  window.addEventListener('popstate', finishReturning);
  window.addEventListener('hashchange', resetOnHashChange);
}

/** 헤더도 기기 뒤로가기와 같이 실제 이전 화면으로 이동하고, 이력이 없는 직접 진입만 호출자의 대체 경로를 사용합니다. */
export function goBackToPreviousRoute() {
  if (!window.dispatchEvent(new Event('moahome:before-navigation', {
    cancelable: true
  }))) return true;
  if (returning) return true;
  const position = getPosition();
  if (!activeHistory || position === null) return false;
  const previous = activeHistory.urls[position - activeHistory.start - 1];
  if (!previous) return false;
  // 브라우저가 복원하는 원래 URL을 그대로 사용하며 조건을 추가하거나 재정렬하지 않습니다.
  returning = {
    mode: 'previous'
  };
  // 같은 경로라도 조회 조건이 다를 수 있으므로 중간 항목을 건너뛰지 않습니다.
  window.history.back();
  return true;
}

/** 업로드 완료·취소처럼 목적지가 정해진 업무 흐름에서만 사용합니다. 헤더 뒤로가기는 이전 화면을 사용합니다. */
export function goBackToRoute(href: string, onReplace: (href: string) => void) {
  if (returning) return true;
  const position = getPosition();
  if (!activeHistory || position === null) return false;
  const destination = new URL(href, window.location.href);
  if (destination.origin !== window.location.origin) return false;

  for (let index = position - activeHistory.start - 1; index >= 0; index--) {
    const previous = new URL(activeHistory.urls[index]);
    if (previous.origin !== destination.origin || previous.pathname !== destination.pathname) continue;
    // 이전 목록의 조회 조건을 보존하되 명시된 월·계좌 등이 다른 목록으로 복귀하지 않습니다.
    const matchesQuery = [...destination.searchParams].every(([key, value]) => {
      const previousValue = previous.searchParams.get(key);

      return previousValue === null || previousValue === value;
    });
    if (!matchesQuery) continue;
    returning = {
      mode: 'destination',
      href,
      onReplace
    };
    window.history.go(index + activeHistory.start - position);

    return true;
  }

  return false;
}
