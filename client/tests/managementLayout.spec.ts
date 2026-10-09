import {
  expect,
  test,
  type Page,
  type Route
} from '@playwright/test';

const API_ORIGIN = 'http://localhost:8080';
const USER_ID = '00000000-0000-0000-0000-000000000001';
const REQUEST_ID = 'c29cad4e-749c-432a-9c60-2eaa97936e8e';
const PROPERTY_ID = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const DASHBOARD = `/manage/${PROPERTY_ID}/dashboard`;
const REFERENCE_KEY = `moahome.management.recent-property.${USER_ID}`;
const RESULT_URL = `${API_ORIGIN}/api/property-registrations/${REQUEST_ID}`;
const LIST_URL = `${API_ORIGIN}/api/users/me/managed-properties`;
const CONTEXT_URL = `${API_ORIGIN}/api/properties/${PROPERTY_ID}/management-context`;
const PROPERTY = {
  propertyId: PROPERTY_ID,
  name: '성내빌라',
  role: 'ADMIN'
};
const RESULT = {
  requestId: REQUEST_ID,
  property: {
    id: PROPERTY_ID,
    name: '성내빌라',
    hasBuildings: false,
    status: 'ACTIVE'
  },
  membership: {
    id: '6114debb-fdf5-4e92-ac9d-ea665f7e13ed',
    role: 'ADMIN',
    status: 'ACTIVE'
  },
  summary: {
    buildingCount: 0,
    unitCount: 10,
    bankAccountCount: 1,
    feeItemCount: 1,
    monthlyDefaultAmount: 10000
  },
  createdAt: '2026-10-09T01:00:00Z'
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'X-CSRF-TOKEN, Authorization, Content-Type',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  });
}

/** 최근 선택은 편의 정보로만 주입하며 서버 목록·현재 권한을 거쳐야 표시합니다. */
async function seedRecentProperty(page: Page, propertyId = PROPERTY_ID) {
  await page.addInitScript(({ key, propertyId }) => {
    if (sessionStorage.getItem('management-test-seeded')) return;
    localStorage.setItem(key, propertyId);
    sessionStorage.setItem('management-test-seeded', 'true');
  }, {
    key: REFERENCE_KEY,
    propertyId
  });
}

test.beforeEach(async ({ page }) => {
  // 인증과 목록·현재 관리 권한 조회만 허용하며 업무 데이터 API는 호출하지 않습니다.
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/web/csrf') return fulfillJson(route, {
      csrfToken: 'test-csrf'
    });
    if (path === '/api/auth/web/refresh') return fulfillJson(route, {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
    });
    if (path === '/api/users/me') return fulfillJson(route, {
      id: USER_ID,
      displayName: '임준현',
      profileImageUrl: '/moahomeIcon.svg',
      systemRole: 'USER',
      status: 'ACTIVE'
    });
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    if (route.request().url() === LIST_URL) return fulfillJson(route, {
      properties: [PROPERTY]
    });
    if (route.request().url() === CONTEXT_URL) return fulfillJson(route, PROPERTY);
    if (route.request().url() === RESULT_URL) return fulfillJson(route, RESULT);
    if (/^\/api\/properties\/[^/]+\/management-context$/.test(path)) return fulfillJson(route, {
      code: 'ACCESS_DENIED'
    }, 403);
    throw new Error(`Unexpected API: ${route.request().method()} ${path}`);
  });
});

test('브라우저 등록 기록 없이 DB 목록으로 대시보드에 이동하고 독립 메뉴 그룹을 펼침', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 960
  });
  await page.goto('/start');
  await expect(page).toHaveURL(DASHBOARD);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', {
    name: '모아홈 대시보드',
    exact: true
  })).toHaveText('모아홈');
  const account = header.getByLabel('임준현님 계정 정보');
  await expect(account).toHaveText('임준현님');
  await expect(account.locator('img')).toHaveAttribute('src', '/moahomeIcon.svg');
  await account.click();
  await expect(header.getByRole('button', {
    name: '로그아웃',
    exact: true
  })).toBeVisible();
  await account.click();
  await expect(header).not.toContainText('관리자');
  await expect(page.getByText('모아홈관리', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByText('성내빌라', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('complementary').getByRole('button', {
    name: '로그아웃',
    exact: true
  })).toHaveCount(0);
  await expect(header.getByRole('combobox')).toHaveCount(0);
  const navigation = page.getByRole('navigation', {
    name: '관리 메뉴'
  });
  const dashboard = navigation.getByRole('link', {
    name: '대시보드',
    exact: true
  });
  await expect(dashboard).toHaveAttribute('href', DASHBOARD);
  await expect(dashboard).toHaveAttribute('aria-current', 'page');
  const households = navigation.getByRole('button', {
    name: '세대 관리',
    exact: true
  });
  await expect(households).toHaveAttribute('aria-expanded', 'false');
  await households.click();
  await expect(households).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.getByText('세대 목록', {
    exact: true
  })).toBeVisible();
  await expect(navigation.getByRole('link', {
    name: '세대 목록'
  })).toHaveCount(0);
  await navigation.getByRole('button', {
    name: '관리비 부과',
    exact: true
  }).click();
  await expect(households).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.getByText('월별 부과 내역', {
    exact: true
  })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('managementDesktop.png'),
    fullPage: true,
    animations: 'disabled'
  });
  expect(await page.evaluate((key) => localStorage.getItem(key), REFERENCE_KEY)).toBe(PROPERTY_ID);
});

test('서버 목록이 실제로 비었을 때만 시작 화면을 표시하고 임의 주소는 권한 조회로 거부', async ({ page }) => {
  await page.route(LIST_URL, (route) => fulfillJson(route, {
    properties: []
  }));
  await page.goto('/start');
  await expect(page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  })).toBeVisible();
  await page.goto('/manage/00000000-0000-0000-0000-000000000099/dashboard');
  await expect(page.getByText('이곳에 접근할 수 없어요.')).toBeVisible();
  await expect(page.getByText('임시 페이지', {
    exact: true
  })).toHaveCount(0);
});

test('오래된 등록 기록에 의존하지 않고 DB 목록의 관리대상으로 이동', async ({ page }) => {
  await page.addInitScript(({ userId, requestId }) => {
    if (sessionStorage.getItem('management-test-seeded')) return;
    sessionStorage.setItem('moahome.property-registration.receipt', JSON.stringify({
      userId,
      result: {
        requestId,
        property: {
          name: '저장소의 오래된 이름'
        }
      }
    }));
    sessionStorage.setItem('management-test-seeded', 'true');
  }, {
    userId: USER_ID,
    requestId: REQUEST_ID
  });
  await page.goto('/start');
  await expect(page).toHaveURL(DASHBOARD);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  await expect(page.getByText('성내빌라', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByText('저장소의 오래된 이름')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), REFERENCE_KEY)).toBe(PROPERTY_ID);
});

test('관리대상 기록이 있어도 명시적으로 연 새 등록 설정은 자동 이동하지 않음', async ({ page }) => {
  let lookups = 0;
  await page.route(LIST_URL, (route) => { lookups++; return fulfillJson(route, {
    properties: [PROPERTY]
  }); });
  await page.goto('/start?registration=basic');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/registration=basic$/);
  expect(lookups).toBe(0);
});

test('완료 화면 버튼은 해당 대상에 연결되고 새로고침에도 현재 관리 권한을 다시 확인', async ({ page }) => {
  await page.goto(`/start?registration=complete&requestId=${REQUEST_ID}`);
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '관리자 대시보드로 이동',
    exact: true
  }).click();
  await expect(page).toHaveURL(DASHBOARD);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  await page.reload();
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  expect(await page.evaluate((key) => localStorage.getItem(key), REFERENCE_KEY)).toBe(PROPERTY_ID);
});

test('다른 관리대상 주소에는 등록 결과의 이름과 사이드바를 표시하지 않음', async ({ page }) => {
  await page.goto('/manage/00000000-0000-0000-0000-000000000099/dashboard');
  await expect(page.getByText('이곳에 접근할 수 없어요.')).toBeVisible();
  await expect(page.getByText('성내빌라', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('navigation', {
    name: '관리 메뉴'
  })).toHaveCount(0);
});

test('현재 관리 권한 거부는 이전 이름을 숨기고 최근 선택을 폐기', async ({ page }) => {
  await seedRecentProperty(page);
  await page.route(CONTEXT_URL, (route) => fulfillJson(route, {
    code: 'ACCESS_DENIED'
  }, 403));
  await page.goto(DASHBOARD);
  await expect(page.getByText('이곳에 접근할 수 없어요.')).toBeVisible();
  await expect(page.getByText('성내빌라', {
    exact: true
  })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), REFERENCE_KEY)).toBeNull();
  await page.route(LIST_URL, (route) => fulfillJson(route, {
    properties: []
  }));
  await page.getByRole('link', {
    name: '시작 화면으로',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  })).toBeVisible();
});

test('조회 장애에는 시작 화면으로 보내지 않고 재시도하며 확인 전 이름을 숨김', async ({ page }) => {
  let failed = true;
  await page.route(LIST_URL, (route) => fulfillJson(route, failed ? {
    code: 'INTERNAL_SERVER_ERROR'
  } : {
    properties: [PROPERTY]
  }, failed ? 500 : 200));
  await page.goto('/start');
  await expect(page.getByRole('heading', {
    name: '관리할 곳을 확인하지 못했어요',
    exact: true
  })).toBeVisible();
  await expect(page.getByText('성내빌라', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  })).toHaveCount(0);
  failed = false;
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page).toHaveURL(DASHBOARD);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
});

test('다른 계정은 이전 사용자의 최근 선택과 이름을 표시하지 않음', async ({ page }) => {
  await seedRecentProperty(page);
  await page.route(LIST_URL, (route) => fulfillJson(route, {
    properties: []
  }));
  let lookups = 0;
  await page.route(RESULT_URL, (route) => { lookups++; return fulfillJson(route, RESULT); });
  await page.route(`${API_ORIGIN}/api/users/me`, (route) => fulfillJson(route, {
    id: '00000000-0000-0000-0000-000000000002',
    displayName: '다른 사용자',
    profileImageUrl: null,
    systemRole: 'USER',
    status: 'ACTIVE'
  }));
  await page.goto('/start');
  await expect(page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  })).toBeVisible();
  expect(lookups).toBe(0);
});

for (const width of [320, 390, 767]) {
  test(`모바일 ${width}px 메뉴의 닫기·Escape·배경 클릭과 포커스·스크롤 복원`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 844
    });
    await page.goto(DASHBOARD);
    await expect(page.getByRole('main')).toHaveText('임시 페이지');
    const opener = page.getByRole('button', {
      name: '임준현님 메뉴 열기',
      exact: true
    });
    const drawer = page.getByRole('dialog', {
      name: '메뉴',
      exact: true
    });
    await opener.click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '관리 메뉴 열기',
      exact: true
    })).toHaveCount(0);
    await drawer.getByRole('button', {
      name: '세대 관리',
      exact: true
    }).click();
    await expect(drawer.getByText('세대 목록', {
      exact: true
    })).toBeVisible();
    await expect.poll(() => drawer.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`managementMobile${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    await opener.click();
    await page.mouse.click(3, 250);
    await expect(drawer).not.toBeVisible();
    await opener.click();
    await drawer.getByRole('button', {
      name: '메뉴 닫기',
      exact: true
    }).click();
    await expect(drawer).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await opener.click();
    await page.setViewportSize({
      width: 1440,
      height: 960
    });
    await expect(drawer).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  });
}

test('프로필은 오른쪽 관리 드로어 하나를 열고 뒤로가기는 메뉴만 닫음', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto(DASHBOARD);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  const startingLeft = await page.getByRole('button', {
    name: '임준현님 메뉴 열기',
    exact: true
  }).evaluate((button: HTMLButtonElement) => {
    button.click();
    return document.querySelector<HTMLDivElement>('dialog [data-management="true"]')!.getBoundingClientRect().left;
  });
  expect(startingLeft).toBeGreaterThanOrEqual(390);
  const drawer = page.getByRole('dialog', {
    name: '메뉴',
    exact: true
  });
  await expect.poll(() => drawer.locator('[data-management="true"]').evaluate((panel) => panel.getBoundingClientRect().left)).toBe(48);
  await page.goBack();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(DASHBOARD);
  await page.getByRole('button', {
    name: '임준현님 메뉴 열기',
    exact: true
  }).click();
  const accountMenu = page.getByRole('dialog', {
    name: '메뉴',
    exact: true
  });
  await expect(accountMenu.getByText('임준현님', {
    exact: true
  })).toBeVisible();
  await expect(accountMenu.getByRole('link', {
    name: '대시보드',
    exact: true
  })).toHaveAttribute('href', DASHBOARD);
  await accountMenu.getByRole('button', {
    name: '메뉴 닫기',
    exact: true
  }).click();
  await expect(accountMenu).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('모션 감소 설정에서도 관리 메뉴를 열고 닫을 수 있음', async ({ page }) => {
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto(DASHBOARD);
  await page.getByRole('button', {
    name: '임준현님 메뉴 열기',
    exact: true
  }).click();
  const drawer = page.getByRole('dialog', {
    name: '메뉴',
    exact: true
  });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('브라우저 문서 캐시 복원은 이전 내용을 숨기고 현재 관리 권한을 재확인', async ({ page }) => {
  let lookups = 0;
  await page.route(CONTEXT_URL, (route) => { lookups++; return fulfillJson(route, PROPERTY); });
  await page.goto(DASHBOARD);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.getByRole('main')).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {
    persisted: true
  })));
  await expect.poll(() => lookups).toBe(2);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
});

test('여러 관리대상은 현재 목록에 있는 최근 선택을 우선하며 기록이 없어도 진입', async ({ page }) => {
  const secondId = '00000000-0000-0000-0000-000000000099';
  const second = {
    propertyId: secondId,
    name: '부담당자 대상',
    role: 'MANAGER'
  };
  await seedRecentProperty(page, secondId);
  await page.route(LIST_URL, (route) => fulfillJson(route, {
    properties: [PROPERTY, second]
  }));
  await page.route(`${API_ORIGIN}/api/properties/${secondId}/management-context`, (route) => fulfillJson(route, second));
  await page.goto('/start');
  await expect(page).toHaveURL(`/manage/${secondId}/dashboard`);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
});

test('권한이 없는 최근 선택은 폐기하고 서버 목록의 첫 관리대상으로 이동', async ({ page }) => {
  await seedRecentProperty(page, '00000000-0000-0000-0000-000000000099');
  await page.goto('/start');
  await expect(page).toHaveURL(DASHBOARD);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  expect(await page.evaluate((key) => localStorage.getItem(key), REFERENCE_KEY)).toBe(PROPERTY_ID);
});

test('잘못된 목록 응답을 대상 없음으로 처리하지 않고 재시도를 표시', async ({ page }) => {
  await page.route(LIST_URL, (route) => fulfillJson(route, {
    properties: [{
      ...PROPERTY,
      role: 'RESIDENT'
    }]
  }));
  await page.goto('/start');
  await expect(page.getByRole('heading', {
    name: '관리할 곳을 확인하지 못했어요',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '다시 시도',
    exact: true
  })).toBeVisible();
});

test('권한 조회 응답의 대상이 다르면 이전 대상 이름과 본문을 표시하지 않음', async ({ page }) => {
  await page.route(CONTEXT_URL, (route) => fulfillJson(route, {
    ...PROPERTY,
    propertyId: '00000000-0000-0000-0000-000000000099'
  }));
  await page.goto(DASHBOARD);
  await expect(page.getByText('관리할 곳을 확인하지 못했어요.')).toBeVisible();
  await expect(page.getByText('성내빌라', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByText('임시 페이지', {
    exact: true
  })).toHaveCount(0);
});
