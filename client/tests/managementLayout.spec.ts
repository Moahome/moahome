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
  // 기존 세대 시나리오는 주민 요약을 조회하지 않는 권한의 명시적 null 응답을 사용합니다.
  if (body && typeof body === 'object' && 'units' in body && 'hasBuildings' in body && !('residentSummaries' in body)) {
    body = {
      ...body,
      residentSummaries: null
    };
  }
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'X-CSRF-TOKEN, Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
  })).toHaveAttribute('href', `/manage/${PROPERTY_ID}/households`);
  await expect(navigation.getByRole('link', {
    name: '관리비 부과',
    exact: true
  })).toHaveAttribute('href', `/manage/${PROPERTY_ID}/billing/monthly`);
  await navigation.getByRole('button', {
    name: '입금 관리',
    exact: true
  }).click();
  await expect(households).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.getByText('입금 확인·매칭', {
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


const HOUSEHOLDS = `/manage/${PROPERTY_ID}/households`;
const UNITS_URL = `${API_ORIGIN}/api/properties/${PROPERTY_ID}/units`;
const BUILDING_ID = '11111111-1111-4111-8111-111111111111';

for (const width of [1440]) {
  test(`세대 상세 ${width}px는 행·키보드로 열고 닫기·수정·상세 삭제의 진입점을 구분`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    await page.route(UNITS_URL, (route) => fulfillJson(route, {
      propertyId: PROPERTY_ID,
      hasBuildings: true,
      buildings: [{
        id: BUILDING_ID,
        name: '101동'
      }],
      units: [{
        id: '22222222-2222-4222-8222-222222222222',
        buildingId: BUILDING_ID,
        unitNumber: '201',
        displayName: '정문 세대',
        floor: -1,
        status: 'ACTIVE'
      }]
    }));
    await page.goto(HOUSEHOLDS);
    const main = page.getByRole('main');
    await expect(main.getByRole('columnheader', {
      name: '관리',
      exact: true
    })).toHaveCount(0);
    await expect(main.getByRole('button', {
      name: /201호 수정/
    })).toHaveCount(0);
    const trigger = main.getByRole('button', {
      name: '101동 201호 상세 보기',
      exact: true
    });
    await expect(main.getByRole('row').last()).toHaveCSS('cursor', 'pointer');
    // 호수 외의 셀을 클릭해도 같은 세대 상세를 열며 수정은 별도 모달로 연결합니다.
    await main.getByRole('row').last().getByRole('cell', {
      name: '101동',
      exact: true
    }).click();
    const detail = page.getByRole('dialog', {
      name: '101동 201호',
      exact: true
    });
    await expect(detail).toBeVisible();
    await expect(detail.getByText('정문 세대', {
      exact: true
    })).toBeVisible();
    await expect(detail.getByText('B1층', {
      exact: true
    })).toBeVisible();
    await expect(detail.getByRole('button', {
      name: '삭제',
      exact: true
    })).toHaveCSS('color', 'rgb(239, 68, 68)');
    await expect(detail.getByRole('button', {
      name: '수정',
      exact: true
    })).toHaveCSS('color', 'rgb(22, 163, 74)');
    await expect(detail.getByRole('button', {
      name: '수정',
      exact: true
    }).locator('svg')).toHaveCount(0);
    await expect(detail.getByRole('button', {
      name: '세대 상세 닫기',
      exact: true
    })).toBeFocused();
    expect(await detail.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth;
    })).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('unitDetail.png'),
      fullPage: true
    });
    await detail.getByRole('button', {
      name: '닫기',
      exact: true
    }).click();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.press('Space');
    await detail.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    const editor = page.getByRole('dialog', {
      name: '세대 수정',
      exact: true
    });
    await expect(editor.getByRole('textbox', {
      name: '호수',
      exact: true
    })).toHaveValue('201');
    await expect(editor.getByRole('button', {
      name: '수정',
      exact: true
    })).toHaveCSS('color', 'rgb(22, 163, 74)');
    await expect(editor.getByRole('button', {
      name: '수정',
      exact: true
    }).locator('svg')).toHaveCount(0);
    await expect(detail).not.toBeVisible();
    await editor.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(trigger).toBeFocused();
    await expect(main.getByRole('button', {
      name: '편집',
      exact: true
    })).toHaveCount(0);
    await expect(main.getByRole('checkbox')).toHaveCount(0);
    await expect(trigger).toBeVisible();
  });
}

test('세대 페이지는 저장 목록을 조회하고 검색·상태 필터·페이지 이동을 제공', async ({ page }) => {
  const units = Array.from({
    length: 12
  }, (_, index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
    buildingId: BUILDING_ID,
    unitNumber: String(201 + index),
    displayName: index === 1 ? '정문 세대' : null,
    floor: 2,
    status: index === 1 ? 'VACANT' : 'ACTIVE'
  }));
  await page.route(UNITS_URL, (route) => fulfillJson(route, {
    propertyId: PROPERTY_ID,
    hasBuildings: true,
    buildings: [{
      id: BUILDING_ID,
      name: '102동'
    }],
    units
  }));
  await page.goto(HOUSEHOLDS);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', {
    name: '세대 목록',
    exact: true
  })).toBeVisible();
  await expect(main.getByRole('row')).toHaveCount(11);
  await expect(main.getByRole('article', {
    name: '전체 세대 12세대'
  })).toBeVisible();
  await expect(main.getByRole('article', {
    name: '사용중 11세대'
  })).toBeVisible();
  await expect(main.getByRole('article', {
    name: '공실 1세대'
  })).toBeVisible();
  await expect(main.getByRole('columnheader', {
    name: '등록 주민',
    exact: true
  })).toHaveCount(0);
  await expect(main.getByRole('columnheader', {
    name: '대표 주민',
    exact: true
  })).toBeVisible();
  await expect(main.getByRole('columnheader', {
    name: '표시 이름',
    exact: true
  })).toHaveCount(0);
  await expect(main.getByRole('columnheader')).toHaveText(['동', '호수', '상태', '대표 주민', '가입 현황']);
  const sizeBox = await main.getByRole('combobox', {
    name: '페이지당 세대 수',
    exact: true
  }).boundingBox();
  const tableBox = await main.getByRole('table', {
    name: '세대 목록',
    exact: true
  }).boundingBox();
  expect(sizeBox!.y + sizeBox!.height).toBeLessThanOrEqual(tableBox!.y);
  await expect(main.getByRole('button', {
    name: '편집',
    exact: true
  })).toHaveCount(0);
  await main.getByRole('combobox', {
    name: '페이지당 세대 수',
    exact: true
  }).click();
  const selectedSize = page.getByRole('option', {
    name: '10개씩 보기',
    exact: true
  });
  const labelFits = await selectedSize.locator('span').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const bounds = range.getBoundingClientRect();
    return bounds.width <= element.clientWidth && range.getClientRects().length === 1;
  });
  expect(labelFits).toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: test.info().outputPath('householdsDesktop.png'),
    fullPage: true
  });
  await main.getByRole('button', {
    name: '다음 페이지',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(3);
  await main.getByLabel('세대 검색', {
    exact: true
  }).fill('정문');
  await expect(main.getByRole('row')).toHaveCount(2);
  await expect(main.getByRole('row').last()).toContainText('202호');
  await main.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await main.getByRole('combobox', {
    name: '상태 필터',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '공실',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(2);
  await expect(main.getByRole('button', {
    name: /선택 해제/
  })).toHaveCount(0);
  await main.getByLabel('세대 검색', {
    exact: true
  }).fill('없는 호수');
  await expect(main.getByText('검색 결과가 없어요.', {
    exact: true
  })).toBeVisible();
});

test('기존 세대 모달로 추가·수정하고 저장 실패에는 입력을 유지하며 새로고침에도 DB 조회 결과를 표시', async ({ page }) => {
  await page.clock.install();
  let units: {
    id: string;
    buildingId: null;
    unitNumber: string;
    displayName: string | null;
    floor: number | null;
    status: string;
  }[] = [];
  let failSave = true;
  let writes = 0;
  const savedId = '33333333-3333-4333-8333-333333333333';
  await page.route(`${UNITS_URL}**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    if (route.request().method() === 'GET') return fulfillJson(route, {
      propertyId: PROPERTY_ID,
      hasBuildings: false,
      buildings: [],
      units
    });
    writes += 1;
    if (failSave) return fulfillJson(route, {
      code: 'UNIT_SERVICE_UNAVAILABLE'
    }, 503);
    const body = route.request().postDataJSON();
    const saved = {
      ...body,
      id: savedId
    };
    if (route.request().method() === 'PUT') {
      expect(route.request().url()).toBe(`${UNITS_URL}/${savedId}`);
      units = [saved];
    } else {
      expect(route.request().method()).toBe('POST');
      expect(body.clientId).toBeUndefined();
      units.push(saved);
    }
    return fulfillJson(route, saved, route.request().method() === 'POST' ? 201 : 200);
  });
  await page.goto(HOUSEHOLDS);
  const main = page.getByRole('main');
  await expect(main.getByRole('columnheader', {
    name: '동',
    exact: true
  })).toHaveCount(0);
  await main.getByRole('button', {
    name: '세대 추가',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '세대 추가',
    exact: true
  });
  await dialog.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(dialog.getByText('호수를 입력해주세요.', {
    exact: true
  })).toBeVisible();
  expect(writes).toBe(0);
  await dialog.getByRole('textbox', {
    name: '호수',
    exact: true
  }).fill('001');
  await dialog.getByLabel('층', {
    exact: true
  }).fill('-1');
  await dialog.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(dialog.getByRole('alert')).toContainText('다시 시도');
  await expect(dialog.getByRole('textbox', {
    name: '호수',
    exact: true
  })).toHaveValue('001');
  failSave = false;
  await dialog.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(dialog).not.toBeVisible();
  await expect(main.getByRole('row').last()).toContainText('001호');
  expect(units[0].floor).toBe(-1);
  await main.getByRole('button', {
    name: '001호 상세 보기',
    exact: true
  }).click();
  const detail = page.getByRole('dialog', {
    name: '001호',
    exact: true
  });
  await expect(detail.getByText('B1층', {
    exact: true
  })).toBeVisible();
  await expect(detail.getByRole('button', {
    name: '삭제',
    exact: true
  })).toBeVisible();
  await detail.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(detail).not.toBeVisible();
  const editor = page.getByRole('dialog', {
    name: '세대 수정',
    exact: true
  });
  await expect(editor.getByRole('button', {
    name: '세대 삭제',
    exact: true
  })).toHaveCount(0);
  await editor.getByLabel('세대 별칭', {
    exact: true
  }).fill('지하 세대');
  await editor.getByRole('combobox', {
    name: '상태',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '공실',
    exact: true
  }).click();
  await editor.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(editor).not.toBeVisible();
  const toast = page.getByRole('status').filter({
    hasText: '세대 정보를 수정했어요.'
  });
  await expect(toast).toBeVisible();
  await expect(main.getByText('세대 정보를 수정했어요.', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '알림 닫기',
    exact: true
  })).toHaveCount(0);
  // CSS 애니메이션은 모의 타이머와 별개로 진행하므로 하단 배치 완료를 기다립니다.
  await expect.poll(async () => {
    const box = await toast.locator('..').boundingBox();

    return Math.abs(page.viewportSize()!.height - box!.y - box!.height - 32);
  }).toBeLessThan(2);
  const toastBox = await toast.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(toastBox!.x + toastBox!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  // 마우스가 알림 위에 있어도 표시 시간이 지나면 자동으로 사라져야 합니다.
  await page.mouse.move(toastBox!.x + toastBox!.width / 2, toastBox!.y + toastBox!.height / 2);
  await page.clock.runFor(4300);
  await expect(toast).toHaveCount(0);
  await page.reload();
  await expect(main.getByRole('row').last()).toContainText('지하 세대');
  await expect(main.getByRole('row').last()).toContainText('공실');
  expect(units).toHaveLength(1);
  expect(units[0].id).toBe(savedId);
});

test('세대 조회 장애는 빈 목록과 구분하고 모바일에서 표·등록 페이지가 화면 밖으로 페이지를 밀지 않음', async ({ page }) => {
  let failed = true;
  await page.route(UNITS_URL, (route) => fulfillJson(route, failed ? {
    code: 'UNIT_SERVICE_UNAVAILABLE'
  } : {
    propertyId: PROPERTY_ID,
    hasBuildings: false,
    buildings: [],
    units: []
  }, failed ? 503 : 200));
  await page.setViewportSize({
    width: 320,
    height: 740
  });
  await page.goto(HOUSEHOLDS);
  const main = page.getByRole('main');
  await expect(main.getByRole('alert')).toContainText('세대 목록을 불러오지 못했어요.');
  failed = false;
  await main.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(main.getByText('아직 등록된 세대가 없어요.', {
    exact: true
  })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const add = main.getByRole('button', {
    name: '세대 추가',
    exact: true
  });
  await add.click();
  await expect(page).toHaveURL(`${HOUSEHOLDS}/new`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await main.getByRole('textbox', {
    name: '호수',
    exact: true
  }).fill('취소할 입력');
  await page.screenshot({
    path: test.info().outputPath('householdEditorMobile.png'),
    fullPage: true,
    animations: 'disabled'
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('banner').getByRole('link', {
    name: '세대 목록으로 돌아가기'
  }).click();
  await expect(page).toHaveURL(HOUSEHOLDS);
  await expect(main.getByText('아직 등록된 세대가 없어요.', {
    exact: true
  })).toBeVisible();
  await add.click();
  await expect(main.getByRole('textbox', {
    name: '호수',
    exact: true
  })).toHaveValue('');
});


test('기존 동 관리·자동 입력 모달로 DB 추가·이름 수정·중복 제외 일괄 저장을 연결', async ({ page }) => {
  const newBuildingId = '44444444-4444-4444-8444-444444444444';
  const buildings = [{
    id: BUILDING_ID,
    name: '101동'
  }];
  const units: { id: string; buildingId: string; unitNumber: string; displayName: string | null; floor: number | null; status: string }[] = [];
  let failBuilding = true;
  let failBatch = true;
  let batchWrites = 0;
  await page.route(UNITS_URL, (route) => fulfillJson(route, {
    propertyId: PROPERTY_ID,
    hasBuildings: true,
    buildings,
    units
  }));
  await page.route(`${API_ORIGIN}/api/properties/${PROPERTY_ID}/buildings**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    if (failBuilding) return fulfillJson(route, {
      code: 'UNIT_SERVICE_UNAVAILABLE'
    }, 503);
    const { name } = route.request().postDataJSON();
    if (route.request().method() === 'POST') {
      const building = {
        id: newBuildingId,
        name
      };
      buildings.push(building);
      return fulfillJson(route, building, 201);
    }
    expect(route.request().url()).toBe(`${API_ORIGIN}/api/properties/${PROPERTY_ID}/buildings/${newBuildingId}`);
    buildings[1].name = name;
    return fulfillJson(route, buildings[1]);
  });
  await page.route(`${UNITS_URL}/batch`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    batchWrites += 1;
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    if (failBatch) return fulfillJson(route, {
      code: 'UNIT_SERVICE_UNAVAILABLE'
    }, 503);
    const body = route.request().postDataJSON();
    expect(body.units).toHaveLength(4);
    expect(body.units.every((unit: { buildingId: string; clientId?: string }) => unit.buildingId === newBuildingId && unit.clientId === undefined)).toBe(true);
    const saved = body.units.map((unit: object, index: number) => ({
      ...unit,
      id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`
    }));
    units.push(...saved);
    return fulfillJson(route, saved, 201);
  });
  await page.goto(HOUSEHOLDS);
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '동 관리',
    exact: true
  }).click();
  const manager = page.getByRole('dialog', {
    name: '동 관리',
    exact: true
  });
  await expect(manager.getByRole('button', {
    name: '101동 삭제',
    exact: true
  })).toHaveCount(0);
  await manager.getByRole('button', {
    name: '동 추가',
    exact: true
  }).click();
  await manager.getByRole('textbox', {
    name: '새 동 이름',
    exact: true
  }).fill('102');
  await manager.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(manager.getByRole('textbox', {
    name: '새 동 이름',
    exact: true
  })).toHaveValue('102');
  await expect(manager.getByText('정보를 처리하지 못했어요. 다시 시도해주세요.', {
    exact: true
  })).toBeVisible();
  failBuilding = false;
  await manager.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(manager.getByRole('button', {
    name: '101동 삭제',
    exact: true
  })).toBeVisible();
  await expect(manager.getByRole('button', {
    name: '102동 삭제',
    exact: true
  })).toBeVisible();
  await manager.getByRole('button', {
    name: '102동 수정',
    exact: true
  }).click();
  await manager.getByRole('textbox', {
    name: '동 이름',
    exact: true
  }).fill('A');
  await manager.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(manager.getByText('A동', {
    exact: true
  })).toBeVisible();
  await expect(manager.getByRole('status').filter({
    hasText: '동 정보를 저장했어요.'
  })).toBeVisible();
  await manager.getByRole('button', {
    name: '완료',
    exact: true
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: '동 정보를 저장했어요.'
  })).toBeVisible();
  await main.getByRole('combobox', {
    name: '동 필터',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: 'A동',
    exact: true
  }).click();
  await expect(main.getByRole('button', {
    name: /선택 해제/
  })).toHaveCount(0);
  await main.getByRole('button', {
    name: '세대 자동 입력',
    exact: true
  }).click();
  const automatic = page.getByRole('dialog', {
    name: '세대 자동 입력',
    exact: true
  });
  await automatic.getByLabel('시작 층').fill('2');
  await automatic.getByLabel('마지막 층').fill('3');
  await automatic.getByLabel('층당 세대 수').fill('2');
  await expect(automatic.getByRole('status').filter({
    hasText: /중복 제외/
  })).toHaveText('총 4세대 · 추가 4세대 · 중복 제외 0세대');
  await automatic.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(automatic.getByRole('alert')).toBeVisible();
  expect(units).toHaveLength(0);
  await expect(automatic.getByLabel('시작 층')).toHaveValue('2');
  failBatch = false;
  await automatic.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(automatic).not.toBeVisible();
  await expect(main.getByRole('row')).toHaveCount(5);
  expect(batchWrites).toBe(2);
  await main.getByRole('button', {
    name: '세대 자동 입력',
    exact: true
  }).click();
  await expect(automatic.getByRole('status').filter({
    hasText: /중복 제외/
  })).toHaveText('총 4세대 · 추가 0세대 · 중복 제외 4세대');
  await expect(automatic.getByRole('button', {
    name: '추가',
    exact: true
  })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.setViewportSize({
    width: 375,
    height: 812
  });
  await expect(main.getByRole('article', {
    name: '전체 세대 4세대'
  })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('householdsCardsMobile.png'),
    fullPage: true
  });
});

test('세대 삭제는 상세에서 한 세대를 확인하며 실패 시 재시도 후 목록과 집계를 갱신', async ({ page }) => {
  const units = [201, 202].map((number) => ({
    id: `22222222-2222-4222-8222-${String(number).padStart(12, '0')}`,
    buildingId: BUILDING_ID,
    unitNumber: String(number),
    displayName: null,
    floor: 2,
    status: 'ACTIVE'
  }));
  let writes = 0;
  let fail = true;
  await page.route(`${UNITS_URL}**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    if (route.request().method() === 'GET') return fulfillJson(route, {
      propertyId: PROPERTY_ID,
      hasBuildings: true,
      buildings: [{
        id: BUILDING_ID,
        name: '101동'
      }],
      units
    });
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    expect(route.request().url()).toBe(`${UNITS_URL}/${units[0].id}`);
    writes += 1;
    if (fail) return fulfillJson(route, {
      code: 'UNIT_SERVICE_UNAVAILABLE'
    }, 503);
    units.shift();
    return route.fulfill({
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  });
  await page.goto(HOUSEHOLDS);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', {
    name: '101동 201호 삭제',
    exact: true
  })).toHaveCount(0);
  await expect(main.getByRole('button', {
    name: '101동 201호 수정',
    exact: true
  })).toHaveCount(0);
  await main.getByRole('button', {
    name: '101동 201호 상세 보기',
    exact: true
  }).click();
  const detail = page.getByRole('dialog', {
    name: '101동 201호',
    exact: true
  });
  const remove = detail.getByRole('button', {
    name: '삭제',
    exact: true
  });
  await expect(remove).toHaveCSS('color', 'rgb(239, 68, 68)');
  await remove.click();
  const confirmation = page.getByRole('alertdialog', {
    name: '세대 삭제 확인',
    exact: true
  });
  await expect(confirmation.getByText('201호', {
    exact: false
  })).toBeVisible();
  await confirmation.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  expect(writes).toBe(0);
  await expect(remove).toBeFocused();
  await remove.click();
  await confirmation.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(confirmation.getByRole('alert')).toHaveText('정보를 처리하지 못했어요. 다시 시도해주세요.');
  await expect(main.getByRole('row')).toHaveCount(3);
  fail = false;
  await confirmation.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(main.getByRole('row')).toHaveCount(2);
  await expect(main.getByRole('article', {
    name: '전체 세대 1세대'
  })).toBeVisible();
  await expect(main.getByRole('heading', {
    name: '세대 목록',
    exact: true
  })).toBeFocused();
  expect(writes).toBe(2);
  await page.reload();
  await expect(main.getByRole('row')).toHaveCount(2);
});

test('상세 삭제는 요청 대기 중 중복 제출과 닫기를 막고 다른 세대는 유지', async ({ page }) => {
  const units = [201, 202, 203].map((number) => ({
    id: `22222222-2222-4222-8222-${String(number).padStart(12, '0')}`,
    buildingId: null,
    unitNumber: String(number),
    displayName: null,
    floor: 2,
    status: 'ACTIVE'
  }));
  let release: (() => void) | undefined;
  let writes = 0;
  await page.route(`${UNITS_URL}**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    if (route.request().method() === 'GET') return fulfillJson(route, {
      propertyId: PROPERTY_ID,
      hasBuildings: false,
      buildings: [],
      units
    });
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().url()).toBe(`${UNITS_URL}/${units[0].id}`);
    writes += 1;
    await new Promise<void>((resolve) => { release = resolve; });
    units.shift();
    return route.fulfill({
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  });
  await page.goto(HOUSEHOLDS);
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '201호 상세 보기',
    exact: true
  }).click();
  const detail = page.getByRole('dialog', {
    name: '201호',
    exact: true
  });
  const remove = detail.getByRole('button', {
    name: '삭제',
    exact: true
  });
  await expect(remove).toHaveCSS('color', 'rgb(239, 68, 68)');
  await remove.click();
  const confirmation = page.getByRole('alertdialog', {
    name: '세대 삭제 확인',
    exact: true
  });
  await expect(confirmation.getByRole('listitem')).toHaveCount(1);
  await confirmation.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(confirmation.getByRole('button', {
    name: '취소',
    exact: true
  })).toBeDisabled();
  await expect(confirmation.getByRole('button', {
    name: '삭제',
    exact: true
  })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeVisible();
  release!();
  await expect(confirmation).not.toBeVisible();
  await expect(detail).not.toBeVisible();
  await expect(main.getByRole('row')).toHaveCount(3);
  await expect(main.getByRole('button', {
    name: '201호 상세 보기',
    exact: true
  })).toHaveCount(0);
  await expect(main.getByRole('article', {
    name: '전체 세대 2세대'
  })).toBeVisible();
  await expect(main.getByRole('heading', {
    name: '세대 목록',
    exact: true
  })).toBeFocused();
  expect(writes).toBe(1);
});

test('동 삭제는 연결 세대를 확인하고 다른 동은 유지하며 삭제한 동 필터를 초기화', async ({ page }) => {
  const otherId = '44444444-4444-4444-8444-444444444444';
  const buildings = [{
    id: BUILDING_ID,
    name: '101동'
  }, {
    id: otherId,
    name: '102동'
  }];
  const units = buildings.map((building, index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
    buildingId: building.id,
    unitNumber: '201',
    displayName: null,
    floor: 2,
    status: 'ACTIVE'
  }));
  let writes = 0;
  await page.route(UNITS_URL, (route) => fulfillJson(route, {
    propertyId: PROPERTY_ID,
    hasBuildings: true,
    buildings,
    units
  }));
  await page.route(`${API_ORIGIN}/api/properties/${PROPERTY_ID}/buildings/${BUILDING_ID}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    writes += 1;
    buildings.shift();
    units.shift();
    return route.fulfill({
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  });
  await page.goto(HOUSEHOLDS);
  const main = page.getByRole('main');
  await main.getByRole('combobox', {
    name: '동 필터',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '101동',
    exact: true
  }).click();
  await main.getByRole('button', {
    name: '동 관리',
    exact: true
  }).click();
  const manager = page.getByRole('dialog', {
    name: '동 관리',
    exact: true
  });
  await manager.getByRole('button', {
    name: '101동 삭제',
    exact: true
  }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: '동 삭제 확인',
    exact: true
  });
  await expect(confirmation.getByText('연결된 세대와 주민을 삭제하고 주민 이용 권한을 종료합니다. 당월 청구는 취소하며 과거 부과 이력은 유지합니다.', {
    exact: true
  })).toBeVisible();
  await confirmation.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(manager.getByRole('button', {
    name: '101동 삭제',
    exact: true
  })).toHaveCount(0);
  await expect(manager.getByRole('button', {
    name: '102동 삭제',
    exact: true
  })).toHaveCount(0);
  await manager.getByRole('button', {
    name: '완료',
    exact: true
  }).click();
  await expect(main.getByRole('combobox', {
    name: '동 필터',
    exact: true
  })).toHaveText('전체 동');
  await expect(main.getByRole('row')).toHaveCount(2);
  await expect(main.getByRole('article', {
    name: '전체 세대 1세대'
  })).toBeVisible();
  expect(writes).toBe(1);
});


const RESIDENTS = `/manage/${PROPERTY_ID}/residents`;
const RESIDENTS_URL = `${API_ORIGIN}/api/properties/${PROPERTY_ID}/residents`;

for (const width of [1440, 375]) {
  for (const hasBuildings of [false, true]) {
    test(`등록된 동 0개 ${width}px 동 구분 ${hasBuildings}에서는 세대·주민 동 필터를 숨김`, async ({ page }) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      await page.route(UNITS_URL, (route) => fulfillJson(route, {
        propertyId: PROPERTY_ID,
        hasBuildings,
        buildings: [],
        units: []
      }));
      await page.route(RESIDENTS_URL, (route) => fulfillJson(route, {
        propertyId: PROPERTY_ID,
        hasBuildings,
        buildings: [],
        residents: []
      }));
      for (const path of [HOUSEHOLDS, RESIDENTS]) {
        await page.goto(path);
        const main = page.getByRole('main');
        await expect(main.getByRole('table')).toBeVisible();
        await expect(main.getByRole('combobox', {
          name: '동 필터',
          exact: true
        })).toHaveCount(0);
        await expect(main.getByRole('button', {
          name: '초기화',
          exact: true
        })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: test.info().outputPath(`${path === HOUSEHOLDS ? 'units' : 'residents'}NoBuildings.png`),
          fullPage: true
        });
      }
    });
  }
}

for (const width of [1440, 375, 320]) {
  test(`주민 엑셀 다운로드 ${width}px는 연락처 마스킹 미리보기와 필터 전체 다운로드를 제공`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 960
    });
    const data = residentDirectory();
    const selected = data.residents.filter((row) => row.relationType === 'FAMILY');
    let requests = 0;
    await page.route(RESIDENTS_URL, (route) => fulfillJson(route, data));
    await page.route(`${RESIDENTS_URL}/export`, (route) => {
      requests++;
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON().residentIds).toEqual(selected.map((row) => row.id));
      return fulfillJson(route, {
        residents: selected.map((row) => ({
          name: row.name,
          phone: '+821012345678',
          unitLabel: '103동 301호'
        }))
      });
    });
    await page.goto(RESIDENTS);
    const main = page.getByRole('main');
    await expect(main).not.toContainText('010-1234-5678');
    await main.getByRole('combobox', {
      name: '주민 구분 필터',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '가족',
      exact: true
    }).click();
    await main.getByRole('button', {
      name: '다음 페이지',
      exact: true
    }).click();
    await main.getByRole('button', {
      name: '엑셀 다운로드',
      exact: true
    }).click();
    const preview = width >= 768 ? page.getByRole('dialog') : main;
    if (width < 768) {
      await expect(page).toHaveURL(`${RESIDENTS}/export`);
      await expect(page.getByRole('link', {
        name: '주민 목록으로 돌아가기'
      })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await expect(preview.getByRole('table', {
      name: '주민 엑셀 미리보기'
    })).toBeVisible();
    await expect(preview.getByRole('columnheader')).toHaveText(['주민명', '연락처', '동·호수']);
    await expect(preview).toContainText('총 11명');
    await expect(preview.getByRole('row')).toHaveCount(6);
    await expect(preview).toContainText('**** 5678');
    await expect(preview).not.toContainText('010-1234-5678');
    await expect(preview).not.toContainText('+821012345678');
    await expect(preview).not.toContainText('주민 구분');
    const previewRequests = requests;
    const downloadPromise = page.waitForEvent('download');
    await preview.getByRole('button', {
      name: '엑셀 다운로드',
      exact: true
    }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('주민_목록.xlsx');
    expect(requests).toBe(previewRequests);
    await expect(preview).toContainText('**** 5678');
    await expect(preview).not.toContainText('010-1234-5678');
    await expect(preview).not.toContainText('+821012345678');
    if (width >= 768) {
      await preview.getByRole('button', {
        name: '닫기',
        exact: true
      }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(main).not.toContainText('010-1234-5678');
    } else {
      await page.reload();
      await expect(main).toContainText('주민 목록에서 엑셀 다운로드를 다시 선택해주세요.');
      await expect(main).not.toContainText('010-1234-5678');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

/** 한 호수의 여러 주민과 세 가지 가입 상태를 함께 반환해 행·집계·대표 표시를 검증합니다. */
function residentDirectory(hasBuildings = true) {
  return {
    propertyId: PROPERTY_ID,
    hasBuildings,
    buildings: hasBuildings ? [{
      id: BUILDING_ID,
      name: '103동'
    }] : [],
    residents: Array.from({
      length: 12
    }, (_, index) => ({
      id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
      name: index === 0 ? '김민수' : `주민 ${String(index + 1).padStart(2, '0')}`,
      phoneLast4: String(1234 + index),
      unitId: '55555555-5555-4555-8555-000000000001',
      buildingId: hasBuildings ? BUILDING_ID : null,
      unitNumber: '301',
      relationType: index === 0 ? 'TENANT' : 'FAMILY',
      representative: index === 0,
      signupStatus: (['APPROVED', 'NOT_JOINED', 'PENDING'] as const)[index % 3]
    }))
  };
}

test('주민 목록은 사람별 행·대표·마스킹·전체 집계를 표시하고 검색·필터·페이지 이동을 제공', async ({ page }) => {
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, residentDirectory()));
  await page.goto(RESIDENTS);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', {
    name: '주민 목록',
    exact: true
  })).toBeVisible();
  await expect(main.getByRole('article', {
    name: '전체 주민 12명'
  })).toBeVisible();
  await expect(main.getByRole('article', {
    name: '가입 완료 4명'
  })).toBeVisible();
  await expect(main.getByRole('article', {
    name: '미가입 4명'
  })).toBeVisible();
  await expect(main.getByRole('article', {
    name: '승인 대기 4명'
  })).toBeVisible();
  await expect(main.getByRole('columnheader', {
    name: '가입 상태',
    exact: true
  })).toBeVisible();
  await expect(main.getByText(/계정 연결|미연결/)).toHaveCount(0);
  await expect(main.getByRole('row')).toHaveCount(11);
  const first = main.getByRole('row').filter({
    hasText: '김민수'
  });
  await expect(first).toContainText('103동 301호');
  await expect(first).toContainText('•••• 1234');
  await expect(first).toContainText('대표');
  await expect(main.getByRole('button', {
    name: /수정|삭제/
  })).toHaveCount(0);
  await expect(main.getByRole('combobox', {
    name: /비활성|주민 상태/
  })).toHaveCount(0);
  await main.getByRole('button', {
    name: '다음 페이지',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(3);
  await main.getByLabel('주민 검색', {
    exact: true
  }).fill('1234');
  await expect(main.getByRole('row')).toHaveCount(2);
  await expect(first).toBeVisible();
  await expect(main.getByRole('article', {
    name: '전체 주민 12명'
  })).toBeVisible();
  await main.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await main.getByRole('combobox', {
    name: '주민 구분 필터',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '임차인',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(2);
  await main.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await main.getByRole('combobox', {
    name: '가입 상태 필터',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '미가입',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(5);
  await main.getByRole('combobox', {
    name: '가입 상태 필터',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '승인 대기',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(5);
  await expect(main.getByRole('row').nth(1)).toContainText('승인 대기');
  await expect(main.getByRole('article', {
    name: '가입 완료 4명'
  })).toBeVisible();
  await main.getByLabel('주민 검색', {
    exact: true
  }).fill('없는 이름');
  await expect(main.getByText('검색 결과가 없어요.', {
    exact: true
  })).toBeVisible();
  await main.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await main.getByRole('combobox', {
    name: '페이지당 주민 수',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '20개씩 보기',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(13);
  await expect(main.getByRole('navigation', {
    name: '주민 목록 페이지'
  }).getByRole('button', {
    name: '다음 페이지'
  })).toBeDisabled();
});

for (const width of [1440, 375, 320]) {
  test(`주민 목록 ${width}px는 카드·필터·스크롤 표를 화면 안에 표시하고 동 없음·빈 연락처를 처리`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const data = residentDirectory(false);
    await page.route(RESIDENTS_URL, (route) => fulfillJson(route, {
      ...data,
      residents: data.residents.map((row, index) => ({
        ...row,
        phoneLast4: index === 0 ? null : row.phoneLast4
      }))
    }));
    await page.goto(RESIDENTS);
    const main = page.getByRole('main');
    await expect(main.getByRole('table', {
      name: '주민 목록',
      exact: true
    })).toBeVisible();
    await expect(main.getByRole('combobox', {
      name: '동 필터',
      exact: true
    })).toHaveCount(0);
    await expect(main.getByRole('row').filter({
      hasText: '김민수'
    })).toContainText('301호');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`residents${width}.png`),
      fullPage: true
    });
  });
}

test('주민 목록 로딩·조회 실패·권한 거부·빈 명부를 구분하고 재시도로 복구', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route(RESIDENTS_URL, async (route) => {
    calls += 1;
    if (calls === 1) {
      await pending;
      return fulfillJson(route, {
        code: 'RESIDENT_SERVICE_UNAVAILABLE'
      }, 503);
    }
    return fulfillJson(route, {
      ...residentDirectory(false),
      residents: []
    });
  });
  await page.goto(RESIDENTS);
  const main = page.getByRole('main');
  await expect(main.getByRole('status')).toHaveText('주민 목록을 불러오고 있어요.');
  await expect(main.getByRole('article')).toHaveCount(0);
  release();
  await expect(main.getByRole('alert')).toContainText('주민 목록을 불러오지 못했어요.');
  await main.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(main.getByText('등록된 주민이 없어요.', {
    exact: true
  })).toBeVisible();
  await expect(main.getByRole('article', {
    name: '전체 주민 0명'
  })).toBeVisible();
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, {
    code: 'ACCESS_DENIED'
  }, 403));
  await page.reload();
  await expect(main.getByRole('alert')).toContainText('관리소장 권한이 없어요.');
  await expect(main.getByRole('table')).toHaveCount(0);
});

test('주민 목록은 잘못된 끝 네 자리 응답을 표시하지 않고 기존 명부를 숨김', async ({ page }) => {
  const data = residentDirectory();
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, data));
  await page.goto(RESIDENTS);
  await expect(page.getByRole('main').getByText('김민수', {
    exact: true
  })).toBeVisible();
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, {
    ...data,
    residents: [{
      ...data.residents[0],
      phoneLast4: '010-1234-5678'
    }]
  }));
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('main').getByText('김민수', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByText('010-1234-5678', {
    exact: true
  })).toHaveCount(0);
});


test('주민 목록은 알 수 없는 가입 상태를 임의의 미가입으로 표시하지 않음', async ({ page }) => {
  const data = residentDirectory();
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, {
    ...data,
    residents: [{
      ...data.residents[0],
      signupStatus: 'LINKED'
    }]
  }));
  await page.goto(RESIDENTS);
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('main').getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(0);
});


test('주민 동 필터는 서버 등록 순서와 관계없이 숫자를 인식하는 이름순으로 표시하고 선택한 동만 조회', async ({ page }) => {
  const data = residentDirectory();
  const buildings = ['103동', '102동', '101동', '10동', '2동', '나동', '가동'].map((name, index) => ({
    id: index === 0 ? BUILDING_ID : `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`,
    name
  }));
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, {
    ...data,
    buildings,
    residents: data.residents.map((row, index) => ({
      ...row,
      buildingId: index === 1 ? buildings[1].id : BUILDING_ID
    }))
  }));
  await page.goto(RESIDENTS);
  const main = page.getByRole('main');
  const filter = main.getByRole('combobox', {
    name: '동 필터',
    exact: true
  });
  await filter.click();
  await expect(page.getByRole('option')).toHaveText(['전체 동', '2동', '10동', '101동', '102동', '103동', '가동', '나동']);
  await page.getByRole('option', {
    name: '102동',
    exact: true
  }).click();
  await expect(main.getByRole('row')).toHaveCount(2);
  await expect(main.getByRole('row').nth(1)).toContainText('주민 02');
  await expect(main.getByRole('row').nth(1)).toContainText('102동 301호');
  await main.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await expect(filter).toHaveText('전체 동');
  await expect(main.getByRole('row')).toHaveCount(11);
});

/** 주민 등록에 필요한 저장된 세대를 제공하며 실제 업무 API는 호출하지 않습니다. */
async function mockResidentRegistrationUnits(page: Page, hasBuildings = true) {
  await page.route(UNITS_URL, (route) => fulfillJson(route, {
    propertyId: PROPERTY_ID,
    hasBuildings,
    buildings: hasBuildings ? [{
      id: BUILDING_ID,
      name: '103동'
    }] : [],
    units: [{
      id: '55555555-5555-4555-8555-000000000001',
      buildingId: hasBuildings ? BUILDING_ID : null,
      unitNumber: '301',
      displayName: null,
      floor: 3,
      status: 'ACTIVE'
    }]
  }));
}

async function fillResidentRegistration(page: Page, hasBuildings = true) {
  await page.getByRole('textbox', {
    name: '주민 이름',
    exact: true
  }).fill('새 주민');
  if (hasBuildings) {
    await page.getByRole('combobox', {
      name: '동',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '103동',
      exact: true
    }).click();
  }
  await page.getByRole('combobox', {
    name: '동·호수',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '301호',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '주민 구분',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '임차인',
    exact: true
  }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

for (const width of [1440, 375, 320]) {
  test(`주민 등록 ${width}px는 웹 모달·모바일 페이지로 열고 선택 연락처 없이 저장한 뒤 목록·카드를 갱신`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 960
    });
    await mockResidentRegistrationUnits(page);
    const data = residentDirectory();
    data.residents = [];
    let posts = 0;
    await page.route(RESIDENTS_URL, async (route) => {
      if (route.request().method() !== 'POST') return fulfillJson(route, data);
      posts++;
      const input = route.request().postDataJSON();
      expect(input.phone).toBeNull();
      expect(input.name).toBe('새 주민');
      expect(input.unitId).toBe('55555555-5555-4555-8555-000000000001');
      expect(input.relationType).toBe('TENANT');
      expect(route.request().headers().authorization).toBe('Bearer test-access');
      data.residents.push({
        ...residentDirectory().residents[0],
        id: input.requestId,
        name: input.name,
        phoneLast4: '',
        signupStatus: 'NOT_JOINED'
      });
      await fulfillJson(route, {
        id: input.requestId,
        propertyId: PROPERTY_ID,
        unitId: input.unitId,
        representative: true
      }, 201);
    });
    // 연락처 없음은 목록 계약의 null로 응답합니다.
    await page.route(RESIDENTS_URL, async (route) => {
      if (route.request().method() === 'POST') return route.fallback();
      await fulfillJson(route, {
        ...data,
        residents: data.residents.map((row) => ({
          ...row,
          phoneLast4: null
        }))
      });
    });
    await page.goto(RESIDENTS);
    await page.getByRole('button', {
      name: '주민 등록',
      exact: true
    }).click();
    if (width >= 768) {
      await expect(page).toHaveURL(RESIDENTS);
      await expect(page.getByRole('dialog', {
        name: '주민 등록'
      })).toBeVisible();
    } else {
      await expect(page).toHaveURL(`${RESIDENTS}/new`);
      const back = page.getByRole('banner').getByRole('link', {
        name: '주민 목록으로 돌아가기'
      });
      await expect(back).toBeVisible();
      await back.click();
      await expect(page).toHaveURL(RESIDENTS);
      await page.goto(`${RESIDENTS}/new`);
      await expect(back).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('heading', {
        name: '주민 등록',
        exact: true
      })).toBeVisible();
    }
    await fillResidentRegistration(page);
    await page.screenshot({
      path: test.info().outputPath(`residentRegistration${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', {
      name: '등록',
      exact: true
    }).click();
    await expect(page.getByRole('article', {
      name: '전체 주민 1명'
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '미가입 1명'
    })).toBeVisible();
    const row = page.getByRole('row').filter({
      hasText: '새 주민'
    });
    await expect(row).toContainText('103동 301호');
    await expect(row).toContainText('대표');
    await expect(row).toContainText('—');
    await expect(page.getByRole('status')).toContainText('주민을 등록했어요.');
    const notice = page.getByRole('status').filter({
      hasText: '주민을 등록했어요.'
    }).locator('..');
    await expect(notice).toHaveCSS('background-color', 'rgb(22, 101, 52)');
    await expect(notice).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect.poll(async () => (await notice.boundingBox())!.height).toBeLessThanOrEqual(50);
    await expect.poll(async () => {
      const box = (await notice.boundingBox())!;
      return Math.abs(960 - box.y - box.height - (width < 768 ? 16 : 32));
    }).toBeLessThan(2);
    const noticeBox = (await notice.boundingBox())!;
    expect(noticeBox.width).toBeGreaterThan(noticeBox.height * 2);
    expect(Math.abs(noticeBox.x + noticeBox.width / 2 - width / 2)).toBeLessThan(2);
    await page.screenshot({
      path: test.info().outputPath(`residentSuccessToast${width}.png`),
      animations: 'disabled'
    });
    await expect(page).toHaveURL(RESIDENTS);
    expect(posts).toBe(1);
    expect(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes('새 주민')))).toBe(false);
  });
}

for (const width of [1440, 375]) {
  test(`주민 재등록 ${width}px는 새 요청과 다른 기존 주민 ID를 받아 목록을 갱신`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 960
    });
    await mockResidentRegistrationUnits(page);
    const data = residentDirectory();
    const original = data.residents[0];
    data.residents = [];
    await page.route(RESIDENTS_URL, async (route) => {
      if (route.request().method() !== 'POST') return fulfillJson(route, data);
      const input = route.request().postDataJSON();
      expect(input.requestId).not.toBe(original.id);
      data.residents.push({
        ...original,
        name: input.name,
        signupStatus: 'NOT_JOINED'
      });
      await fulfillJson(route, {
        id: original.id,
        propertyId: PROPERTY_ID,
        unitId: input.unitId,
        representative: true
      }, 201);
    });
    await page.goto(RESIDENTS);
    await page.getByRole('button', {
      name: '주민 등록',
      exact: true
    }).click();
    await fillResidentRegistration(page);
    await page.getByRole('textbox', {
      name: '연락처 (선택)',
      exact: true
    }).fill('01012345678');
    await page.getByRole('button', {
      name: '등록',
      exact: true
    }).click();
    await expect(page).toHaveURL(RESIDENTS);
    await expect(page.getByRole('article', {
      name: '전체 주민 1명'
    })).toBeVisible();
    await expect(page.getByRole('row').filter({
      hasText: '새 주민'
    })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('주민을 등록했어요.');
  });
}

test('주민 등록은 필수값·연락처를 검증하고 국내 번호를 변환하며 저장 중 닫기·중복 클릭을 막음', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 960
  });
  await mockResidentRegistrationUnits(page, false);
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, residentDirectory(false)));
  let complete: () => void = () => {};
  const gate = new Promise<void>((resolve) => { complete = resolve; });
  let posts = 0;
  await page.route(RESIDENTS_URL, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts++;
    const input = route.request().postDataJSON();
    expect(input.phone).toBe('+821012345678');
    await gate;
    await fulfillJson(route, {
      id: input.requestId,
      propertyId: PROPERTY_ID,
      unitId: input.unitId,
      representative: false
    }, 201);
  });
  await page.goto(RESIDENTS);
  await page.getByRole('button', {
    name: '주민 등록',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '주민 등록'
  });
  const save = dialog.getByRole('button', {
    name: '등록',
    exact: true
  });
  await save.click();
  await expect(dialog.getByText('이름을 1~50자로 입력해주세요.')).toBeVisible();
  expect(posts).toBe(0);
  await fillResidentRegistration(page, false);
  await expect(dialog.getByRole('combobox', {
    name: '동',
    exact: true
  })).toHaveCount(0);
  await dialog.getByRole('textbox', {
    name: '연락처 (선택)',
    exact: true
  }).fill('abcd1234');
  await save.click();
  await expect(dialog.getByText('올바른 연락처를 입력해주세요.')).toBeVisible();
  expect(posts).toBe(0);
  await dialog.getByRole('textbox', {
    name: '연락처 (선택)',
    exact: true
  }).fill('010-1234-5678');
  await save.click();
  await expect(dialog.getByRole('button', {
    name: '등록 중…'
  })).toBeDisabled();
  await expect(dialog.getByRole('button', {
    name: '주민 등록 닫기'
  })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(posts).toBe(1);
  complete();
  await expect(dialog).toHaveCount(0);
});

test('주민 등록 중복·통신 실패에는 입력을 유지하고 같은 요청 ID로 재시도하며 취소 시 초안을 폐기', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 960
  });
  await mockResidentRegistrationUnits(page);
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, residentDirectory()));
  const ids: string[] = [];
  await page.route(RESIDENTS_URL, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const input = route.request().postDataJSON();
    ids.push(input.requestId);
    if (ids.length === 1) return fulfillJson(route, {
      code: 'DUPLICATE_RESIDENT',
      message: 'private data'
    }, 409);
    return fulfillJson(route, {
      code: 'UNAVAILABLE',
      message: 'private SQL'
    }, 503);
  });
  await page.goto(RESIDENTS);
  const open = page.getByRole('button', {
    name: '주민 등록',
    exact: true
  });
  await open.click();
  await fillResidentRegistration(page);
  const dialog = page.getByRole('dialog', {
    name: '주민 등록'
  });
  const save = dialog.getByRole('button', {
    name: '등록',
    exact: true
  });
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('이름과 연락처가 같은 주민');
  await expect(dialog.getByRole('textbox', {
    name: '주민 이름',
    exact: true
  })).toHaveValue('새 주민');
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('등록 결과를 확인하지 못했어요.');
  await expect(dialog).not.toContainText('private');
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await open.click();
  await expect(dialog.getByRole('textbox', {
    name: '주민 이름',
    exact: true
  })).toHaveValue('');
});

test('주민 등록 세대 조회 실패는 재시도하고 빈 세대는 등록을 안내하며 모바일 직접 접근은 관리소장만 허용', async ({ page }) => {
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, residentDirectory()));
  await page.route(UNITS_URL, (route) => fulfillJson(route, {
    code: 'UNAVAILABLE'
  }, 503));
  await page.goto(`${RESIDENTS}/new`);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('세대 목록을 불러오지 못했어요.');
  await page.route(UNITS_URL, (route) => fulfillJson(route, {
    propertyId: PROPERTY_ID,
    hasBuildings: false,
    buildings: [],
    units: []
  }));
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByText('주민을 등록하려면 먼저 세대를 등록해주세요.')).toBeVisible();
  await page.route(CONTEXT_URL, (route) => fulfillJson(route, {
    ...PROPERTY,
    role: 'MANAGER'
  }));
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('주민을 등록할 관리소장 권한이 없어요.');
  await expect(page.getByRole('textbox', {
    name: '주민 이름',
    exact: true
  })).toHaveCount(0);
});

for (const width of [320, 767]) {
  test(`모바일 세대 ${width}px 등록·상세·수정 페이지의 헤더 뒤로가기·직접 접근·저장·삭제`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const unitId = '33333333-3333-4333-8333-333333333333';
    let units: { id: string; buildingId: string | null; unitNumber: string; displayName: string | null; floor: number | null; status: string }[] = [];
    let failSave = true;
    await page.route(`${UNITS_URL}**`, async (route) => {
      const method = route.request().method();
      if (method === 'OPTIONS') return fulfillJson(route, {});
      if (method === 'GET') return fulfillJson(route, {
        propertyId: PROPERTY_ID,
        hasBuildings: true,
        buildings: [{
          id: BUILDING_ID,
          name: '101동'
        }],
        units
      });
      expect(route.request().headers().authorization).toBe('Bearer test-access');
      if (method === 'DELETE') {
        expect(route.request().url()).toBe(`${UNITS_URL}/${unitId}`);
        units = [];
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': 'http://localhost:3100',
            'Access-Control-Allow-Credentials': 'true'
          }
        });
      }
      if (failSave) return fulfillJson(route, {
        code: 'UNIT_SERVICE_UNAVAILABLE'
      }, 503);
      const input = route.request().postDataJSON();
      expect(input.buildingId).toBe(BUILDING_ID);
      const saved = {
        ...input,
        id: unitId
      };
      units = [saved];
      return fulfillJson(route, saved, method === 'POST' ? 201 : 200);
    });
    await page.goto(HOUSEHOLDS);
    const main = page.getByRole('main');
    const banner = page.getByRole('banner');
    await main.getByRole('button', {
      name: '세대 추가',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${HOUSEHOLDS}/new`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(banner.getByRole('link', {
      name: '세대 목록으로 돌아가기'
    })).toBeVisible();
    await main.getByRole('textbox', {
      name: '호수',
      exact: true
    }).fill('201');
    await main.getByLabel('층', {
      exact: true
    }).fill('-1');
    await main.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    await expect(main.getByRole('alert')).toContainText('다시 시도');
    await expect(main.getByRole('textbox', {
      name: '호수',
      exact: true
    })).toHaveValue('201');
    failSave = false;
    await main.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    await expect(page).toHaveURL(HOUSEHOLDS);
    await expect(page.getByRole('status')).toContainText('세대를 추가했어요.');
    await main.getByRole('button', {
      name: '101동 201호 상세 보기'
    }).click();
    await expect(page).toHaveURL(`${HOUSEHOLDS}/${unitId}`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(main.getByRole('heading', {
      name: '101동 201호',
      exact: true
    })).toBeVisible();
    await expect(main.getByText('B1층', {
      exact: true
    })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`unitDetailMobile${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await banner.getByRole('link', {
      name: '세대 목록으로 돌아가기'
    }).click();
    await expect(page).toHaveURL(HOUSEHOLDS);
    await page.goto(`${HOUSEHOLDS}/${unitId}`);
    await page.reload();
    await expect(main.getByRole('heading', {
      name: '101동 201호',
      exact: true
    })).toBeVisible();
    await main.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${HOUSEHOLDS}/${unitId}/edit`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(main.getByRole('textbox', {
      name: '호수',
      exact: true
    })).toHaveValue('201');
    await banner.getByRole('link', {
      name: '세대 상세로 돌아가기'
    }).click();
    await expect(page).toHaveURL(`${HOUSEHOLDS}/${unitId}`);
    await main.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await main.getByLabel('세대 별칭', {
      exact: true
    }).fill('정문 세대');
    await main.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await expect(page).toHaveURL(HOUSEHOLDS);
    await expect(main.getByRole('row').last()).toContainText('정문 세대');
    await main.getByRole('button', {
      name: '101동 201호 상세 보기'
    }).click();
    await main.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    const confirmation = page.getByRole('alertdialog');
    await confirmation.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${HOUSEHOLDS}/${unitId}`);
    await main.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(page).toHaveURL(HOUSEHOLDS);
    await expect(main.getByText('아직 등록된 세대가 없어요.', {
      exact: true
    })).toBeVisible();
    await page.goto(`${HOUSEHOLDS}/${unitId}`);
    await expect(main.getByRole('alert')).toContainText('세대를 확인할 수 없거나 수정할 수 없어요.');
    await banner.getByRole('link', {
      name: '세대 목록으로 돌아가기'
    }).click();
    await expect(page).toHaveURL(HOUSEHOLDS);
  });
}

const IMPORT_URL = `${API_ORIGIN}/api/properties/${PROPERTY_ID}/resident-imports`;
const IMPORT_ID = '93cf5c70-31d0-4c5e-a57c-cbd998a7f094';
const IMPORT_PATH = `${RESIDENTS}/import`;

function importPreview() {
  return {
    importId: IMPORT_ID,
    expiresAt: '2026-10-11T05:00:00Z',
    rows: Array.from({
      length: 12
    }, (_, index) => ({
      rowNumber: index + 2,
      building: '102동',
      unitNumber: '301',
      name: `엑셀 주민 ${index + 1}`,
      relationType: 'FAMILY',
      phoneLast4: '1234',
      representative: false,
      status: index === 1 ? 'DUPLICATE' : index === 2 ? 'ERROR' : 'READY',
      reason: index === 1 ? '이름·연락처가 같은 주민이 있어요.' : index === 2 ? '세대 오류' : '등록 가능'
    }))
  };
}

for (const width of [1440, 375, 320]) {
  test(`엑셀 업로드 ${width}px는 파일 검증·정상 행 선택·페이지 이동·완료·마스킹 결과 다운로드`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 960
    });
    await page.route(RESIDENTS_URL, (route) => fulfillJson(route, residentDirectory()));
    const preview = importPreview();
    let uploads = 0;
    let commits = 0;
    await page.route(IMPORT_URL, async (route) => {
      uploads++;
      expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=');
      expect(route.request().postDataBuffer()?.toString()).toContain('residents.xlsx');
      await fulfillJson(route, preview);
    });
    await page.route(`${IMPORT_URL}/${IMPORT_ID}/commit`, async (route) => {
      commits++;
      const selected = route.request().postDataJSON().rowNumbers as number[];
      expect(selected).not.toContain(2);
      expect(selected).not.toContain(3);
      expect(selected).not.toContain(4);
      expect(selected).toHaveLength(9);
      await fulfillJson(route, {
        ...preview,
        rows: preview.rows.map((row) => ({
          ...row,
          status: row.status !== 'READY' ? row.status : selected.includes(row.rowNumber) ? 'SUCCESS' : 'NOT_SELECTED',
          representative: row.rowNumber === 5
        }))
      });
    });
    await page.goto(RESIDENTS);
    await page.getByRole('button', {
      name: '엑셀 업로드',
      exact: true
    }).click();
    await expect(page).toHaveURL(IMPORT_PATH);
    if (width < 768) await expect(page.getByRole('banner').getByRole('link', {
      name: '주민 목록으로 돌아가기'
    })).toBeVisible();
    const templateDownload = page.waitForEvent('download');
    await page.getByRole('link', {
      name: '엑셀 양식 다운로드'
    }).click();
    expect((await templateDownload).suggestedFilename()).toBe('주민 업로드 양식.xlsx');
    await page.getByLabel('주민 엑셀 파일').setInputFiles({
      name: 'residents.xls',
      mimeType: 'application/vnd.ms-excel',
      buffer: Buffer.from('invalid')
    });
    await expect(page.getByLabel('알림', {
      exact: true
    }).getByRole('alert')).toContainText('.xlsx');
    expect(uploads).toBe(0);
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    const listButton = page.getByRole('button', {
      name: '주민 목록',
      exact: true
    });
    await expect(listButton).toBeVisible();
    await expect(page.getByRole('button', {
      name: '주민 목록으로',
      exact: true
    })).toHaveCount(0);
    const footer = listButton.locator('..');
    const listBounds = await listButton.boundingBox();
    const footerBounds = await footer.boundingBox();
    expect(Math.abs(listBounds!.x + listBounds!.width - footerBounds!.x - footerBounds!.width)).toBeLessThan(2);
    await page.getByLabel('주민 엑셀 파일').setInputFiles({
      name: 'residents.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK mock workbook')
    });
    await expect(page.getByRole('heading', {
      name: '업로드 데이터 확인'
    })).toBeVisible();
    await expect(page.getByRole('columnheader', {
      name: '엑셀 행',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('columnheader', {
      name: '주민 구분',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '전체 12건'
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '등록 가능 10건'
    })).toBeVisible();
    await expect(page.getByLabel('3행 등록 선택')).toBeDisabled();
    await expect(page.getByLabel('4행 등록 선택')).toBeDisabled();
    await page.getByLabel('2행 등록 선택', {
      exact: true
    }).uncheck();
    await page.getByRole('button', {
      name: '2페이지',
      exact: true
    }).click();
    await expect(page.getByRole('row').filter({
      hasText: '엑셀 주민 12'
    })).toBeVisible();
    await page.getByRole('button', {
      name: '1페이지',
      exact: true
    }).click();
    await page.getByRole('textbox', {
      name: '주민 검색'
    }).fill('엑셀 주민 4');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
    await page.getByRole('textbox', {
      name: '주민 검색'
    }).fill('');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath(`residentImportPreview${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', {
      name: '선택한 주민 등록 (9명)',
      exact: true
    }).click();
    await expect(page.getByRole('heading', {
      name: '주민 등록 완료'
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '등록 성공 9건'
    })).toBeVisible();
    await expect(footer.getByRole('button').last()).toHaveText('주민 목록');
    await expect(page.getByRole('row').filter({
      hasText: '엑셀 주민 4'
    })).toContainText('대표');
    await expect(page.getByRole('main')).not.toContainText('01012341234');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', {
      name: '결과 CSV 다운로드'
    }).click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('•••• 1234');
    expect(csv).toContain('선택 안 함');
    expect(csv).not.toContain('01012341234');
    expect(uploads).toBe(1);
    expect(commits).toBe(1);
    expect(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes('엑셀 주민')))).toBe(false);
    await page.getByRole('button', {
      name: '새로 등록하기'
    }).click();
    await expect(page.getByRole('heading', {
      name: '주민 엑셀 업로드'
    })).toBeVisible();
    await listButton.click();
    await expect(page).toHaveURL(RESIDENTS);
  });
}

test('일괄 등록 통신 실패는 선택·검증 ID를 유지하고 같은 요청으로 재시도', async ({ page }) => {
  const preview = importPreview();
  let attempts = 0;
  let first: unknown;
  await page.route(IMPORT_URL, (route) => fulfillJson(route, preview));
  await page.route(`${IMPORT_URL}/${IMPORT_ID}/commit`, async (route) => {
    attempts++;
    if (attempts === 1) {
      first = route.request().postDataJSON();
      return fulfillJson(route, {
        code: 'RESIDENT_SERVICE_UNAVAILABLE',
        message: 'private error'
      }, 503);
    }
    expect(route.request().postDataJSON()).toEqual(first);
    return fulfillJson(route, {
      ...preview,
      rows: preview.rows.map((row) => ({
        ...row,
        status: row.status === 'READY' ? 'SUCCESS' : row.status
      }))
    });
  });
  await page.goto(IMPORT_PATH);
  await page.getByLabel('주민 엑셀 파일').setInputFiles({
    name: 'residents.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('mock')
  });
  await page.getByRole('button', {
    name: '선택한 주민 등록 (10명)'
  }).click();
  await expect(page.getByLabel('알림', {
    exact: true
  }).getByRole('alert')).toContainText('같은 요청');
  await expect(page.getByLabel('알림', {
    exact: true
  }).getByRole('alert')).not.toContainText('private error');
  await expect(page.getByLabel('2행 등록 선택', {
    exact: true
  })).toBeDisabled();
  await page.getByRole('button', {
    name: '같은 요청으로 다시 시도'
  }).click();
  await expect(page.getByRole('heading', {
    name: '주민 등록 완료'
  })).toBeVisible();
  expect(attempts).toBe(2);
});

test('일괄 등록은 잘못된 전체 연락처 응답을 거부하고 부담당자의 직접 접근을 차단', async ({ page }) => {
  const preview = importPreview();
  preview.rows[0].phoneLast4 = '01012341234';
  await page.route(IMPORT_URL, (route) => fulfillJson(route, preview));
  await page.goto(IMPORT_PATH);
  await page.getByLabel('주민 엑셀 파일').setInputFiles({
    name: 'residents.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('mock')
  });
  await expect(page.getByLabel('알림', {
    exact: true
  }).getByRole('alert')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('01012341234');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.route(CONTEXT_URL, (route) => fulfillJson(route, {
    ...PROPERTY,
    role: 'MANAGER'
  }));
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('관리소장 권한');
  await expect(page.getByLabel('주민 엑셀 파일')).toHaveCount(0);
});


test('엑셀 파일 드래그는 배경·테두리·안내를 강조하고 이탈·드롭에 해제하며 검증 중 중복 업로드를 막음', async ({ page }) => {
  let uploads = 0;
  let releaseUpload: () => void = () => {};
  const pending = new Promise<void>((resolve) => { releaseUpload = resolve; });
  await page.route(IMPORT_URL, async (route) => {
    uploads++;
    await pending;
    await fulfillJson(route, {
      code: 'PHONE_SECURITY_UNAVAILABLE'
    }, 503);
  });
  await page.goto(IMPORT_PATH);
  const zone = page.getByRole('region', {
    name: '엑셀 파일 업로드 영역'
  });
  const select = zone.getByRole('button', {
    name: '파일 선택'
  });
  await expect(zone).toBeVisible();
  const initialBackground = await zone.evaluate((element) => getComputedStyle(element).backgroundColor);
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['mock'], 'residents.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));

    return transfer;
  });
  await zone.dispatchEvent('dragenter', {
    dataTransfer
  });
  await zone.dispatchEvent('dragover', {
    dataTransfer
  });
  await expect(zone).toContainText('여기에 놓으면 파일 검증을 시작해요.');
  await expect(zone).toHaveCSS('border-style', 'solid');
  await expect(zone).not.toHaveCSS('background-color', initialBackground);
  // 자식 버튼으로 이동할 때 발생하는 진입·이탈이 전체 영역의 강조를 꺼서는 안 됩니다.
  await select.dispatchEvent('dragenter', {
    dataTransfer
  });
  await zone.dispatchEvent('dragleave', {
    dataTransfer
  });
  await expect(zone).toHaveCSS('border-style', 'solid');
  await page.screenshot({
    path: test.info().outputPath('residentImportDragging.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await select.dispatchEvent('dragleave', {
    dataTransfer
  });
  await expect(zone).toHaveCSS('border-style', 'dashed');
  await expect(zone).toHaveCSS('background-color', initialBackground);
  await zone.dispatchEvent('dragenter', {
    dataTransfer
  });
  await zone.dispatchEvent('drop', {
    dataTransfer
  });
  await expect(zone.getByRole('button', {
    name: '검증 중…'
  })).toBeDisabled();
  await expect(zone).toHaveCSS('border-style', 'dashed');
  await zone.dispatchEvent('dragenter', {
    dataTransfer
  });
  await zone.dispatchEvent('drop', {
    dataTransfer
  });
  await expect(zone).toHaveCSS('border-style', 'dashed');
  releaseUpload();
  await expect(page.getByLabel('알림', {
    exact: true
  }).getByRole('alert')).toContainText('연락처 저장 설정');
  expect(uploads).toBe(1);
  await expect(select).toBeEnabled();
  await expect(zone).toHaveCSS('background-color', initialBackground);
  await dataTransfer.dispose();
});

for (const width of [1440, 375, 320]) {
  test(`엑셀 헤더 오류 ${width}px는 하단 중앙 토스트로 표시하고 같은 오류의 재시도는 표시 시간을 새로 시작`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const message = '양식의 첫 행을 동·호수·이름·주민 구분·연락처 순서로 맞춰주세요.';
    await page.route(IMPORT_URL, (route) => fulfillJson(route, {
      code: 'INVALID_EXCEL_HEADER'
    }, 400));
    await page.goto(IMPORT_PATH);
    await expect(page.getByRole('heading', {
      name: '주민 엑셀 업로드'
    })).toBeVisible();
    await page.clock.install();
    const file = {
      name: 'residents.xlsx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('mock')
    };
    const toast = page.getByLabel('알림', {
      exact: true
    }).getByRole('alert');
    await page.getByLabel('주민 엑셀 파일').setInputFiles(file);
    await expect(toast).toHaveText(message);
    await expect(page.getByRole('main')).not.toContainText(message);
    await expect.poll(async () => {
      const box = await toast.locator('..').boundingBox();

      return Math.abs(900 - box!.y - box!.height - (width < 768 ? 16 : 32));
    }).toBeLessThan(2);
    const box = await toast.boundingBox();
    const container = (await toast.locator('..').boundingBox())!;
    expect(container.height).toBeLessThanOrEqual(100);
    expect(container.width).toBeGreaterThan(container.height * 2);
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(2);
    await page.clock.fastForward(4000);
    await page.getByLabel('주민 엑셀 파일').setInputFiles(file);
    await expect(toast).toHaveText(message);
    await page.clock.fastForward(4000);
    await expect(toast).toBeVisible();
    await page.clock.fastForward(2000);
    await page.clock.fastForward(200);
    await expect(toast).toHaveCount(0);
    await expect(page.getByRole('heading', {
      name: '주민 엑셀 업로드'
    })).toBeVisible();
  });
}

for (const width of [1440, 375, 320]) {
  test(`주민 상세 ${width}px는 웹 모달·모바일 페이지에서 번호 공개·숨김·수정 재시도·대표 선택 삭제를 제공`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 960
    });
    await mockResidentRegistrationUnits(page);
    const directory = residentDirectory();
    const first = directory.residents[0];
    const second = directory.residents[1];
    let detail = {
      ...first,
      propertyId: PROPERTY_ID,
      buildingName: '103동',
      createdAt: '2026-10-10T04:00:00Z',
      updatedAt: '2026-10-10T04:00:00Z',
      hasLinkedRequests: true,
      representativeCandidates: [{
        id: second.id,
        name: second.name
      }]
    };
    let reveals = 0;
    let edits = 0;
    let deletes = 0;
    const detailUrl = `${RESIDENTS_URL}/${first.id}`;
    await page.route(RESIDENTS_URL, (route) => fulfillJson(route, directory));
    await page.route(`${detailUrl}/phone-reveal`, (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers().authorization).toBe('Bearer test-access');
      reveals++;
      return fulfillJson(route, {
        phone: '+82101231234'
      });
    });
    await page.route(detailUrl, async (route) => {
      const method = route.request().method();
      if (method === 'GET') return fulfillJson(route, detail);
      if (method === 'PUT') {
        edits++;
        const input = route.request().postDataJSON();
        expect(input.phoneAction).toBe('REPLACE');
        expect(input.phone).toBe('+821098765432');
        expect(input.expectedUpdatedAt).toBe('2026-10-10T04:00:00Z');
        if (edits === 1) return fulfillJson(route, {
          code: 'DUPLICATE_RESIDENT'
        }, 409);
        detail = {
          ...detail,
          name: input.name,
          phoneLast4: '5432',
          updatedAt: '2026-10-10T04:00:01Z'
        };
        directory.residents[0] = {
          ...first,
          name: input.name,
          phoneLast4: '5432'
        };
        return fulfillJson(route, detail);
      }
      expect(method).toBe('DELETE');
      deletes++;
      const input = route.request().postDataJSON();
      expect(input.replacementResidentId).toBe(second.id);
      expect(input.expectedUpdatedAt).toBe(detail.updatedAt);
      if (deletes === 1) return fulfillJson(route, {
        code: 'RESIDENT_SERVICE_UNAVAILABLE'
      }, 503);
      directory.residents.shift();
      directory.residents[0].representative = true;
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true'
        }
      });
    });
    await page.goto(RESIDENTS);
    const upload = page.getByRole('button', {
      name: '엑셀 업로드',
      exact: true
    });
    await expect(upload).toHaveCSS('background-color', 'rgb(22, 101, 52)');
    await expect(upload.locator('svg')).toHaveCount(1);
    await expect(page.getByRole('columnheader', {
      name: '동·호수',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('columnheader', {
      name: '주민 구분',
      exact: true
    })).toBeVisible();
    await page.getByRole('row').filter({
      hasText: first.name
    }).getByRole('cell').first().click();
    const view = width >= 768 ? page.getByRole('dialog') : page.getByRole('main');
    await expect(view.getByRole('heading', {
      name: '주민 상세',
      exact: true
    })).toBeVisible();
    if (width < 768) {
      await expect(page).toHaveURL(`${RESIDENTS}/${first.id}`);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('banner').getByRole('link', {
        name: '주민 목록으로 돌아가기'
      })).toBeVisible();
    } else await expect(page).toHaveURL(RESIDENTS);
    expect(reveals).toBe(0);
    await expect(view.getByRole('button', {
      name: '수정',
      exact: true
    })).toHaveCSS('color', 'rgb(22, 163, 74)');
    await expect(view.getByRole('button', {
      name: '수정',
      exact: true
    })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(view).toContainText('•••• 1234');
    await expect(view).not.toContainText('010-123-1234');
    await view.getByRole('button', {
      name: '전체 번호 보기',
      exact: true
    }).click();
    await expect(view).toContainText('010-123-1234');
    expect(reveals).toBe(1);
    await view.getByRole('button', {
      name: '번호 숨기기',
      exact: true
    }).click();
    await expect(view).not.toContainText('010-123-1234');
    await view.getByRole('button', {
      name: '전체 번호 보기',
      exact: true
    }).click();
    await expect(view).toContainText('010-123-1234');
    await view.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await expect(view.getByRole('heading', {
      name: '주민 수정',
      exact: true
    })).toBeVisible();
    await expect(view).not.toContainText('010-123-1234');
    await expect(view.getByRole('textbox', {
      name: '연락처 (선택)',
      exact: true
    })).toHaveCount(0);
    await view.getByRole('textbox', {
      name: '주민 이름',
      exact: true
    }).fill('수정 주민');
    await view.getByRole('combobox', {
      name: '연락처 변경',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '새 연락처로 변경',
      exact: true
    }).click();
    await view.getByRole('textbox', {
      name: '새 연락처',
      exact: true
    }).fill('010-9876-5432');
    await view.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await expect(view.getByRole('alert')).toContainText('이름과 연락처가 같은 주민');
    await expect(view.getByRole('textbox', {
      name: '주민 이름',
      exact: true
    })).toHaveValue('수정 주민');
    await expect(view.getByRole('textbox', {
      name: '새 연락처',
      exact: true
    })).toHaveValue('010-9876-5432');
    await view.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await expect(view.getByRole('heading', {
      name: '주민 상세',
      exact: true
    })).toBeVisible();
    await expect(view).toContainText('수정 주민');
    await expect(view).toContainText('•••• 5432');
    await page.screenshot({
      path: test.info().outputPath(`residentDetail${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) => value.includes('+82101231234') || value.includes('010-9876-5432')))).toBe(false);
    await view.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await view.getByRole('button', {
      name: '삭제 확인',
      exact: true
    }).click();
    await expect(view.getByRole('alert')).toContainText('새 대표');
    expect(deletes).toBe(0);
    await view.getByRole('combobox', {
      name: '새 대표 주민',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: second.name,
      exact: true
    }).click();
    await view.getByRole('button', {
      name: '삭제 확인',
      exact: true
    }).click();
    await expect(view.getByRole('alert')).toContainText('다시 시도');
    await expect(view.getByRole('combobox', {
      name: '새 대표 주민',
      exact: true
    })).toHaveText(second.name);
    await view.getByRole('button', {
      name: '삭제 확인',
      exact: true
    }).click();
    await expect(page).toHaveURL(RESIDENTS);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '수정 주민 상세 보기',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('status').filter({
      hasText: '주민을 삭제했어요.'
    })).toBeVisible();
    expect(edits).toBe(2);
    expect(deletes).toBe(2);
  });
}

test('주민 상세를 다시 열면 번호는 마스킹되고 전체 번호 조회 실패·잘못된 기본 응답은 원문을 노출하지 않음', async ({ page }) => {
  const directory = residentDirectory();
  const first = directory.residents[0];
  const detail = {
    ...first,
    propertyId: PROPERTY_ID,
    buildingName: '103동',
    createdAt: '2026-10-10T04:00:00Z',
    updatedAt: '2026-10-10T04:00:00Z',
    hasLinkedRequests: false,
    representativeCandidates: []
  };
  const url = `${RESIDENTS_URL}/${first.id}`;
  await page.route(RESIDENTS_URL, (route) => fulfillJson(route, directory));
  await page.route(url, (route) => fulfillJson(route, detail));
  await page.route(`${url}/phone-reveal`, (route) => fulfillJson(route, {
    phone: '+82101231234'
  }));
  await page.goto(RESIDENTS);
  await page.getByRole('button', {
    name: '김민수 상세 보기'
  }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {
    name: '전체 번호 보기'
  }).click();
  await expect(dialog).toContainText('010-123-1234');
  await dialog.getByRole('button', {
    name: '주민 상세 닫기'
  }).click();
  await page.getByRole('button', {
    name: '김민수 상세 보기'
  }).focus();
  await page.keyboard.press('Enter');
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('•••• 1234');
  await expect(dialog).not.toContainText('010-123-1234');
  await page.route(`${url}/phone-reveal`, (route) => fulfillJson(route, {
    code: 'ACCESS_DENIED',
    message: 'private detail'
  }, 403));
  await dialog.getByRole('button', {
    name: '전체 번호 보기'
  }).click();
  await expect(dialog.getByRole('alert')).toContainText('관리소장 권한');
  await expect(dialog).not.toContainText('private detail');
  await dialog.getByRole('button', {
    name: '주민 상세 닫기'
  }).click();
  await page.route(url, (route) => fulfillJson(route, {
    ...detail,
    phoneLast4: '0101231234',
    phone: '+82101231234'
  }));
  await page.getByRole('button', {
    name: '김민수 상세 보기'
  }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('처리 결과를 확인하지 못했어요');
  await expect(page.getByRole('dialog')).not.toContainText('0101231234');
  await expect(page.getByRole('dialog')).not.toContainText('+82101231234');
});


for (const width of [1440, 320]) {
  test(`주민 목록 ${width}px는 동·호수의 숫자 순으로 페이지를 나누고 소유주 표시와 필터를 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const data = residentDirectory();
    const secondBuilding = '22222222-2222-4222-8222-000000000102';
    const locations = [
      [BUILDING_ID, '301'], [secondBuilding, '202'], [secondBuilding, '201'],
      [BUILDING_ID, '2'], [secondBuilding, '10'], [secondBuilding, '2'],
      [secondBuilding, '101'], [BUILDING_ID, '10'], [secondBuilding, '201'],
      [secondBuilding, '201'], [BUILDING_ID, '301'], [null, null]
    ];
    await page.route(RESIDENTS_URL, (route) => fulfillJson(route, {
      ...data,
      buildings: [...data.buildings, {
        id: secondBuilding,
        name: '102동'
      }],
      residents: data.residents.map((row, index) => ({
        ...row,
        buildingId: locations[index][0],
        unitId: locations[index][1] ? row.unitId : null,
        unitNumber: locations[index][1],
        relationType: locations[index][1] ? 'OWNER' : null,
        representative: false
      }))
    }));
    await page.goto(RESIDENTS);
    const main = page.getByRole('main');
    const names = () => main.getByRole('rowheader').allTextContents();
    await expect.poll(names).toEqual(['주민 06', '주민 05', '주민 07', '주민 03', '주민 09', '주민 10', '주민 02', '주민 04', '주민 08', '김민수']);
    await expect(main.getByRole('row').nth(1)).toContainText('102동 2호');
    await expect(main.getByRole('row').nth(1)).toContainText('소유주');
    await expect(main).not.toContainText('소유자');
    await main.getByRole('button', {
      name: '다음 페이지',
      exact: true
    }).click();
    await expect.poll(names).toEqual(['주민 11', '주민 12']);
    await main.getByRole('combobox', {
      name: '동 필터',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '103동',
      exact: true
    }).click();
    await expect.poll(names).toEqual(['주민 04', '주민 08', '김민수', '주민 11']);
    await main.getByRole('combobox', {
      name: '주민 구분 필터',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '소유주',
      exact: true
    }).click();
    await expect.poll(names).toEqual(['주민 04', '주민 08', '김민수', '주민 11']);
  });
}

for (const width of [1440, 375, 320]) {
  test(`세대 주민 요약 ${width}px는 실제 대표·가입 인원과 빈 세대를 목록·상세에 표시`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 960
    });
    const occupiedId = '55555555-5555-4555-8555-000000000001';
    const emptyId = '55555555-5555-4555-8555-000000000002';
    await page.route(UNITS_URL, (route) => fulfillJson(route, {
      propertyId: PROPERTY_ID,
      hasBuildings: false,
      buildings: [],
      units: [occupiedId, emptyId].map((id, index) => ({
        id,
        buildingId: null,
        unitNumber: String(301 + index),
        displayName: null,
        floor: 3,
        status: 'ACTIVE'
      })),
      residentSummaries: {
        [occupiedId]: {
          representativeName: '대표 주민 예시',
          total: 3,
          approved: 1,
          pending: 1,
          notJoined: 1
        },
        [emptyId]: {
          representativeName: null,
          total: 0,
          approved: 0,
          pending: 0,
          notJoined: 0
        }
      }
    }));
    await page.goto(HOUSEHOLDS);
    const table = page.getByRole('table', {
      name: '세대 목록'
    });
    const occupied = table.getByRole('row').filter({
      hasText: '301호'
    });
    await expect(occupied).toContainText('대표 주민 예시');
    await expect(occupied).toContainText('1/3 명');
    await expect(table.getByRole('row').filter({
      hasText: '302호'
    })).toContainText('0/0 명');
    await expect(page.getByRole('combobox', {
      name: '페이지당 세대 수',
      exact: true
    })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`unitResidents${width}.png`),
      fullPage: true
    });
    await occupied.getByRole('button', {
      name: '301호 상세 보기',
      exact: true
    }).click();
    const detail = width >= 768 ? page.getByRole('dialog') : page.getByRole('main');
    await expect(detail.getByText('대표 주민 예시', {
      exact: true
    })).toBeVisible();
    await expect(detail.getByText('1/3 명', {
      exact: true
    })).toBeVisible();
    if (width < 768) {
      await expect(page).toHaveURL(`${HOUSEHOLDS}/${occupiedId}`);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
}

test('세대 주민 요약의 누락·잘못된 합계는 0명으로 표시하지 않고 오류로 처리', async ({ page }) => {
  const unitId = '55555555-5555-4555-8555-000000000001';
  let invalid: unknown = {};
  await page.route(UNITS_URL, (route) => fulfillJson(route, {
    propertyId: PROPERTY_ID,
    hasBuildings: false,
    buildings: [],
    units: [{
      id: unitId,
      buildingId: null,
      unitNumber: '301',
      displayName: null,
      floor: 3,
      status: 'ACTIVE'
    }],
    residentSummaries: invalid
  }));
  await page.goto(HOUSEHOLDS);
  await expect(page.getByRole('alert')).toContainText('세대 주민 정보를 확인할 수 없습니다.');
  invalid = {
    [unitId]: {
      representativeName: '예시',
      total: 1,
      approved: 1,
      pending: 1,
      notJoined: 0
    }
  };
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('alert')).toContainText('세대 주민 정보를 확인할 수 없습니다.');
  invalid = null;
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '세대 목록'
  })).toBeVisible();
  await expect(page.getByText('0/0 명', {
    exact: true
  })).toHaveCount(0);
});

for (const width of [375, 320]) {
  test(`모바일 동 관리·자동 입력 ${width}px는 페이지와 헤더 뒤로가기를 사용하고 수정·실패 재시도를 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 960
    });
    const buildings = [{
      id: BUILDING_ID,
      name: '101동'
    }];
    const units: { id: string; buildingId: string; unitNumber: string; displayName: null; floor: number; status: string }[] = [];
    let failBatch = true;
    await page.route(UNITS_URL, (route) => fulfillJson(route, {
      propertyId: PROPERTY_ID,
      hasBuildings: true,
      buildings,
      units
    }));
    await page.route(`${API_ORIGIN}/api/properties/${PROPERTY_ID}/buildings/${BUILDING_ID}`, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      expect(route.request().method()).toBe('PUT');
      buildings[0].name = route.request().postDataJSON().name;
      return fulfillJson(route, buildings[0]);
    });
    await page.route(`${UNITS_URL}/batch`, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      if (failBatch) return fulfillJson(route, {
        code: 'UNIT_SERVICE_UNAVAILABLE'
      }, 503);
      const payload = route.request().postDataJSON();
      expect(payload.units).toHaveLength(1);
      const entry = {
        ...payload.units[0],
        id: '55555555-5555-4555-8555-000000000001'
      };
      units.push(entry);
      return fulfillJson(route, [entry], 201);
    });
    await page.goto(HOUSEHOLDS);
    const main = page.getByRole('main');
    const back = page.getByRole('banner').getByRole('link', {
      name: '세대 목록으로 돌아가기'
    });
    await main.getByRole('button', {
      name: '동 관리',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${HOUSEHOLDS}/buildings`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(back).toBeVisible();
    await page.reload();
    await expect(main.getByRole('heading', {
      name: '동 관리',
      exact: true
    })).toBeVisible();
    await expect(main.getByRole('button', {
      name: '101동 삭제',
      exact: true
    })).toHaveCount(0);
    const edit = main.getByRole('button', {
      name: '101동 수정',
      exact: true
    });
    await expect(edit).toHaveText('');
    await expect(edit.locator('svg')).toHaveCount(1);
    await edit.click();
    await main.getByRole('textbox', {
      name: '동 이름',
      exact: true
    }).fill('102');
    await main.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await expect(main.getByText('102동', {
      exact: true
    })).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(HOUSEHOLDS);
    await main.getByRole('button', {
      name: '세대 자동 입력',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${HOUSEHOLDS}/automatic`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(back).toBeVisible();
    await page.reload();
    await main.getByRole('spinbutton', {
      name: '시작 층',
      exact: true
    }).fill('2');
    await main.getByRole('spinbutton', {
      name: '마지막 층',
      exact: true
    }).fill('2');
    await main.getByRole('spinbutton', {
      name: '층당 세대 수',
      exact: true
    }).fill('1');
    await expect(main.getByRole('table', {
      name: '생성될 세대 미리보기'
    })).toContainText('201호');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`unitAutomaticPage${width}.png`),
      fullPage: true
    });
    await main.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    await expect(main.getByRole('alert')).toBeVisible();
    await expect(main.getByRole('spinbutton', {
      name: '시작 층',
      exact: true
    })).toHaveValue('2');
    failBatch = false;
    await main.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    await expect(page).toHaveURL(HOUSEHOLDS);
    await expect(main.getByRole('table', {
      name: '세대 목록'
    })).toContainText('201호');
    await page.goto(`${HOUSEHOLDS}/automatic`);
    await back.click();
    await expect(page).toHaveURL(HOUSEHOLDS);
  });
}
