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
  await expect(page.getByRole('status')).toContainText('입력한 정보는 아직 저장되지 않았어요.');
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
    await expect(page.getByRole('status')).toContainText('기본 정보를 확인했어요.');
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
  await expect(page.getByRole('status')).toContainText('기본 정보를 확인했어요.');
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
