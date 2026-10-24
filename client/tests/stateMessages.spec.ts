import {
  expect,
  test,
  type Route
} from '@playwright/test';

const API = 'http://localhost:8080';
const PROPERTY = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const BASE = `/manage/${PROPERTY}`;

/** 상태 표시 검증은 실제 인증·저장소 없이 조회 결과만 모의 처리합니다. */
async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

if (process.env.MOAHOME_MAINTENANCE_MODE === 'true') {
  test('명시적 서비스 점검은 공개·업무 주소에서 점검 그림을 표시하고 세션·업무 API를 호출하지 않음', async ({ page }) => {
    const requests: string[] = [];
    await page.route(`${API}/**`, async (route) => {
      requests.push(route.request().url());
      await route.abort();
    });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      for (const path of ['/login', `${BASE}/residents`]) {
        await page.goto(path);
        const state = page.getByRole('status', {
          name: '더 안정적인 서비스를 위해 점검하고 있어요.'
        });
        await expect(state).toBeVisible();
        await expect(state.locator('img')).toHaveAttribute('src', /maintenance/);
        await expect(page.getByRole('button', {
          name: '카카오로 시작하기'
        })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
    expect(requests).toEqual([]);
  });
} else {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'OPTIONS') return json(route, {});
      if (path.endsWith('/csrf')) return json(route, {
        csrfToken: 'test-csrf'
      });
      if (path.endsWith('/refresh')) return json(route, {
        accessToken: 'test-access',
        tokenType: 'Bearer',
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      if (path === '/api/users/me') return json(route, {
        id: '00000000-0000-4000-8000-000000000001',
        displayName: '상태 관리자',
        profileImageUrl: null,
        systemRole: 'USER',
        status: 'ACTIVE',
      });
      const property = {
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'MANAGER'
      };
      if (path.endsWith('/management-context')) return json(route, property);
      if (path.endsWith('/managed-properties')) return json(route, {
        properties: [property]
      });
      if (path.endsWith('/units')) return json(route, {
        propertyId: PROPERTY,
        hasBuildings: false,
        buildings: [],
        units: [],
        residentSummaries: null,
      });
      if (path.endsWith('/residents')) return json(route, {
        propertyId: PROPERTY,
        hasBuildings: false,
        buildings: [],
        residents: [],
      });
      if (path.endsWith('/payments/workspace')) return json(route, {
        propertyId: PROPERTY,
        asOf: '2026-10-24',
        accounts: [],
        units: [],
        charges: [],
        payments: [],
      });
      if (path.endsWith('/banking/workspace')) return json(route, {
        propertyId: PROPERTY,
        asOf: '2026-10-24',
        accounts: [],
        buildings: [],
        units: [],
        rows: [],
        rules: [],
      });
      throw new Error(`Unexpected API ${path}`);
    });
  });

  test('과거 월에 거래가 있으면 현재 월의 빈 목록을 미등록 상태로 안내하지 않음', async ({ page }) => {
    await page.route(`${API}/api/properties/${PROPERTY}/banking/workspace`, (route) => json(route, {
      propertyId: PROPERTY,
      asOf: '2026-10-24',
      accounts: [],
      buildings: [],
      units: [],
      rules: [],
      rows: [{
        id: '00000000-0000-4000-8000-000000000010',
        accountId: '00000000-0000-4000-8000-000000000011',
        date: '2026-09-15',
        time: null,
        payer: '과거 거래',
        memo: null,
        amount: '1000',
        balance: '1000',
        direction: 'INCOME',
        paymentId: null,
        ruleKey: null,
        status: 'PENDING',
        unitId: '',
        unitLabel: '',
        expense: null,
      }],
    }));
    await page.goto(`${BASE}/banking/transactions`);
    await expect(page.getByRole('status', {
      name: '조건에 맞는 검색 결과가 없어요.'
    })).toBeVisible();
    await expect(page.getByRole('heading', {
      name: '아직 등록된 거래가 없어요.'
    })).toHaveCount(0);
  });

  test('파일 검증 로딩은 중복 업로드를 막고 성공 응답 후 미리보기로 전환', async ({ page }, testInfo) => {
    await page.setViewportSize({
      width: 320,
      height: 900
    });
    const accountId = '00000000-0000-4000-8000-000000000011';
    await page.route(`${API}/api/properties/${PROPERTY}/banking/workspace`, (route) => json(route, {
      propertyId: PROPERTY,
      asOf: '2026-10-24',
      accounts: [{
        id: accountId,
        bankName: '하나은행',
        bankCode: '081',
        last4: '1234',
        alias: null,
        isPrimary: true,
        status: 'ACTIVE',
        importSupport: {
          enabled: true,
          extensions: ['.xls', '.xlsx', '.csv'],
          message: '지원 형식: .xls · .xlsx · .csv'
        },
      }],
      buildings: [],
      units: [],
      rows: [],
      rules: [],
    }));
    let finish!: () => void;
    let previews = 0;
    const responseReady = new Promise<void>((resolve) => { finish = resolve; });
    await page.route(`${API}/api/properties/${PROPERTY}/banking/import/preview`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      previews++;
      await responseReady;
      await json(route, {
        propertyId: PROPERTY,
        rows: [],
        duplicateCount: 0,
        beforeCutoffCount: 0
      });
    });
    await page.goto(`${BASE}/banking/upload`);
    const zone = page.getByRole('region', {
      name: '통장 거래 파일 업로드'
    });
    const file = page.getByLabel('통장 거래 파일 선택');
    await expect(file).toBeEnabled();
    await file.setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('test')
    });
    await expect(zone).toHaveAttribute('aria-busy', 'true');
    await expect(file).toBeDisabled();
    await expect(zone.getByRole('button')).toBeDisabled();
    await expect(zone.locator('img[data-state="loading"]')).toBeVisible();
    await expect(zone.locator('img[data-state="file-upload"]')).toHaveCount(0);
    await expect(zone).toHaveCSS('border-style', 'solid');
    await expect(zone).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(zone.getByText('엑셀 파일을 여기에 놓거나 파일을 선택해주세요.')).toHaveCount(0);
    await zone.evaluate((element) => {
      const data = new DataTransfer();
      data.items.add(new File(['test'], 'duplicate.csv', {
        type: 'text/csv'
      }));
      element.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: data
      }));
    });
    await page.screenshot({
      path: testInfo.outputPath('uploadLoading-320.png'),
      fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    finish();
    await expect(page.getByRole('heading', {
      name: '업로드 미리보기',
      exact: true
    })).toBeVisible();
    await expect(page.locator('img[data-state="loading"]')).toHaveCount(0);
    expect(previews).toBe(1);
  });

  for (const width of [1440, 390, 320]) {
    test(`메뉴 로딩 통일 ${width}px는 조회 중 큰 캐릭터·흰 배경을 표시하고 추가 테두리 없이 실패 상태로 전환`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 1000
      });
      let finish = () => {};
      let responseReady = Promise.resolve();
      let paymentPending = false;
      await page.route(`${API}/api/properties/${PROPERTY}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() !== 'GET' || path.endsWith('/management-context')) return route.fallback();
        if (!paymentPending && path.endsWith('/payments/workspace')) return route.fallback();
        await responseReady;
        await route.abort('failed');
      });
      for (const [path, title] of [
        ['households', '세대 목록을 불러오고 있어요.'],
        ['residents', '주민 목록을 불러오고 있어요.'],
        ['join-requests', '미연결 주민을 불러오고 있어요.'],
        ['invitations', '가입 요청을 불러오고 있어요.'],
        ['billing/monthly', '관리비 정보를 불러오고 있어요.'],
        ['payments/matching', '입금 정보를 불러오고 있어요.'],
        ['payments/monthly', '입금 정보를 불러오고 있어요.'],
        ['banking/transactions', '통장 정보를 불러오고 있어요.'],
        ['banking/expenses', '통장 정보를 불러오고 있어요.'],
        ['banking/balances', '잔고를 불러오고 있어요.'],
        ['closing/monthly', '월별 정산 자료를 불러오고 있어요.'],
      ]) {
        paymentPending = path.startsWith('payments/');
        responseReady = new Promise<void>((resolve) => { finish = resolve; });
        await page.goto(`${BASE}/${path}`);
        const loading = page.getByRole('status', {
          name: title,
          exact: true
        }).first();
        const image = loading.locator('img[data-state="loading"]');
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
        await expect(loading).toHaveCSS('border-width', '0px');
        const surface = loading.locator('..');
        await expect(surface).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(surface).toHaveCSS('border-width', '0px');
        const bounds = await image.boundingBox();
        expect(bounds?.width).toBeGreaterThan(width >= 1000 ? 390 : 150);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`loading-${path.replaceAll('/', '-')}-${width}.png`),
          fullPage: true
        });
        finish();
        await expect(page.getByRole('main').getByRole('alert').first()).toBeVisible();
        await expect(page.locator('img[data-state="loading"]')).toHaveCount(0);
      }
    });

    test(`로딩 안내 ${width}px는 짧은 회전 표시 뒤 캐릭터를 보여주고 조회 완료 시 빈 목록으로 전환`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      let finish!: () => void;
      const responseReady = new Promise<void>((resolve) => { finish = resolve; });
      await page.route(`${API}/api/properties/${PROPERTY}/units`, async (route) => {
        await responseReady;
        await route.fallback();
      });
      await page.goto(`${BASE}/households`);
      const loading = page.getByRole('status', {
        name: '세대 목록을 불러오고 있어요.'
      });
      await expect(loading).toBeVisible();
      await expect(page.locator('img[data-state="loading"]')).toHaveCount(0);
      const image = loading.locator('img[data-state="loading"]');
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
      await expect(image).not.toHaveCSS('animation-name', 'none');
      await expect(loading.locator('span[aria-hidden="true"]')).not.toHaveCSS('animation-name', 'none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`loading-${width}.png`),
        fullPage: true
      });
      await page.emulateMedia({
        reducedMotion: 'reduce'
      });
      await expect(image).toHaveCSS('animation-name', 'none');
      await expect(loading.locator('span[aria-hidden="true"]')).toHaveCSS('animation-name', 'none');
      finish();
      await expect(page.locator('section[data-state="empty-data"]')).toBeVisible();
      await expect(loading).toHaveCount(0);
      await expect(page.locator('img[data-state="loading"]')).toHaveCount(0);
    });

    test(`404 안내 ${width}px는 잘못된 URL에 지도 그림과 홈 링크를 제공`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      const response = await page.goto('/missing-page-for-status-test');
      expect(response?.status()).toBe(404);
      const state = page.getByRole('status', {
        name: '찾으시는 페이지가 없어요.'
      });
      await expect(state).toBeVisible();
      await expect(state.locator('img')).toHaveAttribute('src', /notFound/);
      await expect(state.getByRole('link', {
        name: '홈으로 돌아가기'
      })).toHaveAttribute('href', '/');
      await expect(state.getByRole('link', {
        name: '홈으로 돌아가기'
      })).toHaveCSS('color', 'rgb(37, 99, 235)');
      await expect(state.getByRole('link', {
        name: '홈으로 돌아가기'
      })).toHaveCSS('text-decoration-line', 'underline');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`notFound-${width}.png`),
        fullPage: true
      });
    });

    test(`로그인 필요 ${width}px는 초대 정보를 조회하지 않고 기존 로그인·재확인 동작을 표시`, async ({ page }) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      let invitationReads = 0;
      page.on('request', (request) => {
        if (request.url().startsWith(`${API}/api/resident-invitations/`)) invitationReads++;
      });
      await page.route(`${API}/api/auth/web/csrf`, (route) => json(route, {
        code: 'AUTHENTICATION_REQUIRED'
      }, 401));
      await page.goto('/invitations#R-ABCD-EFGH-JKLM');
      const state = page.getByRole('status', {
        name: '로그인이 필요한 서비스예요.'
      });
      await expect(state).toBeVisible();
      await expect(state.locator('img')).toHaveAttribute('src', /loginRequired/);
      const login = state.getByRole('link', {
        name: '카카오 로그인'
      });
      await expect(login).toHaveAttribute('href', '/login');
      await expect(login).toHaveAttribute('target', '_blank');
      await expect(state.getByRole('button', {
        name: '로그인 확인'
      })).toBeVisible();
      expect(invitationReads).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test(`업로드 안내 ${width}px는 파일 선택 전 그림을 표시하고 지원 통장 확인을 우회하지 않음`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      await page.goto(`${BASE}/banking/upload`);
      const zone = page.getByRole('region', {
        name: '통장 거래 파일 업로드'
      });
      await expect(zone.locator('img')).toHaveAttribute('src', /fileUpload/);
      await expect(zone.getByRole('button', {
        name: '파일 선택'
      })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`fileUpload-${width}.png`),
        fullPage: true
      });
    });

    test(`빈 목록·검색 결과 없음 ${width}px는 그림을 구분하고 조건을 유지하며 불필요한 재조회·저장 없음`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      for (const [path, searchLabel] of [
        ['households', '세대 검색'],
        ['residents', '주민 검색'],
        ['banking/transactions', '거래 검색'],
      ]) {
        let reads = 0;
        let writes = 0;
        const onRequest = (request: import('@playwright/test').Request) => {
          if (!request.url().startsWith(`${API}/api/properties/`)) return;
          if (request.method() === 'GET') reads++;
          else if (request.method() !== 'OPTIONS') writes++;
        };
        page.on('request', onRequest);
        await page.goto(`${BASE}/${path}`);
        const empty = page.locator('section[data-state="empty-data"]');
        await expect(empty).toBeVisible();
        await expect(empty.locator('img')).toHaveAttribute('src', /emptyData/);
        await expect.poll(() => empty.locator('img').evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
        const baselineReads = reads;
        const search = page.getByRole('textbox', {
          name: searchLabel
        });
        await search.fill('없는검색어');
        const results = page.locator('section[data-state="no-results"]');
        await expect(results).toBeVisible();
        await expect(results.locator('img')).toHaveAttribute('src', /noResults/);
        await expect(search).toHaveValue('없는검색어');
        await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (path === 'residents') await page.screenshot({
          path: testInfo.outputPath(`noResults-${width}.png`),
          fullPage: true
        });
        await search.fill('');
        await expect(empty).toBeVisible();
        expect(reads).toBe(baselineReads);
        expect(writes).toBe(0);
        page.off('request', onRequest);
      }
    });

    test(`준비 중 메뉴 ${width}px는 대시보드·공지·차량 안내에 연결되고 모바일 메뉴를 닫음`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      await page.goto(`${BASE}/dashboard`);
      await expect(page.getByRole('heading', {
        name: '새로운 기능을 준비하고 있어요!'
      })).toBeVisible();
      for (const [label, path] of [['공지사항', 'notices'], ['차량 내역', 'vehicles'], ['차량 승인', 'vehicles/approvals']]) {
        if (width < 768) await page.getByRole('button', {
          name: '상태 관리자님 메뉴 열기'
        }).click();
        const navigation = page.getByRole('navigation', {
          name: '관리 메뉴',
          exact: true
        });
        if (label.startsWith('차량') && !(await navigation.getByRole('link', {
          name: new RegExp(label)
        }).isVisible())) {
          await navigation.getByRole('button', {
            name: '차량 관리',
            exact: true
          }).click();
        }
        await navigation.getByRole('link', {
          name: new RegExp(label)
        }).click();
        await expect(page).toHaveURL(`${BASE}/${path}`);
        await expect(page.getByRole('heading', {
          level: 1,
          name: label,
          exact: true
        })).toBeVisible();
        const state = page.getByRole('status', {
          name: '새로운 기능을 준비하고 있어요!'
        });
        await expect(state.locator('img')).toHaveAttribute('src', /comingSoon/);
        if (width < 768) await expect(navigation).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await page.screenshot({
        path: testInfo.outputPath(`comingSoon-${width}.png`),
        fullPage: true
      });
    });
  }
}
