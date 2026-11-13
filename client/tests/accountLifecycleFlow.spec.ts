import {
  expect,
  test,
  type Page
} from '@playwright/test';

const USER_ID = '00000000-0000-4000-8000-000000000099';
const PROPERTY_ID = '00000000-0000-4000-8000-000000000088';

/** 실제 계정·세션을 건드리지 않고 탈퇴·재인증·복구 상태의 HTTP 계약만 모의 처리합니다. */
async function mockLifecycle(page: Page, recovery = false, account?: { withdrawn: boolean }) {
  const state = {
    loggedOut: false,
    recovery,
    blocked: false,
    failed: false,
    withdrawals: 0,
    recoveries: 0,
    refreshes: 0,
    csrfReads: 0,
    userReads: 0,
    sessionUnavailable: false
  };
  await page.route('http://localhost:8080/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let body: unknown = {};
    let status = 200;
    if (method === 'OPTIONS') body = {};
    else if (path === '/api/auth/web/csrf') {
      state.csrfReads++;
      body = state.loggedOut || account?.withdrawn ? {
        code: 'SESSION_EXPIRED'
      } : {
        csrfToken: 'test-csrf'
      };
      if (state.loggedOut || account?.withdrawn) status = 401;
    } else if (path === '/api/auth/web/refresh') {
      state.refreshes++;
      body = state.recovery ? {
        code: 'ACCOUNT_RECOVERY_REQUIRED'
      } : {
        accessToken: 'test-access',
        tokenType: 'Bearer',
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
      };
      if (state.recovery) status = 403;
    } else if (path === '/api/auth/web/account-recovery') {
      expect(request.headers().authorization).toBeUndefined();
      if (method === 'GET') {
        body = {
          state: 'PENDING',
          displayName: '복구 회원',
          csrfToken: 'test-recovery-csrf',
          requestedAt: new Date(Date.now() - 86400000).toISOString(),
          recoverableUntil: new Date(Date.now() + 29 * 86400000).toISOString()
        };
      } else {
        expect(request.headers()['x-csrf-token']).toBe('test-recovery-csrf');
        state.recoveries++;
        if (state.failed) { status = 503; body = {
          code: 'AUTH_SERVICE_UNAVAILABLE'
        }; }
        else { state.recovery = false; status = 204; }
      }
    } else if (path === '/api/users/me/withdrawal') {
      expect(request.headers().authorization).toBe('Bearer test-access');
      if (method === 'GET') body = {
        userId: USER_ID,
        canWithdraw: !state.blocked,
        managedProperties: state.blocked ? [{
          id: PROPERTY_ID,
          name: '인계할 빌라'
        }] : []
      };
      else {
        expect(request.postDataJSON()).toEqual({
          confirmed: true
        });
        state.withdrawals++;
        if (state.blocked) { status = 409; body = {
          code: 'ACCOUNT_HANDOVER_REQUIRED'
        }; }
        else if (state.failed) { status = 503; body = {
          code: 'AUTH_SERVICE_UNAVAILABLE'
        }; }
        else {
          state.loggedOut = true;
          if (account) account.withdrawn = true;
          body = {
            requestedAt: new Date().toISOString(),
            recoverableUntil: new Date(Date.now() + 30 * 86400000).toISOString()
          };
        }
      }
    } else if (path === '/api/users/me') {
      state.userReads++;
      expect(request.headers().authorization).toBe('Bearer test-access');
      if (state.loggedOut || account?.withdrawn) {
        status = 403;
        body = {
          code: 'ACCOUNT_UNAVAILABLE'
        };
      } else if (state.sessionUnavailable) {
        status = 503;
        body = {
          code: 'AUTH_SERVICE_UNAVAILABLE'
        };
      } else body = {
        id: USER_ID,
        displayName: '복구 회원',
        profileImageUrl: null,
        systemRole: 'USER',
        status: 'ACTIVE',
        canCreateProperty: false
      };
    } else if (path.endsWith('/managed-properties') || path.endsWith('/resident-properties')) body = {
      properties: []
    };
    else throw new Error(`Unexpected API ${method} ${path}`);
    await route.fulfill({
      status,
      contentType: status === 204 ? undefined : 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-CSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Cache-Control': 'no-store'
      },
      body: status === 204 ? undefined : JSON.stringify(body)
    });
  });
  return state;
}

test('모바일 탈퇴 카드는 짧은 안내와 카드 너비를 채우는 버튼을 표시하고 취소하면 신청하지 않는다', async ({ page }) => {
  const state = await mockLifecycle(page);
  await page.setViewportSize({
    width: 320,
    height: 740
  });
  await page.goto('/account');
  const section = page.getByRole('region', {
    name: '회원 탈퇴',
    exact: true
  });
  await expect(section.getByText('탈퇴 후 30일간 복구할 수 있어요.', {
    exact: true
  })).toBeVisible();
  const button = section.getByRole('button', {
    name: '탈퇴하기',
    exact: true
  });
  const width = await button.evaluate((element) => ({
    button: element.getBoundingClientRect().width,
    card: element.parentElement!.getBoundingClientRect().width
  }));
  expect(Math.abs(width.button - width.card)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await button.click();
  const dialog = page.getByRole('dialog', {
    name: '회원 탈퇴',
    exact: true
  });
  await expect(dialog.getByRole('button', {
    name: '탈퇴 신청',
    exact: true
  })).toBeEnabled();
  await expect(dialog).toContainText('30일');
  await dialog.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  expect(state.withdrawals).toBe(0);
  await expect(page).toHaveURL('/account');
});

test('사전 확인 뒤 관리소장이 되면 서버가 신청을 거부하고 인계할 곳을 다시 안내한다', async ({ page }) => {
  const state = await mockLifecycle(page);
  await page.goto('/account');
  await page.getByRole('button', {
    name: '탈퇴하기',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '회원 탈퇴',
    exact: true
  });
  await expect(dialog.getByRole('button', {
    name: '탈퇴 신청',
    exact: true
  })).toBeEnabled();
  state.blocked = true;
  await dialog.getByRole('button', {
    name: '탈퇴 신청',
    exact: true
  }).click();
  await expect(dialog.getByRole('link', {
    name: '인계할 빌라',
    exact: true
  })).toHaveAttribute('href', `/manage/${PROPERTY_ID}/settings`);
  await expect(dialog.getByRole('button', {
    name: '탈퇴 신청',
    exact: true
  })).toHaveCount(0);
  expect(state.loggedOut).toBe(false);
});

test('탈퇴 실패에는 로그인과 확인창을 유지하고 성공하면 현재 탭과 다른 탭을 즉시 로그아웃한다', async ({ page, context }) => {
  const state = await mockLifecycle(page);
  const other = await context.newPage();
  const otherState = await mockLifecycle(other);
  await page.goto('/account');
  await other.goto('/account');
  await expect(other.getByRole('button', {
    name: '탈퇴하기',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '탈퇴하기',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '회원 탈퇴',
    exact: true
  });
  state.failed = true;
  await dialog.getByRole('button', {
    name: '탈퇴 신청',
    exact: true
  }).click();
  await expect(dialog.getByRole('alert')).toContainText('탈퇴 신청을 완료하지 못했어요.');
  expect(state.loggedOut).toBe(false);
  state.failed = false;
  otherState.loggedOut = true;
  await dialog.getByRole('button', {
    name: '탈퇴 신청',
    exact: true
  }).click();
  await expect(page).toHaveURL('/login?withdrawal=requested');
  await expect(other).toHaveURL('/login?withdrawal=requested');
  await expect(page.getByRole('status').filter({
    hasText: '탈퇴 신청이 완료되어 로그아웃'
  })).toBeVisible();
  await expect(page.getByText('복구 회원', {
    exact: true
  })).toHaveCount(0);
  expect(state.withdrawals).toBe(2);
  await other.close();
});

for (const trigger of ['주기 확인', '앱 복귀'] as const) {
  test(`다른 기기의 탈퇴는 별도 브라우저에서도 ${trigger}으로 로그아웃을 반영한다`, async ({ page, browser }) => {
    // 별도 Context는 쿠키·BroadcastChannel을 공유하지 않아 다른 기기의 세션을 재현합니다.
    const account = {
      withdrawn: false
    };
    await mockLifecycle(page, false, account);
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await other.clock.install();
      const otherState = await mockLifecycle(other, false, account);
      await page.goto('/account');
      await other.goto('/account');
      await expect(other.getByRole('button', {
        name: '탈퇴하기',
        exact: true
      })).toBeVisible();
      const refreshes = otherState.refreshes;
      await page.getByRole('button', {
        name: '탈퇴하기',
        exact: true
      }).click();
      await page.getByRole('dialog', {
        name: '회원 탈퇴',
        exact: true
      })
        .getByRole('button', {
          name: '탈퇴 신청',
          exact: true
        }).click();
      await expect(page).toHaveURL('/login?withdrawal=requested');
      await expect(other).toHaveURL('/account');

      if (trigger === '주기 확인') await other.clock.runFor(15_001);
      else await other.evaluate(() => window.dispatchEvent(new Event('focus')));

      await expect(other).toHaveURL('/login');
      await expect(other.getByText('복구 회원', {
        exact: true
      })).toHaveCount(0);
      // 유효한 Access를 검증하므로 탈퇴 확인 자체가 Refresh Rotation을 반복하지 않습니다.
      expect(otherState.refreshes).toBe(refreshes);
      expect(otherState.userReads).toBeGreaterThan(1);
    } finally {
      await otherContext.close();
    }
  });
}

test('기기별 세션 확인 중 저장소 장애는 로그인과 화면을 유지하고 다음 확인을 계속한다', async ({ page }) => {
  await page.clock.install();
  const state = await mockLifecycle(page);
  await page.goto('/account');
  const withdrawal = page.getByRole('button', {
    name: '탈퇴하기',
    exact: true
  });
  await expect(withdrawal).toBeVisible();
  const reads = state.userReads;
  const refreshes = state.refreshes;
  state.sessionUnavailable = true;
  await page.clock.runFor(15_001);
  await expect.poll(() => state.userReads).toBeGreaterThan(reads);
  await expect(page).toHaveURL('/account');
  await expect(withdrawal).toBeVisible();
  state.sessionUnavailable = false;
  const failedReads = state.userReads;
  await page.clock.runFor(15_001);
  await expect.poll(() => state.userReads).toBeGreaterThan(failedReads);
  await expect(withdrawal).toBeVisible();
  expect(state.refreshes).toBe(refreshes);
});

test('복구 페이지는 일반 토큰을 발급받지 않고 복구 전용 쿠키로 안내하며 실패 후 재시도한다', async ({ page }) => {
  const state = await mockLifecycle(page, true);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto('/account/recovery');
  await expect(page.getByRole('heading', {
    name: '계정을 복구할까요?',
    exact: true
  })).toBeVisible();
  expect(state.csrfReads).toBe(0);
  expect(state.refreshes).toBe(0);
  const brand = await page.getByRole('link', {
    name: '모아홈 로그인',
    exact: true
  }).boundingBox();
  expect(brand!.width).toBeLessThan(180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  state.failed = true;
  await page.getByRole('button', {
    name: '계정 복구',
    exact: true
  }).click();
  await expect(page.getByRole('alert').filter({
    hasText: '계정을 복구하지 못했어요.'
  })).toBeVisible();
  await expect(page).toHaveURL('/account/recovery');
  state.failed = false;
  await page.getByRole('button', {
    name: '계정 복구',
    exact: true
  }).click();
  await expect(page).toHaveURL('/start');
  expect(state.recoveries).toBe(2);
  await expect(page.getByRole('button', {
    name: '복구 회원님 메뉴 열기',
    exact: true
  })).toBeVisible();
});

test('복구 기한이 지난 응답은 복구 버튼 없이 안내하고 로그인 수단만 제공한다', async ({ page }) => {
  await mockLifecycle(page, true);
  await page.route('http://localhost:8080/api/auth/web/account-recovery', async (route) => {
    await route.fulfill({
      status: 410,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        code: 'ACCOUNT_RECOVERY_EXPIRED'
      })
    });
  });
  await page.goto('/account/recovery');
  await expect(page.getByRole('heading', {
    name: '계정 복구 기간이 지났어요',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '계정 복구',
    exact: true
  })).toHaveCount(0);
});
