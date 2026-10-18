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
    legacyOpening: false,
    emptyRequests: false,
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
    if (path.endsWith('/managed-properties')) return json(route, {
      properties: [{
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'ADMIN'
      }]
    });
    if (path.endsWith('/management-context')) return json(route, {
      propertyId: PROPERTY,
      name: '모아빌라',
      role: 'ADMIN'
    });
    if (['POST', 'PUT', 'DELETE'].includes(request.method())) state.writes.push({
      path,
      body: request.postDataJSON() ?? {}
    });
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

test('가입 승인과 주민 선택은 별도 가입 요청 메뉴에서 처리', async ({ page }) => {
  const state = await mockWorkspace(page);
  await page.goto(`${BASE}/join-requests`);
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
  await expect(page.getByRole('textbox', {
    name: '초대코드',
    exact: true
  })).toBeVisible();
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
  await page.goto(`${BASE}/join-requests`);
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
      name: '주민 참여 링크 복사',
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
    await page.getByRole('button', {
      name: '계좌 관리',
      exact: true
    }).click();
    const dialog = page.getByRole('dialog', {
      name: '관리계좌',
      exact: true
    });
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByRole('button', {
      name: '다시 시도',
      exact: true
    }).click();
    await dialog.getByRole('button', {
      name: '정보 정정',
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
    await dialog.getByRole('button', {
      name: '관리계좌 닫기'
    }).click();
    await page.getByRole('button', {
      name: '계좌 관리',
      exact: true
    }).click();
    await dialog.getByRole('button', {
      name: '정보 정정',
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
    await dialog.getByRole('button', {
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

test('부담당자의 설정에는 통장 관리을 제공하지 않음', async ({ page }) => {
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
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '등록 및 참여',
    exact: true
  })).toBeVisible();
});
