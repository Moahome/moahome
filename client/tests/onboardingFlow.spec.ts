import type { ResidentInvitation } from '../src/features/member-management';
import type { UnlinkedResident } from '../src/features/membership-requests';
import {
  expect,
  test,
  type Page,
  type Route
} from '@playwright/test';

const API = 'http://localhost:8080';
const PROPERTY = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const BASE = `/manage/${PROPERTY}`;
async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: status === 204 ? '' : JSON.stringify(body)
  });
}
async function mockWorkspace(page: Page, joined = false) {
  const state = {
    writes: [] as { path: string; body: Record<string, unknown> }[],
    failSave: false,
    loggedIn: true,
    hasManagedProperties: true,
    managementRole: 'ADMIN' as 'ADMIN' | 'MANAGER',
    residentJoined: false,
    legacyShare: false,
    legacyOpening: false,
    emptyRequests: false,
    invitationRows: [] as ResidentInvitation[],
    unlinkedCount: 1,
    unlinkedRows: null as UnlinkedResident[] | null,
    chiefLinked: false,
    failChiefLink: false,
    delayChiefLink: null as null | (() => Promise<void>)
  };
  let role: string | null = joined ? 'RESIDENT' : null;
  const detail = () => ({
    id: id(10),
    propertyId: PROPERTY,
    name: '김주민',
    phoneLast4: '1234',
    unitId: id(101),
    buildingId: null,
    buildingName: null,
    unitNumber: '101',
    relationType: 'TENANT',
    representative: true,
    signupStatus: joined || state.chiefLinked ? 'APPROVED' : 'NOT_JOINED',
    serviceRole: role,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-17T00:00:00Z',
    hasLinkedRequests: joined,
    representativeCandidates: []
  });
  let opening = {
    propertyId: PROPERTY,
    asOf: '2026-10-17',
    managementStarted: false,
    cutoffDate: null as string | null,
    firstBillingMonth: null as string | null,
    batch: null as null | { id: string; revision: number; status: string; cutoffDate: string; firstBillingMonth: string; confirmedAt: string | null; canceledAt: string | null; cancelReason: string | null },
    units: [101, 102, 103, 104].map((n) => ({
      unitId: id(n),
      label: `${n}호`,
      receivable: '0',
      credit: '0',
      originMonth: null,
      responsibility: null
    })),
    accounts: [{
      accountId: id(20),
      label: '관리은행 ····1234',
      amount: '0'
    }],
    history: [] as unknown[]
  };
  let requests = [{
    id: id(30),
    unitId: id(101),
    unitLabel: '101호',
    requesterName: '신청계정',
    phoneLast4: '1234',
    status: 'PENDING',
    requestedAt: '2026-10-17T00:00:00Z',
    updatedAt: '2026-10-17T00:00:00Z',
    candidates: [{
      residentId: id(10),
      name: '김주민'
    }]
  }];
  await page.route(`${API}/**`, async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return json(route, {});
    if (path.endsWith('/csrf')) return json(route, {
      csrfToken: 'synthetic-csrf'
    });
    if (path.endsWith('/refresh') && !state.loggedIn) return json(route, {
      code: 'AUTHENTICATION_REQUIRED'
    }, 401);
    if (path.endsWith('/refresh')) return json(route, {
      accessToken: 'synthetic-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
    });
    if (path === '/api/users/me') return json(route, {
      id: id(1),
      displayName: '관리자',
      profileImageUrl: null,
      systemRole: 'USER',
      status: 'ACTIVE'
    });
    expect(request.headers().authorization).toBe('Bearer synthetic-access');
    if (path.endsWith('/resident-properties')) return json(route, {
      properties: state.residentJoined ? [{
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'RESIDENT'
      }] : []
    });
    if (path.endsWith('/managed-properties')) return json(route, {
      properties: state.hasManagedProperties ? [{
        propertyId: PROPERTY,
        name: '모아빌라',
        role: state.managementRole
      }] : []
    });
    if (path.endsWith('/management-context')) return json(route, {
      propertyId: PROPERTY,
      name: '모아빌라',
      role: state.managementRole
    });
    if (['POST', 'PUT', 'DELETE'].includes(request.method())) state.writes.push({
      path,
      body: request.postDataJSON() ?? {}
    });
    if (path.endsWith('/resident-invitations') && request.method() === 'GET') return json(route, {
      propertyId: PROPERTY,
      invitations: state.invitationRows
    });
    if (path.endsWith('/resident-invitations/shared-code')) {
      if (request.method() === 'DELETE') return json(route, null, 204);
      return json(route, {
        id: id(3000),
        token: 'B-ABCD-EFGH-JKLM',
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
    }
    if (path.includes('/resident-invitations/residents/')) {
      const residentId = path.split('/').at(-1)!;
      const row = state.unlinkedRows?.find((r) => r.residentId === residentId);
      state.invitationRows = [{
        id: id(3001),
        residentId,
        name: row?.name ?? '김주민',
        unitLabel: '101호',
        phoneLast4: '1234',
        status: 'ISSUED',
        revision: 0,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        requestedName: null,
        requestedPhoneLast4: null,
        phoneAction: null
      }];
      return json(route, {
        id: id(3001),
        token: 'R-ABCD-EFGH-JKLM',
        expiresAt: state.invitationRows[0].expiresAt
      });
    }
    if (/\/resident-invitations\/[^/]+\/restore$/.test(path)) {
      if (request.postDataJSON().token !== 'R-ABCD-EFGH-JKLM') return json(route, {
        code: 'INVALID_INVITATION'
      }, 400);
      state.legacyShare = false;
      state.invitationRows[0].revision++;
      return json(route, {
        id: state.invitationRows[0].id,
        token: 'R-ABCD-EFGH-JKLM',
        expiresAt: state.invitationRows[0].expiresAt
      });
    }
    if (/\/resident-invitations\/[^/]+\/share$/.test(path)) return json(route, {
      id: state.invitationRows[0].id,
      token: state.legacyShare ? null : 'R-ABCD-EFGH-JKLM',
      expiresAt: state.invitationRows[0].expiresAt
    });
    if (path.endsWith('/api/resident-invitations/shared-options')) return json(route, {
      propertyId: PROPERTY,
      propertyName: '모아빌라',
      units: [{
        unitId: id(101),
        label: '102동 201호'
      }]
    });
    if (path.endsWith('/api/resident-invitations/preview')) return json(route, {
      propertyName: '모아빌라',
      name: '김주민',
      unitLabel: '102동 201호',
      phoneLast4: null,
      status: 'ISSUED',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      revision: 0
    });
    if (path.endsWith('/api/resident-invitations/accept')) {
      state.residentJoined = !request.postDataJSON().correction;
      return json(route, {
        status: state.residentJoined ? 'APPROVED' : 'CHANGE_REQUESTED'
      });
    }
    if (path.includes('/resident-invitations/') && /\/(approve|reject|revoke)$/.test(path)) {
      state.invitationRows = state.invitationRows.map((r) => ({
        ...r,
        status: path.endsWith('/approve') ? 'APPROVED' : path.endsWith('/reject') ? 'REJECTED' : 'REVOKED',
        revision: r.revision + 1
      }));
      return json(route, {
        propertyId: PROPERTY,
        invitations: state.invitationRows
      });
    }
    if (path.endsWith('/members/me/resident')) {
      await state.delayChiefLink?.();
      if (state.failChiefLink) return json(route, {
        code: 'MEMBER_ROLE_CONFLICT',
        message: 'synthetic conflict'
      }, 409);
      state.chiefLinked = true;
      role = 'ADMIN';
      return json(route, {}, 204);
    }
    if (path.endsWith('/members')) return json(route, {
      propertyId: PROPERTY,
      members: [],
      invitations: []
    });
    if (path.endsWith('/basic-info/validate')) return json(route, request.postDataJSON());
    if (path.endsWith('/billing/settings')) return json(route, {
      propertyId: PROPERTY,
      currentMonth: '2026-10',
      firstBillingMonth: '2026-10',
      nextBillingDate: '2026-11-01',
      revisionId: id(40),
      current: {
        id: id(40),
        effectiveMonth: '2026-10',
        items: [{
          id: id(41),
          code: null,
          name: '관리비',
          amount: '50000'
        }],
        reason: null,
        changedAt: '2026-10-17T00:00:00Z'
      },
      scheduled: null,
      managementStarted: opening.managementStarted
    });
    if (path.endsWith('/billing/opening-balances')) {
      if (request.method() === 'PUT') {
        if (state.failSave) return json(route, {
          code: 'OPENING_BALANCE_CONFLICT',
          message: 'conflict'
        }, 409);
        const input = request.postDataJSON();
        opening = {
          ...opening,
          units: input.units.map((u: { unitId: string }) => ({
            ...opening.units.find((r) => r.unitId === u.unitId),
            ...u
          })),
          accounts: input.accounts.map((a: object) => ({
            ...opening.accounts[0],
            ...a
          })),
          batch: {
            id: id(50),
            revision: 1,
            status: 'DRAFT',
            cutoffDate: input.cutoffDate,
            firstBillingMonth: input.firstBillingMonth,
            confirmedAt: null,
            canceledAt: null,
            cancelReason: null
          }
        };
      }
      return json(route, state.legacyOpening ? {
        ...opening,
        managementStarted: true,
        cutoffDate: null
      } : opening);
    }
    if (path.endsWith('/confirm') && path.includes('/opening-balances/')) {
      opening = {
        ...opening,
        managementStarted: true,
        cutoffDate: opening.batch!.cutoffDate,
        firstBillingMonth: opening.batch!.firstBillingMonth,
        batch: {
          ...opening.batch!,
          revision: 2,
          status: 'CONFIRMED',
          confirmedAt: '2026-10-17T00:00:00Z'
        }
      };
      return json(route, opening);
    }
    if (path.endsWith('/units')) return json(route, {
      propertyId: PROPERTY,
      hasBuildings: false,
      buildings: [],
      units: [101, 102].map((n) => ({
        id: id(n),
        buildingId: null,
        unitNumber: String(n),
        displayName: null,
        floor: 1,
        status: 'ACTIVE'
      })),
      residentSummaries: {}
    });
    if (path.endsWith('/residents')) return json(route, {
      propertyId: PROPERTY,
      hasBuildings: false,
      buildings: [],
      residents: [detail()]
    });
    if (path.endsWith(`/residents/${id(10)}`)) {
      if (request.method() === 'PUT') role = request.postDataJSON().serviceRole ?? role;
      return json(route, detail());
    }
    if (path.endsWith('/membership-requests/unlinked-residents')) return json(route, {
      propertyId: PROPERTY,
      residents: joined || state.chiefLinked ? [] : state.unlinkedRows ?? Array.from({
        length: state.unlinkedCount
      }, (_, index) => ({
        residentId: id(1000 + index),
        name: index === 0 ? '김주민' : `미연결주민${String(index + 1).padStart(2, '0')}`,
        phoneLast4: index === 0 ? '1234' : null,
        buildingName: null,
        unitNumber: String(101 + index),
        relationType: index % 2 === 0 ? 'TENANT' : 'OWNER'
      }))
    });
    if (path.endsWith('/membership-requests') && request.method() === 'POST') return json(route, {
      id: id(31),
      status: 'PENDING'
    });
    if (path.endsWith('/membership-requests')) return json(route, {
      propertyId: PROPERTY,
      requests: state.emptyRequests ? [] : requests
    });
    if (path.endsWith('/approve') && path.includes('/membership-requests/')) {
      requests = requests.map((r) => ({
        ...r,
        status: 'APPROVED'
      }));return json(route, {
        propertyId: PROPERTY,
        requests
      });
    }
    if (path.endsWith('/billing/history')) return json(route, {
      propertyId: PROPERTY,
      periods: []
    });
    if (path.includes('/billing/monthly/')) return json(route, {
      propertyId: PROPERTY,
      hasBuildings: false,
      month: '2026-10',
      billingDate: '2026-10-01',
      dueDate: '2026-10-31',
      status: 'NOT_BILLED',
      baseAmount: '0',
      charges: []
    });
    return json(route, {
      code: 'NOT_FOUND'
    }, 404);
  });

  return state;
}

test('주민 상세는 기존 필드 행에 역할만 표시하고 초대·코드·별도 권한 영역을 넣지 않음', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto(`${BASE}/residents`);
  await page.getByRole('button', {
    name: '김주민 상세 보기'
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '주민 상세'
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('dt').filter({
    hasText: /^역할$/
  })).toHaveCount(1);
  await expect(dialog).not.toContainText('서비스 역할');
  await expect(dialog).not.toContainText('권한 관리');
  await expect(dialog).not.toContainText('초대');
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(620);
  await page.screenshot({
    path: test.info().outputPath('residentDetail.png')
  });
  await dialog.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '주민 수정'
  }).getByRole('combobox', {
    name: '역할',
    exact: true
  })).toBeDisabled();
});

test('역할 변경은 기존 주민 수정 모달에서 일반 정보와 한 번에 저장', async ({ page }) => {
  const state = await mockWorkspace(page, true);
  await page.goto(`${BASE}/residents`);
  await page.getByRole('button', {
    name: '김주민 상세 보기'
  }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await dialog.getByRole('combobox', {
    name: '역할',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '부담당자',
    exact: true
  }).click();
  await page.screenshot({
    path: test.info().outputPath('residentEdit.png')
  });
  await dialog.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(dialog.locator('dd').filter({
    hasText: /^부담당자$/
  })).toHaveCount(1);
  expect(state.writes.filter((r) => r.path.includes('/residents/'))).toHaveLength(1);
  expect(state.writes.at(-1)!.body).toMatchObject({
    serviceRole: 'MANAGER',
    expectedServiceRole: 'RESIDENT'
  });
  expect(state.writes.some((r) => r.path.includes('invitations'))).toBe(false);
});

test('가입 승인과 주민 선택은 승인 관리 메뉴에서 처리', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.goto(`${BASE}/invitations`);
  await page.getByRole('rowheader', {
    name: '신청계정'
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '가입 요청 확인'
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText('초대코드');
  await dialog.getByRole('combobox', {
    name: '연결할 주민'
  }).click();
  await page.getByRole('option', {
    name: '김주민'
  }).click();
  await dialog.getByRole('button', {
    name: '가입 승인'
  }).click();
  await expect(page.getByRole('table', {
    name: '가입 요청 목록'
  })).toContainText('승인 완료');
  expect(state.writes.at(-1)!.path).toContain('/membership-requests/');
  expect(state.writes.at(-1)!.body.residentId).toBe(id(10));
});

test('잔액 인계는 내부 탭을 유지하며 실패 시 입력 보존·저장 후에만 관리 시작', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.goto(`${BASE}/billing/monthly?tab=opening`);
  await expect(page.getByRole('tab', {
    name: '기존 잔액 인계'
  })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', {
    name: '101호 기존 미납',
    exact: true
  }).fill('100000');
  await page.getByRole('textbox', {
    name: '102호 기존 선납',
    exact: true
  }).fill('30000');
  await page.getByRole('textbox', {
    name: '103호 기존 선납',
    exact: true
  }).fill('80000');
  await expect(page.getByRole('button', {
    name: '인계 확정 · 관리 시작'
  })).toBeDisabled();
  state.failSave = true;
  await page.getByRole('button', {
    name: '초안 저장'
  }).click();
  await expect(page.getByRole('textbox', {
    name: '101호 기존 미납',
    exact: true
  })).toHaveValue('100,000');
  state.failSave = false;
  await page.getByRole('button', {
    name: '초안 저장'
  }).click();
  await expect(page.getByRole('button', {
    name: '인계 확정 · 관리 시작'
  })).toBeEnabled();
  await page.getByRole('button', {
    name: '인계 확정 · 관리 시작'
  }).click();
  await expect(page.getByText('인계 확정 완료 · 기준일 이전 입금은 신규 수납으로 반영하지 않습니다.')).toBeVisible();
  expect(state.writes.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1);
  await page.screenshot({
    path: test.info().outputPath('openingBalance.png'),
    fullPage: true
  });
});

test('모바일 주민 상세는 헤더 뒤로가기와 기존 수정 폼의 역할 선택을 사용', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await mockWorkspace(page, true);
  await page.goto(`${BASE}/residents/${id(10)}`);
  await expect(page.getByRole('link', {
    name: '주민 목록으로 돌아가기'
  })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).not.toContainText('초대코드');
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(main.getByRole('combobox', {
    name: '역할',
    exact: true
  })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('residentEditMobile.png'),
    fullPage: true
  });
});



test('설정에서 관리대상이 있는 계정도 추가 화면에 진입하고 일반 시작의 기본 이동은 유지', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto(`${BASE}/settings`);
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('main')).not.toContainText('초대 신청');
  await expect(page.getByRole('main')).not.toContainText('외부 부담당자');
  await page.screenshot({
    path: test.info().outputPath('settings.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('button', {
    name: '등록 및 참여',
    exact: true
  }).click();
  await expect(page).toHaveURL('/properties/add');
  await expect(page.getByRole('heading', {
    name: '등록 및 참여'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '초대코드로 참여하기',
    exact: true
  })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {
    name: '등록 및 참여'
  })).toBeVisible();
  await page.getByRole('button', {
    name: '초대코드로 참여하기',
    exact: true
  }).click();
  const invitation = page.getByRole('dialog', {
    name: '초대코드로 참여하기'
  });
  await expect(page).toHaveURL('/properties/add');
  await expect(invitation).toBeVisible();
  await expect(invitation).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(invitation.getByRole('heading')).toHaveCSS('font-size', '24px');
  await expect(invitation.getByRole('button', {
    name: '초대코드 입력 닫기'
  }).locator('svg')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('invitationCodeModal.png'),
    animations: 'disabled'
  });
  await invitation.getByRole('button', {
    name: '초대코드 입력 닫기'
  }).click();
  await expect(invitation).toHaveCount(0);
  await page.goto('/start');
  await expect(page).toHaveURL(`${BASE}/dashboard`);
});

test('추가 화면은 모바일에서도 기존 초대 입력과 등록 폼을 사용하고 취소·새로고침을 복구', async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({
    width: 320,
    height: 800
  });
  await page.goto('/properties/add');
  await expect(page.getByRole('heading', {
    name: '등록 및 참여'
  })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('button', {
    name: /승인 대기 중인 요청/
  })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.screenshot({
    path: test.info().outputPath('additionalEntryMobile.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('button', {
    name: '초대코드로 참여하기',
    exact: true
  }).click();
  await expect(page).toHaveURL('/invitations');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('textbox', {
    name: '초대코드',
    exact: true
  })).toBeVisible();
  const invitationForm = await page.getByRole('main').locator('form').boundingBox();
  const invitationSubmit = await page.getByRole('button', {
    name: '참여 신청',
    exact: true
  }).boundingBox();
  expect(invitationSubmit!.width).toBe(invitationForm!.width);
  expect(invitationSubmit!.height).toBeGreaterThanOrEqual(56);
  await page.screenshot({
    path: test.info().outputPath('invitationCodeMobile.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.goBack();
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  await expect(page).toHaveURL('/properties/add?registration=basic');
  await page.getByRole('textbox', {
    name: '건물·단지 이름',
    exact: true
  }).fill('새로운 빌라');
  await page.reload();
  await expect(page.getByRole('textbox', {
    name: '건물·단지 이름',
    exact: true
  })).toHaveValue('새로운 빌라');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', {
    name: '등록 취소하고 돌아가기',
    exact: true
  }).click();
  await expect(page).toHaveURL('/properties/add');
  await expect(page.getByRole('heading', {
    name: '등록 및 참여'
  })).toBeVisible();
});

test('추가 등록은 기존 기본 검증·세대 단계를 재사용하며 단계 이동과 복원에서 새 경로 유지', async ({ page }) => {
  await mockWorkspace(page);
  await page.route('https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.kakao = { Postcode: class {
      constructor(options) { this.options = options; }
      embed(element) { const button = document.createElement('button'); button.textContent = '주소 선택';
        button.onclick = () => this.options.oncomplete({ userSelectedType: 'R', roadAddress: '서울특별시 강동구 성내로 10', address: '서울특별시 강동구 성내로 10' });
        element.append(button); }
    } };`
  }));
  await page.goto('/properties/add?registration=basic');
  await page.getByRole('textbox', {
    name: '건물·단지 이름',
    exact: true
  }).fill('추가 빌라');
  await page.getByRole('button', {
    name: '주소 검색',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '주소 선택',
    exact: true
  }).click();
  await page.getByRole('radio', {
    name: /^동 없음/
  }).check();
  await page.getByRole('button', {
    name: '등록하고 계속',
    exact: true
  }).click();
  await expect(page).toHaveURL('/properties/add?registration=units');
  await page.reload();
  await expect(page).toHaveURL('/properties/add?registration=units');
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await expect(page).toHaveURL('/properties/add?registration=basic');
  await expect(page.getByRole('textbox', {
    name: '건물·단지 이름',
    exact: true
  })).toHaveValue('추가 빌라');
});

test('추가 등록의 잘못된 완료 요청은 자동 대시보드 이동 없이 추가 화면으로 복귀', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/properties/add?registration=complete&requestId=invalid');
  await expect(page).toHaveURL('/properties/add');
  await expect(page.getByRole('heading', {
    name: '등록 및 참여'
  })).toBeVisible();
});


test('기존 잔액 탭은 스크롤바 없는 탭과 상태 카드·다음 조회 동작을 제공', async ({ page }) => {
  const state = await mockWorkspace(page); state.legacyOpening = true;
  await page.goto(`${BASE}/billing/monthly?tab=opening`);
  await expect(page.getByRole('heading', {
    name: '이미 관리비 부과를 시작한 곳이에요'
  })).toBeVisible();
  const tabs = page.getByRole('tablist');
  expect(await tabs.evaluate((element) => { const css = getComputedStyle(element); return ['auto','scroll'].includes(css.overflowY); })).toBe(false);
  await page.screenshot({
    path: test.info().outputPath('openingExisting.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('button', {
    name: '월별 부과 보기',
    exact: true
  }).click();
  await expect(page).toHaveURL(/tab=monthly/);
});

test('빈 가입 요청은 흰 목록 카드 안에서 표 헤더·빈 상태를 구분', async ({ page }) => {
  const state = await mockWorkspace(page); state.emptyRequests = true;
  await page.goto(`${BASE}/invitations`);
  await expect(page.getByRole('table', {
    name: '가입 요청 목록'
  })).toContainText('아직 가입 요청이 없어요');
  await page.screenshot({
    path: test.info().outputPath('emptySignupRequests.png'),
    fullPage: true,
    animations: 'disabled'
  });
});

for (const width of [1440, 390]) {
  for (const representative of [false, true]) {
    test(`기존 관리소장 연결 UI ${width}px: 대표 ${representative ? '유지' : '자동 지정 없음'}·실제 저장`, async ({ page }) => {
      const state = await mockWorkspace(page);
      await page.setViewportSize({
        width,
        height: 960
      });
      await page.route(`${API}/api/properties/${PROPERTY}/residents`, (route) => json(route, {
        propertyId: PROPERTY,
        hasBuildings: false,
        buildings: [],
        residents: [{
          id: id(10),
          name: '김주민',
          phoneLast4: '1234',
          unitId: id(101),
          buildingId: null,
          unitNumber: '101',
          relationType: 'TENANT',
          representative,
          signupStatus: state.chiefLinked ? 'APPROVED' : 'NOT_JOINED',
          serviceRole: state.chiefLinked ? 'ADMIN' : null
        }]
      }));
      await page.goto(`${BASE}/residents`);
      await page.getByRole('button', {
        name: '내 계정 연결',
        exact: true
      }).click();
      const content = width > 767 ? page.getByRole('dialog', {
        name: '내 관리소장 계정 연결'
      }) : page.getByRole('main');
      await expect(content.getByRole('heading', {
        name: '내 관리소장 계정 연결',
        exact: true
      })).toBeVisible();
      await expect(content).toContainText('현재 로그인 계정');
      await expect(content).toContainText('관리자');
      if (width < 768) {
        await expect(page).toHaveURL(`${BASE}/residents/account-link`);
        await page.reload();
        await expect(page.getByRole('button', {
          name: '주민 목록',
          exact: true
        })).toHaveCount(0);
      }
      await content.getByRole('combobox', {
        name: '주민 명부의 본인'
      }).click();
      await page.getByRole('option', {
        name: /김주민 · 101호/
      }).click();
      await expect(content.getByRole('region', {
        name: '연결할 주민 정보'
      })).toContainText(representative ? '대표 유지' : '대표 아님 (유지)');
      await content.getByRole('button', {
        name: '계정 연결',
        exact: true
      }).click();
      await expect(page.getByText('관리소장 계정을 주민 명부에 연결했어요.')).toBeVisible();
      await expect(page.getByRole('button', {
        name: '내 계정 연결',
        exact: true
      })).toHaveCount(0);
      const row = page.getByRole('table', {
        name: '주민 목록'
      }).getByRole('row').filter({
        hasText: '김주민'
      });
      await expect(row).toContainText('관리소장');
      await expect(row).toContainText('가입 완료');
      expect(state.writes).toEqual([{
        path: `/api/properties/${PROPERTY}/members/me/resident`,
        body: {
          residentId: id(10),
          expectedUnitId: id(101)
        }
      }]);
      await page.reload();
      await expect(page.getByRole('table', {
        name: '주민 목록'
      }).getByRole('row').filter({
        hasText: '김주민'
      })).toContainText('관리소장');
      await page.screenshot({
        path: test.info().outputPath(`chiefLink${width}.png`),
        fullPage: true,
        animations: 'disabled'
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page).toHaveURL(`${BASE}/residents`);
    });
  }
}

for (const width of [320, 390, 767]) {
  test(`가입 요청 참여 링크 버튼 ${width}px: 전체 너비와 큰 터치 영역`, async ({ page }) => {
    const state = await mockWorkspace(page);
    state.emptyRequests = true;
    await page.setViewportSize({
      width,
      height: 900
    });
    await page.goto(`${BASE}/join-requests`);
    const button = page.getByRole('button', {
      name: '전체 초대코드 발급',
      exact: true
    });
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS('min-height', '56px');
    const buttonBounds = await button.boundingBox();
    const headerBounds = await page.getByRole('heading', {
      name: '가입 요청',
      exact: true
    }).locator('..').locator('..').boundingBox();
    expect(Math.abs(buttonBounds!.width - headerBounds!.width)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: test.info().outputPath(`joinRequestButton${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

test('기존 관리소장 연결은 실패 시 선택을 보존하고 저장 중 닫기·중복 요청을 막은 뒤 버튼을 숨김', async ({ page }) => {
  const state = await mockWorkspace(page);
  state.failChiefLink = true;
  await page.goto(`${BASE}/residents`);
  await page.getByRole('button', {
    name: '내 계정 연결',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '내 관리소장 계정 연결'
  });
  await modal.getByRole('combobox', {
    name: '주민 명부의 본인'
  }).click();
  await page.getByRole('option', {
    name: /김주민 · 101호/
  }).click();
  await modal.getByRole('button', {
    name: '계정 연결',
    exact: true
  }).click();
  await expect(modal.getByRole('alert')).toContainText('이미 연결된 계정이 있거나 주민 정보가 변경됐어요.');
  await expect(modal.getByRole('combobox', {
    name: '주민 명부의 본인'
  })).toContainText('김주민');
  await expect(page.getByRole('button', {
    name: '내 계정 연결',
    exact: true
  })).toHaveCount(1);
  state.failChiefLink = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  state.delayChiefLink = () => gate;
  await modal.getByRole('button', {
    name: '계정 연결',
    exact: true
  }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(modal.getByRole('button', {
    name: '연결 중',
    exact: true
  })).toBeDisabled();
  await expect(modal.getByRole('button', {
    name: '계정 연결 닫기',
    exact: true
  })).toBeDisabled();
  await expect(modal.getByRole('combobox', {
    name: '주민 명부의 본인'
  })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await expect.poll(() => state.writes.length).toBe(2);
  release();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '내 계정 연결',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('table', {
    name: '주민 목록'
  })).toContainText('관리소장');
  expect(state.writes).toHaveLength(2);
});

test('이미 연결된 관리소장은 목록의 연결 버튼을 표시하지 않고 직접 연결 주소에서도 중복 선택을 제공하지 않음', async ({ page }) => {
  await mockWorkspace(page);
  await page.route(`${API}/api/properties/${PROPERTY}/residents`, (route) => json(route, {
    propertyId: PROPERTY,
    hasBuildings: false,
    buildings: [],
    residents: [{
      id: id(10),
      name: '김주민',
      phoneLast4: '1234',
      unitId: id(101),
      buildingId: null,
      unitNumber: '101',
      relationType: 'TENANT',
      representative: false,
      signupStatus: 'APPROVED',
      serviceRole: 'ADMIN'
    }]
  }));
  await page.goto(`${BASE}/residents`);
  await expect(page.getByRole('table', {
    name: '주민 목록'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '내 계정 연결',
    exact: true
  })).toHaveCount(0);
  await page.goto(`${BASE}/residents/account-link`);
  await expect(page.getByText(/이미 주민 목록의/)).toBeVisible();
  await expect(page.getByRole('button', {
    name: '계정 연결',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('combobox', {
    name: '주민 명부의 본인'
  })).toHaveCount(0);
});

test('본인 계정 연결은 현재 세대가 있는 미연결 주민이 없으면 저장을 막음', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.route(`${API}/api/properties/${PROPERTY}/residents`, (route) => json(route, {
    propertyId: PROPERTY,
    hasBuildings: false,
    buildings: [],
    residents: []
  }));
  await page.goto(`${BASE}/residents`);
  await page.getByRole('button', {
    name: '내 계정 연결',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '내 관리소장 계정 연결'
  });
  await expect(modal.getByText(/연결할 주민 정보가 없어요/)).toBeVisible();
  await expect(modal.getByRole('button', {
    name: '계정 연결',
    exact: true
  })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

for (const width of [1440, 390]) {
  test(`설정의 통장 관리 ${width}px는 현재 정보 조회·검증·실패 재시도·저장을 지원`, async ({ page }) => {
    await mockWorkspace(page);
    await page.setViewportSize({
      width,
      height: 900
    });
    let account = {
      propertyId: PROPERTY,
      accountId: id(20),
      updatedAt: '2026-10-18T00:00:00Z',
      bankCode: '004',
      bankName: '국민은행',
      accountNumber: '00012345678',
      holderName: '기존 예금주',
      alias: null as string | null,
      isPrimary: true,
      status: 'ACTIVE'
    };
    let reads = 0;
    const writes: Record<string, unknown>[] = [];
    await page.route(`${API}/api/properties/${PROPERTY}/banking/account**`, async (route) => {
      if (route.request().method() === 'OPTIONS') return json(route, {});
      expect(route.request().headers().authorization).toBe('Bearer synthetic-access');
      if (route.request().method() === 'GET') {
        reads += 1;
        if (reads === 1) return json(route, {
          code: 'PAYMENT_SERVICE_UNAVAILABLE'
        }, 503);
        return json(route, [account]);
      }
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) return json(route, {
        code: 'PAYMENT_SERVICE_UNAVAILABLE'
      }, 503);
      account = {
        ...account,
        ...body,
        updatedAt: '2026-10-18T00:01:00Z'
      };
      return json(route, account);
    });
    await page.goto(`${BASE}/settings`);
    expect(reads).toBe(0);
    await expect(page.getByRole('heading', {
      name: '설정',
      exact: true,
      level: 1
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '계좌 관리',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('heading', {
      name: '관리 설정',
      exact: true
    })).toHaveCount(0);
    if (width <= 767) await expect(page.getByRole('link', {
      name: '대시보드로 돌아가기',
      exact: true
    })).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath(`settingsOverview${width}.png`),
      fullPage: true
    });
    await page.getByRole('button', {
      name: '계좌 관리',
      exact: true
    }).click();
    const dialog = page.getByRole(width <= 767 ? 'region' : 'dialog', {
      name: '관리계좌',
      exact: true
    });
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByRole('button', {
      name: '다시 시도',
      exact: true
    }).click();
    await expect(dialog.getByRole('button', {
      name: '수정',
      exact: true
    })).toBeVisible();
    await expect(dialog.getByText('사용 중', {
      exact: true
    })).toHaveCount(0);
    await expect.poll(() => dialog.locator('img[src="/banks/bank004.png"]').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`bankAccountList${width}.png`),
      fullPage: true
    });
    await dialog.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await dialog.getByRole('button', {
      name: / 펼치기$/
    }).click();
    await expect(dialog.getByRole('textbox', {
      name: '계좌번호',
      exact: true
    })).toHaveValue('00012345678');
    await dialog.getByRole('combobox', {
      name: '은행',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '신한은행',
      exact: true
    }).click();
    await dialog.getByRole('textbox', {
      name: '예금주',
      exact: true
    }).fill('');
    await expect(dialog.getByRole('button', {
      name: '변경 저장',
      exact: true
    })).toBeDisabled();
    await dialog.getByRole('textbox', {
      name: '예금주',
      exact: true
    }).fill('정정 예금주');
    await dialog.getByRole('textbox', {
      name: '계좌번호',
      exact: true
    }).fill('00098765432');
    await dialog.getByRole('button', {
      name: '변경 저장',
      exact: true
    }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('textbox', {
      name: '계좌번호',
      exact: true
    })).toHaveValue('00098765432');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`bankAccountCorrection${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await dialog.getByRole('button', {
      name: '변경 저장',
      exact: true
    }).click();
    await expect(dialog.getByText('신한은행 00098765432 · 정정 예금주', {
      exact: true
    })).toBeVisible();
    await expect(page.getByText('계좌 정보를 변경했어요.', {
      exact: true
    })).toBeVisible();
    const toast = page.getByLabel('알림', {
      exact: true
    }).filter({
      hasText: '계좌 정보를 변경했어요.'
    });
    await expect(toast.getByRole('status')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.screenshot({
      path: test.info().outputPath(`accountSuccessToast${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[1]).toEqual({
      accountId: id(20),
      updatedAt: '2026-10-18T00:00:00Z',
      bankCode: '088',
      bankName: '신한은행',
      accountNumber: '00098765432',
      holderName: '정정 예금주',
      alias: null,
      isPrimary: true,
      primaryAccountId: id(20)
    });
    if (width <= 767) await page.getByRole('link', {
      name: '설정으로 돌아가기',
      exact: true
    }).click();
    else await dialog.getByRole('button', {
      name: '관리계좌 닫기'
    }).click();
    await page.getByRole('button', {
      name: '계좌 관리',
      exact: true
    }).click();
    await dialog.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    await dialog.getByRole('button', {
      name: / 펼치기$/
    }).click();
    await expect(dialog.getByRole('textbox', {
      name: '예금주',
      exact: true
    })).toHaveValue('정정 예금주');
    await expect(dialog.getByRole('textbox', {
      name: '계좌번호',
      exact: true
    })).toHaveValue('00098765432');
    if (width <= 767) await page.getByRole('link', {
      name: '설정으로 돌아가기',
      exact: true
    }).click();
    else await dialog.getByRole('button', {
      name: '관리계좌 닫기',
      exact: true
    }).click();
    const stored = await page.evaluate(() => JSON.stringify({
      ...localStorage,
      ...sessionStorage
    }));
    expect(stored).not.toContain('00098765432');
    expect(stored).not.toContain('정정 예금주');
  });
}

test('부담당자의 설정에도 계좌 관리를 제공', async ({ page }) => {
  await mockWorkspace(page);
  await page.route(`${API}/api/properties/${PROPERTY}/management-context`, route => json(route, {
    propertyId: PROPERTY,
    name: '모아빌라',
    role: 'MANAGER'
  }));
  await page.goto(`${BASE}/settings`);
  await expect(page.getByRole('heading', {
    name: '설정',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '계좌 관리',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '등록 및 참여',
    exact: true
  })).toBeVisible();
});

for (const width of [1440, 390]) {
  test(`통장 삭제 ${width}px는 공통 모달로 확인·취소·실패 재시도하고 삭제 후 목록에서 숨김`, async ({ page }) => {
    await mockWorkspace(page);
    await page.setViewportSize({
      width,
      height: 900
    });
    const originalVersion = '2026-10-18T00:00:00Z';
    const accounts = Array.from({
      length: 8
    }, (_, index) => ({
      propertyId: PROPERTY,
      accountId: id(20 + index),
      updatedAt: originalVersion,
      bankCode: '004',
      bankName: '국민은행',
      accountNumber: `0001234567${index}`,
      holderName: '검증 예금주',
      alias: `통장 ${index + 1}`,
      isPrimary: index === 0,
      status: 'ACTIVE'
    }));
    let writes = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`${API}/api/properties/${PROPERTY}/banking/account**`, async (route) => {
      if (route.request().method() === 'OPTIONS') return json(route, {});
      if (route.request().method() === 'GET') return json(route, accounts);
      expect(new URL(route.request().url()).pathname).toBe(`/api/properties/${PROPERTY}/banking/account/${id(21)}/close`);
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({
        updatedAt: originalVersion
      });
      writes++;
      if (writes === 1) return json(route, {
        code: 'PAYMENT_SERVICE_UNAVAILABLE'
      }, 503);
      await gate;
      accounts[1] = {
        ...accounts[1],
        status: 'CLOSED',
        updatedAt: '2026-10-23T12:00:00Z'
      };
      return json(route, accounts[1]);
    });
    await page.goto(`${BASE}/settings`);
    await page.getByRole('button', {
      name: '계좌 관리',
      exact: true
    }).click();
    const dialog = page.getByRole(width <= 767 ? 'region' : 'dialog', {
      name: '관리계좌',
      exact: true
    });
    const card = dialog.locator('section').filter({
      has: page.getByRole('heading', {
        name: '통장 2',
        exact: true
      })
    });
    const primaryCard = dialog.locator('section').filter({
      has: page.getByRole('heading', {
        name: '통장 1 · 기본 납부계좌',
        exact: true
      })
    });
    await expect(primaryCard.getByRole('button', {
      name: '삭제',
      exact: true
    })).toHaveCount(0);
    await expect(card.getByRole('button', {
      name: '수정',
      exact: true
    })).toHaveCSS('color', 'rgb(22, 163, 74)');
    await expect(card.getByRole('button', {
      name: '삭제',
      exact: true
    })).toHaveCSS('color', 'rgb(239, 68, 68)');
    for (const name of ['수정', '삭제']) {
      const button = card.getByRole('button', {
        name,
        exact: true
      });
      await expect(button).toHaveAttribute('data-variant', 'text');
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(button).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    }
    await card.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    const confirmation = page.getByRole('alertdialog', {
      name: '통장 삭제 확인',
      exact: true
    });
    await expect(confirmation).toBeInViewport();
    await expect(confirmation).toContainText('과거 거래 내역은 보존합니다.');
    await expect(card).not.toContainText('삭제할까요?');
    await page.screenshot({
      path: test.info().outputPath(`bankAccountDeleteConfirmation${width}.png`),
      fullPage: true
    });
    await expect(confirmation.getByRole('button', {
      name: '취소',
      exact: true
    })).toBeFocused();
    await confirmation.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    expect(writes).toBe(0);
    await expect(confirmation).toHaveCount(0);
    await card.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(confirmation.getByRole('alert')).toBeVisible();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect.poll(() => writes).toBe(2);
    await expect(confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    })).toBeDisabled();
    await expect(confirmation.getByRole('button', {
      name: '취소',
      exact: true
    })).toBeDisabled();
    if (width > 767) await expect(dialog.getByRole('button', {
      name: '관리계좌 닫기',
      exact: true
    })).toBeDisabled();
    release();
    await expect(confirmation).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await expect(dialog.getByRole('heading', {
      level: 3
    })).toHaveCount(7);
    expect(writes).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`bankAccountDeleted${width}.png`),
      fullPage: true
    });
    if (width <= 767) await page.getByRole('link', {
      name: '설정으로 돌아가기',
      exact: true
    }).click();
    else await dialog.getByRole('button', {
      name: '관리계좌 닫기',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '계좌 관리',
      exact: true
    }).click();
    await expect(dialog.getByRole('heading', {
      level: 3
    })).toHaveCount(7);
    await expect(card).toHaveCount(0);
  });
}

test('모바일 계좌 관리 직접 접근·새로고침·로딩·오류에서도 페이지와 공통 헤더 뒤로가기를 유지', async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({
    width: 390,
    height: 900
  });
  let fail = true;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`${API}/api/properties/${PROPERTY}/banking/account/list`, async (route) => {
    if (route.request().method() === 'OPTIONS') return json(route, {});
    if (fail) {
      await gate;
      return json(route, {
        code: 'PAYMENT_SERVICE_UNAVAILABLE'
      }, 503);
    }
    return json(route, [{
      propertyId: PROPERTY,
      accountId: id(20),
      updatedAt: '2026-10-18T00:00:00Z',
      bankCode: '004',
      bankName: '국민은행',
      accountNumber: '00012345678',
      holderName: '검증 예금주',
      alias: '관리비 통장',
      isPrimary: true,
      status: 'ACTIVE'
    }]);
  });
  await page.goto(`${BASE}/settings/accounts`);
  const back = page.getByRole('link', {
    name: '설정으로 돌아가기',
    exact: true
  });
  const content = page.getByRole('region', {
    name: '관리계좌',
    exact: true
  });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', `${BASE}/settings`);
  await expect(content.getByRole('status')).toContainText('관리계좌를 불러오는 중');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  release();
  await expect(content.getByRole('alert')).toBeVisible();
  await expect(back).toBeVisible();
  fail = false;
  await page.reload();
  await expect(content).toContainText('관리비 통장');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(back).toBeVisible();
  await expect(content.getByRole('button', {
    name: /닫기|목록|돌아가기/
  })).toHaveCount(0);
  await content.getByRole('button', {
    name: '통장 추가',
    exact: true
  }).click();
  await expect(content.getByRole('heading', {
    name: '통장 추가',
    exact: true,
    level: 1
  })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await content.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(content).toContainText('관리비 통장');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('mobileBankAccountsPage.png'),
    fullPage: true
  });
  await back.click();
  await expect(page).toHaveURL(`${BASE}/settings`);
});

test('가입 요청은 미연결 주민 전원을 공용 표에서 검색·페이지 이동하고 승인 관리와 구분', async ({ page }) => {
  const state = await mockWorkspace(page);
  state.unlinkedCount = 23;
  await page.goto(`${BASE}/join-requests`);
  const table = page.getByRole('table', {
    name: '미연결 주민 목록'
  });
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await expect(table).toContainText('김주민');
  await expect(table).not.toContainText('신청계정');
  await expect(page.getByRole('combobox', {
    name: '동 필터',
    exact: true
  })).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('unlinkedResidentsDesktop.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.getByRole('navigation', {
    name: '미연결 주민 페이지'
  }).getByRole('button', {
    name: '2페이지',
    exact: true
  }).click();
  await expect(table).toContainText('미연결주민11');
  await expect(table).not.toContainText('김주민');
  await page.getByRole('textbox', {
    name: '미연결 주민 검색'
  }).fill('1234');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('김주민');
  await expect(page.getByRole('button', {
    name: '1페이지',
    exact: true
  })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('textbox', {
    name: '미연결 주민 검색'
  }).fill('없는주민');
  await expect(table).toContainText('검색 조건에 맞는 주민이 없어요');
  await page.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '페이지당 미연결 주민 수'
  }).click();
  await page.getByRole('option', {
    name: '20개씩 보기'
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(20);
  const navigation = page.getByRole('navigation', {
    name: '관리 메뉴',
    exact: true
  });
  await expect(navigation.getByRole('link', {
    name: '승인 관리'
  })).toHaveAttribute('href', `${BASE}/invitations`);
  await navigation.getByRole('button', {
    name: '차량 관리',
    exact: true
  }).click();
  await expect(navigation.getByText('차량 내역', {
    exact: true
  }).locator('..')).toHaveAttribute('href', `${BASE}/vehicles`);
  await expect(navigation.getByText('차량 승인', {
    exact: true
  }).locator('..')).toHaveAttribute('href', `${BASE}/vehicles/approvals`);
  await navigation.getByRole('link', {
    name: '승인 관리'
  }).click();
  await expect(page.getByRole('heading', {
    name: '승인 관리',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('table', {
    name: '가입 요청 목록'
  })).toContainText('신청계정');
});

test('모바일 승인 상세는 직접 접근·새로고침에서도 공통 헤더로 승인 관리에 복귀', async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto(`${BASE}/invitations/${id(30)}`);
  await expect(page.getByRole('heading', {
    name: '가입 요청 확인'
  })).toBeVisible();
  await page.reload();
  await page.getByRole('link', {
    name: '승인 관리로 돌아가기'
  }).click();
  await expect(page).toHaveURL(`${BASE}/invitations`);
  await expect(page.getByRole('table', {
    name: '가입 요청 목록'
  })).toBeVisible();
  await page.goto(`${BASE}/join-requests/${id(30)}`);
  await expect(page.getByRole('heading', {
    name: '가입 요청 확인'
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: '승인 관리로 돌아가기'
  })).toHaveAttribute('href', `${BASE}/invitations`);
});


test('가입 요청은 이름·응답 순서와 관계없이 102동부터 호수 숫자순 정렬 후 페이지를 나눔', async ({ page }) => {
  const state = await mockWorkspace(page);
  const row = (n: number, buildingName: string | null, unitNumber: string | null, name: string): UnlinkedResident => ({
    residentId: id(2000 + n),
    name,
    buildingName,
    unitNumber,
    phoneLast4: null,
    relationType: 'TENANT'
  });
  state.unlinkedRows = [
    row(0, '104동', '101', '가장 앞 이름'),
    row(1, '102동', '1001', '가나다'),
    row(2, '102동', '101', '나나다'),
    row(3, '102동', '2', '마지막 이름'),
    ...Array.from({
      length: 10
    }, (_, i) => row(10 + i, '103동', String(110 - i), `주민${i}`)),
    row(30, null, null, '소속 없는 주민')
  ];
  await page.goto(`${BASE}/join-requests`);
  const rows = page.getByRole('table', {
    name: '미연결 주민 목록'
  }).locator('tbody tr');
  await expect(rows.nth(0)).toContainText('102동 2호');
  await expect(rows.nth(1)).toContainText('102동 101호');
  await expect(rows.nth(2)).toContainText('102동 1001호');
  await expect(rows.nth(3)).toContainText('103동 101호');
  await page.getByRole('button', {
    name: '2페이지',
    exact: true
  }).click();
  await expect(rows.last()).toContainText('소속 없음');
  await page.getByRole('textbox', {
    name: '미연결 주민 검색'
  }).fill('102동');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('102동 2호');
  await expect(rows.nth(2)).toContainText('102동 1001호');
  await page.getByRole('textbox', {
    name: '미연결 주민 검색'
  }).clear();
  await page.getByRole('combobox', {
    name: '동 필터',
    exact: true
  }).click();
  await expect(page.getByRole('option')).toHaveText(['전체 동', '102동', '103동', '104동']);
  await page.getByRole('option', {
    name: '103동',
    exact: true
  }).click();
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('103동 101호');
  await expect(rows.last()).toContainText('103동 110호');
  await page.getByRole('textbox', {
    name: '미연결 주민 검색'
  }).fill('110호');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('103동 110호');
  await page.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('102동 2호');
  await expect(page.getByRole('combobox', {
    name: '동 필터',
    exact: true
  })).toContainText('전체 동');
});


test('주민별 개인 초대를 발급하고 코드·바로 가입 링크 전달을 선택', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const state = await mockWorkspace(page);
  await page.goto(`${BASE}/join-requests`);
  await expect(page).toHaveTitle('가입 요청 | 모아홈');
  await expect(page.getByRole('button', {
    name: '공통 코드 폐기',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '김주민 개인 초대',
    exact: true
  })).toHaveCSS('color', 'rgb(37, 99, 235)');

  await page.getByRole('button', {
    name: '김주민 개인 초대',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '김주민 개인 초대'
  });
  await expect(modal.getByRole('textbox', {
    name: '초대코드'
  })).toHaveValue('R-ABCD-EFGH-JKLM');
  await expect(modal.getByRole('button', {
    name: '코드 복사',
    exact: true
  })).toBeVisible();
  await expect(modal.getByRole('button', {
    name: '가입 링크 복사',
    exact: true
  })).toBeVisible();
  await modal.getByRole('button', {
    name: '가입 링크 복사',
    exact: true
  }).click();
  await expect(modal.getByRole('status')).toContainText('가입 링크를 복사했어요.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('http://localhost:3100/invitations#R-ABCD-EFGH-JKLM');
  await expect(modal.getByRole('button', {
    name: '메시지로 공유'
  })).toBeVisible();
  for (const name of ['코드 복사', '가입 링크 복사', '메시지로 공유']) {
    await expect(modal.getByRole('button', {
      name,
      exact: true
    })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(modal.getByRole('button', {
      name,
      exact: true
    })).toHaveCSS('color', 'rgb(37, 99, 235)');
  }

  await page.screenshot({
    path: test.info().outputPath('personalInvitationDesktop.png'),
    animations: 'disabled'
  });

  expect(state.writes.some((r) => r.path.endsWith('/resident-invitations/residents/' + id(1000)))).toBe(true);
  await modal.getByRole('button', {
    name: '초대 전달 닫기'
  }).click();
  const expiresAt = state.invitationRows[0].expiresAt;
  await page.getByRole('button', {
    name: '김주민 개인 초대 메뉴',
    exact: true
  }).click();
  await page.getByRole('menuitem', {
    name: '개인 초대',
    exact: true
  }).click();
  await expect(modal.getByRole('textbox', {
    name: '초대코드'
  })).toHaveValue('R-ABCD-EFGH-JKLM');
  await modal.getByRole('button', {
    name: '초대 전달 닫기'
  }).click();
  await page.reload();
  await page.getByRole('button', {
    name: '김주민 개인 초대 메뉴',
    exact: true
  }).click();
  await page.getByRole('menuitem', {
    name: '개인 초대',
    exact: true
  }).click();
  await expect(modal.getByRole('textbox', {
    name: '초대코드'
  })).toHaveValue('R-ABCD-EFGH-JKLM');
  expect(state.invitationRows[0].expiresAt).toBe(expiresAt);
  expect(state.writes.filter((r) => r.path.includes('/resident-invitations/residents/'))).toHaveLength(1);
  await modal.getByRole('button', {
    name: '초대 전달 닫기'
  }).click();
  const invitationMenu = page.getByRole('button', {
    name: '김주민 개인 초대 메뉴'
  });
  await expect(invitationMenu).toBeVisible();
  await invitationMenu.click();
  await expect(page.getByRole('menu', {
    name: '김주민 개인 초대 작업'
  })).toBeVisible();
  await expect(page.getByRole('menuitem')).toHaveText(['개인 초대', '재발급', '철회']);
  const triggerBox = await invitationMenu.boundingBox();
  const menuBox = await page.getByRole('menu', {
    name: '김주민 개인 초대 작업'
  }).boundingBox();
  expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);
  expect(Math.abs(menuBox!.x + menuBox!.width - triggerBox!.x - triggerBox!.width)).toBeLessThan(2);
  await expect(page.getByRole('row').filter({
    hasText: '김주민'
  }).getByRole('button')).toHaveCount(1);

  await page.getByRole('menuitem', {
    name: '재발급',
    exact: true
  }).click();
  await expect(modal).toBeVisible();
  expect(state.writes.filter((r) => r.path.includes('/resident-invitations/residents/'))).toHaveLength(2);
  await modal.getByRole('button', {
    name: '초대 전달 닫기'
  }).click();
  await invitationMenu.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', {
    name: '개인 초대',
    exact: true
  })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(invitationMenu).toBeFocused();
  await invitationMenu.click();
  await page.getByRole('menuitem', {
    name: '철회',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '김주민 개인 초대',
    exact: true
  })).toBeVisible();
});

test('공통 가입 링크는 코드 입력 없이 이름 필수·연락처 선택 폼으로 바로 연결', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.goto(`/join/${PROPERTY}#B-ABCD-EFGH-JKLM`);
  await expect(page.getByRole('textbox', {
    name: '이름',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('textbox', {
    name: '초대코드',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('textbox', {
    name: '이름',
    exact: true
  })).toHaveAttribute('required', '');
  await expect(page.getByRole('textbox', {
    name: '연락처 (선택)'
  })).not.toHaveAttribute('required');
  await page.getByRole('textbox', {
    name: '이름',
    exact: true
  }).fill('신청한 실명');
  await page.getByRole('combobox', {
    name: '동·호수'
  }).click();
  await page.getByRole('option', {
    name: '102동 201호'
  }).click();
  await expect(page.getByRole('button', {
    name: '가입 신청'
  })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByRole('button', {
    name: '가입 신청'
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: '가입을 신청했어요'
  })).toBeVisible();
  await expect(page.locator('img[data-state="approval-pending"]')).toBeVisible();
  await expect(page.locator('img[data-state="success"]')).toHaveCount(0);
  expect(state.writes.find((r) => r.path.endsWith('/membership-requests'))?.body).toEqual({
    code: 'B-ABCD-EFGH-JKLM',
    name: '신청한 실명',
    unitId: id(101),
    phone: null
  });
});

test('개인 링크는 코드 입력 없이 지정 주민 정보 확인 후 바로 가입', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.goto('/invitations#R-ABCD-EFGH-JKLM');
  await expect(page.getByText('모아빌라 · 102동 201호', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('textbox', {
    name: '초대코드',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByText('미등록', {
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '참여하기',
    exact: true
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: '주민 가입이 완료'
  })).toBeVisible();
  await expect(page.locator('img[data-state="success"]')).toBeVisible();
  await expect(page.locator('img[data-state="approval-pending"]')).toHaveCount(0);
  expect(state.writes.find((r) => r.path.endsWith('/accept'))?.body).toEqual({
    token: 'R-ABCD-EFGH-JKLM',
    correction: false
  });
});

test('개인 정보 정정 제출은 주민 PENDING이나 가입 성공 그림으로 표시하지 않음', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.goto('/invitations#R-ABCD-EFGH-JKLM');
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '이름',
    exact: true
  }).fill('정정 이름');
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('status')).toContainText('정보 정정을 요청했어요. 관리자 확인 후 가입이 완료됩니다.');
  await expect(page.locator('img[data-state="approval-pending"]')).toHaveCount(0);
  await expect(page.locator('img[data-state="success"]')).toHaveCount(0);
  expect(state.residentJoined).toBe(false);
  expect(state.writes.find((row) => row.path.endsWith('/accept'))?.body).toEqual({
    token: 'R-ABCD-EFGH-JKLM',
    correction: true,
    name: '정정 이름',
    phoneAction: 'KEEP'
  });
});

test('개인 초대 정정 요청은 승인 관리에서 이름·선택 연락처를 검토 후 가입 승인', async ({ page }) => {
  const state = await mockWorkspace(page);
  state.invitationRows = [{
    id: id(3001),
    residentId: id(1000),
    name: '김주민',
    unitLabel: '102동 201호',
    phoneLast4: null,
    status: 'CHANGE_REQUESTED',
    revision: 1,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    requestedName: '정정한 이름',
    requestedPhoneLast4: null,
    phoneAction: 'KEEP'
  }];
  await page.goto(`${BASE}/invitations`);
  await expect(page).toHaveTitle('승인 관리 | 모아홈');
  const table = page.getByRole('table', {
    name: '개인 초대 승인 목록'
  });
  await expect(table).toContainText('정정한 이름');
  await expect(table).toContainText('미등록');
  await table.getByRole('button', {
    name: '정정 후 가입 승인'
  }).click();
  await expect(table).toContainText('가입 완료');
  expect(state.writes.find((r) => r.path.endsWith('/resident-invitations/' + id(3001) + '/approve'))?.body).toEqual({
    revision: 1
  });
});


test('개인 초대 모달은 모바일에서 전달 버튼 3개가 전체 너비와 56px 높이로 표시', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockWorkspace(page);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto(`${BASE}/join-requests`);
  await page.getByRole('button', {
    name: '김주민 개인 초대',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '김주민 개인 초대'
  });
  await modal.getByRole('button', {
    name: '가입 링크 복사',
    exact: true
  }).click();
  await expect(modal.getByRole('status')).toContainText('가입 링크를 복사했어요.');
  for (const name of ['코드 복사', '가입 링크 복사', '메시지로 공유']) {
    const button = modal.getByRole('button', {
      name,
      exact: true
    });
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThan(290);
    expect(box!.height).toBeGreaterThanOrEqual(56);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('personalInvitationMobile.png'),
    animations: 'disabled'
  });
});


for (const code of ['B-ABCD-EFGH-JKLM', 'R-ABCD-EFGH-JKLM']) {
  test(`비로그인 ${code[0]} 초대 링크는 정보를 노출하지 않고 로그인 후 원래 가입으로 복귀`, async ({ page }) => {
    const state = await mockWorkspace(page);
    state.loggedIn = false;
    const link = code.startsWith('B') ? `/join/${PROPERTY}#${code}` : `/invitations#${code}`;
    await page.goto(link);
    await expect(page.getByRole('link', {
      name: '카카오 로그인',
      exact: true
    })).toBeVisible();
    await expect(page.getByText('김주민', {
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('textbox', {
      name: '이름',
      exact: true
    })).toHaveCount(0);
    expect(state.writes.some((row) => /\/(preview|shared-options|accept)$/.test(row.path))).toBe(false);
    state.loggedIn = true;
    await page.getByRole('button', {
      name: '로그인 확인',
      exact: true
    }).click();
    if (code.startsWith('B')) await expect(page.getByRole('textbox', {
      name: '이름',
      exact: true
    })).toBeVisible();
    else await expect(page.getByRole('button', {
      name: '참여하기',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('textbox', {
      name: '초대코드',
      exact: true
    })).toHaveCount(0);
  });
}

for (const width of [1440, 375]) {
  test(`최초 시작의 주민 참여 ${width}px는 PC 모달·모바일 페이지로 열린다`, async ({ page }) => {
    const state = await mockWorkspace(page); state.hasManagedProperties = false;
    await page.setViewportSize({
      width,
      height: 960
    });
    await page.goto('/start');
    await page.getByRole('button', {
      name: '주민으로 참여하기',
      exact: true
    }).click();
    if (width >= 768) {
      await expect(page).toHaveURL('/start');
      const modal = page.getByRole('dialog', {
        name: '초대코드로 참여하기'
      });
      await expect(modal.getByRole('textbox', {
        name: '초대코드'
      })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await expect(page.getByRole('button', {
        name: '주민으로 참여하기',
        exact: true
      })).toBeFocused();
    } else {
      await expect(page).toHaveURL('/join');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('textbox', {
        name: '초대코드'
      })).toBeVisible();
    }
  });
}
for (const path of ['/join', '/invitations']) {
  test(`직접 ${path} 코드 입력도 PC 공통 모달로 열린다`, async ({ page }) => {
    await mockWorkspace(page);
    await page.goto(path);
    await expect(page.getByRole('dialog', {
      name: '초대코드로 참여하기'
    }).getByRole('textbox', {
      name: '초대코드'
    })).toBeVisible();
  });
}
for (const width of [1440, 375]) {
  test(`주민 ${width}px는 시작·가입 완료에서 임시 주민 홈으로 이동하고 관리자 메뉴를 표시하지 않는다`, async ({ page }) => {
    const state = await mockWorkspace(page); state.hasManagedProperties = false;
    await page.setViewportSize({
      width,
      height: 960
    });
    await page.goto('/invitations#R-ABCD-EFGH-JKLM');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', {
      name: '초대된 주민 정보'
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '수정',
      exact: true
    })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('residentParticipation.png'),
      fullPage: true,
      animations: 'disabled'
    });
    const primary = page.getByRole('button', {
      name: '참여하기',
      exact: true
    });
    const secondary = page.getByRole('button', {
      name: '수정',
      exact: true
    });
    const first = await secondary.boundingBox(); const second = await primary.boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y);
    expect(Math.abs(first!.width - second!.width)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await primary.click();
    await expect(page.getByRole('status')).toContainText('주민 가입이 완료되었어요.');
    await page.getByRole('button', {
      name: '주민 홈으로'
    }).click();
    await expect(page).toHaveURL('/resident');
    await expect(page.getByRole('heading', {
      name: '주민 홈',
      exact: true
    })).toBeVisible();
    await expect(page.getByText('모아빌라', {
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('navigation', {
      name: /관리/
    })).toHaveCount(0);
    expect(state.writes.some((row) => row.path.endsWith('/accept'))).toBe(true);
    await page.goto('/start');
    await expect(page).toHaveURL('/resident');
    await page.reload();
    await expect(page.getByRole('heading', {
      name: '주민 홈',
      exact: true
    })).toBeVisible();
  });
}

test('기존 해시 전용 초대는 보관한 링크로 복원해 같은 코드·링크·만료를 다시 열고 재발급하지 않는다', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.goto(`${BASE}/join-requests`);
  await page.getByRole('button', {
    name: '김주민 개인 초대',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '김주민 개인 초대'
  });
  await modal.getByRole('button', {
    name: '초대 전달 닫기'
  }).click();
  const expiresAt = state.invitationRows[0].expiresAt;
  state.legacyShare = true;
  await page.getByRole('button', {
    name: '김주민 개인 초대 메뉴'
  }).click();
  await page.getByRole('menuitem', {
    name: '개인 초대',
    exact: true
  }).click();
  await expect(modal.getByRole('button', {
    name: '재발급',
    exact: true
  })).toHaveCount(0);
  await expect(modal.getByRole('button', {
    name: '가입 링크 복사',
    exact: true
  })).toHaveCount(0);
  const input = modal.getByRole('textbox', {
    name: '기존 초대코드 또는 가입 링크'
  });
  await input.fill('R-AAAA-AAAA-AAAA');
  await modal.getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('R-AAAA-AAAA-AAAA');
  await input.fill('http://localhost:3100/invitations#R-ABCD-EFGH-JKLM');
  await modal.getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(modal.getByRole('textbox', {
    name: '초대코드',
    exact: true
  })).toHaveValue('R-ABCD-EFGH-JKLM');
  await expect(modal.getByRole('button', {
    name: '가입 링크 복사',
    exact: true
  })).toBeVisible();
  expect(state.invitationRows[0].expiresAt).toBe(expiresAt);
  await modal.getByRole('button', {
    name: '초대 전달 닫기'
  }).click();
  await page.reload();
  await page.getByRole('button', {
    name: '김주민 개인 초대 메뉴'
  }).click();
  await page.getByRole('menuitem', {
    name: '개인 초대',
    exact: true
  }).click();
  await expect(modal.getByRole('textbox', {
    name: '초대코드',
    exact: true
  })).toHaveValue('R-ABCD-EFGH-JKLM');
  await expect(modal.getByRole('textbox', {
    name: '기존 초대코드 또는 가입 링크'
  })).toHaveCount(0);
  expect(state.writes.filter((row) => row.path.includes('/resident-invitations/residents/'))).toHaveLength(1);
});
test('부담당자는 재로그인 시 관리자 대시보드에 진입하고 주민 홈으로 보내지 않는다', async ({ page }) => {
  const state = await mockWorkspace(page); state.managementRole = 'MANAGER'; state.residentJoined = true;
  await page.goto('/start');
  await expect(page).toHaveURL(`${BASE}/dashboard`);
  await expect(page.getByRole('navigation', {
    name: '관리 메뉴'
  })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', {
    name: '관리 메뉴'
  })).toBeVisible();
  await page.goto(`${BASE}/join-requests`);
  await expect(page.getByRole('heading', {
    name: '가입 요청',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '전체 초대코드 발급'
  })).toBeVisible();
});

for (const width of [1440, 390]) {
  test(`부담당자 ${width}px는 통장 거래·주민 조회·일반 수정을 쓰고 주민 승격만 선택할 수 없다`, async ({ page }) => {
    const state = await mockWorkspace(page, true); state.managementRole = 'MANAGER';
    await page.setViewportSize({
      width,
      height: 960
    });
    await page.route(`${API}/api/properties/${PROPERTY}/banking/workspace`, (route) => json(route, {
      propertyId: PROPERTY,
      asOf: '2026-10-24',
      accounts: [],
      buildings: [],
      units: [],
      rows: [],
      rules: []
    }));
    await page.route(`${API}/api/properties/${PROPERTY}/payments/workspace`, (route) => json(route, {
      propertyId: PROPERTY,
      asOf: '2026-10-24',
      accounts: [],
      units: [],
      charges: [],
      payments: []
    }));
    await page.goto(`${BASE}/banking/transactions`);
    await expect(page.getByRole('heading', {
      name: '통장 거래',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await page.goto(`${BASE}/residents`);
    await expect(page.getByRole('table', {
      name: '주민 목록'
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '주민 등록',
      exact: true
    })).toBeVisible();
    await page.getByRole('button', {
      name: '김주민 상세 보기'
    }).click();
    const detail = width < 768 ? page.getByRole('main') : page.getByRole('dialog', {
      name: '주민 상세'
    });
    await detail.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    const form = width < 768 ? page.getByRole('main') : page.getByRole('dialog', {
      name: '주민 수정'
    });
    const role = form.getByRole('combobox', {
      name: '역할',
      exact: true
    });
    await expect(role).toBeDisabled();
    await expect(role).toContainText('주민');
    await expect(form.getByRole('textbox', {
      name: '주민 이름',
      exact: true
    })).toBeEnabled();
    await form.getByRole('textbox', {
      name: '주민 이름',
      exact: true
    }).fill('변경 주민');
    await form.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    expect(state.writes.find((row) => row.path.endsWith(`/residents/${id(10)}`))?.body.name).toBe('변경 주민');
  });
}

test('부담당자에게 관리소장 상세는 조회만 제공하고 수정·삭제 버튼을 노출하지 않는다', async ({ page }) => {
  const state = await mockWorkspace(page, true); state.managementRole = 'MANAGER';
  await page.route(`${API}/api/properties/${PROPERTY}/residents/${id(10)}`, (route) => json(route, {
    id: id(10),
    propertyId: PROPERTY,
    name: '김소장',
    phoneLast4: '1234',
    unitId: id(101),
    buildingId: null,
    buildingName: null,
    unitNumber: '101',
    relationType: 'OWNER',
    representative: false,
    signupStatus: 'APPROVED',
    serviceRole: 'ADMIN',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-17T00:00:00Z',
    hasLinkedRequests: true,
    representativeCandidates: []
  }));
  await page.goto(`${BASE}/residents/${id(10)}`);
  const main = page.getByRole('main');
  await expect(main.getByText('김소장', {
    exact: true
  })).toBeVisible();
  await expect(main.getByRole('button', {
    name: '수정',
    exact: true
  })).toHaveCount(0);
  await expect(main.getByRole('button', {
    name: '삭제',
    exact: true
  })).toHaveCount(0);
});
