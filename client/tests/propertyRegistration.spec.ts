import {
  expect,
  test,
  type Page,
  type Route
} from '@playwright/test';

const API_ORIGIN = 'http://localhost:8080';
const VALIDATE_URL = `${API_ORIGIN}/api/property-registrations/basic-info/validate`;
const DRAFT_STORAGE_KEY = 'moahome.property-registration.basic-info';
const POSTCODE_SCRIPT_URL = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
const CURRENT_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  displayName: '모아 주민',
  profileImageUrl: null,
  systemRole: 'USER',
  status: 'ACTIVE',
};

/** 실제 서버와 주소 검색 외부망 없이 사용자 입력·인증 요청의 결과를 확인합니다. */
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

/** 공식 검색 SDK 경계만 모의 처리하고 실제 주소 선택 콜백으로 폼을 채웁니다. */
async function mockPostcode(page: Page) {
  await page.route(POSTCODE_SCRIPT_URL, (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.kakao = {
      Postcode: class {
        constructor(options) { this.options = options; }
        embed(element) {
          for (const type of ['R', 'J']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = type === 'R' ? '도로명 주소 선택' : '지번 주소 선택';
            button.onclick = () => this.options.oncomplete({
              userSelectedType: type,
              roadAddress: '서울특별시 강동구 성내로 10',
              jibunAddress: '서울특별시 강동구 성내동 10',
              address: '서울특별시 강동구 성내로 10'
            });
            element.append(button);
          }
        }
      }
    };`,
  }));
}

/** 시작 화면에서 실제 등록 진입 버튼을 눌러 폼을 엽니다. */
async function openRegistration(page: Page) {
  await page.goto('/start');
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  })).toBeVisible();
}

/** 검색 결과를 선택해 읽기 전용 주소를 채우고 상세주소 포커스 복귀도 검증합니다. */
async function selectAddress(page: Page, type: '도로명' | '지번' = '도로명') {
  await page.getByRole('button', {
    name: '주소 검색',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: `${type} 주소 선택`
  }).click();
  await expect(page.getByRole('dialog', {
    name: '주소 검색',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByLabel('상세주소', {
    exact: true
  })).toBeFocused();
}

/** 기본 제출 조건을 만족시키되 선택 입력은 비워 둡니다. */
async function fillRequiredFields(page: Page) {
  await page.getByLabel('관리대상 이름').fill('성내빌라');
  await selectAddress(page);
  await page.getByRole('radio', {
    name: /^동 없음/
  }).check();
}

test.beforeEach(async ({ page }) => {
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    const response = route.request().url().endsWith('/csrf') ? {
      csrfToken: 'test-csrf'
    } : {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    await fulfillJson(route, response);
  });
  await page.route(`${API_ORIGIN}/api/users/me`, (route) => fulfillJson(route, CURRENT_USER));
  await page.route(VALIDATE_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillJson(route, {});
      return;
    }

    expect(route.request().headers().authorization).toBe('Bearer test-access');
    await fulfillJson(route, route.request().postDataJSON());
  });
  await mockPostcode(page);
});

test('이름·주소·명시적인 동 구분을 모두 입력해야 계속 버튼이 활성화되고 선택 입력은 필수가 아님', async ({ page }) => {
  await openRegistration(page);
  const continueButton = page.getByRole('button', {
    name: '등록하고 계속'
  });

  await expect(continueButton).toBeDisabled();
  await expect(page.getByRole('radio', {
    name: /^동 없음/
  })).not.toBeChecked();
  await expect(page.getByRole('radio', {
    name: /^동 있음/
  })).not.toBeChecked();
  await page.getByLabel('관리대상 이름').fill('   ');
  await expect(continueButton).toBeDisabled();
  await selectAddress(page);
  await page.getByLabel('관리대상 이름').fill('성내빌라');
  await expect(continueButton).toBeDisabled();
  await page.getByRole('radio', {
    name: /^동 없음/
  }).check();
  await expect(continueButton).toBeEnabled();
  await page.getByRole('combobox', {
    name: '건물 유형',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '빌라',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '건물 유형 선택 해제',
    exact: true
  }).click();
  await expect(continueButton).toBeEnabled();
  await page.getByLabel('관리대상 이름').fill('');
  await expect(continueButton).toBeDisabled();
});

test('Unicode 글자 수와 선택 입력 길이를 검증하고 정상 입력으로 바꾸면 계속 버튼이 복구됨', async ({ page }) => {
  await openRegistration(page);
  await fillRequiredFields(page);
  const continueButton = page.getByRole('button', {
    name: '등록하고 계속'
  });
  const nameInput = page.getByLabel('관리대상 이름');
  await nameInput.fill(`  ${'🏠'.repeat(50)}  `);
  await expect(page.getByText('50/50', {
    exact: true
  })).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await nameInput.fill('🏠'.repeat(51));
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  }).getByRole('alert')).toContainText('50자 이내');
  await expect(continueButton).toBeDisabled();
  await nameInput.fill('성내빌라');
  await page.getByLabel('상세주소', {
    exact: true
  }).fill('가'.repeat(256));
  await expect(continueButton).toBeDisabled();
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  }).getByRole('alert')).toContainText('255자 이내');
  await page.getByLabel('상세주소', {
    exact: true
  }).fill('');
  await expect(continueButton).toBeEnabled();
});

test('건물 유형은 placeholder를 목록에 넣지 않고 고정 옵션·선택 표시·선택 해제를 제공', async ({ page }) => {
  await page.setViewportSize({
    width: 1536,
    height: 1024
  });
  await openRegistration(page);
  const dropdown = page.getByRole('combobox', {
    name: '건물 유형',
    exact: true
  });
  await expect(dropdown).toHaveText('건물 유형을 선택해주세요');
  await dropdown.click();
  const listbox = page.getByRole('listbox', {
    name: '건물 유형',
    exact: true
  });
  await expect(listbox.getByRole('option')).toHaveText(['빌라', '아파트', '공동주택', '기타']);
  await expect(listbox.getByRole('option', {
    name: '건물 유형을 선택해주세요'
  })).toHaveCount(0);
  const fieldBounds = await dropdown.evaluate((element) => {
    const bounds = element.parentElement!.getBoundingClientRect();

    return {
      x: bounds.x,
      width: bounds.width,
      bottom: bounds.bottom
    };
  });
  const menuBounds = await listbox.boundingBox();
  expect(menuBounds?.x).toBeCloseTo(fieldBounds.x, 0);
  expect(menuBounds?.width).toBeCloseTo(fieldBounds.width, 0);
  expect(menuBounds?.y).toBeGreaterThan(fieldBounds.bottom);
  await page.screenshot({
    path: test.info().outputPath('propertyTypeOptionsDesktop.png')
  });
  await listbox.getByRole('option', {
    name: '아파트',
    exact: true
  }).click();
  await expect(dropdown).toHaveText('아파트');
  await expect(dropdown).toHaveAttribute('aria-expanded', 'false');
  await dropdown.click();
  await expect(listbox.getByRole('option', {
    name: '아파트',
    exact: true
  })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('관리대상 이름').click();
  await expect(listbox).toHaveCount(0);
  await expect(dropdown).toHaveText('아파트');
  await page.getByRole('button', {
    name: '건물 유형 선택 해제',
    exact: true
  }).click();
  await expect(dropdown).toHaveText('건물 유형을 선택해주세요');
});

test('드롭다운은 방향키·Enter로 선택하고 Escape는 목록만 닫으며 Tab으로 다음 입력에 이동', async ({ page }) => {
  await openRegistration(page);
  const dropdown = page.getByRole('combobox', {
    name: '건물 유형',
    exact: true
  });
  await dropdown.focus();
  await dropdown.press('ArrowDown');
  await expect(page.getByRole('listbox', {
    name: '건물 유형',
    exact: true
  })).toBeVisible();
  await dropdown.press('ArrowDown');
  await dropdown.press('Enter');
  await expect(dropdown).toHaveText('아파트');
  await expect(dropdown).toBeFocused();
  await dropdown.press('ArrowDown');
  await dropdown.press('End');
  await dropdown.press('Escape');
  await expect(dropdown).toHaveText('아파트');
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  })).toBeVisible();
  await dropdown.press('ArrowDown');
  await dropdown.press('Home');
  await dropdown.press('Enter');
  await expect(dropdown).toHaveText('빌라');
  await dropdown.press('ArrowDown');
  await dropdown.press('Tab');
  await expect(dropdown).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', {
    name: '건물 유형 선택 해제',
    exact: true
  })).toBeFocused();
});

test('모바일 목록은 화면 안에 표시하고 공통 라디오는 키보드로 동 구분을 변경', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await openRegistration(page);
  await fillRequiredFields(page);
  const noBuildings = page.getByRole('radio', {
    name: /^동 없음/
  });
  await noBuildings.focus();
  await noBuildings.press('ArrowRight');
  await expect(page.getByRole('radio', {
    name: /^동 있음/
  })).toBeChecked();
  await expect(noBuildings).not.toBeChecked();
  await expect(page.getByRole('button', {
    name: '등록하고 계속'
  })).toBeEnabled();
  await page.getByRole('combobox', {
    name: '건물 유형',
    exact: true
  }).click();
  const listbox = page.getByRole('listbox', {
    name: '건물 유형',
    exact: true
  });
  await expect(listbox).toBeVisible();
  const bounds = await listbox.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: test.info().outputPath('propertyTypeOptionsMobile.png')
  });
  await listbox.getByRole('option', {
    name: '빌라',
    exact: true
  }).click();
  await expect(page.getByRole('combobox', {
    name: '건물 유형',
    exact: true
  })).toHaveText('빌라');
});

test('기본 정보만 정규화해서 검증하고 대기 중 중복 제출과 입력 변경을 막음', async ({ page }) => {
  let requestCount = 0;
  let releaseResponse: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(VALIDATE_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillJson(route, {});
      return;
    }

    requestCount += 1;
    expect(route.request().postDataJSON()).toEqual({
      name: '성내빌라',
      address: '서울특별시 강동구 성내로 10',
      addressDetail: null,
      propertyType: null,
      hasBuildings: false,
    });
    await responseGate;
    await fulfillJson(route, route.request().postDataJSON());
  });
  const finalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${API_ORIGIN}/api/property-registrations`) {
      finalRequests.push(request.url());
    }
  });

  await openRegistration(page);
  await fillRequiredFields(page);
  await page.getByLabel('관리대상 이름').fill('  성내빌라  ');
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(page.getByRole('button', {
    name: '확인 중…'
  })).toBeDisabled();
  await expect(page.getByLabel('관리대상 이름')).toBeDisabled();
  await page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  }).locator('form').dispatchEvent('submit');
  await expect.poll(() => requestCount).toBe(1);
  releaseResponse();
  await expect(page).toHaveURL(/registration=units$/);
  await expect(page.getByRole('heading', {
    name: '동·세대 설정',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('성내빌라');
  expect(finalRequests).toHaveLength(0);
  await page.getByLabel('관리대상 이름').fill('새 빌라');
  await expect(page.getByRole('status')).toHaveCount(0);
});

for (const failure of [
  {
    name: '입력 오류',
    status: 400,
    body: {
      code: 'INVALID_REQUEST'
    },
    message: '입력한 기본 정보를 확인해주세요.'
  },
  {
    name: '일시 장애',
    status: 503,
    body: {
      code: 'REGISTRATION_SERVICE_UNAVAILABLE'
    },
    message: '잠시 후 다시 시도해주세요.'
  },
  {
    name: '잘못된 성공 응답',
    status: 200,
    body: {
      name: '이름만 있는 응답'
    },
    message: '검증 결과를 확인하지 못했어요.'
  },
]) {
  test(`검증 실패 (${failure.name})는 입력을 유지하고 같은 화면에서 재시도할 수 있음`, async ({ page }) => {
    let attempts = 0;
    await page.route(VALIDATE_URL, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await fulfillJson(route, {});
        return;
      }

      attempts += 1;
      await fulfillJson(route, attempts === 1 ? failure.body : route.request().postDataJSON(), attempts === 1 ? failure.status : 200);
    });
    await openRegistration(page);
    await fillRequiredFields(page);
    await page.getByRole('button', {
      name: '등록하고 계속'
    }).click();
    await expect(page.getByRole('dialog', {
      name: '관리할 곳 등록',
      exact: true
    }).getByRole('alert')).toContainText(failure.message);
    await expect(page.getByLabel('관리대상 이름')).toHaveValue('성내빌라');
    await expect(page.getByRole('radio', {
      name: /^동 없음/
    })).toBeChecked();
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.getByRole('button', {
      name: '등록하고 계속'
    }).click();
    await expect(page.getByRole('heading', {
      name: '동·세대 설정',
      exact: true
    })).toBeVisible();
    expect(attempts).toBe(2);
  });
}

test('동 있음·지번 주소·선택 입력은 선택한 값 그대로 검증 요청에 전달', async ({ page }) => {
  await openRegistration(page);
  await page.getByLabel('관리대상 이름').fill('아파트');
  await selectAddress(page, '지번');
  await page.getByRole('radio', {
    name: /^동 있음/
  }).check();
  await page.getByLabel('상세주소', {
    exact: true
  }).fill('  101동 201호  ');
  await page.getByRole('combobox', {
    name: '건물 유형',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '아파트',
    exact: true
  }).click();
  const request = page.waitForRequest((request) => request.url() === VALIDATE_URL && request.method() === 'POST');
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  expect((await request).postDataJSON()).toEqual({
    name: '아파트',
    address: '서울특별시 강동구 성내동 10',
    addressDetail: '101동 201호',
    propertyType: '아파트',
    hasBuildings: true,
  });
  await expect(page.getByRole('heading', {
    name: '동·세대 설정',
    exact: true
  })).toBeVisible();
});

/** 기본 정보의 실제 검증 성공을 거쳐 동·세대 단계로 이동합니다. */
async function openUnitSetup(page: Page, hasBuildings = false) {
  await openRegistration(page);
  await fillRequiredFields(page);
  if (hasBuildings) await page.getByRole('radio', {
    name: /^동 있음/
  }).check();
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(page.getByRole('heading', {
    name: '동·세대 설정',
    exact: true
  })).toBeVisible();
}

/** 사용자에게 보이는 편집 창에서 호수·선택 층·동을 입력해 세대를 추가합니다. */
async function addUnit(page: Page, unitNumber: string, floor = '', buildingName?: string, vacant = false) {
  await page.getByRole('button', {
    name: '세대 추가',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '세대 추가',
    exact: true
  });
  await editor.getByRole('textbox', {
    name: '호수',
    exact: true
  }).fill(unitNumber);
  await editor.getByLabel('층', {
    exact: true
  }).fill(floor);
  if (buildingName) {
    await editor.getByRole('combobox', {
      name: '동',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: buildingName,
      exact: true
    }).click();
  }
  if (vacant) {
    await editor.getByRole('combobox', {
      name: '상태',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '공실',
      exact: true
    }).click();
  }
  await editor.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
}

/** 삭제 대상 확인을 거쳐야 등록 초안에서 제거됩니다. */
async function confirmUnitDeletion(page: Page) {
  await page.getByRole('alertdialog', {
    name: '세대 삭제 확인',
    exact: true
  }).getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
}

/** 동 관리를 통해 이름만 입력하며 초안 식별자는 화면에서 생성합니다. */
async function addBuilding(page: Page, name: string) {
  await page.getByRole('button', {
    name: '동 관리',
    exact: true
  }).click();
  const manager = page.getByRole('dialog', {
    name: '동 관리',
    exact: true
  });
  await manager.getByRole('button', {
    name: '동 추가',
    exact: true
  }).click();
  await manager.getByLabel('새 동 이름').fill(name);
  await manager.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await manager.getByRole('button', {
    name: '완료',
    exact: true
  }).click();
}

test('동 없음은 빈 목록에서 시작하고 추가·중복 검증·수정·검색과 이전 이동에 입력을 유지', async ({ page }) => {
  const finalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${API_ORIGIN}/api/property-registrations`) finalRequests.push(request.url());
  });
  await openUnitSetup(page);
  await expect(page.getByText('아직 등록한 세대가 없어요.')).toBeVisible();
  await expect(page.getByRole('button', {
    name: '다음',
    exact: true
  })).toBeDisabled();
  await addUnit(page, '201', '2');
  await addUnit(page, '201');
  await expect(page.getByRole('dialog', {
    name: '세대 추가',
    exact: true
  }).getByRole('alert')).toContainText('이미 등록한 호수');
  await page.keyboard.press('Escape');
  await page.getByRole('button', {
    name: '201호 수정',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '세대 수정',
    exact: true
  });
  await editor.getByLabel('층', {
    exact: true
  }).fill('-1');
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
  const row = page.getByRole('row').filter({
    has: page.getByRole('button', {
      name: '201호 수정',
      exact: true
    })
  });
  await expect(row).toContainText('B1층');
  await expect(row).toContainText('공실');
  await page.getByLabel('호수 검색').fill('999');
  await expect(page.getByText('검색 결과가 없어요.')).toBeVisible();
  await page.getByLabel('호수 검색').fill('201호');
  await expect(row).toBeVisible();
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('성내빌라');
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(row).toContainText('공실');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByRole('status').filter({
    hasText: '입력한 정보는 아직 저장되지 않았어요.'
  })).toBeVisible();
  expect(finalRequests).toHaveLength(0);
});

test('호수의 문자·붙여넣기와 앞자리 0을 보존하고 층은 정수로 검증', async ({ page }) => {
  await openUnitSetup(page);
  await page.getByRole('button', {
    name: '세대 추가',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '세대 추가',
    exact: true
  });
  const number = editor.getByRole('textbox', {
    name: '호수',
    exact: true
  });
  await number.fill('001');
  await number.pressSequentially('A');
  await expect(number).toHaveValue('001A');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('B01'));
  await number.selectText();
  await number.press('Meta+V');
  await expect(number).toHaveValue('B01');
  await editor.getByLabel('층', {
    exact: true
  }).fill('1.5');
  await editor.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(editor.getByRole('alert')).toContainText('정수로 입력해주세요.');
  await editor.getByLabel('층', {
    exact: true
  }).fill('-1');
  await editor.getByRole('combobox', {
    name: '상태',
    exact: true
  }).click();
  await expect(page.getByRole('option')).toHaveText(['사용중', '공실']);
  await page.keyboard.press('Escape');
  await editor.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await addUnit(page, '관리실');
  await addUnit(page, '201호');
  await addUnit(page, '001');
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.units.map((unit: { unitNumber: string }) => unit.unitNumber)).toEqual(['B01', '관리실', '201호', '001']);
  expect(stored.units[0].floor).toBe(-1);
  for (const label of ['B01', '관리실', '201호', '001호']) {
    await expect(page.getByRole('button', {
      name: `${label} 수정`,
      exact: true
    })).toBeVisible();
  }
});

test('동 접미사 유무가 같은 이름으로 저장되고 중복 검증하며 문자 동 이름도 허용', async ({ page }) => {
  await openUnitSetup(page, true);
  await addBuilding(page, '101');
  await addBuilding(page, 'A');
  await expect(page.getByRole('group', {
    name: '동별 보기',
    exact: true
  }).getByRole('button')).toHaveText(['전체', '101동', 'A동']);
  await page.getByRole('button', {
    name: '동 관리',
    exact: true
  }).click();
  const manager = page.getByRole('dialog', {
    name: '동 관리',
    exact: true
  });
  await manager.getByRole('button', {
    name: '동 추가',
    exact: true
  }).click();
  await manager.getByLabel('새 동 이름').fill('101동');
  await manager.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(manager.getByRole('alert')).toContainText('이미 등록한 동');
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.buildings.map((building: { name: string }) => building.name)).toEqual(['101동', 'A동']);
});

test('세대 자동 입력은 층별 미리보기에서 중복을 제외하고 규칙을 다른 동과 새로고침에 재사용', async ({ page }) => {
  await page.setViewportSize({
    width: 1448,
    height: 1086
  });
  await openUnitSetup(page, true);
  await addBuilding(page, '101');
  await addBuilding(page, '102');
  await addUnit(page, '201', '7', '101동');
  const original = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).units[0], DRAFT_STORAGE_KEY);
  const choices = page.getByRole('group', {
    name: '동별 보기',
    exact: true
  });
  await choices.getByRole('button', {
    name: '101동',
    exact: true
  }).click();
  const openAutomatic = page.getByRole('button', {
    name: '세대 자동 입력',
    exact: true
  });
  await openAutomatic.click();
  const automatic = page.getByRole('dialog', {
    name: '세대 자동 입력',
    exact: true
  });
  await expect(automatic.getByRole('combobox', {
    name: '추가할 동'
  })).toContainText('101동');
  await automatic.getByLabel('시작 층').fill('2');
  await automatic.getByLabel('마지막 층').fill('6');
  await automatic.getByLabel('층당 세대 수').fill('2');
  await expect(automatic.getByRole('status')).toHaveText('총 10세대 · 추가 9세대 · 중복 제외 1세대');
  const previewRows = automatic.getByRole('table').locator('tbody tr');
  await expect(previewRows.locator('td:first-child')).toHaveText(['201호', '202호', '301호', '302호', '401호', '402호', '501호', '502호', '601호', '602호']);
  await expect(previewRows.first()).toContainText('중복 제외');
  await page.screenshot({
    path: test.info().outputPath('automaticUnitsDesktop.png')
  });
  await automatic.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  let stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.units).toHaveLength(10);
  expect(stored.units.find((unit: { clientId: string }) => unit.clientId === original.clientId)).toEqual(original);
  expect(stored.units.find((unit: { unitNumber: string }) => unit.unitNumber === '602').floor).toBe(6);
  expect(new Set(stored.units.map((unit: { clientId: string }) => unit.clientId)).size).toBe(10);
  await openAutomatic.click();
  await expect(automatic.getByRole('status')).toHaveText('총 10세대 · 추가 0세대 · 중복 제외 10세대');
  await expect(automatic.getByRole('button', {
    name: '추가',
    exact: true
  })).toBeDisabled();
  await page.keyboard.press('Escape');
  await choices.getByRole('button', {
    name: '102동',
    exact: true
  }).click();
  await openAutomatic.click();
  await expect(automatic.getByLabel('시작 층')).toHaveValue('2');
  await expect(automatic.getByLabel('마지막 층')).toHaveValue('6');
  await expect(automatic.getByLabel('층당 세대 수')).toHaveValue('2');
  await expect(automatic.getByRole('status')).toHaveText('총 10세대 · 추가 10세대 · 중복 제외 0세대');
  await automatic.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.units).toHaveLength(20);
  const secondBuilding = stored.buildings.find((building: { name: string }) => building.name === '102동');
  expect(stored.units.filter((unit: { buildingClientId: string }) => unit.buildingClientId === secondBuilding.clientId)).toHaveLength(10);
  await page.getByRole('button', {
    name: '201호 수정',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '세대 수정',
    exact: true
  });
  await editor.getByRole('textbox', {
    name: '호수',
    exact: true
  }).fill('B01');
  await editor.getByLabel('층', {
    exact: true
  }).fill('-1');
  await editor.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: 'B01 수정',
    exact: true
  })).toBeVisible();
  await page.reload();
  await openAutomatic.click();
  await expect(automatic.getByLabel('시작 층')).toHaveValue('2');
  await expect(automatic.getByLabel('마지막 층')).toHaveValue('6');
  await expect(automatic.getByLabel('층당 세대 수')).toHaveValue('2');
  await automatic.getByRole('combobox', {
    name: '추가할 동'
  }).click();
  await page.getByRole('option', {
    name: '101동',
    exact: true
  }).click();
  await expect(automatic.getByRole('status')).toHaveText('총 10세대 · 추가 0세대 · 중복 제외 10세대');
});

test('동 없는 자동 입력은 잘못된 범위를 막고 취소에 세대를 추가하지 않으며 320px에서 미리보기와 추가를 제공', async ({ page }) => {
  await page.setViewportSize({
    width: 320,
    height: 640
  });
  await openUnitSetup(page);
  const openAutomatic = page.getByRole('button', {
    name: '세대 자동 입력',
    exact: true
  });
  await openAutomatic.click();
  const automatic = page.getByRole('dialog', {
    name: '세대 자동 입력',
    exact: true
  });
  const add = automatic.getByRole('button', {
    name: '추가',
    exact: true
  });
  await expect(automatic.getByRole('combobox', {
    name: '추가할 동'
  })).toHaveCount(0);
  await expect(add).toBeDisabled();
  await automatic.getByLabel('시작 층').fill('6');
  await automatic.getByLabel('마지막 층').fill('2');
  await automatic.getByLabel('층당 세대 수').fill('2');
  await expect(automatic.getByRole('alert')).toContainText('시작 층 이상');
  await expect(add).toBeDisabled();
  await automatic.getByLabel('시작 층').fill('2.5');
  await expect(automatic.getByRole('alert')).toContainText('정수로 입력');
  await automatic.getByLabel('시작 층').fill('2');
  await automatic.getByLabel('마지막 층').fill('32768');
  await expect(automatic.getByRole('alert')).toContainText('정수로 입력');
  await automatic.getByLabel('마지막 층').fill('100');
  await automatic.getByLabel('층당 세대 수').fill('99');
  await expect(automatic.getByRole('alert')).toContainText('최대 1,000세대');
  await automatic.getByLabel('마지막 층').fill('6');
  await automatic.getByLabel('층당 세대 수').fill('0');
  await expect(automatic.getByRole('alert')).toContainText('1~99개');
  await automatic.getByLabel('층당 세대 수').fill('2');
  await expect(automatic.getByRole('status')).toHaveText('총 10세대 · 추가 10세대 · 중복 제외 0세대');
  await automatic.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page.getByText('아직 등록한 세대가 없어요.')).toBeVisible();
  await expect(openAutomatic).toBeFocused();
  await openAutomatic.click();
  expect(await automatic.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await add.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('automaticUnits320.png')
  });
  await add.click();
  await expect(automatic).toHaveCount(0);
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.units).toHaveLength(10);
  expect(stored.units.every((unit: { buildingClientId: string | null }) => unit.buildingClientId === null)).toBe(true);
  await expect(page.getByRole('button', {
    name: '602호 수정',
    exact: true
  })).toBeVisible();
});

test('세대 자동 입력은 지하를 B로 표시하고 0층을 제외한 수량과 중복을 계산', async ({ page }) => {
  await page.setViewportSize({
    width: 320,
    height: 640
  });
  await openUnitSetup(page);
  await addUnit(page, 'B101', '-1');
  await page.getByRole('button', {
    name: '세대 자동 입력',
    exact: true
  }).click();
  const automatic = page.getByRole('dialog', {
    name: '세대 자동 입력',
    exact: true
  });
  const add = automatic.getByRole('button', {
    name: '추가',
    exact: true
  });
  await automatic.getByLabel('시작 층').fill('0');
  await automatic.getByLabel('마지막 층').fill('0');
  await automatic.getByLabel('층당 세대 수').fill('2');
  await expect(automatic.getByRole('alert')).toContainText('0층은 생성하지 않습니다');
  await expect(add).toBeDisabled();
  await expect(automatic.getByRole('table')).toHaveCount(0);

  await automatic.getByLabel('마지막 층').fill('1');
  await expect(automatic.getByRole('status')).toHaveText('총 2세대 · 추가 2세대 · 중복 제외 0세대');
  await automatic.getByLabel('시작 층').fill('-1');
  await automatic.getByLabel('마지막 층').fill('0');
  await expect(automatic.getByRole('status')).toHaveText('총 2세대 · 추가 1세대 · 중복 제외 1세대');

  // 0층을 빼면 10개 층이므로 990세대는 한 번의 생성 제한을 넘지 않습니다.
  await automatic.getByLabel('시작 층').fill('-5');
  await automatic.getByLabel('마지막 층').fill('5');
  await automatic.getByLabel('층당 세대 수').fill('99');
  await expect(automatic.getByRole('status')).toHaveText('총 990세대 · 추가 989세대 · 중복 제외 1세대');
  await expect(add).toBeEnabled();
  await automatic.getByLabel('마지막 층').fill('6');
  await expect(automatic.getByRole('alert')).toContainText('최대 1,000세대');
  await expect(add).toBeDisabled();

  await automatic.getByLabel('시작 층').fill('-2');
  await automatic.getByLabel('마지막 층').fill('1');
  await automatic.getByLabel('층당 세대 수').fill('2');
  await expect(automatic.getByRole('status')).toHaveText('총 6세대 · 추가 5세대 · 중복 제외 1세대');
  const rows = automatic.getByRole('table').locator('tbody tr');
  await expect(rows.locator('td:first-child')).toHaveText(['B201호', 'B202호', 'B101호', 'B102호', '101호', '102호']);
  await expect(rows.locator('td:nth-child(2)')).toHaveText(['B2층', 'B2층', 'B1층', 'B1층', '1층', '1층']);
  await expect(add).toBeEnabled();
  await add.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('automaticBasement320.png')
  });
  await add.click();
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.units).toHaveLength(6);
  expect(stored.units.map((unit: { unitNumber: string }) => unit.unitNumber).sort()).toEqual(['101', '102', 'B101', 'B102', 'B201', 'B202']);
  expect(stored.units.some((unit: { floor: number }) => unit.floor === 0)).toBe(false);
  expect(stored.units.find((unit: { unitNumber: string }) => unit.unitNumber === 'B201').floor).toBe(-2);
  await expect(page.getByRole('button', {
    name: 'B201호 수정',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('row').filter({
    hasText: 'B2층'
  })).toHaveCount(2);
});

test('동별 중복 범위와 이름 수정의 세대 연결을 유지하고 동 삭제 범위를 확인', async ({ page }) => {
  await openUnitSetup(page, true);
  await expect(page.getByRole('button', {
    name: '세대 추가',
    exact: true
  })).toBeDisabled();
  await addBuilding(page, '101동');
  await addUnit(page, '201', '2');
  await addBuilding(page, '102동');
  await addUnit(page, '201', '', '102동');
  await expect(page.getByRole('button', {
    name: '201호 수정',
    exact: true
  })).toHaveCount(2);
  await expect(page.getByRole('combobox', {
    name: '동별 보기',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '동 관리',
    exact: true
  }).click();
  const manager = page.getByRole('dialog', {
    name: '동 관리',
    exact: true
  });
  const editBuilding = manager.getByRole('button', {
    name: '101동 수정',
    exact: true
  });
  const deleteBuilding = manager.getByRole('button', {
    name: '101동 삭제',
    exact: true
  });
  await expect(editBuilding).toHaveCSS('color', 'rgb(22, 163, 74)');
  await expect(editBuilding.locator('svg')).toBeVisible();
  await expect(editBuilding).toHaveText('');
  await expect(deleteBuilding).toHaveCSS('color', 'rgb(239, 68, 68)');
  await deleteBuilding.click();
  await expect(page.getByRole('alertdialog', {
    name: '동 삭제 확인',
    exact: true
  })).toBeVisible();
  await page.getByRole('alertdialog', {
    name: '동 삭제 확인',
    exact: true
  }).getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await editBuilding.click();
  await manager.getByLabel('동 이름').fill('A동');
  await manager.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await manager.getByRole('button', {
    name: '완료',
    exact: true
  }).click();
  await page.getByRole('group', {
    name: '동별 보기',
    exact: true
  }).getByRole('button', {
    name: 'A동',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '201호 수정',
    exact: true
  })).toHaveCount(1);
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  const renamedBuilding = stored.buildings.find((building: { name: string }) => building.name === 'A동');
  expect(stored.units[0].buildingClientId).toBe(renamedBuilding.clientId);
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await page.getByRole('radio', {
    name: /^동 없음/
  }).check();
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(page.getByRole('button', {
    name: '동 연결 해제',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '동 연결 해제',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '201호 수정',
    exact: true
  })).toHaveCount(2);
  await expect(page.getByRole('button', {
    name: '다음',
    exact: true
  })).toBeDisabled();
});

for (const viewport of [{
  width: 1448,
  height: 1086
}, {
  width: 320,
  height: 640
}]) {
  test(`동별 세대 전체 삭제는 확인 후 동과 다른 세대를 유지하고 자동 입력을 재사용 (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openUnitSetup(page, true);
    for (const name of ['101동', '102동', '103동']) await addBuilding(page, name);
    await addUnit(page, '202', '2', '102동');
    const choices = page.getByRole('group', {
      name: '동별 보기',
      exact: true
    });
    await choices.getByRole('button', {
      name: '101동',
      exact: true
    }).click();
    const openAutomatic = page.getByRole('button', {
      name: '세대 자동 입력',
      exact: true
    });
    const automatic = page.getByRole('dialog', {
      name: '세대 자동 입력',
      exact: true
    });
    await openAutomatic.click();
    await automatic.getByLabel('시작 층').fill('2');
    await automatic.getByLabel('마지막 층').fill('3');
    await automatic.getByLabel('층당 세대 수').fill('2');
    await automatic.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    const before = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
    const manage = page.getByRole('button', {
      name: '동 관리',
      exact: true
    });
    const manager = page.getByRole('dialog', {
      name: '동 관리',
      exact: true
    });
    const clear = manager.getByRole('button', {
      name: '101동 삭제',
      exact: true
    });
    const confirmation = page.getByRole('alertdialog', {
      name: '동 삭제 확인',
      exact: true
    });
    await manage.click();
    await expect(manager.getByRole('button', {
      name: /세대 전체 삭제/
    })).toHaveCount(0);
    await manager.getByRole('button', {
      name: '103동 삭제',
      exact: true
    }).click();
    await expect(confirmation.getByRole('radio', {
      name: /^세대만 전체 삭제/
    })).toBeDisabled();
    await expect(confirmation.getByRole('radio', {
      name: /^동과 세대 모두 삭제/
    })).toBeChecked();
    await confirmation.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(clear).toHaveCSS('color', 'rgb(239, 68, 68)');
    await page.screenshot({
      path: test.info().outputPath('buildingUnitsClearManager.png')
    });
    await clear.click();
    await expect(confirmation).toContainText('101동의 4세대');
    await expect(confirmation).toContainText('동은 유지됩니다');
    await expect(confirmation.getByRole('button', {
      name: '취소',
      exact: true
    })).toBeFocused();
    await confirmation.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(clear).toBeFocused();
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY)).toEqual(before);
    await clear.click();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(manager).toBeVisible();
    await expect(clear).toBeFocused();
    await clear.click();
    const confirm = confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    });
    await expect(confirm).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(confirm).toHaveCSS('color', 'rgb(239, 68, 68)');
    expect(await confirmation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath('buildingUnitsClearConfirmation.png')
    });
    await confirm.click();
    await expect(confirmation).toHaveCount(0);
    await expect(manager).toBeVisible();
    await expect(manager.getByRole('listitem').filter({
      has: clear
    })).toContainText('0세대');
    expect(await manager.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    const after = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
    expect(after.buildings).toEqual(before.buildings);
    expect(after.units).toEqual([before.units[0]]);
    expect(after.automaticUnitRule).toEqual(before.automaticUnitRule);
    await manager.getByRole('button', {
      name: '완료',
      exact: true
    }).click();
    await expect(manage).toBeFocused();
    await expect(page.getByRole('button', {
      name: '다음',
      exact: true
    })).toBeEnabled();
    await page.reload();
    await choices.getByRole('button', {
      name: '101동',
      exact: true
    }).click();
    await openAutomatic.click();
    await expect(automatic.getByRole('status')).toHaveText('총 4세대 · 추가 4세대 · 중복 제외 0세대');
    await automatic.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    await manage.click();
    for (const name of ['101동', '102동']) {
      await manager.getByRole('button', {
        name: `${name} 삭제`,
        exact: true
      }).click();
      if (name === '102동') await confirmation.getByRole('radio', {
        name: /^동과 세대 모두 삭제/
      }).check();
      await confirmation.getByRole('button', {
        name: '삭제',
        exact: true
      }).click();
    }
    await manager.getByRole('button', {
      name: '완료',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '다음',
      exact: true
    })).toBeDisabled();
    const empty = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
    expect(empty.units).toEqual([]);
    expect(empty.buildings).toEqual(before.buildings.filter((building: { name: string }) => building.name !== '102동'));
    expect(empty.automaticUnitRule).toEqual(before.automaticUnitRule);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const viewport of [{
  width: 1448,
  height: 1086
}, {
  width: 320,
  height: 640
}]) {
  test(`세대 선택 삭제는 10개 중 2개만 지우고 동·검색 변경에 선택을 초기화 (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openUnitSetup(page, true);
    for (const name of ['101동', '102동']) await addBuilding(page, name);
    await addUnit(page, '201', '2', '102동');
    const choices = page.getByRole('group', {
      name: '동별 보기',
      exact: true
    });
    await choices.getByRole('button', {
      name: '101동',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '세대 자동 입력',
      exact: true
    }).click();
    const automatic = page.getByRole('dialog', {
      name: '세대 자동 입력',
      exact: true
    });
    await automatic.getByLabel('시작 층').fill('2');
    await automatic.getByLabel('마지막 층').fill('6');
    await automatic.getByLabel('층당 세대 수').fill('2');
    await automatic.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    const before = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
    const search = page.getByRole('textbox', {
      name: '호수 검색',
      exact: true
    });
    const all = page.getByRole('checkbox', {
      name: '현재 목록 전체 선택',
      exact: true
    });
    const room = (name: string) => page.getByRole('checkbox', {
      name,
      exact: true
    });
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '선택한 0세대 삭제',
      exact: true
    })).toBeDisabled();
    await room('101동 201호 선택').check();
    await page.getByRole('button', {
      name: '완료',
      exact: true
    }).click();
    await expect(all).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '편집',
      exact: true
    })).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY)).toEqual(before);
    await expect(page.getByRole('status').filter({
      hasText: '101동 · 총 10세대'
    })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('unitListEditHeading.png')
    });
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await expect(room('101동 201호 선택')).not.toBeChecked();
    await room('101동 201호 선택').check();
    await search.fill('201');
    await expect(room('101동 201호 선택')).not.toBeChecked();
    await all.check();
    await expect(page.getByRole('button', {
      name: '선택한 1세대 삭제',
      exact: true
    })).toBeEnabled();
    await search.clear();
    await expect(room('101동 201호 선택')).not.toBeChecked();
    await room('101동 201호 선택').check();
    await choices.getByRole('button', {
      name: '102동',
      exact: true
    }).click();
    await expect(room('102동 201호 선택')).not.toBeChecked();
    await all.check();
    await choices.getByRole('button', {
      name: '전체',
      exact: true
    }).click();
    await expect(room('102동 201호 선택')).not.toBeChecked();
    await choices.getByRole('button', {
      name: '101동',
      exact: true
    }).click();
    await all.check();
    await expect(page.getByRole('button', {
      name: '선택한 10세대 삭제',
      exact: true
    })).toBeEnabled();
    await all.uncheck();
    await room('101동 201호 선택').check();
    await room('101동 602호 선택').check();
    await expect(all).toHaveJSProperty('indeterminate', true);
    await page.screenshot({
      path: test.info().outputPath('selectedUnits.png'),
      fullPage: true
    });
    const deleteSelected = page.getByRole('button', {
      name: '선택한 2세대 삭제',
      exact: true
    });
    const confirmation = page.getByRole('alertdialog', {
      name: '선택한 세대 삭제 확인',
      exact: true
    });
    await deleteSelected.click();
    await expect(confirmation.getByRole('list', {
      name: '삭제할 세대'
    }).getByRole('listitem')).toHaveText(['101동 201호', '101동 602호']);
    await page.keyboard.press('Escape');
    await expect(deleteSelected).toBeFocused();
    await expect(room('101동 201호 선택')).toBeChecked();
    await deleteSelected.click();
    await confirmation.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY)).toEqual(before);
    await deleteSelected.click();
    await page.screenshot({
      path: test.info().outputPath('selectedUnitsConfirmation.png')
    });
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '편집',
      exact: true
    })).toBeFocused();
    const after = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
    const buildingId = before.buildings.find((building: { name: string }) => building.name === '101동').clientId;
    expect(after.units).toEqual(before.units.filter((unit: { buildingClientId: string; unitNumber: string }) => unit.buildingClientId !== buildingId || !['201', '602'].includes(unit.unitNumber)));
    expect(after.units).toHaveLength(9);
    expect(after.buildings).toEqual(before.buildings);
    expect(after.automaticUnitRule).toEqual(before.automaticUnitRule);
    await page.reload();
    await choices.getByRole('button', {
      name: '101동',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await all.check();
    await page.getByRole('button', {
      name: '선택한 8세대 삭제',
      exact: true
    }).click();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '다음',
      exact: true
    })).toBeEnabled();
    await choices.getByRole('button', {
      name: '102동',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await all.check();
    await page.getByRole('button', {
      name: '선택한 1세대 삭제',
      exact: true
    }).click();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '다음',
      exact: true
    })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('동 없는 세대 목록도 문자 호수와 앞자리 0을 개별 선택하여 삭제', async ({ page }) => {
  await openUnitSetup(page);
  for (const value of ['관리실', '001', 'B101']) await addUnit(page, value);
  await page.getByRole('button', {
    name: '편집',
    exact: true
  }).click();
  await page.getByRole('checkbox', {
    name: '관리실 선택',
    exact: true
  }).check();
  await page.getByRole('checkbox', {
    name: '001호 선택',
    exact: true
  }).check();
  await page.getByRole('button', {
    name: '선택한 2세대 삭제',
    exact: true
  }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: '선택한 세대 삭제 확인',
    exact: true
  });
  await expect(confirmation.getByRole('list', {
    name: '삭제할 세대'
  }).getByRole('listitem')).toHaveText(['001호', '관리실']);
  await confirmation.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.units.map((unit: { unitNumber: string }) => unit.unitNumber)).toEqual(['B101']);
});

test('모바일 동 선택과 검색을 단순하게 표시하고 동 관리에서 추가·수정·삭제와 참조 검증을 처리', async ({ page }) => {
  await page.emulateMedia({
    reducedMotion: 'reduce'
  });
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await openUnitSetup(page, true);
  await expect(page.getByRole('combobox', {
    name: '동별 보기',
    exact: true
  })).toBeHidden();
  await expect(page.getByRole('button', {
    name: '동 추가',
    exact: true
  })).toBeHidden();
  const manageButton = page.getByRole('button', {
    name: '동 관리',
    exact: true
  });
  await manageButton.click();
  const manager = page.getByRole('dialog', {
    name: '동 관리',
    exact: true
  });
  for (const name of ['101동', '102동', '103동']) {
    await manager.getByRole('button', {
      name: '동 추가',
      exact: true
    }).click();
    await manager.getByRole('textbox', {
      name: '새 동 이름',
      exact: true
    }).fill(name);
    await manager.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
  }
  await manager.getByRole('button', {
    name: '동 추가',
    exact: true
  }).click();
  await manager.getByRole('textbox', {
    name: '새 동 이름',
    exact: true
  }).fill('101동');
  await manager.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(manager.getByRole('alert')).toContainText('이미 등록한 동');
  await manager.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await page.keyboard.press('Escape');
  await expect(manageButton).toBeFocused();

  const choices = page.getByRole('group', {
    name: '동별 보기',
    exact: true
  });
  await choices.getByRole('button', {
    name: '101동',
    exact: true
  }).click();
  await addUnit(page, '102', '1');
  await choices.getByRole('button', {
    name: '102동',
    exact: true
  }).click();
  await addUnit(page, '202', '2');
  await expect(page.getByRole('status')).toContainText('102동 · 총 1세대');
  await expect(page.getByRole('button', {
    name: '102호 수정',
    exact: true
  })).toHaveCount(0);
  await choices.getByRole('button', {
    name: '101동',
    exact: true
  }).click();
  await expect(page.getByRole('status')).toContainText('101동 · 총 1세대');
  const search = page.getByRole('textbox', {
    name: '호수 검색',
    exact: true
  });
  await search.fill('202');
  await expect(page.getByText('검색 결과가 없어요.')).toBeVisible();
  await search.clear();
  await page.screenshot({
    path: test.info().outputPath('unitSetupBuildingsMobile.png'),
    fullPage: true
  });

  await manageButton.click();
  await manager.getByRole('button', {
    name: '101동 삭제',
    exact: true
  }).click();
  await expect(page.getByRole('alertdialog', {
    name: '동 삭제 확인',
    exact: true
  })).toBeVisible();
  await page.getByRole('alertdialog', {
    name: '동 삭제 확인',
    exact: true
  }).getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await manager.getByRole('button', {
    name: '101동 수정',
    exact: true
  }).click();
  await manager.getByRole('textbox', {
    name: '동 이름',
    exact: true
  }).fill('A동');
  await manager.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await manager.getByRole('button', {
    name: '완료',
    exact: true
  }).click();
  await expect(page.getByRole('status')).toContainText('A동 · 총 1세대');
  await expect(page.getByRole('button', {
    name: '102호 수정',
    exact: true
  })).toBeVisible();
  await choices.getByRole('button', {
    name: '103동',
    exact: true
  }).click();
  await manageButton.click();
  await manager.getByRole('button', {
    name: '103동 삭제',
    exact: true
  }).click();
  await page.getByRole('alertdialog', {
    name: '동 삭제 확인',
    exact: true
  }).getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await page.setViewportSize({
    width: 320,
    height: 640
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await manager.getByRole('button', {
    name: '완료',
    exact: true
  }).click();
  await expect(choices.getByRole('button', {
    name: '전체',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toContainText('전체 동 · 총 2세대');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('동·세대는 숫자를 인식하는 이름순으로 표시하고 PC 삭제와 모바일 칩·편집 배치를 제공', async ({ page }) => {
  await page.setViewportSize({
    width: 1448,
    height: 1086
  });
  await openUnitSetup(page, true);
  for (const name of ['101동', '10동', '2동', '1동']) {
    await addBuilding(page, name);
  }
  const choices = page.getByRole('group', {
    name: '동별 보기',
    exact: true
  });
  await expect(choices.getByRole('button')).toHaveText(['전체', '1동', '2동', '10동', '101동']);
  await expect(choices.getByRole('button', {
    name: '1동',
    exact: true
  }).locator('svg')).toBeVisible();
  await page.getByRole('button', {
    name: '동 관리',
    exact: true
  }).click();
  const manager = page.getByRole('dialog', {
    name: '동 관리',
    exact: true
  });
  await expect(manager.getByRole('listitem').locator('strong')).toHaveText(['1동', '2동', '10동', '101동']);
  await manager.getByRole('button', {
    name: '완료',
    exact: true
  }).click();
  await addUnit(page, '1001', '10', '10동');
  await addUnit(page, '1001', '10', '1동');
  await addUnit(page, '102', '1', '1동');
  await addUnit(page, '101', '1', '1동');
  await addUnit(page, '201', '2', '2동');
  const rows = page.getByRole('table', {
    name: '등록할 세대 목록'
  }).getByRole('row').filter({
    has: page.getByRole('cell')
  });
  await expect(rows.locator('td:first-child strong')).toHaveText(['101호', '102호', '1001호', '201호', '1001호']);
  await expect(rows.locator('td:nth-child(2)')).toHaveText(['1동', '1동', '1동', '2동', '10동']);
  await expect(page.getByRole('button', {
    name: '102호 수정',
    exact: true
  })).toHaveCSS('color', 'rgb(22, 163, 74)');
  await expect(page.getByRole('button', {
    name: '102호 삭제',
    exact: true
  })).toHaveCSS('color', 'rgb(239, 68, 68)');
  await page.screenshot({
    path: test.info().outputPath('sortedUnitSetupDesktop.png'),
    fullPage: true
  });
  await page.getByRole('button', {
    name: '102호 삭제',
    exact: true
  }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: '세대 삭제 확인',
    exact: true
  });
  await expect(confirmation).toContainText('1동 102호');
  const confirmDelete = confirmation.getByRole('button', {
    name: '삭제',
    exact: true
  });
  await expect(confirmDelete).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(confirmDelete).toHaveCSS('color', 'rgb(239, 68, 68)');
  await expect(confirmDelete).toHaveCSS('border-color', 'rgb(239, 68, 68)');
  await confirmation.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(rows.locator('td:first-child strong')).toHaveText(['101호', '102호', '1001호', '201호', '1001호']);
  await page.getByRole('button', {
    name: '102호 삭제',
    exact: true
  }).click();
  await confirmUnitDeletion(page);
  await expect(rows.locator('td:first-child strong')).toHaveText(['101호', '1001호', '201호', '1001호']);
  const before = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(before.buildings.map((building: { name: string }) => building.name)).toEqual(['101동', '10동', '2동', '1동']);
  await page.getByRole('button', {
    name: '101호 수정',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '세대 수정',
    exact: true
  });
  await expect(editor.getByRole('button', {
    name: '세대 삭제',
    exact: true
  })).toBeHidden();
  await editor.getByRole('combobox', {
    name: '동',
    exact: true
  }).click();
  await expect(page.getByRole('option')).toHaveText(['1동', '2동', '10동', '101동']);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.setViewportSize({
    width: 320,
    height: 640
  });
  const firstChip = choices.getByRole('button', {
    name: '1동',
    exact: true
  });
  await expect(firstChip).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(firstChip).toHaveCSS('border-color', 'rgb(226, 232, 240)');
  await expect(firstChip.locator('svg')).toBeHidden();
  await firstChip.click();
  await page.mouse.move(0, 0);
  await expect(firstChip).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  await expect(page.getByRole('button', {
    name: '101호 삭제',
    exact: true
  })).toBeHidden();
  await page.getByRole('button', {
    name: '101호 수정',
    exact: true
  }).click();
  const mobileDelete = editor.getByRole('button', {
    name: '세대 삭제',
    exact: true
  });
  await mobileDelete.scrollIntoViewIfNeeded();
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('buildingUnitEditor320.png')
  });
  await mobileDelete.click();
  await expect(confirmation).toContainText('1동 101호');
  await expect(confirmation.getByRole('button', {
    name: '취소',
    exact: true
  })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor.getByRole('textbox', {
    name: '호수',
    exact: true
  })).toHaveValue('101');
  await expect(mobileDelete).toBeFocused();
  await mobileDelete.click();
  await page.screenshot({
    path: test.info().outputPath('unitDeleteConfirmation320.png')
  });
  await confirmUnitDeletion(page);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '101호 수정',
    exact: true
  })).toHaveCount(0);
  await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
});

test('동·세대와 현재 단계는 새로고침에 복원하고 흐름 이탈과 다른 계정에는 폐기', async ({ page }) => {
  await openUnitSetup(page);
  await addUnit(page, '201', '2');
  await page.reload();
  await expect(page.getByRole('button', {
    name: '201호 수정',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL(/registration=units$/);
  await page.route(`${API_ORIGIN}/api/users/me`, (route) => fulfillJson(route, {
    ...CURRENT_USER,
    id: '00000000-0000-0000-0000-000000000002',
  }));
  await page.reload();
  await expect(page).toHaveURL(/registration=basic$/);
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('');
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/start$/);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_STORAGE_KEY)).toBeNull();
  await page.goto('/start?registration=units');
  await expect(page).toHaveURL(/registration=basic$/);
});

test('층 범위·선택 입력을 검증하고 세대 삭제 후 최소 한 세대 조건을 다시 적용', async ({ page }) => {
  await openUnitSetup(page);
  await addUnit(page, '201', '32768');
  const editor = page.getByRole('dialog', {
    name: '세대 추가',
    exact: true
  });
  await expect(editor.getByRole('alert')).toContainText('정수로 입력해주세요.');
  await editor.getByLabel('층', {
    exact: true
  }).fill('');
  await editor.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '201호 수정',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '세대 수정',
    exact: true
  }).getByRole('button', {
    name: '세대 삭제',
    exact: true
  })).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', {
    name: '201호 삭제',
    exact: true
  }).click();
  await confirmUnitDeletion(page);
  await expect(page.getByText('아직 등록한 세대가 없어요.')).toBeVisible();
  await expect(page.getByRole('button', {
    name: '다음',
    exact: true
  })).toBeDisabled();
});

test('동·세대 화면은 PC 표·모바일 카드와 하단 버튼을 표시하고 320px에서도 넘치지 않음', async ({ page }) => {
  await page.setViewportSize({
    width: 1448,
    height: 1086
  });
  await openUnitSetup(page);
  await addUnit(page, '201', '2');
  await addUnit(page, '202', '2');
  await addUnit(page, '301', '3');
  await addUnit(page, '302', '3', undefined, true);
  await expect(page.getByRole('columnheader', {
    name: '호수',
    exact: true
  })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('unitSetupDesktop.png'),
    fullPage: true
  });
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await expect(page.getByText('초기 설정', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('button', {
    name: '다음',
    exact: true
  })).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath('unitSetupMobile.png'),
    fullPage: true
  });
  await page.getByRole('button', {
    name: '302호 수정',
    exact: true
  }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', {
    name: '302호 수정',
    exact: true
  })).toBeFocused();
  await page.setViewportSize({
    width: 320,
    height: 640
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', {
    name: '302호 수정',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '세대 수정',
    exact: true
  });
  const deleteUnit = editor.getByRole('button', {
    name: '세대 삭제',
    exact: true
  });
  const cancel = editor.getByRole('button', {
    name: '취소',
    exact: true
  });
  const save = editor.getByRole('button', {
    name: '수정',
    exact: true
  });
  await expect(deleteUnit).toHaveCSS('color', 'rgb(239, 68, 68)');
  await expect(deleteUnit).toHaveCSS('border-color', 'rgb(239, 68, 68)');
  await save.scrollIntoViewIfNeeded();
  const cancelBox = (await cancel.boundingBox())!;
  const saveBox = (await save.boundingBox())!;
  const deleteBox = (await deleteUnit.boundingBox())!;
  expect(deleteBox.width).toBe(saveBox.x + saveBox.width - cancelBox.x);
  expect(deleteBox.y + deleteBox.height).toBeLessThan(cancelBox.y);
  expect(cancelBox.width).toBe(saveBox.width);
  expect(cancelBox.y).toBe(saveBox.y);
  expect(cancelBox.x + cancelBox.width).toBeLessThan(saveBox.x);
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('unitEditor320.png')
  });
  await save.click();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', {
    name: '기본 정보로 돌아가기',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  })).toBeVisible();
});

test('새로고침에는 같은 사용자 초안을 복원하고 취소·뒤로 이동 이후 새 등록은 비워 둠', async ({ page }) => {
  await openRegistration(page);
  await fillRequiredFields(page);
  await page.getByLabel('상세주소', {
    exact: true
  }).fill('201호');
  await page.reload();
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('성내빌라');
  await expect(page.getByLabel('상세주소', {
    exact: true
  })).toHaveValue('201호');
  await expect(page.getByRole('radio', {
    name: /^동 없음/
  })).toBeChecked();
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/start$/);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_STORAGE_KEY)).toBeNull();
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('');
  await page.getByLabel('관리대상 이름').fill('새 입력');
  await page.goBack();
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  })).toHaveCount(0);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_STORAGE_KEY)).toBeNull();
});

test('다른 계정으로 새로고침하면 이전 계정 입력을 복원하지 않음', async ({ page }) => {
  await openRegistration(page);
  await fillRequiredFields(page);
  await page.route(`${API_ORIGIN}/api/users/me`, (route) => fulfillJson(route, {
    ...CURRENT_USER,
    id: '00000000-0000-0000-0000-000000000002'
  }));
  await page.reload();
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('');
  await expect(page.getByRole('button', {
    name: '등록하고 계속'
  })).toBeDisabled();
});

test('주소 검색 로딩 실패는 닫거나 재시도할 수 있고 폼 입력이 사라지지 않음', async ({ page }) => {
  await page.route(POSTCODE_SCRIPT_URL, (route) => route.abort());
  await openRegistration(page);
  await page.getByLabel('관리대상 이름').fill('성내빌라');
  await page.getByRole('button', {
    name: '주소 검색',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '주소 검색',
    exact: true
  }).getByRole('alert')).toContainText('주소 검색을 불러오지 못했어요.');
  await mockPostcode(page);
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '도로명 주소 선택'
  }).click();
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('성내빌라');
  await expect(page.getByRole('textbox', {
    name: '주소',
    exact: true
  })).toHaveValue('서울특별시 강동구 성내로 10');
  await page.getByRole('button', {
    name: '주소 검색',
    exact: true
  }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {
    name: '주소 검색',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('textbox', {
    name: '주소',
    exact: true
  })).toHaveValue('서울특별시 강동구 성내로 10');
});

test('검증 중 취소 후 늦게 도착한 성공 응답은 새 등록 입력에 반영되지 않음', async ({ page }) => {
  let releaseResponse: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(VALIDATE_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillJson(route, {});
      return;
    }
    await responseGate;
    await fulfillJson(route, route.request().postDataJSON());
  });
  await openRegistration(page);
  await fillRequiredFields(page);
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(page.getByRole('button', {
    name: '확인 중…'
  })).toBeDisabled();
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  releaseResponse();
  await expect(page.getByLabel('관리대상 이름')).toHaveValue('');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('PC 모달·모바일 전체 화면에서 가로 넘침 없이 표시하고 Escape·모바일 뒤로가기로 취소', async ({ page }) => {
  await page.setViewportSize({
    width: 1536,
    height: 1024
  });
  await openRegistration(page);
  const dialog = page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  });
  await expect(dialog).toHaveCSS('width', '712px');
  await page.locator('section[data-kind]').evaluateAll(async (elements) => {
    await Promise.all(elements.flatMap((element) => element.getAnimations().map((animation) => animation.finished)));
  });
  await page.screenshot({
    path: test.info().outputPath('propertyRegistrationDesktop.png'),
    fullPage: true
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('width', '390px');
  expect(await dialog.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 390,
    height: 844
  });
  await expect(page.getByRole('button', {
    name: '취소',
    exact: true
  })).toBeHidden();
  await expect(page.getByRole('button', {
    name: '관리할 곳 등록 닫기',
    exact: true
  })).toBeHidden();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('propertyRegistrationMobile.png')
  });
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('propertyRegistrationMobileBottom.png')
  });
  await page.setViewportSize({
    width: 320,
    height: 640
  });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', {
    name: '등록 취소하고 돌아가기',
    exact: true
  }).click();
  await expect(dialog).toHaveCount(0);
});
