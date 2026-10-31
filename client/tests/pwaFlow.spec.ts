import {
  expect,
  test,
  type Page
} from '@playwright/test';

const API_ORIGIN = 'http://localhost:8080';
const PROPERTY_ID = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const BANNER_NAME = '모아홈 앱 설치 안내';

/** 설치 테스트는 외부 인증 서비스 없이 현재 역할에 맞는 세션과 권한 응답을 사용합니다. */
async function mockSession(page: Page, role?: 'ADMIN' | 'RESIDENT') {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    let status = 200;

    if (route.request().method() === 'OPTIONS') {
      body = {};
    } else if (!role) {
      status = 401;
      body = {
        code: 'AUTHENTICATION_REQUIRED'
      };
    } else if (path.endsWith('/csrf')) {
      body = {
        csrfToken: 'test-csrf'
      };
    } else if (path.endsWith('/refresh')) {
      body = {
        accessToken: 'test-access',
        tokenType: 'Bearer',
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    } else if (path === '/api/users/me') {
      body = {
        id: '00000000-0000-0000-0000-000000000001',
        displayName: '모아 주민',
        profileImageUrl: null,
        systemRole: 'USER',
        status: 'ACTIVE',
      };
    } else if (path.endsWith('/access-context')) {
      body = {
        propertyId: PROPERTY_ID,
        name: '모아빌라',
        role,
        residentEligible: role === 'RESIDENT',
      };
    } else if (path.endsWith('/managed-properties') || path.endsWith('/resident-properties')) {
      body = {
        properties: [],
      };
    } else {
      throw new Error(`Unexpected API: ${path}`);
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'X-CSRF-TOKEN, Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify(body),
    });
  });
}

/** 브라우저 전용 설치 이벤트를 모의해 사용자 클릭과 일회 소비·실패 처리를 검증합니다. */
async function offerInstall(page: Page, reject = false) {
  await page.evaluate((reject) => {
    const event = new Event('beforeinstallprompt', {
      cancelable: true
    });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          document.documentElement.dataset.installCalls = String(Number(document.documentElement.dataset.installCalls ?? 0) + 1);
          if (reject) throw new Error('Installation unavailable');
        },
      },
      userChoice: {
        value: Promise.resolve({
          outcome: 'dismissed',
          platform: 'web',
        }),
      },
    });
    window.dispatchEvent(event);
  }, reject);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await mockSession(page);
});

test('공개 Manifest와 PNG 아이콘은 설치 정보와 실제 해상도를 제공한다', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: '/',
    name: '모아홈',
    start_url: '/start',
    scope: '/',
    display: 'standalone',
    lang: 'ko',
  });
  for (const icon of [...manifest.icons, {
    src: '/icons/appleTouchIcon.png',
    sizes: '180x180',
  }]) {
    const imageResponse = await request.get(icon.src);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()['content-type']).toContain('image/png');
    const image = await imageResponse.body();
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const [width, height] = icon.sizes.split('x').map(Number);
    expect(image.readUInt32BE(16)).toBe(width);
    expect(image.readUInt32BE(20)).toBe(height);
  }
  const html = await (await request.get('/login')).text();
  expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
  expect(html).toContain('rel="apple-touch-icon"');
  expect(html).toContain('/icons/appleTouchIcon.png');
});

test('모바일 상단 배너는 첨부 문구·설치 버튼과 X를 제공하고 새로고침에도 숨김을 유지한다', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('complementary', {
    name: BANNER_NAME,
  });
  await expect(banner).toBeVisible();
  const bounds = await banner.boundingBox();
  expect(bounds!.y).toBeLessThan(100);
  expect(bounds!.height).toBeLessThan(180);
  const installBounds = await banner.getByRole('button', {
    name: '설치하기',
    exact: true,
  }).boundingBox();
  const textBounds = await banner.getByText('이 사이트를 앱처럼 설치하고 더 편리하게 이용하세요.').boundingBox();
  expect(installBounds!.x).toBeGreaterThanOrEqual(textBounds!.x + textBounds!.width);
  await expect(banner.locator('img')).toHaveAttribute('src', '/moahomeIcon.svg');
  for (const width of [320, 390, 600, 767]) {
    await page.setViewportSize({
      width,
      height: 844,
    });
    const popupBounds = await banner.boundingBox();
    const buttonBounds = await banner.getByRole('button', {
      name: '설치하기',
      exact: true,
    }).boundingBox();
    expect(Math.abs(buttonBounds!.y + buttonBounds!.height / 2 - popupBounds!.y - popupBounds!.height / 2)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await expect(banner.getByText('모아홈 앱으로 설치하기')).toBeVisible();
  await expect(banner.getByRole('button', {
    name: '나중에',
    exact: true,
  })).toHaveCount(0);
  // 상단 메뉴를 가리지 않아 설치 배너를 닫기 전에도 서비스 탐색을 계속할 수 있습니다.
  await page.getByRole('button', {
    name: '메뉴 열기',
    exact: true,
  }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', {
    name: '앱 설치 안내 닫기',
  }).click();
  await expect(banner).toHaveCount(0);
  await page.goto('/login');
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기',
  })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기',
  })).toBeVisible();
  await expect(banner).toHaveCount(0);
});

test('X로 닫은 배너는 1시간이 지나면 열린 화면에서 다시 나타난다', async ({ page }) => {
  await page.clock.install();
  await page.goto('/login');
  const banner = page.getByRole('complementary', {
    name: BANNER_NAME,
  });
  await expect(banner).toBeVisible();
  await page.getByRole('button', {
    name: '앱 설치 안내 닫기',
  }).click();
  await expect(banner).toHaveCount(0);
  await page.clock.fastForward(59 * 60 * 1000);
  await expect(banner).toHaveCount(0);
  await page.clock.fastForward(60 * 1000);
  await expect(banner).toBeVisible();
});

test('배너의 1시간 숨김은 같은 브라우저의 다른 탭에도 반영된다', async ({ page, context }) => {
  await page.goto('/login');
  await expect(page.getByRole('complementary', {
    name: BANNER_NAME,
  })).toBeVisible();
  const other = await context.newPage();
  await other.setViewportSize({
    width: 390,
    height: 844,
  });
  await mockSession(other);
  await other.goto('/login');
  const otherBanner = other.getByRole('complementary', {
    name: BANNER_NAME,
  });
  await expect(otherBanner).toBeVisible();
  await page.getByRole('button', {
    name: '앱 설치 안내 닫기',
  }).click();
  await expect(otherBanner).toHaveCount(0);
  await other.reload();
  await expect(other.getByRole('button', {
    name: '카카오로 시작하기',
  })).toBeVisible();
  await expect(otherBanner).toHaveCount(0);
});

test('PC에는 설치 배너를 표시하지 않고 모바일 폭으로 바꾸면 표시한다', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 960,
  });
  await page.goto('/login');
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기',
  })).toBeVisible();
  await expect(page.getByRole('complementary', {
    name: BANNER_NAME,
  })).toHaveCount(0);
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await expect(page.getByRole('complementary', {
    name: BANNER_NAME,
  })).toBeVisible();
});

test('iPhone은 공유 메뉴의 홈 화면 추가 방법을 표시하고 Escape로 닫는다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1',
    });
  });
  await page.goto('/login');
  await page.getByRole('button', {
    name: '설치하기',
    exact: true,
  }).click();
  const guide = page.getByRole('dialog', {
    name: '홈 화면에 추가',
  });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('브라우저의 공유 버튼을 누르세요.');
  await page.keyboard.press('Escape');
  await expect(guide).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '설치하기',
    exact: true,
  })).toBeFocused();
});

test('설치 이벤트는 클릭할 때 한 번만 사용하고 설치 완료 시 배너를 숨긴다', async ({ page }) => {
  await page.goto('/login');
  const install = page.getByRole('button', {
    name: '설치하기',
    exact: true,
  });
  await expect(install).toBeVisible();
  await offerInstall(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-install-calls');
  await install.click();
  await expect(page.locator('html')).toHaveAttribute('data-install-calls', '1');
  await install.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-install-calls', '1');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(install).toHaveCount(0);
});

test('설치 창이 실패하면 재시도 가능한 브라우저 설치 안내를 표시한다', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', {
    name: '설치하기',
    exact: true,
  })).toBeVisible();
  await offerInstall(page, true);
  await page.getByRole('button', {
    name: '설치하기',
    exact: true,
  }).click();
  await expect(page.getByRole('dialog')).toContainText('설치 창을 열지 못했어요.');
});

test('독립 앱으로 실행하면 설치 배너를 표시하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
    });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기',
  })).toBeVisible();
  await expect(page.getByRole('complementary', {
    name: BANNER_NAME,
  })).toHaveCount(0);
});

for (const role of ['ADMIN', 'RESIDENT'] as const) {
  test(`${role} 설정의 설치는 배너를 닫아도 사용할 수 있고 PC에서는 숨긴다`, async ({ page }) => {
    await mockSession(page, role);
    await page.addInitScript(() => localStorage.setItem('moahome-app-install-dismissed-until', String(Date.now() + 3600000)));
    await page.goto(role === 'ADMIN' ? `/manage/${PROPERTY_ID}/settings` : `/resident/settings?propertyId=${PROPERTY_ID}`);
    const install = page.getByRole('button', {
      name: '앱 설치',
      exact: true,
    });
    await expect(install).toBeVisible();
    await install.click();
    await expect(page.getByRole('dialog', {
      name: '모아홈 앱 설치',
    })).toBeVisible();
    await page.getByRole('button', {
      name: '설치 방법 닫기',
    }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.getByRole('button', {
      name: '설치됨',
    })).toBeDisabled();
    await page.setViewportSize({
      width: 1440,
      height: 960,
    });
    await expect(page.getByRole('heading', {
      name: '모아홈 앱',
    })).toHaveCount(0);
  });
}
