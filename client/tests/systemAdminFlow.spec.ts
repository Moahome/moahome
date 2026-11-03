import {
  expect,
  test,
  type Page
} from '@playwright/test';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';

/** 실제 저장소 대신 요청별 권한과 재시도 ID를 확인하는 격리된 API를 사용합니다. */
async function mockSystemAdmin(page: Page, options: { ordinary?: boolean; failFirst?: boolean } = {}) {
  const users = [
    {
      id: ACTOR,
      displayName: '테스트 운영자',
      systemRole: options.ordinary ? 'USER' : 'ADMIN',
      status: 'ACTIVE',
      canCreateProperty: false,
      createdAt: '2026-11-01T00:00:00Z'
    },
    {
      id: TARGET,
      displayName: '테스트 회원',
      systemRole: 'USER',
      status: 'ACTIVE',
      canCreateProperty: false,
      createdAt: '2026-11-02T00:00:00Z'
    }
  ];
  const commands: Record<string, unknown>[] = [];
  const applied = new Set<string>();
  let adminReads = 0;
  await page.route('http://localhost:8080/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({
      status: 204,
      headers
    });
    let body: unknown;
    if (path.endsWith('/csrf')) body = {
      csrfToken: 'test-csrf'
    };
    else if (path.endsWith('/refresh')) body = {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
    };
    else if (path === '/api/users/me') body = {
      ...users[0],
      profileImageUrl: null
    };
    else if (path.endsWith('/managed-properties') || path.endsWith('/resident-properties')) body = {
      properties: []
    };
    else if (path.startsWith('/api/system-admin/users')) {
      adminReads++;
      if (users[0].systemRole !== 'ADMIN') return route.fulfill({
        status: 403,
        headers,
        json: {
          code: 'ACCESS_DENIED'
        }
      });
      const parts = path.split('/');
      const member = users.find((user) => user.id === parts[4]);
      if (path === '/api/system-admin/users') {
        const keyword = url.searchParams.get('query') ?? '';
        const matches = users.filter((user) => (!keyword || `${user.displayName} ${user.id}`.includes(keyword))
          && (url.searchParams.get('administrators') !== 'true' || user.systemRole === 'ADMIN'));
        body = {
          users: matches,
          page: Number(url.searchParams.get('page')),
          pageSize: Number(url.searchParams.get('size')),
          total: matches.length,
          pageCount: 1
        };
      } else if (request.method() === 'GET') body = member;
      else {
        const input = request.postDataJSON();
        commands.push(input);
        if (options.failFirst && commands.length === 1) return route.fulfill({
          status: 503,
          headers,
          json: {
            code: 'ADMIN_SERVICE_UNAVAILABLE'
          }
        });
        if (!applied.has(input.requestId)) {
          if (path.endsWith('/creation-permission')) member!.canCreateProperty = input.allowed;
          else member!.systemRole = 'ADMIN';
          applied.add(input.requestId);
        }
        body = member;
      }
    } else throw new Error(`Unexpected request: ${path}`);
    await route.fulfill({
      status: 200,
      headers,
      json: body
    });
  });
  return {
    users,
    commands,
    adminReads: () => adminReads
  };
}

test('시스템 회원 관리 PC는 검색·권한 확인·실패 재시도·관리자 목록을 지원', async ({ page }, testInfo) => {
  const api = await mockSystemAdmin(page, {
    failFirst: true
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto('/admin');
  await expect(page.getByRole('table', {
    name: '회원 관리',
    exact: true
  })).toContainText('테스트 운영자');
  await page.getByRole('textbox', {
    name: '회원 검색',
    exact: true
  }).fill('테스트 회원');
  await page.getByRole('button', {
    name: '검색',
    exact: true
  }).click();
  const table = page.getByRole('table', {
    name: '회원 관리',
    exact: true
  });
  await expect(table).not.toContainText('테스트 운영자');
  await table.getByRole('row').filter({
    hasText: '테스트 회원'
  }).click();
  const detail = page.getByRole('dialog', {
    name: '회원 상세',
    exact: true
  });
  await expect(detail).toContainText(TARGET);
  await detail.getByRole('button', {
    name: '생성 권한 부여',
    exact: true
  }).click();
  let confirmation = page.getByRole('dialog', {
    name: '생성 권한을 부여할까요?',
    exact: true
  });
  await confirmation.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  expect(api.commands).toHaveLength(0);
  await detail.getByRole('button', {
    name: '생성 권한 부여',
    exact: true
  }).click();
  confirmation = page.getByRole('dialog', {
    name: '생성 권한을 부여할까요?',
    exact: true
  });
  await confirmation.getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(confirmation.getByRole('alert')).toContainText('일시적으로');
  await confirmation.getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(detail.getByRole('button', {
    name: '생성 권한 회수',
    exact: true
  })).toBeVisible();
  expect(api.commands[1]).toEqual(api.commands[0]);
  await page.screenshot({
    path: testInfo.outputPath('system-admin-member-desktop.png'),
    fullPage: true
  });
  await detail.getByRole('button', {
    name: '시스템 관리자 승격',
    exact: true
  }).click();
  await page.getByRole('dialog', {
    name: '시스템 관리자로 승격할까요?',
    exact: true
  }).getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(detail.getByRole('button', {
    name: '시스템 관리자 승격',
    exact: true
  })).toHaveCount(0);
  await detail.getByRole('button', {
    name: '회원 상세 닫기',
    exact: true
  }).click();
  await page.getByRole('navigation', {
    name: '시스템 관리 메뉴'
  }).getByRole('link', {
    name: '관리자 목록',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '시스템 관리자',
    exact: true
  })).toContainText('테스트 회원');
});

test('일반 회원은 관리자 자료와 생성 화면에 접근하지 못하고 초대 참여는 유지', async ({ page }) => {
  const api = await mockSystemAdmin(page, {
    ordinary: true
  });
  await page.goto('/admin');
  await expect(page.getByText('시스템 관리자 권한이 필요합니다.', {
    exact: true
  })).toBeVisible();
  expect(api.adminReads()).toBe(0);
  await page.goto('/start?registration=basic');
  await expect(page.getByText('관리대상 생성 권한이 필요합니다.', {
    exact: true
  })).toBeVisible();
  await page.goto('/start');
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '생성 권한이 필요합니다.',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL('/start');
  await page.getByRole('dialog').getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '주민으로 참여하기',
    exact: true
  })).toBeEnabled();
});

test('시스템 관리자도 생성 자동 허용 없이 모바일 상세에서 승격·회수와 실제 뒤로가기를 지원', async ({ page }, testInfo) => {
  await mockSystemAdmin(page);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto('/start?registration=basic');
  await expect(page.getByText('관리대상 생성 권한이 필요합니다.', {
    exact: true
  })).toBeVisible();
  await page.goto('/admin');
  await page.getByRole('table', {
    name: '회원 관리',
    exact: true
  }).getByRole('row').filter({
    hasText: '테스트 회원'
  }).click();
  await expect(page).toHaveURL(`/admin/members/${TARGET}`);
  await expect(page.getByRole('link', {
    name: '뒤로가기',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '시스템 관리자 승격',
    exact: true
  }).click();
  await page.getByRole('dialog', {
    name: '시스템 관리자로 승격할까요?',
    exact: true
  }).getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '생성 권한 부여',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '시스템 관리자 승격',
    exact: true
  })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('system-admin-member-mobile.png'),
    fullPage: true
  });
  await page.getByRole('link', {
    name: '뒤로가기',
    exact: true
  }).click();
  await expect(page).toHaveURL('/admin');
});
