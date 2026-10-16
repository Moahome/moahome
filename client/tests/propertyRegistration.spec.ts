import {
  expect,
  test,
  type Page,
  type Route
} from '@playwright/test';
import type { RegistrationRequest } from '../src/features/property-registration/api/registrationApi';

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
  await page.getByLabel('건물·단지 이름').fill('성내빌라');
  await selectAddress(page);
  await page.getByRole('radio', {
    name: /^동 없음/
  }).check();
}

test.beforeEach(async ({ page }) => {
  await page.route(`${API_ORIGIN}/api/users/me/managed-properties`, (route) => fulfillJson(route, {
    properties: []
  }));
  await page.route(`${API_ORIGIN}/api/properties/*/management-context`, (route) => fulfillJson(route, {
    propertyId: 'f5405dd1-42ea-4279-9302-812ffcc2d21b',
    name: '관리대상',
    role: 'ADMIN'
  }));
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
  await page.getByLabel('건물·단지 이름').fill('   ');
  await expect(continueButton).toBeDisabled();
  await selectAddress(page);
  await page.getByLabel('건물·단지 이름').fill('성내빌라');
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
  await expect(page.getByRole('button', {
    name: '건물 유형 선택 해제',
    exact: true
  })).toHaveCount(0);
  await expect(continueButton).toBeEnabled();
  await page.getByLabel('건물·단지 이름').fill('');
  await expect(continueButton).toBeDisabled();
});

test('Unicode 글자 수와 선택 입력 길이를 검증하고 정상 입력으로 바꾸면 계속 버튼이 복구됨', async ({ page }) => {
  await openRegistration(page);
  await fillRequiredFields(page);
  const continueButton = page.getByRole('button', {
    name: '등록하고 계속'
  });
  const nameInput = page.getByLabel('건물·단지 이름');
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

test('건물 유형은 고정 옵션·선택 표시를 제공하고 선택 해제 X를 표시하지 않음', async ({ page }) => {
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
  await page.getByLabel('건물·단지 이름').click();
  await expect(listbox).toHaveCount(0);
  await expect(dropdown).toHaveText('아파트');
  await expect(page.getByRole('button', {
    name: '건물 유형 선택 해제',
    exact: true
  })).toHaveCount(0);
  await expect(dropdown).toHaveText('아파트');
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
  await expect(dropdown).not.toBeFocused();
  await expect(page.getByRole('button', {
    name: '건물 유형 선택 해제',
    exact: true
  })).toHaveCount(0);
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
  await page.getByLabel('건물·단지 이름').fill('  성내빌라  ');
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(page.getByRole('button', {
    name: '확인 중…'
  })).toBeDisabled();
  await expect(page.getByLabel('건물·단지 이름')).toBeDisabled();
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('성내빌라');
  expect(finalRequests).toHaveLength(0);
  await page.getByLabel('건물·단지 이름').fill('새 빌라');
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
    await expect(page.getByLabel('건물·단지 이름')).toHaveValue('성내빌라');
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
  await page.getByLabel('건물·단지 이름').fill('아파트');
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('성내빌라');
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(row).toContainText('공실');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리계좌 설정',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL(/registration=account/);
  expect(finalRequests).toHaveLength(0);
});

/** 기본 정보·세대의 실제 입력을 거쳐 계좌 설정으로 이동해 URL만으로 단계를 건너뛰지 않습니다. */
async function openBankAccountSetup(page: Page) {
  await openUnitSetup(page);
  await addUnit(page, '201', '2');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리계좌 설정',
    exact: true
  })).toBeVisible();
}

/** 은행은 실제 드롭다운으로 선택하고 가상 계좌를 사용해 앞자리 0의 보존을 검증합니다. */
async function fillBankAccount(page: Page) {
  await page.getByRole('combobox', {
    name: '은행',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '하나은행',
    exact: true
  }).click();
  await page.getByLabel('계좌번호').fill('00012345678');
  await page.getByLabel('예금주').fill('예시 관리단');
}

test('관리계좌는 빈 폼으로 시작하고 필수·번호 형식·예금주 길이·기본 계좌 조건을 모두 확인', async ({ page }) => {
  await openBankAccountSetup(page);
  const next = page.getByRole('button', {
    name: '다음',
    exact: true
  });
  const number = page.getByLabel('계좌번호');
  const holder = page.getByLabel('예금주');
  const primary = page.getByRole('checkbox', {
    name: '이 계좌를 기본 관리계좌로 사용'
  });
  await expect(number).toHaveValue('');
  await expect(holder).toHaveValue('');
  await expect(primary).toBeChecked();
  await expect(next).toBeDisabled();
  await fillBankAccount(page);
  await expect(next).toBeEnabled();
  for (const invalid of ['000-1234', '000 1234', '000/1234', '１２３４', '000a1234']) {
    await number.fill(invalid);
    await expect(number).toHaveValue('00012345678');
    await expect(next).toBeEnabled();
  }
  await number.press('End');
  await number.press('-');
  await number.press('a');
  await expect(number).toHaveValue('00012345678');
  for (const invalid of ['123', '0'.repeat(51)]) {
    await number.fill(invalid);
    await holder.focus();
    await expect(number).toHaveValue(invalid);
    await expect(number).toHaveAttribute('aria-invalid', 'true');
    await expect(next).toBeDisabled();
  }
  // 은행에서 복사한 구분 기호는 붙여넣기에서 정리하고 입력·초안에는 숫자 문자열만 유지합니다.
  await number.evaluate((input: HTMLInputElement) => {
    input.setSelectionRange(0, input.value.length);
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', ' 000 -1234- 5678 ');
    input.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData,
      bubbles: true,
      cancelable: true
    }));
  });
  await expect(number).toHaveValue('00012345678');
  await number.evaluate((input: HTMLInputElement) => {
    input.setSelectionRange(0, input.value.length);
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '000a1234');
    input.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData,
      bubbles: true,
      cancelable: true
    }));
  });
  await expect(number).toHaveValue('00012345678');
  const storedNumber = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).bankAccount.accountNumber, DRAFT_STORAGE_KEY);
  expect(storedNumber).toBe('00012345678');
  await holder.fill('   ');
  await expect(next).toBeDisabled();
  await holder.fill('😀'.repeat(50));
  await expect(next).toBeEnabled();
  await holder.fill('😀'.repeat(51));
  await expect(next).toBeDisabled();
  await holder.fill('예시 관리단');
  await primary.uncheck();
  await expect(page.getByRole('alert').filter({
    hasText: '기본 관리계좌를 지정'
  })).toBeVisible();
  await expect(next).toBeDisabled();
  await primary.check();
  await expect(next).toBeEnabled();
});

test('은행 SelectDropdown은 코드와 이름을 함께 유지하고 키보드·Escape를 지원', async ({ page }) => {
  await openBankAccountSetup(page);
  const bank = page.getByRole('combobox', {
    name: '은행',
    exact: true
  });
  await bank.focus();
  await bank.press('ArrowDown');
  await expect(page.getByRole('option', {
    name: '하나은행',
    exact: true
  })).toBeVisible();
  await bank.press('Escape');
  await expect(bank).toHaveAttribute('aria-expanded', 'false');
  await expect(page).toHaveURL(/registration=account/);
  await bank.press('ArrowDown');
  await bank.press('Enter');
  await expect(bank).toHaveValue('국민은행');
  const account = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).bankAccount, DRAFT_STORAGE_KEY);
  expect(account.bankCode).toBe('004');
  expect(account.bankName).toBe('국민은행');
});

test('은행 선택은 24개 로컬 아이콘 그리드로 열리고 이름·별칭 검색 후 선택한 아이콘과 이름을 표시', async ({ page }) => {
  await openBankAccountSetup(page);
  const bank = page.getByRole('combobox', {
    name: '은행',
    exact: true
  });
  const list = page.getByRole('listbox', {
    name: '은행',
    exact: true
  });
  await bank.click();
  await expect(page.getByRole('option')).toHaveCount(24);
  await expect(list).toHaveAttribute('data-layout', 'grid');
  // 원격 이미지나 모의 아이콘 없이 모든 실제 로컬 자산이 브라우저에서 로드되는지 확인합니다.
  expect(await page.getByRole('option').locator('img').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => (image as HTMLImageElement).decode()));
    return images.every((image) => (image as HTMLImageElement).naturalWidth > 0 && image.getAttribute('src')?.startsWith('/banks/'));
  })).toBe(true);
  await bank.fill(' kB ');
  await expect(page.getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('option', {
    name: '케이뱅크',
    exact: true
  })).toBeVisible();
  await expect(list).toHaveAttribute('data-layout', 'list');
  const kb = page.getByRole('option', {
    name: '국민은행',
    exact: true
  });
  await expect(kb.locator('img')).toBeVisible();
  await expect(kb).toHaveText('국민은행');
  await kb.click();
  await expect(bank).toHaveValue('국민은행');
  await expect(bank).toHaveAttribute('aria-expanded', 'false');
  await expect(bank.locator('..').locator('img:visible')).toHaveAttribute('src', '/banks/bank004.png');
  await bank.click();
  await expect(page.getByRole('option')).toHaveCount(24);
  await expect(kb).toHaveAttribute('aria-selected', 'true');
  await bank.fill('대구');
  await expect(page.getByRole('option', {
    name: '아이엠뱅크',
    exact: true
  })).toBeVisible();
  await bank.press('Enter');
  await expect(bank).toHaveValue('아이엠뱅크');
  const account = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).bankAccount, DRAFT_STORAGE_KEY);
  expect(account.bankCode).toBe('031');
  expect(account.bankName).toBe('아이엠뱅크');
});

test('은행 검색의 빈 결과·Escape·Tab·외부 클릭은 확정한 계좌와 이전 단계 입력을 바꾸지 않음', async ({ page }) => {
  await openBankAccountSetup(page);
  await fillBankAccount(page);
  const bank = page.getByRole('combobox', {
    name: '은행',
    exact: true
  });
  const next = page.getByRole('button', {
    name: '다음',
    exact: true
  });
  await bank.click();
  await bank.fill('004');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('검색 결과가 없어요.');
  await expect(bank).not.toHaveAttribute('aria-activedescendant');
  await bank.press('Enter');
  await expect(bank).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/registration=account/);
  await bank.press('Escape');
  await expect(bank).toHaveValue('하나은행');
  for (const action of ['Tab', 'outside', 'toggle']) {
    await bank.click();
    await bank.fill('신한');
    if (action === 'Tab') await bank.press('Tab');
    if (action === 'outside') await page.getByLabel('예금주').click();
    if (action === 'toggle') await page.getByRole('button', {
      name: '은행 목록 닫기',
      exact: true
    }).click();
    await expect(bank).toHaveAttribute('aria-expanded', 'false');
    await expect(bank).toHaveValue('하나은행');
  }
  await expect(next).toBeEnabled();
  await bank.click();
  await expect(page.getByRole('option', {
    name: '하나은행',
    exact: true
  })).toHaveAttribute('aria-selected', 'true');
  await bank.fill('SC 제일');
  await expect(page.getByRole('option')).toHaveCount(1);
  await bank.press('Enter');
  await expect(bank).toHaveValue('SC제일은행');
  await expect(page.getByLabel('계좌번호')).toHaveValue('00012345678');
  await expect(page.getByLabel('예금주')).toHaveValue('예시 관리단');
});

test('은행 검색은 한글 조합 중 Enter를 선택으로 처리하지 않고 조합 완료 후 후보만 확정', async ({ page }) => {
  await openBankAccountSetup(page);
  const bank = page.getByRole('combobox', {
    name: '은행',
    exact: true
  });
  await bank.click();
  await bank.dispatchEvent('compositionstart', {
    data: ''
  });
  await bank.fill('신한');
  await bank.press('Enter');
  await expect(bank).toHaveAttribute('aria-expanded', 'true');
  const account = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).bankAccount, DRAFT_STORAGE_KEY);
  expect(account.bankCode).toBe('');
  await bank.dispatchEvent('compositionend', {
    data: '신한'
  });
  await bank.press('Enter');
  await expect(bank).toHaveValue('신한은행');
  await expect(bank).toHaveAttribute('aria-expanded', 'false');
});

test.describe('은행 SelectDropdown 모바일 터치', () => {
  test.use({
    hasTouch: true,
    viewport: {
      width: 390,
      height: 844
    }
  });

  test('아이콘 그리드·검색 결과를 터치해 선택하고 다시 열어 현재 선택을 확인', async ({ page }) => {
    await openBankAccountSetup(page);
    const bank = page.getByRole('combobox', {
      name: '은행',
      exact: true
    });
    await bank.tap();
    await page.getByRole('option', {
      name: '국민은행',
      exact: true
    }).tap();
    await expect(bank).toHaveValue('국민은행');
    await bank.tap();
    await expect(page.getByRole('option', {
      name: '국민은행',
      exact: true
    })).toHaveAttribute('aria-selected', 'true');
    await bank.fill('하나');
    await page.getByRole('option', {
      name: '하나은행',
      exact: true
    }).tap();
    await expect(bank).toHaveValue('하나은행');
    await expect(bank).toHaveAttribute('aria-expanded', 'false');
    await expect(bank.locator('..').locator('img:visible')).toHaveAttribute('src', '/banks/bank081.png');
  });
});

test('은행 선택은 짧은 모바일 화면과 화면 축소 후에도 입력 아래에 선택 가능한 후보를 유지', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 480
  });
  await openBankAccountSetup(page);
  const bank = page.getByRole('combobox', {
    name: '은행',
    exact: true
  });
  await bank.click();
  const list = page.getByRole('listbox', {
    name: '은행',
    exact: true
  });
  for (const height of [480, 340]) {
    await page.setViewportSize({
      width: 390,
      height
    });
    await expect.poll(async () => {
      const inputBounds = await bank.boundingBox();
      const menuBounds = await list.boundingBox();
      return Boolean(inputBounds && menuBounds && menuBounds.height >= 108
        && menuBounds.y > inputBounds.y + inputBounds.height && menuBounds.y + menuBounds.height <= height);
    }).toBe(true);
  }
  await bank.fill('하나');
  await page.getByRole('option', {
    name: '하나은행',
    exact: true
  }).click();
  await expect(bank).toHaveValue('하나은행');
});

test('계좌와 이전 단계 입력을 이력 이동·새로고침에 복원하고 확인 버튼으로 최종 저장을 호출하지 않음', async ({ page }) => {
  const finalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${API_ORIGIN}/api/property-registrations`) finalRequests.push(request.url());
  });
  await openBankAccountSetup(page);
  await fillBankAccount(page);
  // 이전 버전 초안의 공백·하이픈을 새로고침에서 정리하고 앞자리 0은 그대로 복원합니다.
  await page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.bankAccount.accountNumber = ' 000 -1234- 5678 ';
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, DRAFT_STORAGE_KEY);
  await page.reload();
  await expect(page.getByLabel('계좌번호')).toHaveValue('00012345678');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리비 항목 설정',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '201호 수정',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByLabel('계좌번호')).toHaveValue('00012345678');
  await page.goBack();
  await expect(page).toHaveURL(/registration=units/);
  await page.goForward();
  await expect(page.getByLabel('예금주')).toHaveValue('예시 관리단');
  await page.reload();
  await expect(page.getByRole('combobox', {
    name: '은행',
    exact: true
  })).toHaveValue('하나은행');
  await expect(page.getByLabel('계좌번호')).toHaveValue('00012345678');
  await expect(page.getByLabel('예금주')).toHaveValue('예시 관리단');
  expect(finalRequests).toHaveLength(0);
  await page.goto('/start');
  await openBankAccountSetup(page);
  await expect(page.getByLabel('계좌번호')).toHaveValue('');
  await expect(page.getByLabel('예금주')).toHaveValue('');
});

test('관리계좌 직접 진입과 새로고침의 유효하지 않은 세대는 선행 단계로 돌아감', async ({ page }) => {
  await page.goto('/start?registration=account');
  await expect(page).toHaveURL(/registration=basic/);
  await fillRequiredFields(page);
  await page.getByRole('button', {
    name: '등록하고 계속'
  }).click();
  await expect(page.getByRole('heading', {
    name: '동·세대 설정',
    exact: true
  })).toBeVisible();
  await page.evaluate(() => history.pushState(null, '', '/start?registration=account'));
  await page.reload();
  await expect(page).toHaveURL(/registration=units/);
  await expect(page.getByRole('button', {
    name: '다음',
    exact: true
  })).toBeDisabled();
});

test('손상된 계좌 초안은 이전 단계를 보존하고 다른 사용자에게 계좌 입력을 복원하지 않음', async ({ page }) => {
  await openBankAccountSetup(page);
  await fillBankAccount(page);
  await page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.bankAccount.accountNumber = 1234;
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, DRAFT_STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole('heading', {
    name: '관리계좌 설정',
    exact: true
  })).toBeVisible();
  await expect(page.getByLabel('계좌번호')).toHaveValue('');
  await fillBankAccount(page);
  await page.route(`${API_ORIGIN}/api/users/me`, (route) => fulfillJson(route, {
    ...CURRENT_USER,
    id: '00000000-0000-0000-0000-000000000002'
  }));
  await page.reload();
  await expect(page).toHaveURL(/registration=basic/);
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('');
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
  expect(stored.bankAccount.accountNumber).toBe('');
  expect(stored.bankAccount.holderName).toBe('');
});

for (const width of [1440, 390, 320]) {
  test(`관리계좌 ${width}px에서 폼·은행 목록·버튼이 화면 안에 표시되고 모바일 이전 이동을 지원`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: width > 640 ? 1000 : 844
    });
    await openBankAccountSetup(page);
    await fillBankAccount(page);
    await expect(page.getByRole('button', {
      name: '다음',
      exact: true
    })).toBeEnabled();
    await page.getByRole('combobox', {
      name: '은행',
      exact: true
    }).click();
    const bounds = await page.getByRole('listbox', {
      name: '은행',
      exact: true
    }).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const bank = page.getByRole('combobox', {
      name: '은행',
      exact: true
    });
    const inputBounds = await bank.boundingBox();
    expect(bounds!.y).toBeGreaterThan(inputBounds!.y + inputBounds!.height);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(width > 640 ? 1000 : 844);
    await page.screenshot({
      path: test.info().outputPath(`bankSelectGrid${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await bank.fill('bnk');
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.screenshot({
      path: test.info().outputPath(`bankSelectSearch${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('heading', {
      name: '관리계좌 설정',
      exact: true
    }).click();
    await page.screenshot({
      path: test.info().outputPath(`bankAccount${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    if (width <= 640) {
      await expect(page.getByLabel('5단계 중 3단계: 관리계좌')).toBeVisible();
      await page.getByRole('button', {
        name: '동·세대 설정으로 돌아가기',
        exact: true
      }).click();
      await expect(page.getByRole('heading', {
        name: '동·세대 설정',
        exact: true
      })).toBeVisible();
    }
  });
}

/** 선행 계좌 입력을 실제 화면에서 완료한 뒤 관리비 설정으로 이동합니다. */
async function openFeeItemsSetup(page: Page) {
  await openBankAccountSetup(page);
  await fillBankAccount(page);
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리비 항목 설정',
    exact: true
  })).toBeVisible();
}

/** 가상 관리비 항목을 실제 추가창으로 입력해 표시·합계·초안을 검증합니다. */
async function addFeeItem(page: Page, itemName: string, amount: string) {
  await page.getByRole('button', {
    name: '관리비 항목 추가',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '관리비 항목 추가',
    exact: true
  });
  await editor.getByRole('combobox', {
    name: '항목 종류'
  }).click();
  await editor.getByRole('option', {
    name: '직접 입력',
    exact: true
  }).click();
  await editor.getByLabel('항목명').fill(itemName);
  await editor.getByLabel('기본 금액').fill(amount);
  await editor.getByRole('button', {
    name: '추가',
    exact: true
  }).click();
  await expect(editor).toHaveCount(0);
}

test('관리비는 빈 목록·0원으로 시작하고 0원과 음수 항목의 합계를 세대당 금액으로 표시', async ({ page }) => {
  const finalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${API_ORIGIN}/api/property-registrations`) finalRequests.push(request.url());
  });
  await openFeeItemsSetup(page);
  const next = page.getByRole('button', {
    name: '다음',
    exact: true
  });
  const total = page.getByLabel('세대당 월 기본 관리비', {
    exact: true
  });
  await expect(page.getByText('등록된 관리비 항목이 없어요.')).toBeVisible();
  await expect(page.getByRole('alert').filter({
    hasText: '관리비 항목을 하나 이상 추가해주세요.'
  })).toHaveCount(0);
  await expect(total).toContainText('0원');
  await expect(next).toBeDisabled();
  await addFeeItem(page, '0원 항목', '0');
  await expect(next).toBeEnabled();
  await addFeeItem(page, '일반관리비', '15000');
  await addFeeItem(page, '차감', '-5000');
  await expect(total).toContainText('10,000원');
  await page.getByRole('button', {
    name: '차감 수정',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '관리비 항목 수정',
    exact: true
  });
  await editor.getByLabel('기본 금액').fill('-25000');
  await editor.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(total).toContainText('-10,000원');
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).feeItems, DRAFT_STORAGE_KEY);
  expect(stored.map((item: { defaultAmount: string }) => item.defaultAmount)).toEqual(['0', '15000', '-25000']);
  await next.click();
  await expect(page.getByRole('heading', {
    name: '등록 정보를 확인해주세요',
    exact: true
  })).toBeVisible();
  expect(finalRequests).toHaveLength(0);
});

for (const width of [1440, 320]) {
  test(`관리비 종류 ${width}px에서 추천 이름 고정·직접 입력 초기화·개별 오류·취소·복원을 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 844
    });
    await openFeeItemsSetup(page);
    await page.getByRole('button', {
      name: '관리비 항목 추가',
      exact: true
    }).click();
    let editor = page.getByRole('dialog', {
      name: '관리비 항목 추가',
      exact: true
    });
    const kind = editor.getByRole('combobox', {
      name: '항목 종류'
    });
    const amount = editor.getByLabel('기본 금액');
    await expect(kind).toBeFocused();
    await expect(editor.getByLabel('항목명')).toHaveCount(0);
    await expect(editor.locator('[aria-invalid="true"]')).toHaveCount(0);
    await kind.click();
    await expect(editor.getByRole('option')).toHaveCount(8);
    await page.screenshot({
      path: test.info().outputPath(`feeKindMenu${width}.png`),
      animations: 'disabled'
    });
    await editor.getByRole('option', {
      name: '청소비',
      exact: true
    }).click();
    await expect(editor.getByLabel('항목명')).toHaveCount(0);
    await expect(editor.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(editor.getByText('계단·복도 등 공용 공간 청소', {
      exact: true
    })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`feeKindSelected${width}.png`),
      animations: 'disabled'
    });
    await expect(editor.getByRole('button', {
      name: '추가',
      exact: true
    })).toBeDisabled();
    await amount.fill('8000');
    await editor.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
    let stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).feeItems, DRAFT_STORAGE_KEY);
    const clientId = stored[0].clientId;
    expect(stored[0]).toMatchObject({
      itemCode: 'CLEANING',
      itemName: '청소비',
      defaultAmount: '8000'
    });
    await page.reload();
    await page.getByRole('button', {
      name: '청소비 수정',
      exact: true
    }).click();
    editor = page.getByRole('dialog', {
      name: '관리비 항목 수정',
      exact: true
    });
    const editKind = editor.getByRole('combobox', {
      name: '항목 종류'
    });
    await expect(editKind).toHaveText('청소비');
    await expect(editor.getByLabel('항목명')).toHaveCount(0);
    await editKind.click();
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();
    await expect(editKind).toHaveAttribute('aria-expanded', 'false');
    await editKind.click();
    await editor.getByRole('option', {
      name: '공용 전기료',
      exact: true
    }).click();
    await expect(editor.getByLabel('항목명')).toHaveCount(0);
    await editor.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '청소비 수정',
      exact: true
    }).click();
    await expect(editKind).toHaveText('청소비');
    await editKind.press('ArrowDown');
    await editKind.press('End');
    await editKind.press('Enter');
    await expect(editKind).toHaveText('직접 입력');
    const name = editor.getByLabel('항목명');
    await expect(name).toHaveValue('');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await expect(editor.getByLabel('기본 금액')).toHaveValue('8,000');
    await expect(editor.getByRole('button', {
      name: '수정',
      exact: true
    })).toBeDisabled();
    await name.fill('새 이름');
    await editKind.click();
    await editor.getByRole('option', {
      name: '일반관리비',
      exact: true
    }).click();
    await expect(name).toHaveCount(0);
    await editKind.click();
    await editor.getByRole('option', {
      name: '직접 입력',
      exact: true
    }).click();
    await expect(name).toHaveValue('');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await name.fill('공용 인터넷 이용료');
    await editor.getByRole('button', {
      name: '수정',
      exact: true
    }).click();
    stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).feeItems, DRAFT_STORAGE_KEY);
    expect(stored[0]).toEqual({
      clientId,
      itemCode: null,
      itemName: '공용 인터넷 이용료',
      defaultAmount: '8000'
    });
    await page.reload();
    await page.getByRole('button', {
      name: '공용 인터넷 이용료 수정',
      exact: true
    }).click();
    await expect(editKind).toHaveText('직접 입력');
    await expect(name).toHaveValue('공용 인터넷 이용료');
    await page.evaluate((key) => {
      const draft = JSON.parse(sessionStorage.getItem(key)!);
      draft.feeItems[0].itemCode = 'UNKNOWN';
      sessionStorage.setItem(key, JSON.stringify(draft));
    }, DRAFT_STORAGE_KEY);
    await page.reload();
    await expect(page.getByText('등록된 관리비 항목이 없어요.')).toBeVisible();
    await page.getByRole('button', {
      name: '이전',
      exact: true
    }).click();
    await expect(page.getByLabel('예금주')).toHaveValue('예시 관리단');
  });
}

test('모바일 관리비는 종류별 아이콘·색상·연한 배경과 직접 입력의 중립색 공통 아이콘을 표시', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await openFeeItemsSetup(page);
  const names = ['일반관리비', '청소비', '승강기 유지비', '공용 전기료', '공용 수도료', '정화조 청소비', '생활폐기물 처리비'];
  for (const name of names) {
    await page.getByRole('button', {
      name: '관리비 항목 추가',
      exact: true
    }).click();
    const editor = page.getByRole('dialog', {
      name: '관리비 항목 추가',
      exact: true
    });
    await editor.getByRole('combobox', {
      name: '항목 종류'
    }).click();
    await editor.getByRole('option', {
      name,
      exact: true
    }).click();
    await editor.getByLabel('기본 금액').fill('100');
    await editor.getByRole('button', {
      name: '추가',
      exact: true
    }).click();
  }
  await addFeeItem(page, '공용 인터넷', '100');
  await addFeeItem(page, '정화조 청소', '100');
  await page.reload();
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).feeItems, DRAFT_STORAGE_KEY);
  expect(stored.map((item: { itemCode: string | null }) => item.itemCode)).toEqual([
    'GENERAL_MANAGEMENT', 'CLEANING', 'ELEVATOR_MAINTENANCE', 'COMMON_ELECTRICITY', 'COMMON_WATER',
    'SEPTIC_TANK_CLEANING',
    'WASTE_DISPOSAL', null, null
  ]);
  expect(stored.map((item: { itemName: string }) => item.itemName)).toEqual([...names, '공용 인터넷', '정화조 청소']);
  const list = page.getByRole('list', {
    name: '기본 관리비 항목'
  });
  await expect(list.getByRole('listitem')).toHaveCount(names.length + 2);
  const icons = await list.locator('li > span > svg').evaluateAll((elements) => elements.map((element) => element.innerHTML));
  expect(new Set(icons.slice(0, names.length)).size).toBe(names.length);
  expect(icons[names.length]).toBe(icons[names.length + 1]);
  expect(icons.slice(0, names.length)).not.toContain(icons[names.length]);
  const appearances = await list.locator('li > span').evaluateAll((elements) => elements.map((element) => ({
    color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor
  })));
  expect(new Set(appearances.slice(0, names.length).map((appearance) => appearance.color)).size).toBe(4);
  expect(new Set(appearances.slice(0, names.length).map((appearance) => appearance.background)).size).toBe(4);
  expect(appearances[names.length]).toEqual(appearances[names.length + 1]);
  expect(appearances[names.length].color).toBe('rgb(100, 116, 139)');
  expect(appearances.slice(0, names.length).map((appearance) => appearance.color)).not.toContain(appearances[names.length].color);
  const edits = list.getByRole('button', {
    name: / 수정$/
  });
  expect(await edits.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).color === 'rgb(37, 99, 235)'))).toBe(true);
  expect(await edits.locator('svg').evaluateAll((elements) => elements.every((element) => getComputedStyle(element).color === 'rgb(37, 99, 235)'))).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('feeKindIcons390.png'),
    fullPage: true,
    animations: 'disabled'
  });
});

for (const width of [1440, 320]) {
  test(`관리비 금액 ${width}px는 콤마·중간 커서·선택 교체·구분자 삭제를 유지하고 원본 정수를 저장`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    await openFeeItemsSetup(page);
    await page.getByRole('button', {
      name: '관리비 항목 추가',
      exact: true
    }).click();
    const editor = page.getByRole('dialog', {
      name: '관리비 항목 추가',
      exact: true
    });
    await editor.getByRole('combobox', {
      name: '항목 종류'
    }).click();
    await editor.getByRole('option', {
      name: '일반관리비',
      exact: true
    }).click();
    const amount = editor.getByLabel('기본 금액');
    const add = editor.getByRole('button', {
      name: '추가',
      exact: true
    });
    await amount.fill('-');
    await expect(amount).toHaveValue('-');
    await expect(add).toBeDisabled();
    await amount.pressSequentially('1000');
    await expect(amount).toHaveValue('-1,000');
    await expect(add).toBeEnabled();
    await amount.fill('0');
    await expect(add).toBeEnabled();
    await amount.press('Backspace');
    await expect(amount).toHaveValue('');
    await expect(add).toBeDisabled();

    await amount.fill('12345');
    await expect(amount).toHaveValue('12,345');
    await amount.evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 2));
    await amount.pressSequentially('9');
    await expect(amount).toHaveValue('129,345');
    expect(await amount.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(3);
    await amount.pressSequentially('8');
    await expect(amount).toHaveValue('1,298,345');
    expect(await amount.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(5);
    await amount.evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 5));
    await amount.pressSequentially('0');
    await expect(amount).toHaveValue('10,345');
    await amount.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 3));
    await amount.press('Backspace');
    await expect(amount).toHaveValue('1,345');
    expect(await amount.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
    await amount.press('Delete');
    await expect(amount).toHaveValue('145');
    expect(await amount.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);

    await amount.fill('10,000');
    await expect(amount).toHaveValue('10,000');
    await amount.fill('1.5');
    await expect(amount).toHaveValue('10,000');
    const rejectedPaste = await amount.evaluate((element) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', '12,34');

      return !element.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true
      }));
    });
    expect(rejectedPaste).toBe(true);
    await expect(amount).toHaveValue('10,000');
    await amount.fill('-12345');
    await expect(amount).toHaveValue('-12,345');
    await add.click();
    const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).feeItems, DRAFT_STORAGE_KEY);
    expect(stored[0].defaultAmount).toBe('-12345');
    await expect(page.getByLabel('세대당 월 기본 관리비', {
      exact: true
    })).toContainText('-12,345원');
    await page.getByRole('button', {
      name: '일반관리비 수정',
      exact: true
    }).click();
    await expect(page.getByLabel('기본 금액')).toHaveValue('-12,345');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`feeAmountFormatter${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

test('관리비 추가창은 빈 이름·부호만 입력·범위 초과를 막고 금액의 문자·소수 입력을 거부', async ({ page }) => {
  await openFeeItemsSetup(page);
  await page.getByRole('button', {
    name: '관리비 항목 추가',
    exact: true
  }).click();
  const editor = page.getByRole('dialog', {
    name: '관리비 항목 추가',
    exact: true
  });
  const save = editor.getByRole('button', {
    name: '추가',
    exact: true
  });
  const amount = editor.getByLabel('기본 금액');
  const kind = editor.getByRole('combobox', {
    name: '항목 종류'
  });
  await expect(kind).toBeFocused();
  await expect(save).toBeDisabled();
  await kind.click();
  await editor.getByRole('option', {
    name: '직접 입력',
    exact: true
  }).click();
  await expect(editor.getByLabel('항목명')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(amount).not.toHaveAttribute('aria-invalid', 'true');
  await editor.getByLabel('항목명').fill('   ');
  await amount.fill('0');
  await expect(save).toBeDisabled();
  await expect(editor.getByLabel('항목명')).toHaveAttribute('aria-invalid', 'true');
  await expect(amount).not.toHaveAttribute('aria-invalid', 'true');
  await editor.getByLabel('항목명').fill('😀'.repeat(101));
  await expect(save).toBeDisabled();
  await editor.getByLabel('항목명').fill('😀'.repeat(100));
  await expect(save).toBeEnabled();
  for (const invalid of ['-', '-1000000000000000', '1000000000000000']) {
    await amount.fill(invalid);
    await expect(save).toBeDisabled();
  }
  await amount.fill('-123');
  for (const rejected of ['1.5', '1e3', '12a', '1-2', '１２３']) {
    await amount.fill(rejected);
    await expect(amount).toHaveValue('-123');
  }
  await amount.fill('-999999999999999');
  await expect(save).toBeEnabled();
  await editor.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page.getByText('등록된 관리비 항목이 없어요.')).toBeVisible();
});

test('관리비 최종 합계의 범위 초과는 진행을 막고 음수 상쇄 항목을 추가하면 복구', async ({ page }) => {
  await openFeeItemsSetup(page);
  await addFeeItem(page, '상한', '999999999999999');
  await addFeeItem(page, '더하기', '1');
  const next = page.getByRole('button', {
    name: '다음',
    exact: true
  });
  await expect(next).toBeDisabled();
  await expect(page.getByRole('alert').filter({
    hasText: '관리비 합계'
  })).toBeVisible();
  await addFeeItem(page, '상쇄', '-1');
  await expect(next).toBeEnabled();
  await expect(page.getByLabel('세대당 월 기본 관리비', {
    exact: true
  })).toContainText('999,999,999,999,999원');
});

for (const width of [1440, 320]) {
  test(`관리비 ${width}px에서 수정 취소·삭제 취소·확인과 마지막 항목 삭제의 진행 조건을 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 844
    });
    await openFeeItemsSetup(page);
    await addFeeItem(page, '차감', '-5000');
    const edit = page.getByRole('button', {
      name: '차감 수정',
      exact: true
    });
    await edit.click();
    const editor = page.getByRole('dialog', {
      name: '관리비 항목 수정',
      exact: true
    });
    await editor.getByLabel('기본 금액').fill('-7000');
    await page.keyboard.press('Escape');
    await expect(edit).toBeFocused();
    await expect(page.getByLabel('세대당 월 기본 관리비', {
      exact: true
    })).toContainText('-5,000원');
    await edit.click();
    await editor.getByLabel('기본 금액').fill('-7000');
    if (width > 640) {
      await expect(editor.getByRole('button', {
        name: '항목 삭제',
        exact: true,
        includeHidden: true
      })).toBeHidden();
      await editor.getByRole('button', {
        name: '취소',
        exact: true
      }).click();
    }
    const deleteButton = width > 640 ? page.getByRole('button', {
      name: '차감 삭제',
      exact: true
    }) : editor.getByRole('button', {
      name: '항목 삭제',
      exact: true
    });
    await deleteButton.click();
    const confirmation = page.getByRole('alertdialog', {
      name: '관리비 항목 삭제 확인',
      exact: true
    });
    await expect(confirmation).toContainText('차감');
    await expect(confirmation.getByRole('button', {
      name: '취소',
      exact: true
    })).toBeFocused();
    await page.keyboard.press('Escape');
    if (width <= 640) {
      await expect(editor).toBeVisible();
      await expect(editor.getByLabel('기본 금액')).toHaveValue('-7,000');
    } else {
      await expect(editor).toHaveCount(0);
    }
    await expect(deleteButton).toBeFocused();
    await deleteButton.click();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByText('등록된 관리비 항목이 없어요.')).toBeVisible();
    await expect(page.getByRole('button', {
      name: '관리비 항목 추가',
      exact: true
    })).toBeFocused();
    await expect(page.getByRole('button', {
      name: '다음',
      exact: true
    })).toBeDisabled();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
}

test('관리비 항목·순서와 이전 입력은 이동·새로고침에 복원하고 잘못된 계좌는 선행 단계로 복귀', async ({ page }) => {
  await openFeeItemsSetup(page);
  await addFeeItem(page, '일반관리비', '15000');
  await addFeeItem(page, '차감', '-5000');
  // 코드가 없던 이전 버전 초안도 이름·금액·순서를 유지해 직접 입력으로 복원합니다.
  await page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    for (const item of draft.feeItems) delete item.itemCode;
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, DRAFT_STORAGE_KEY);
  await page.reload();
  await expect(page).toHaveURL(/registration=fees/);
  await expect(page.getByLabel('세대당 월 기본 관리비', {
    exact: true
  })).toContainText('10,000원');
  expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!).feeItems.map((item: { itemCode: string | null }) => item.itemCode), DRAFT_STORAGE_KEY))
    .toEqual([null, null]);
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await expect(page.getByLabel('계좌번호')).toHaveValue('00012345678');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByLabel('세대당 월 기본 관리비', {
    exact: true
  })).toContainText('10,000원');
  await page.goBack();
  await expect(page).toHaveURL(/registration=account/);
  await page.goForward();
  await expect(page).toHaveURL(/registration=fees/);
  await page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.bankAccount.accountNumber = '';
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, DRAFT_STORAGE_KEY);
  await page.reload();
  await expect(page).toHaveURL(/registration=account/);
  await page.getByLabel('계좌번호').fill('00012345678');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByLabel('세대당 월 기본 관리비', {
    exact: true
  })).toContainText('10,000원');
  await page.evaluate((key) => {
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.feeItems[0].defaultAmount = 'invalid';
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, DRAFT_STORAGE_KEY);
  await page.reload();
  await expect(page.getByText('등록된 관리비 항목이 없어요.')).toBeVisible();
  await page.getByRole('button', {
    name: '이전',
    exact: true
  }).click();
  await expect(page.getByLabel('예금주')).toHaveValue('예시 관리단');
  await page.goto('/start');
  await page.goto('/start?registration=fees');
  await expect(page).toHaveURL(/registration=basic/);
});

for (const width of [1440, 390, 320]) {
  test(`관리비 ${width}px의 표·카드·금액·버튼은 긴 항목명에도 화면을 넘치지 않음`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: width > 640 ? 1000 : 844
    });
    await openFeeItemsSetup(page);
    await page.screenshot({
      path: test.info().outputPath(`feeItemsEmpty${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    for (const [name, amount] of [['일반관리비', '15000'], ['청소용역비', '8000'], ['엘리베이터비', '25300'], ['기타(수선비 등)', '1700']]) {
      await addFeeItem(page, name, amount);
    }
    await expect(page.getByLabel('세대당 월 기본 관리비', {
      exact: true
    })).toContainText('50,000원');
    await page.getByRole('heading', {
      name: '관리비 항목 설정',
      exact: true
    }).click();
    await page.screenshot({
      path: test.info().outputPath(`feeItems${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    if (width <= 640) await expect(page.getByLabel('5단계 중 4단계: 관리비 항목')).toBeVisible();
    await addFeeItem(page, '긴 항목명'.repeat(16), '-999999999999999');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', {
      name: '이전',
      exact: true
    }).click();
    await expect(page.getByRole('heading', {
      name: '관리계좌 설정',
      exact: true
    })).toBeVisible();
  });
}

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
  await expect(editBuilding.locator('svg')).toHaveCount(1);
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
  test(`동과 세대 모두 삭제는 확인 후 해당 동만 제거하고 다른 동과 자동 입력을 유지 (${viewport.width}px)`, async ({ page }) => {
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
    await expect(confirmation.getByRole('radio')).toHaveCount(0);
    await expect(confirmation).toContainText('103동과 연결된 0세대');
    await expect(confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    })).toBeEnabled();
    await confirmation.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(clear).toHaveCSS('color', 'rgb(239, 68, 68)');
    await page.screenshot({
      path: test.info().outputPath('buildingUnitsClearManager.png')
    });
    await clear.click();
    await expect(confirmation).toContainText('101동과 연결된 4세대');
    await expect(confirmation).toContainText('동과 해당 동에 입력한 모든 세대가 함께 삭제됩니다.');
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
    await expect(clear).toHaveCount(0);
    await expect(choices.getByRole('button', {
      name: '101동',
      exact: true
    })).toHaveCount(0);
    await expect(manager.getByRole('button', {
      name: '102동 삭제',
      exact: true
    })).toBeVisible();
    expect(await manager.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    const after = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), DRAFT_STORAGE_KEY);
    expect(after.buildings).toEqual(before.buildings.filter((building: { name: string }) => building.name !== '101동'));
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
    await expect(choices.getByRole('button', {
      name: '101동',
      exact: true
    })).toHaveCount(0);
    await addBuilding(page, '101동');
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
    expect(empty.buildings).toEqual(before.buildings.filter((building: { name: string }) => building.name !== '101동' && building.name !== '102동'));
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('');
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('성내빌라');
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('');
  await page.getByLabel('건물·단지 이름').fill('새 입력');
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('');
  await expect(page.getByRole('button', {
    name: '등록하고 계속'
  })).toBeDisabled();
});

test('주소 검색 로딩 실패는 닫거나 재시도할 수 있고 폼 입력이 사라지지 않음', async ({ page }) => {
  await page.route(POSTCODE_SCRIPT_URL, (route) => route.abort());
  await openRegistration(page);
  await page.getByLabel('건물·단지 이름').fill('성내빌라');
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('성내빌라');
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
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('');
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

const FINAL_URL = `${API_ORIGIN}/api/property-registrations`;
const LOOKUP_URL = new RegExp(`${FINAL_URL}/[0-9a-f-]{36}$`);
const SUBMISSION_KEY = 'moahome.property-registration.submission';
const RECEIPT_KEY = 'moahome.property-registration.receipt';
const PENDING_KEY = `moahome.property-registration.pending.${CURRENT_USER.id}`;

/** 실제 입력 화면을 거쳐 확인 화면까지 이동하며 저장 API는 아직 호출하지 않습니다. */
async function openRegistrationReview(page: Page) {
  await openFeeItemsSetup(page);
  await addFeeItem(page, '일반관리비', '15000');
  await addFeeItem(page, '차감', '-5000');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '등록 정보를 확인해주세요',
    exact: true
  })).toBeVisible();
}

/** 상세 안에 있는 수정 동작을 사용하기 전에 같은 항목의 아코디언을 펼칩니다. */
/** 수정 뒤 첫 이동부터 남은 단계를 순서대로 확인하여 5단계 직행을 허용하지 않습니다. */
async function finishSequentialReview(page: Page, firstStep: string) {
  const steps = ['units', 'account', 'fees', 'review'];
  const start = steps.indexOf(firstStep);
  expect(start).toBeGreaterThanOrEqual(0);
  await expect(page).toHaveURL(new RegExp(`registration=${firstStep}`));
  for (let index = start; index < steps.length - 1; index++) {
    await page.getByRole('button', {
      name: '다음',
      exact: true
    }).click();
    await expect(page).toHaveURL(new RegExp(`registration=${steps[index + 1]}`));
  }
}

/** 등록 당시 API 계약의 최소 성공 스냅샷을 모의 응답으로 사용합니다. */
function registrationResult(body: { requestId: string; basicInfo: { name: string; hasBuildings: boolean }; buildings: unknown[]; units: unknown[]; feeItems: { defaultAmount: number }[] }) {
  return {
    requestId: body.requestId,
    property: {
      id: 'f5405dd1-42ea-4279-9302-812ffcc2d21b',
      name: body.basicInfo.name,
      hasBuildings: body.basicInfo.hasBuildings,
      status: 'ACTIVE'
    },
    membership: {
      id: '6114debb-fdf5-4e92-ac9d-ea665f7e13ed',
      role: 'ADMIN',
      status: 'ACTIVE'
    },
    summary: {
      buildingCount: body.buildings.length,
      unitCount: body.units.length,
      bankAccountCount: 1,
      feeItemCount: body.feeItems.length,
      monthlyDefaultAmount: body.feeItems.reduce((sum, item) => sum + item.defaultAmount, 0)
    },
    createdAt: '2026-10-09T01:00:00Z'
  };
}

const COMPLETED_REQUEST_ID = 'c29cad4e-749c-432a-9c60-2eaa97936e8e';
const COMPLETED_URL = `/start?registration=complete&requestId=${COMPLETED_REQUEST_ID}`;

/** 재진입 검증은 개인정보가 없는 결과 계약만 준비하고 입력 폼이나 실제 서버에 의존하지 않습니다. */
function completedResult() {
  return registrationResult({
    requestId: COMPLETED_REQUEST_ID,
    basicInfo: {
      name: '서버 확인 빌라',
      hasBuildings: false
    },
    buildings: [],
    units: [{}],
    feeItems: [{
      defaultAmount: 10000
    }]
  });
}

for (const width of [1440, 320]) {
  test(`완료 재진입 ${width}px는 저장소 요약을 신뢰하지 않고 서버 권한 확인 뒤 결과만 표시`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    await page.addInitScript(({ key, userId, result }) => {
      sessionStorage.setItem(key, JSON.stringify({
        userId,
        result: {
          ...result,
          property: {
            ...result.property,
            name: '조작된 이전 정보'
          }
        }
      }));
    }, {
      key: RECEIPT_KEY,
      userId: CURRENT_USER.id,
      result: completedResult()
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let lookups = 0;
    await page.route(LOOKUP_URL, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      lookups++;
      expect(route.request().headers().authorization).toBe('Bearer test-access');
      await gate;
      await fulfillJson(route, completedResult());
    });
    await page.goto(COMPLETED_URL);
    await expect(page.getByRole('heading', {
      name: '등록 결과를 확인하고 있습니다'
    })).toBeVisible();
    await expect(page.getByRole('heading', {
      name: '관리할 곳이 등록되었습니다!'
    })).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText('조작된 이전 정보');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`resultChecking${width}.png`),
      fullPage: true
    });
    release();
    await expect(page.getByRole('heading', {
      name: '관리할 곳이 등록되었습니다!'
    })).toBeVisible();
    await expect(page.getByRole('region', {
      name: '등록된 정보',
      exact: true
    })).toContainText('서버 확인 빌라');
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), RECEIPT_KEY)).toEqual({
      userId: CURRENT_USER.id,
      requestId: COMPLETED_REQUEST_ID
    });
    await page.reload();
    await expect(page.getByRole('heading', {
      name: '관리할 곳이 등록되었습니다!'
    })).toBeVisible();
    expect(lookups).toBe(2);
    await expect(page.getByRole('main')).not.toContainText('조작된 이전 정보');
  });
}

for (const status of [403, 404]) {
  test(`완료 주소의 ${status}는 다른 사용자·해제된 권한의 정보와 재등록 폼을 표시하지 않음`, async ({ page }) => {
    let posts = 0;
    await page.route(FINAL_URL, async (route) => {
      if (route.request().method() === 'POST') posts++;
      await fulfillJson(route, {}, 503);
    });
    await page.route(LOOKUP_URL, (route) => fulfillJson(route, {
      code: status === 403 ? 'ACCESS_DENIED' : 'REGISTRATION_NOT_FOUND'
    }, status));
    await page.goto(COMPLETED_URL);
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByRole('heading', {
      name: '모아홈을 시작해 보세요!'
    })).toBeVisible();
    await expect(page.getByRole('heading', {
      name: '관리할 곳이 등록되었습니다!'
    })).toHaveCount(0);
    await expect(page.getByRole('dialog', {
      name: '관리할 곳 등록',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByText('서버 확인 빌라')).toHaveCount(0);
    expect(posts).toBe(0);
  });
}

for (const suffix of ['', '&requestId=invalid']) {
  test(`조회 ID가 없는·잘못된 완료 주소(${suffix || '없음'})는 성공 화면을 만들지 않음`, async ({ page }) => {
    let lookups = 0;
    await page.route(LOOKUP_URL, async (route) => {
      lookups++;
      await fulfillJson(route, completedResult());
    });
    await page.goto(`/start?registration=complete${suffix}`);
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', {
      name: '관리할 곳이 등록되었습니다!'
    })).toHaveCount(0);
    expect(lookups).toBe(0);
  });
}

test('비로그인 사용자는 완료 URL의 조회 ID가 있어도 로그인 화면으로 이동', async ({ page }) => {
  await page.route(`${API_ORIGIN}/api/auth/web/**`, (route) => fulfillJson(route, {
    code: 'AUTHENTICATION_REQUIRED'
  }, 401));
  let lookups = 0;
  await page.route(LOOKUP_URL, async (route) => {
    lookups++;
    await fulfillJson(route, completedResult());
  });
  await page.goto(COMPLETED_URL);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기'
  })).toBeVisible();
  expect(lookups).toBe(0);
});

test('완료 조회의 일시 장애에는 이전 정보를 숨기고 재제출 없이 같은 결과만 재확인', async ({ page }) => {
  let available = false;
  let lookups = 0;
  let posts = 0;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'POST') posts++;
    await fulfillJson(route, {}, 503);
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    lookups++;
    await fulfillJson(route, available ? completedResult() : {
      code: 'SERVICE_UNAVAILABLE'
    }, available ? 200 : 503);
  });
  await page.goto(COMPLETED_URL);
  await expect(page.getByRole('heading', {
    name: '등록 결과를 확인하지 못했어요'
  })).toBeVisible();
  await expect(page.getByText('서버 확인 빌라')).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  })).toHaveCount(0);
  available = true;
  await page.getByRole('button', {
    name: '다시 확인',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!'
  })).toBeVisible();
  expect(lookups).toBe(2);
  expect(posts).toBe(0);
});

test('완료 뒤 뒤로가기는 서버 권한을 다시 확인하고 권한 해제 시 과거 계좌와 입력 폼을 숨김', async ({ page }) => {
  let posts = 0;
  let lookups = 0;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    posts++;
    await fulfillJson(route, registrationResult(route.request().postDataJSON()), 201);
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    lookups++;
    await fulfillJson(route, {
      code: 'ACCESS_DENIED'
    }, 403);
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page).toHaveURL(/registration=complete&requestId=/);
  await expect(page.getByRole('region', {
    name: '등록된 정보',
    exact: true
  })).toContainText('00012345678');
  await page.goBack();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole('heading', {
    name: '모아홈을 시작해 보세요!'
  })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('00012345678');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(lookups).toBe(1);
  expect(posts).toBe(1);
});

test('완료 조회의 인증 거부는 캐시된 로그인 성공을 버리고 로그인 화면을 표시', async ({ page }) => {
  let expired = false;
  await page.route(`${API_ORIGIN}/api/auth/web/**`, (route) => {
    if (expired) return fulfillJson(route, {
      code: 'AUTHENTICATION_REQUIRED'
    }, 401);
    return fulfillJson(route, route.request().url().endsWith('/csrf') ? {
      csrfToken: 'test-csrf'
    } : {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    expired = true;
    await fulfillJson(route, {
      code: 'AUTHENTICATION_REQUIRED'
    }, 401);
  });
  await page.goto(COMPLETED_URL);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기'
  })).toBeVisible();
  await expect(page.getByText('서버 확인 빌라')).toHaveCount(0);
});

test('완료 화면에서 실제 로그아웃 뒤 뒤로가도 이전 입력과 계좌를 다시 표시하지 않음', async ({ page }) => {
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    await fulfillJson(route, registrationResult(route.request().postDataJSON()), 201);
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page).toHaveURL(/registration=complete&requestId=/);
  await page.route(`${API_ORIGIN}/api/auth/web/logout`, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    await page.route(`${API_ORIGIN}/api/auth/web/**`, (nextRoute) => fulfillJson(nextRoute, {
      code: 'AUTHENTICATION_REQUIRED'
    }, 401));
    await route.fulfill({
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  });
  await page.getByLabel('모아 주민님 계정 정보').click();
  await page.getByRole('button', {
    name: '로그아웃',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기'
  })).toBeVisible();
  await expect(page.getByText('00012345678')).toHaveCount(0);
});

test('다른 계정으로 접속하면 이전 사용자의 완료 기록을 조회하거나 표시하지 않음', async ({ page }) => {
  await page.addInitScript(({ key, userId, result }) => {
    sessionStorage.setItem(key, JSON.stringify({
      userId,
      result
    }));
  }, {
    key: RECEIPT_KEY,
    userId: CURRENT_USER.id,
    result: completedResult()
  });
  await page.route(`${API_ORIGIN}/api/users/me`, (route) => fulfillJson(route, {
    ...CURRENT_USER,
    id: '00000000-0000-0000-0000-000000000002',
    displayName: '다른 사용자'
  }));
  let lookups = 0;
  await page.route(LOOKUP_URL, async (route) => {
    lookups++;
    await fulfillJson(route, completedResult());
  });
  await page.goto('/start?registration=complete');
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole('heading', {
    name: '모아홈을 시작해 보세요!'
  })).toBeVisible();
  await expect(page.getByText('서버 확인 빌라')).toHaveCount(0);
  expect(lookups).toBe(0);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), RECEIPT_KEY)).toBeNull();
});

test('완료 화면의 조회 ID가 바뀌면 직전 정보를 숨기고 새 ID의 서버 결과를 확인', async ({ page }) => {
  const otherId = 'c29cad4e-749c-432a-9c60-2eaa97936e8f';
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    if (route.request().url().endsWith(otherId)) {
      await gate;
      return fulfillJson(route, {
        code: 'REGISTRATION_NOT_FOUND'
      }, 404);
    }
    await fulfillJson(route, completedResult());
  });
  await page.goto(COMPLETED_URL);
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!'
  })).toBeVisible();
  await page.evaluate((id) => window.history.pushState(null, '', `/start?registration=complete&requestId=${id}`), otherId);
  await expect(page.getByRole('heading', {
    name: '등록 결과를 확인하고 있습니다'
  })).toBeVisible();
  await expect(page.getByText('서버 확인 빌라')).toHaveCount(0);
  release();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole('heading', {
    name: '모아홈을 시작해 보세요!'
  })).toBeVisible();
});

test('캐시 복원 이벤트는 이전 화면을 가리고 로그아웃된 세션부터 다시 확인', async ({ page }) => {
  let lookups = 0;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    await fulfillJson(route, registrationResult(route.request().postDataJSON()), 201);
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    lookups++;
    await fulfillJson(route, completedResult());
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!'
  })).toBeVisible();
  await page.getByRole('button', {
    name: '등록 정보 다시 보기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '관리계좌 상세 펼치기',
    exact: true
  }).click();
  const details = page.locator('#review-account-details');
  await expect(details).toBeVisible();
  await expect(details).toContainText('00012345678');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {
    persisted: true
  })));
  await expect(details).toBeHidden();
  await page.route(`${API_ORIGIN}/api/auth/web/**`, (route) => fulfillJson(route, {
    code: 'AUTHENTICATION_REQUIRED'
  }, 401));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {
    persisted: true
  })));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', {
    name: '카카오로 시작하기'
  })).toBeVisible();
  await expect(page.getByText('00012345678')).toHaveCount(0);
  expect(lookups).toBe(0);
});

for (const width of [1440, 390, 320]) {
  test(`등록 확인 ${width}px는 전체 계좌번호·실제 요약·수정 후 순차 진행·새로고침을 유지하고 성공 전 완료를 표시하지 않음`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    let posts = 0;
    await page.route(FINAL_URL, async (route) => {
      if (route.request().method() === 'POST') posts++;
      await fulfillJson(route, {}, 503);
    });
    await openRegistrationReview(page);
    const account = page.getByRole('region', {
      name: '관리계좌 요약'
    });
    await expect(account).toContainText('00012345678');
    await expect(page.getByRole('region', {
      name: '관리비 요약'
    })).toContainText('10,000원');
    await expect(page.getByRole('heading', {
      name: '관리할 곳이 등록되었습니다!'
    })).toHaveCount(0);
    await page.getByRole('button', {
      name: '관리계좌 수정',
      exact: true
    }).click();
    await page.getByLabel('예금주').fill('변경 관리단');
    await page.getByRole('button', {
      name: '다음',
      exact: true
    }).click();
    await finishSequentialReview(page, 'fees');
    await expect(account).toContainText('변경 관리단');
    await page.getByRole('button', {
      name: '건물·단지 정보 수정',
      exact: true
    }).click();
    await page.getByLabel('건물·단지 이름').fill('수정한 빌라');
    await page.getByRole('button', {
      name: '등록하고 계속',
      exact: true
    }).click();
    await finishSequentialReview(page, 'units');
    await expect(page.getByRole('region', {
      name: '건물·단지 정보 요약'
    })).toContainText('수정한 빌라');
    await page.reload();
    await expect(account).toContainText('변경 관리단');
    expect(posts).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`registrationReview${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

for (const width of [390, 320]) {
  test(`모바일 확인 ${width}px는 요약 전체를 펼치고 오른쪽 수정 글씨에서 단계 순서를 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    await openRegistrationReview(page);
    const toggles = page.getByRole('button', {
      name: /^(건물·단지 정보 상세|세대 목록|관리계좌 상세|관리비 항목) 펼치기$/
    });
    await expect(toggles).toHaveCount(4);
    await expect(page.getByRole('button', {
      name: /^(건물·단지 정보|동·세대|관리계좌|관리비 항목) 수정$/
    })).toHaveCount(4);
    const icons = page.getByRole('region', {
      name: /^(건물·단지 정보|동·세대|관리계좌|관리비) 요약$/
    }).locator('[data-icon]');
    const iconColors = await icons.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color));
    expect(new Set(iconColors).size).toBe(4);
    const positions: number[] = [];

    for (const item of [
      {
        region: '건물·단지 정보 요약',
        toggle: '건물·단지 정보 상세',
        edit: '건물·단지 정보 수정',
        step: 'basic',
        next: '등록하고 계속',
        id: 'review-property-details'
      },
      {
        region: '동·세대 요약',
        toggle: '세대 목록',
        edit: '동·세대 수정',
        step: 'units',
        next: '다음',
        id: 'review-unit-list'
      },
      {
        region: '관리계좌 요약',
        toggle: '관리계좌 상세',
        edit: '관리계좌 수정',
        step: 'account',
        next: '다음',
        id: 'review-account-details'
      },
      {
        region: '관리비 요약',
        toggle: '관리비 항목',
        edit: '관리비 항목 수정',
        step: 'fees',
        next: '다음',
        id: 'review-fee-details'
      }
    ]) {
      const region = page.getByRole('region', {
        name: item.region
      });
      await region.click({
        position: {
          x: 26,
          y: 30
        }
      });
      await expect(page).toHaveURL(/registration=review/);
      const content = page.locator(`#${item.id}`);
      await expect(content).toBeVisible();
      if (item.step === 'basic') await expect(content).toContainText('건물 유형');
      if (item.step === 'account') {
        await expect(content).toContainText('예금주');
        await expect(content).toContainText('00012345678');
      }
      if (item.step === 'units') await expect(content.getByRole('listitem')).toHaveCount(1);
      if (item.step === 'fees') await expect(content.getByRole('table')).toBeVisible();
      const toggle = region.getByRole('button', {
        name: new RegExp(`^${item.toggle} (접기|펼치기)$`)
      });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.click();
      await expect(content).toBeHidden();
      await expect(content).toHaveAttribute('inert', '');
      await expect(region.getByRole('button', {
        name: item.edit,
        exact: true
      })).toHaveCount(1);
      await toggle.focus();
      await toggle.press('Enter');
      await expect(content).toBeVisible();
      const edit = region.getByRole('button', {
        name: item.edit,
        exact: true
      });
      await expect(edit).toHaveText('수정');
      await expect(edit.locator('svg')).toHaveCount(0);
      const appearance = await edit.evaluate((element) => {
        const style = getComputedStyle(element);

        return {
          color: style.color,
          border: style.borderTopWidth,
          background: style.backgroundColor
        };
      });
      expect(appearance).toEqual({
        color: 'rgb(37, 99, 235)',
        border: '0px',
        background: 'rgba(0, 0, 0, 0)'
      });
      const editBox = await edit.boundingBox();
      const summaryBox = await toggle.boundingBox();
      expect(Math.abs(editBox!.y + editBox!.height / 2 - summaryBox!.y - summaryBox!.height / 2)).toBeLessThan(1);
      expect(editBox!.x).toBeGreaterThan(summaryBox!.x + summaryBox!.width * 0.6);
      await edit.hover();
      const hover = await edit.evaluate((element) => ({
        underline: getComputedStyle(element).textDecorationLine,
        transform: getComputedStyle(element).transform
      }));
      expect(hover).toEqual({
        underline: 'none',
        transform: 'none'
      });
      positions.push(editBox!.x);
      await edit.click();
      await expect(page).toHaveURL(new RegExp(`registration=${item.step}`));
      await page.getByRole('button', {
        name: item.next,
        exact: true
      }).click();
      const nextSteps: Record<string, string> = {
        basic: 'units',
        units: 'account',
        account: 'fees',
        fees: 'review'
      };
      await finishSequentialReview(page, nextSteps[item.step]);
    }
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
    await expect(page.getByText('항목 추가 또는 수정은 관리비 설정 단계에서 가능합니다.')).toHaveCount(0);
    await page.emulateMedia({
      reducedMotion: 'reduce'
    });
    const motion = await page.getByRole('button', {
      name: '건물·단지 정보 상세 펼치기',
      exact: true
    }).evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(motion).toBe('0s');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('등록 확인은 많은 세대를 펼쳐 보고 동·세대 수정 뒤 남은 단계를 순서대로 진행', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 900
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '동·세대 수정',
    exact: true
  }).click();
  for (let i = 301; i < 308; i++) await addUnit(page, String(i), '3');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await finishSequentialReview(page, 'account');
  const units = page.locator('#review-unit-list');
  await expect(units).toBeHidden();
  await page.getByRole('button', {
    name: '세대 목록 펼치기',
    exact: true
  }).click();
  await expect(units).toBeVisible();
  await expect(units.getByRole('listitem')).toHaveCount(8);
  const unitGroup = units.getByRole('region', {
    name: '동 없음 세대 목록'
  });
  await expect(unitGroup.getByRole('heading')).toHaveText('동 없음');
  await expect(unitGroup.getByText('8세대', {
    exact: true
  })).toHaveCount(1);
  await expect(unitGroup.getByRole('button')).toHaveCount(0);
  const thirdFloor = unitGroup.getByRole('list', {
    name: '3층 세대 목록',
    exact: true
  });
  // 같은 층에 7세대가 있을 때만 PC 최대 4열과 모바일 최대 2열의 줄바꿈을 확인합니다.
  for (const layout of [
    {
      width: 1440,
      columns: 4
    },
    {
      width: 390,
      columns: 2
    },
    {
      width: 320,
      columns: 2
    }
  ]) {
    await page.setViewportSize({
      width: layout.width,
      height: 900
    });
    await expect.poll(async () => thirdFloor.getByRole('listitem').evaluateAll((items) => {
      const firstTop = items[0].getBoundingClientRect().top;

      return items.filter((item) => Math.abs(item.getBoundingClientRect().top - firstTop) < 1).length;
    })).toBe(layout.columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', {
    name: '세대 목록 접기',
    exact: true
  }).click();
  await expect(units).toBeHidden();
  await page.getByRole('button', {
    name: '관리비 항목 수정',
    exact: true
  }).click();
  await addFeeItem(page, '청소비', '7000');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await expect(page.getByRole('region', {
    name: '관리비 요약'
  })).toContainText('17,000원');
});

for (const width of [1440, 320]) {
  test(`등록 확인 층별 배치 ${width}px는 층당 1·2·3·4·5세대를 구분하고 다음 층을 새 줄로 표시`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    await openRegistrationReview(page);
    await page.getByRole('button', {
      name: '동·세대 수정',
      exact: true
    }).click();
    const floors = [
      {
        label: 'B1층',
        value: '-1',
        units: ['B101', 'B102']
      },
      {
        label: '1층',
        value: '1',
        units: ['101']
      },
      {
        label: '2층',
        value: '2',
        units: ['201', '202']
      },
      {
        label: '3층',
        value: '3',
        units: ['301', '302', '303']
      },
      {
        label: '4층',
        value: '4',
        units: ['401', '402', '403', '404']
      },
      {
        label: '5층',
        value: '5',
        units: ['501', '502', '503', '504', '505']
      },
      {
        label: '6층',
        value: '6',
        units: ['601', '602']
      },
      {
        label: '층 미입력',
        value: '',
        units: ['001', '관리실']
      }
    ];
    for (const floor of floors) {
      for (const unit of floor.units) {
        if (unit !== '201') await addUnit(page, unit, floor.value);
      }
    }
    await page.getByRole('button', {
      name: '다음',
      exact: true
    }).click();
    await finishSequentialReview(page, 'account');
    await page.getByRole('button', {
      name: '세대 목록 펼치기',
      exact: true
    }).click();
    const unitGroup = page.getByRole('region', {
      name: '동 없음 세대 목록'
    });
    await expect(unitGroup.getByRole('list')).toHaveCount(floors.length);
    let previousBottom = 0;
    for (const floor of floors) {
      const list = unitGroup.getByRole('list', {
        name: `${floor.label} 세대 목록`,
        exact: true
      });
      await expect(list.getByRole('listitem')).toHaveText(floor.units.map((unit) => unit === '관리실' ? unit : `${unit}호`));
      const positions = await list.getByRole('listitem').evaluateAll((items) => items.map((item) => {
        const box = item.getBoundingClientRect();

        return {
          top: box.top,
          bottom: box.bottom
        };
      }));
      // 동 전체 세대 수와 관계없이 실제 층당 개수로 열을 정하고 층 경계에서 반드시 줄을 나눕니다.
      const columns = Math.min(floor.units.length, width < 768 ? 2 : 4);
      expect(positions.filter((position) => Math.abs(position.top - positions[0].top) < 1)).toHaveLength(columns);
      expect(positions[0].top).toBeGreaterThanOrEqual(previousBottom);
      previousBottom = Math.max(...positions.map((position) => position.bottom));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`reviewUnitFloors${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

test('최종 등록은 중복 클릭·뒤로가기를 막고 API 계약의 전체 본문을 한 번 저장한 뒤 초안을 폐기', async ({ page }) => {
  let release!: () => void;
  const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
  const bodies: RegistrationRequest[] = [];
  let lookups = 0;
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    lookups++;
    await fulfillJson(route, registrationResult(bodies[0]));
  });
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    const body = route.request().postDataJSON();
    bodies.push(body);
    await waitForRelease;
    await fulfillJson(route, registrationResult(body), 201);
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('dialog', {
    name: '관리 환경을 준비하고 있습니다'
  })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {
    name: '관리 환경을 준비하고 있습니다'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '건물·단지 정보 수정'
  })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/registration=review/);
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].units[0]).not.toHaveProperty('clientId');
  expect(bodies[0].feeItems[0]).toEqual({
    itemCode: null,
    itemName: '일반관리비',
    defaultAmount: 15000
  });
  expect(bodies[0]).not.toHaveProperty('automaticUnitRule');
  release();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  expect(await page.evaluate((keys) => keys.map((key) => sessionStorage.getItem(key)), [DRAFT_STORAGE_KEY, SUBMISSION_KEY])).toEqual([null, null]);
  expect(await page.evaluate((key) => localStorage.getItem(key), PENDING_KEY)).toBeNull();
  const receipt = await page.evaluate((key) => sessionStorage.getItem(key), RECEIPT_KEY);
  expect(JSON.parse(receipt!)).toEqual({
    userId: CURRENT_USER.id,
    requestId: bodies[0].requestId
  });
  await expect(page).toHaveURL(/registration=complete/);
  await page.getByRole('button', {
    name: '등록 정보 다시 보기',
    exact: true
  }).click();
  await expect(page.getByRole('region', {
    name: '관리계좌 요약'
  })).toContainText('00012345678');
  await expect(page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '완료 화면으로 돌아가기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '관리자 대시보드로 이동',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/manage\/[0-9a-f-]+\/dashboard$/);
  await expect(page.getByRole('main')).toHaveText('임시 페이지');
  expect(lookups).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/registration=complete/);
  await expect.poll(() => lookups).toBe(1);
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('00012345678');
  expect(bodies).toHaveLength(1);
  expect(lookups).toBe(2);
});

test('최종 등록 응답 유실은 기존 ID의 결과 조회로 성공을 확인하고 새 등록을 보내지 않음', async ({ page }) => {
  let body: RegistrationRequest;
  let posts = 0;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    posts++;
    body = route.request().postDataJSON();
    await route.abort('failed');
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    expect(route.request().url()).toBe(`${FINAL_URL}/${body.requestId}`);
    await fulfillJson(route, registrationResult(body));
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  expect(posts).toBe(1);
});

test('등록 결과 404와 새로고침 뒤에도 기존 ID·본문을 유지해 재시도하고 성공까지 입력을 잠금', async ({ page }) => {
  const bodies: RegistrationRequest[] = [];
  let succeed = false;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (!succeed) return route.abort('failed');
    await fulfillJson(route, registrationResult(body), 200);
  });
  await page.route(LOOKUP_URL, (route) => fulfillJson(route, {
    code: 'REGISTRATION_NOT_FOUND'
  }, 404));
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '같은 정보로 다시 시도',
    exact: true
  })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {
    name: '같은 정보로 다시 시도',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '관리계좌 수정'
  })).toHaveCount(0);
  succeed = true;
  await page.getByRole('button', {
    name: '같은 정보로 다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

for (const originalCompletes of [false, true]) {
  test(`등록 내역 404 뒤 입력 수정은 같은 ID로 재등록하며 늦은 기존 성공(${originalCompletes})도 중복 생성하지 않음`, async ({ page }) => {
    const bodies: RegistrationRequest[] = [];
    let originalFound = false;
    await page.route(FINAL_URL, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) return route.abort('failed');
      if (originalCompletes) {
        originalFound = true;
        return fulfillJson(route, {
          code: 'REGISTRATION_REQUEST_CONFLICT'
        }, 409);
      }
      await fulfillJson(route, registrationResult(body), 201);
    });
    await page.route(LOOKUP_URL, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      await fulfillJson(route, originalFound ? registrationResult(bodies[0]) : {
        code: 'REGISTRATION_NOT_FOUND'
      }, originalFound ? 200 : 404);
    });
    await openRegistrationReview(page);
    await page.getByRole('button', {
      name: '관리 시작하기',
      exact: true
    }).click();
    const dialog = page.getByRole('dialog', {
      name: '등록을 완료하지 못했어요',
      exact: true
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', {
      name: '입력 수정하기',
      exact: true
    }).click();
    await expect(page).toHaveURL(/registration=basic/);
    await expect(page.getByLabel('건물·단지 이름')).toHaveValue('성내빌라');
    await expect(page.getByRole('dialog', {
      name: '관리할 곳 등록',
      exact: true
    }).getByRole('alert')).toHaveCount(0);
    await page.getByLabel('건물·단지 이름').fill('수정한 빌라');
    await page.getByRole('button', {
      name: '등록하고 계속',
      exact: true
    }).click();
    await finishSequentialReview(page, 'units');
    await page.getByRole('button', {
      name: '관리 시작하기',
      exact: true
    }).click();
    await expect(page).toHaveURL(/registration=complete/);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].requestId).toBe(bodies[0].requestId);
    expect(bodies[1].basicInfo.name).toBe('수정한 빌라');
    const information = page.getByRole('region', {
      name: '등록된 정보',
      exact: true
    });
    await expect(information).toContainText(originalCompletes ? '성내빌라' : '수정한 빌라');
    if (originalCompletes) {
      await expect(information).not.toContainText('수정한 빌라');
      await expect(information).not.toContainText('00012345678');
      await page.getByRole('button', {
        name: '등록 정보 다시 보기',
        exact: true
      }).click();
      await expect(page.getByRole('heading', {
        name: '등록된 정보를 확인해주세요',
        exact: true
      })).toBeVisible();
      await expect(page.getByRole('region', {
        name: '관리계좌 요약'
      })).toHaveCount(0);
    }
  });
}

test('등록 설정을 나간 뒤 등록 내역이 없으면 새 입력 화면에서 다시 등록할 수 있음', async ({ page }) => {
  const bodies: RegistrationRequest[] = [];
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (bodies.length === 1) return route.abort('failed');
    await fulfillJson(route, registrationResult(body), 201);
  });
  await page.route(LOOKUP_URL, (route) => fulfillJson(route, route.request().method() === 'OPTIONS' ? {} : {
    code: 'REGISTRATION_NOT_FOUND'
  }, route.request().method() === 'OPTIONS' ? 200 : 404));
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '등록 안내 닫기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '등록 설정 나가기',
    exact: true
  }).click();
  await expect(page).toHaveURL('/start');
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL(/registration=basic/);
  await expect(page.getByLabel('건물·단지 이름')).toHaveValue('');
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  }).getByRole('alert')).toHaveCount(0);
  // 기존 입력을 폐기한 새 진입도 같은 ID를 사용해 아직 끝나지 않은 첫 요청과 중복 생성되지 않습니다.
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page).toHaveURL(/registration=complete/);
  expect(bodies).toHaveLength(2);
  expect(bodies[1].requestId).toBe(bodies[0].requestId);
});

test('명확한 등록 입력 오류는 해당 단계로 돌아가 값을 유지하고 수정 후 기존 ID로 저장', async ({ page }) => {
  const ids: string[] = [];
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    const body = route.request().postDataJSON();
    ids.push(body.requestId);
    if (ids.length === 1) return fulfillJson(route, {
      code: 'INVALID_REQUEST',
      errors: [{
        field: 'bankAccounts[0].holderName',
        reason: 'INVALID_FORMAT',
        message: 'private-error-original'
      }]
    }, 400);
    await fulfillJson(route, registrationResult(body), 201);
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  const failureDialog = page.getByRole('dialog', {
    name: '등록에 실패했습니다',
    exact: true
  });
  await expect(failureDialog).toBeVisible();
  await expect(failureDialog).toContainText('관리계좌: 입력 형식을 확인해주세요.');
  await expect(failureDialog).not.toContainText('private-error-original');
  await failureDialog.getByRole('button', {
    name: '입력 수정하기',
    exact: true
  }).click();
  await expect(page).toHaveURL(/registration=account/);
  await expect(page.getByRole('alert').filter({
    hasText: '관리계좌:'
  })).toContainText('관리계좌');
  await expect(page.getByRole('alert').filter({
    hasText: '관리계좌:'
  })).not.toContainText('private-error-original');
  await expect(page.getByLabel('예금주')).toHaveValue('예시 관리단');
  await page.getByLabel('예금주').fill('수정 관리단');
  await page.getByRole('button', {
    name: '다음',
    exact: true
  }).click();
  await finishSequentialReview(page, 'fees');
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
});

test('등록 결과 조회 자체가 실패하면 새 요청·수정을 막고 같은 ID 조회만 재시도', async ({ page }) => {
  let body: RegistrationRequest;
  let posts = 0;
  let recover = false;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    body = route.request().postDataJSON();
    posts++;
    await fulfillJson(route, {
      code: 'REGISTRATION_SERVICE_UNAVAILABLE'
    }, 503);
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    await fulfillJson(route, recover ? registrationResult(body) : {
      code: 'REGISTRATION_SERVICE_UNAVAILABLE'
    }, recover ? 200 : 503);
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '등록 결과 확인',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '같은 정보로 다시 시도',
    exact: true
  })).toHaveCount(0);
  recover = true;
  await page.getByRole('button', {
    name: '등록 결과 확인',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  expect(posts).toBe(1);
});

for (const closeMethod of ['닫기 버튼', 'Escape', '배경 클릭']) {
  test(`결과 미확인 모달 ${closeMethod}은 안내만 닫고 같은 요청 확인·재시도를 유지`, async ({ page }) => {
    await page.setViewportSize({
      width: closeMethod === 'Escape' ? 1440 : 320,
      height: 900
    });
    const bodies: RegistrationRequest[] = [];
    const lookups: string[] = [];
    await page.route(FINAL_URL, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (bodies.length === 1) return route.abort('failed');
      await fulfillJson(route, registrationResult(body), 201);
    });
    await page.route(LOOKUP_URL, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      lookups.push(route.request().url());
      await fulfillJson(route, {
        code: 'REGISTRATION_NOT_FOUND'
      }, 404);
    });
    await openRegistrationReview(page);
    await page.getByRole('button', {
      name: '관리 시작하기',
      exact: true
    }).click();
    const dialog = page.getByRole('dialog', {
      name: '등록을 완료하지 못했어요',
      exact: true
    });
    await expect(dialog).toBeVisible();
    if (closeMethod === '닫기 버튼') {
      await dialog.getByRole('button', {
        name: '등록 안내 닫기',
        exact: true
      }).click();
    } else if (closeMethod === 'Escape') {
      await page.keyboard.press('Escape');
    } else {
      await page.mouse.click(2, 2);
    }
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/registration=review/);
    const checkButton = page.getByRole('button', {
      name: '등록 결과 확인',
      exact: true
    });
    await expect(checkButton).toBeFocused();
    await expect(page.getByRole('button', {
      name: '등록 설정 나가기',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '건물·단지 정보 수정',
      exact: true
    })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), PENDING_KEY)).toBe(bodies[0].requestId);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (closeMethod === '닫기 버튼') {
      await page.screenshot({
        path: test.info().outputPath('registrationRecovery320.png'),
        fullPage: true,
        animations: 'disabled'
      });
    }
    await checkButton.click();
    await expect(dialog).toBeVisible();
    expect(lookups).toEqual([`${FINAL_URL}/${bodies[0].requestId}`, `${FINAL_URL}/${bodies[0].requestId}`]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', {
      name: '같은 정보로 다시 시도',
      exact: true
    }).click();
    await expect(page).toHaveURL(/registration=complete/);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });
}

test('결과 미확인 안내를 닫고 등록 설정을 나가도 재진입에서 기존 결과를 조회하고 새 등록을 보내지 않음', async ({ page }) => {
  let body: RegistrationRequest;
  let posts = 0;
  let found = false;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    posts++;
    body = route.request().postDataJSON();
    await route.abort('failed');
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    expect(route.request().url()).toBe(`${FINAL_URL}/${body.requestId}`);
    await fulfillJson(route, found ? registrationResult(body) : {
      code: 'REGISTRATION_NOT_FOUND'
    }, found ? 200 : 404);
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '등록 안내 닫기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '등록 설정 나가기',
    exact: true
  }).click();
  await expect(page).toHaveURL('/start');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), SUBMISSION_KEY)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), PENDING_KEY)).toBe(body!.requestId);
  found = true;
  await page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  }).click();
  await expect(page).toHaveURL(/registration=complete/);
  expect(posts).toBe(1);
});

test('제출 중 새로고침은 기존 요청의 성공 결과를 조회하고 POST를 추가하지 않음', async ({ page }) => {
  let body: RegistrationRequest;
  let posts = 0;
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    posts++;
    body = route.request().postDataJSON();
    await responseGate;
    await fulfillJson(route, registrationResult(body), 201).catch(() => {});
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    await fulfillJson(route, registrationResult(body));
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect.poll(() => posts).toBe(1);
  await page.reload();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  release();
  expect(posts).toBe(1);
});

test('이탈·재진입은 제출 본문을 폐기하고 본인 요청 ID만으로 결과를 복구', async ({ page }) => {
  let body: RegistrationRequest;
  let found = false;
  let posts = 0;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    posts++;
    body = route.request().postDataJSON();
    await route.abort('failed');
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    await fulfillJson(route, found ? registrationResult(body) : {
      code: 'REGISTRATION_NOT_FOUND'
    }, found ? 200 : 404);
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '같은 정보로 다시 시도',
    exact: true
  })).toBeVisible();
  await page.goto('/start');
  await expect(page.getByRole('button', {
    name: '관리할 곳 만들기',
    exact: true
  })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), SUBMISSION_KEY)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), PENDING_KEY)).toBe(body!.requestId);
  found = true;
  await page.goto('/start?registration=review');
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  expect(posts).toBe(1);
});

test('다른 사용자에게 이전 제출 본문·성공 결과를 보여주거나 요청 ID를 조회하지 않음', async ({ page }) => {
  const requestId = '7f0c8c26-33d9-4bb3-8ca7-2c7c99e7f0ef';
  let lookups = 0;
  await page.route(LOOKUP_URL, async (route) => { lookups++; await fulfillJson(route, {}, 404); });
  await page.goto('/start');
  await page.evaluate(({ key, requestId }) => localStorage.setItem(key, requestId), {
    key: PENDING_KEY,
    requestId
  });
  await page.route(`${API_ORIGIN}/api/users/me`, (route) => fulfillJson(route, {
    ...CURRENT_USER,
    id: '00000000-0000-0000-0000-000000000002'
  }));
  await page.goto('/start?registration=review');
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL(/registration=basic/);
  expect(lookups).toBe(0);
});

test('손상된 제출 본문은 재전송하지 않고 결과가 없으면 기본 정보 입력을 다시 허용', async ({ page }) => {
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    await route.abort('failed');
  });
  await page.route(LOOKUP_URL, (route) => fulfillJson(route, route.request().method() === 'OPTIONS' ? {} : {
    code: 'REGISTRATION_NOT_FOUND'
  }, route.request().method() === 'OPTIONS' ? 200 : 404));
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '같은 정보로 다시 시도',
    exact: true
  })).toBeVisible();
  await page.evaluate((key) => {
    const data = JSON.parse(sessionStorage.getItem(key)!);
    data.request.bankAccounts[0].accountNumber = 1234;
    sessionStorage.setItem(key, JSON.stringify(data));
  }, SUBMISSION_KEY);
  await page.reload();
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL(/registration=basic/);
  await expect(page.getByRole('dialog', {
    name: '관리할 곳 등록',
    exact: true
  }).getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '같은 정보로 다시 시도',
    exact: true
  })).toHaveCount(0);
});

test('잘못된 성공 응답은 완료로 믿지 않고 기존 요청 ID의 유효한 결과를 확인', async ({ page }) => {
  let body: RegistrationRequest;
  let lookups = 0;
  await page.route(FINAL_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    body = route.request().postDataJSON();
    await fulfillJson(route, {
      ...registrationResult(body),
      requestId: 'wrong-request'
    }, 201);
  });
  await page.route(LOOKUP_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
    lookups++;
    await fulfillJson(route, registrationResult(body));
  });
  await openRegistrationReview(page);
  await page.getByRole('button', {
    name: '관리 시작하기',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '관리할 곳이 등록되었습니다!',
    exact: true
  })).toBeVisible();
  expect(lookups).toBe(1);
});

for (const width of [1440, 390, 320]) {
  test(`등록 상태 ${width}px는 로딩·실패 모달과 별도 완료 페이지를 표시하고 완료 전 입력을 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    let release!: () => void;
    const responseGate = new Promise<void>((resolve) => { release = resolve; });
    let posts = 0;
    await page.route(FINAL_URL, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, {});
      posts++;
      const body = route.request().postDataJSON();
      if (posts === 1) {
        await responseGate;
        return fulfillJson(route, {
          code: 'INVALID_REQUEST',
          errors: [{
            field: 'feeItems[0].defaultAmount',
            reason: 'OUT_OF_RANGE'
          }]
        }, 400);
      }
      await fulfillJson(route, registrationResult(body), 201);
    });
    await openRegistrationReview(page);
    await page.getByRole('button', {
      name: '관리 시작하기',
      exact: true
    }).click();
    const loading = page.getByRole('dialog', {
      name: '관리 환경을 준비하고 있습니다',
      exact: true
    });
    await expect(loading).toBeVisible();
    await expect(loading).toContainText('관리계좌 및 기본 관리비');
    await page.screenshot({
      path: test.info().outputPath(`registrationLoading${width}.png`),
      animations: 'disabled'
    });
    release();
    const failure = page.getByRole('dialog', {
      name: '등록에 실패했습니다',
      exact: true
    });
    await expect(failure).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`registrationFailure${width}.png`),
      animations: 'disabled'
    });
    await failure.getByRole('button', {
      name: '등록 정보로 돌아가기',
      exact: true
    }).click();
    await expect(page).toHaveURL(/registration=review/);
    await expect(page.getByRole('region', {
      name: '관리계좌 요약'
    })).toContainText('00012345678');
    await page.getByRole('button', {
      name: '관리 시작하기',
      exact: true
    }).click();
    await expect(page.getByRole('heading', {
      name: '관리할 곳이 등록되었습니다!',
      exact: true
    })).toBeVisible();
    await expect(page).toHaveURL(/registration=complete/);
    await expect(page.getByRole('region', {
      name: '등록된 정보',
      exact: true
    })).toContainText('00012345678');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`registrationComplete${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    expect(posts).toBe(2);
  });
}
