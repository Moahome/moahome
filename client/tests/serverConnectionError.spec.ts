import {
  expect,
  test,
  type Route
} from '@playwright/test';

const API = 'http://localhost:8080';
const PROPERTY = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(body)
  });
}

for (const width of [1440, 390, 320]) {
  for (const failure of ['network', '503']) {
    test(`연결 오류 ${failure} ${width}px는 캐릭터·안내를 표시하고 재시도에서 실패한 조회만 실행`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      let reads = 0;
      let writes = 0;
      let documentRequests = 0;
      page.on('request', (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
      });
      await page.route(`${API}/**`, async (route) => {
        if (route.request().method() === 'OPTIONS') return json(route, {});
        if (route.request().method() !== 'GET') writes++;
        expect(new URL(route.request().url()).pathname).toBe('/api/auth/web/csrf');
        reads++;
        if (reads > 1) return json(route, {
          code: 'AUTHENTICATION_REQUIRED'
        }, 401);
        if (failure === 'network') return route.abort('connectionrefused');
        return json(route, {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'internal details must not be shown'
        }, 503);
      });
      await page.goto('/login');
      const error = page.getByRole('alert', {
        name: '서버에 연결하지 못했어요'
      });
      await expect(error).toBeVisible();
      const illustration = error.locator('img');
      await expect(illustration).toHaveAttribute('src', failure === 'network' ? /networkError/ : /serverError/);
      await expect.poll(() => illustration.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
      await expect(error).not.toContainText('입력하신 내용');
      await expect(error).not.toContainText('internal details');
      await expect(page.getByRole('button', {
        name: '카카오로 시작하기'
      })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(reads).toBe(1);
      await page.screenshot({
        path: testInfo.outputPath(`connectionError-${failure}-${width}.png`),
        fullPage: true,
        animations: 'disabled'
      });
      await page.getByRole('button', {
        name: '다시 시도',
        exact: true
      }).click();
      await expect(page.getByRole('button', {
        name: '카카오로 시작하기'
      })).toBeVisible();
      expect(reads).toBe(2);
      expect(writes).toBe(0);
      expect(documentRequests).toBe(1);
    });
  }
}

test('관리 권한 조회 장애는 재시도로 같은 대상을 열고 토큰 재발급·페이지 새로고침을 반복하지 않음', async ({ page }) => {
  let contextReads = 0;
  let refreshes = 0;
  let users = 0;
  let navigation = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigation++;
  });
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return json(route, {});
    if (path.endsWith('/csrf')) return json(route, {
      csrfToken: 'test-csrf'
    });
    if (path.endsWith('/refresh')) {
      refreshes++;
      return json(route, {
        accessToken: 'test-access',
        tokenType: 'Bearer',
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
      });
    }
    if (path === '/api/users/me') {
      users++;
      return json(route, {
        id: '00000000-0000-4000-8000-000000000001',
        displayName: '관리자',
        profileImageUrl: null,
        systemRole: 'USER',
        status: 'ACTIVE'
      });
    }
    if (path.endsWith('/management-context')) {
      contextReads++;
      return contextReads === 1 ? json(route, {
        code: 'SERVICE_UNAVAILABLE'
      }, 503) : json(route, {
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'ADMIN'
      });
    }
    throw new Error(`Unexpected API ${path}`);
  });
  await page.goto(`/manage/${PROPERTY}/dashboard`);
  await expect(page.getByRole('alert', {
    name: '서버에 연결하지 못했어요'
  })).toBeVisible();
  await expect(page.getByRole('navigation', {
    name: '관리 메뉴'
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('main')).toContainText('새로운 기능을 준비하고 있어요!');
  expect(contextReads).toBe(2);
  expect(refreshes).toBe(1);
  expect(users).toBe(1);
  expect(navigation).toBe(1);
});

for (const endpoint of ['banking/workspace', 'payments/workspace', 'residents']) {
  for (const status of [403, 404, 503] as const) {
    test(`${endpoint} ${status} 조회 실패는 권한·서버 안내를 구분하고 현재 조회만 재시도한다`, async ({ page }) => {
      let failed = true;
      let reads = 0;
      const ledger = {
        propertyId: PROPERTY,
        asOf: '2026-10-24',
        accounts: [],
        units: [],
        charges: [],
        payments: []
      };
      const bank = {
        propertyId: PROPERTY,
        asOf: '2026-10-24',
        accounts: [],
        buildings: [],
        units: [],
        rows: [],
        rules: []
      };
      const residents = {
        propertyId: PROPERTY,
        hasBuildings: false,
        buildings: [],
        residents: []
      };
      await page.route(`${API}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === 'OPTIONS') return json(route, {});
        if (path.endsWith('/csrf')) return json(route, {
          csrfToken: 'test-csrf'
        });
        if (path.endsWith('/refresh')) return json(route, {
          accessToken: 'test-access',
          tokenType: 'Bearer',
          accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
        });
        if (path === '/api/users/me') return json(route, {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: '부담당자',
          profileImageUrl: null,
          systemRole: 'USER',
          status: 'ACTIVE'
        });
        if (path.endsWith('/management-context')) return json(route, {
          propertyId: PROPERTY,
          name: '모아빌라',
          role: 'MANAGER'
        });
        if (path.endsWith('/managed-properties')) return json(route, {
          properties: [{
            propertyId: PROPERTY,
            name: '모아빌라',
            role: 'MANAGER'
          }]
        });
        if (path.endsWith(`/${endpoint}`)) {
          reads++;
          if (failed) return json(route, {
            code: ({
              403: 'ACCESS_DENIED',
              404: 'NOT_FOUND',
              503: 'SERVICE_UNAVAILABLE'
            })[status],
            message: 'private internal details'
          }, status);
        }
        if (path.endsWith('/payments/workspace')) return json(route, ledger);
        if (path.endsWith('/banking/workspace')) return json(route, bank);
        if (path.endsWith('/residents')) return json(route, residents);
        throw new Error(`Unexpected API ${path}`);
      });
      const path = endpoint === 'residents' ? 'residents' : endpoint.startsWith('banking') ? 'banking/transactions' : 'payments/matching';
      await page.goto(`/manage/${PROPERTY}/${path}`);
      const error = page.getByRole('alert', {
        name: ({
          403: '접근 권한을 확인해주세요',
          404: '요청한 정보를 찾을 수 없어요',
          503: '서버에 연결하지 못했어요'
        })[status]
      });
      await expect(error).toBeVisible();
      const expectedImage = ({
        403: /forbidden/,
        404: /notFound/,
        503: /serverError/
      })[status];
      await expect(error.locator('img')).toHaveAttribute('src', expectedImage);
      await expect(error).not.toContainText('private internal details');
      await expect(error).not.toContainText('관리소장만');
      expect(reads).toBe(1);
      failed = false;
      await error.getByRole('button', {
        name: '다시 시도',
        exact: true
      }).click();
      await expect(error).toHaveCount(0);
      expect(reads).toBe(2);
    });
  }
}
