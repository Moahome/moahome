import {
  expect,
  test,
  type Page,
  type Route
} from '@playwright/test';

const API = 'http://localhost:8080';
const PROPERTY_ID = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGNQTX79H4QZYAwAUe4JyX4GS0cAAAAASUVORK5CYII=', 'base64');
const USER = {
  id: '00000000-0000-0000-0000-000000000001',
  displayName: '기존 이름',
  profileImageUrl: '/moahomeIcon.svg' as string | null,
  systemRole: 'USER',
  status: 'ACTIVE',
  canCreateProperty: false
};

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'X-CSRF-TOKEN, Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PUT, PATCH, OPTIONS',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(data)
  });
}

async function applyPhotoCrop(page: Page) {
  const dialog = page.getByRole('dialog', {
    name: '사진 편집',
    exact: true
  });
  await expect(dialog.getByRole('button', {
    name: '적용',
    exact: true
  })).toBeEnabled();
  await dialog.getByRole('button', {
    name: '적용',
    exact: true
  }).click();
  await expect(dialog).toHaveCount(0);
}

test('공통 사진 크롭은 모바일 원형 미리보기에서 확대·이동·취소하고 선택한 영역만 적용한다', async ({ page }) => {
  const state = await mockAccount(page);
  await page.setViewportSize({
    width: 320,
    height: 740
  });
  await page.goto('/account');
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  const wideImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgb(255,0,0)';
    context.fillRect(0, 0, 200, 200);
    context.fillStyle = 'rgb(0,0,255)';
    context.fillRect(200, 0, 200, 200);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = {
    name: 'wide.png',
    mimeType: 'image/png',
    buffer: Buffer.from(wideImage, 'base64')
  };
  {
    const chooser = page.waitForEvent('filechooser');
    await main.getByRole('button', {
      name: '사진 변경',
      exact: true
    }).click();
    await (await chooser).setFiles(file);
  }
  const dialog = page.getByRole('dialog', {
    name: '사진 편집',
    exact: true
  });
  await expect(dialog.getByRole('button', {
    name: '적용',
    exact: true
  })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(main.getByRole('button', {
    name: '사진 변경',
    exact: true
  })).toBeFocused();
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /\/moahomeIcon\.svg$/);
  {
    const chooser = page.waitForEvent('filechooser');
    await main.getByRole('button', {
      name: '사진 변경',
      exact: true
    }).click();
    await (await chooser).setFiles(file);
  }
  const zoom = dialog.getByRole('slider', {
    name: '확대',
    exact: true
  });
  await expect(zoom).toBeEnabled();
  await zoom.focus();
  await zoom.press('End');
  await expect(zoom).toHaveValue('3');
  await dialog.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await expect(zoom).toHaveValue('1');
  const stage = dialog.getByRole('group', {
    name: '사진 위치 조정',
    exact: true
  });
  const bounds = (await stage.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 5, bounds.y + bounds.height / 2, {
    steps: 4
  });
  await page.mouse.up();
  await stage.focus();
  for (let step = 0; step < 20; step++) await stage.press('ArrowRight');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('imageCropMobile.png'),
    fullPage: true
  });
  await applyPhotoCrop(page);
  const cropped = await main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  }).evaluate(async (element: HTMLImageElement) => {
    const bitmap = await createImageBitmap(await (await fetch(element.src)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const color = Array.from(context.getImageData(256, 256, 1, 1).data);
    bitmap.close();
    return {
      width: canvas.width,
      height: canvas.height,
      color
    };
  });
  expect(cropped).toEqual({
    width: 512,
    height: 512,
    color: [255, 0, 0, 255]
  });
  expect(state.photoWrites).toBe(0);
});

/** 본인 정보와 이름 저장만 모의 처리하고 관리대상 없는 계정에서도 같은 화면을 검증합니다. */
async function mockAccount(page: Page) {
  const state = {
    user: {
      ...USER
    },
    writes: 0,
    photoWrites: 0,
    photoReads: 0,
    photoFailure: false,
    managing: false,
    failed: false,
    sessionFailure: 0
  };
  await page.route(`${API}/**`, async (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    if (method === 'OPTIONS') return json(route, {});
    if (path === '/api/auth/web/csrf') return json(route, {
      csrfToken: 'test-csrf'
    });
    if (path === '/api/auth/web/refresh') return json(route, {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
    });
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    if (path === '/api/users/me' && method === 'GET') {
      if (state.sessionFailure) return json(route, {
        code: state.sessionFailure === 403 ? 'ACCOUNT_UNAVAILABLE' : 'AUTH_SERVICE_UNAVAILABLE'
      }, state.sessionFailure);
      return json(route, state.user);
    }
    if (path === '/api/users/me' && method === 'PATCH') {
      state.writes += 1;
      const input = route.request().postDataJSON();
      expect(Object.keys(input)).toEqual(['displayName']);
      if (state.failed) return json(route, {
        code: 'AUTH_SERVICE_UNAVAILABLE'
      }, 503);
      state.user.displayName = input.displayName;
      return json(route, state.user);
    }
    if (path === '/api/users/me/profile' && method === 'PUT') {
      state.photoWrites += 1;
      expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=');
      if (state.photoFailure) return json(route, {
        code: 'PROFILE_IMAGE_UNAVAILABLE'
      }, 503);
      const body = route.request().postDataBuffer()!.toString('utf8');
      state.user.displayName = /name="displayName"\r\n\r\n([^\r]*)/.exec(body)![1];
      const removing = /name="removeImage"\r\n\r\ntrue/.test(body);
      if (!removing) expect(body).toContain('name="image"; filename="profile.png"');
      state.user.profileImageUrl = removing ? null : '/api/users/me/profile-image?v=11111111-1111-4111-8111-111111111111';
      return json(route, state.user);
    }
    if (path === '/api/users/me/profile-image' && method === 'GET') {
      state.photoReads += 1;
      expect(new URL(route.request().url()).searchParams.has('token')).toBe(false);
      return route.fulfill({
        contentType: 'image/png',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'no-store'
        },
        body: PHOTO
      });
    }
    if (path.endsWith('/managed-properties')) return json(route, {
      properties: state.managing ? [{
        propertyId: PROPERTY_ID,
        name: '우리 빌라',
        role: 'ADMIN'
      }] : []
    });
    if (path.endsWith('/resident-properties')) return json(route, {
      properties: []
    });
    if (path.endsWith('/access-context')) return json(route, {
      propertyId: PROPERTY_ID,
      name: '우리 빌라',
      role: 'ADMIN',
      residentEligible: false
    });
    throw new Error(`Unexpected API: ${method} ${path}`);
  });
  return state;
}

test('내 정보 진입은 조회 화면이며 수정에서만 편집하고 취소하면 저장하지 않는다', async ({ page }) => {
  const state = await mockAccount(page);
  await page.goto(`/manage/${PROPERTY_ID}/settings`);
  await page.getByRole('banner').getByLabel('기존 이름님 계정 정보').click();
  await expect(page.getByRole('banner').getByText('모아홈 계정', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('link', {
    name: '시스템 관리',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', {
    name: '내 정보',
    exact: true
  }).click();
  await expect(page).toHaveURL('/account');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', {
    name: '기본정보',
    exact: true
  })).toBeVisible();
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /\/moahomeIcon\.svg$/);
  await expect(main.getByRole('textbox')).toHaveCount(0);
  await expect(main.getByRole('button', {
    name: '저장',
    exact: true
  })).toHaveCount(0);
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await main.getByRole('textbox', {
    name: '이름',
    exact: true
  }).fill('취소할 이름');
  await main.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(main.getByText('기존 이름', {
    exact: true
  })).toBeVisible();
  expect(state.writes).toBe(0);
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(main.getByRole('textbox', {
    name: '이름',
    exact: true
  })).toHaveValue('기존 이름');
});

test('사진 선택·삭제는 저장 전까지 미리보기만 바꾸고 취소하면 기존 사진을 유지한다', async ({ page }) => {
  const state = await mockAccount(page);
  await page.goto('/account');
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  const chooser = page.waitForEvent('filechooser');
  await main.getByRole('button', {
    name: '사진 변경',
    exact: true
  }).click();
  await (await chooser).setFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: PHOTO
  });
  await applyPhotoCrop(page);
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /^blob:/);
  expect(state.photoWrites).toBe(0);
  await main.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /\/moahomeIcon\.svg$/);
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await main.getByRole('button', {
    name: '사진 삭제',
    exact: true
  }).click();
  await expect(main.getByRole('img', {
    name: '기본 프로필',
    exact: true
  })).toBeVisible();
  await main.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /\/moahomeIcon\.svg$/);
  expect(state.photoWrites).toBe(0);
});

test('사진과 이름은 함께 저장하고 비공개 사진을 Bearer로 표시하며 삭제 저장 후 기본 프로필로 복원한다', async ({ page }) => {
  const state = await mockAccount(page);
  await page.goto('/account');
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await main.getByRole('textbox', {
    name: '이름',
    exact: true
  }).fill('사진 변경 이름');
  await main.getByLabel('프로필 사진 파일').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: PHOTO
  });
  await applyPhotoCrop(page);
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /^blob:/);
  await main.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(main.getByRole('textbox')).toHaveCount(0);
  const image = main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  });
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(2);
  await expect(page.getByRole('banner').getByLabel('사진 변경 이름님 계정 정보')).toBeVisible();
  expect(state.photoReads).toBe(1);
  await page.reload();
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /^blob:/);
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await page.screenshot({
    path: test.info().outputPath('accountPhotoEditDesktop.png'),
    fullPage: true
  });
  await main.getByRole('button', {
    name: '사진 삭제',
    exact: true
  }).click();
  await main.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(main.getByRole('textbox')).toHaveCount(0);
  await expect(main.getByRole('img', {
    name: '기본 프로필',
    exact: true
  })).toBeVisible();
  expect(state.user.profileImageUrl).toBeNull();
  expect(state.photoWrites).toBe(2);
});

test('사진 형식·크기 오류는 전송하지 않고 업로드 실패에는 선택과 입력을 유지해 재시도한다', async ({ page }) => {
  const state = await mockAccount(page);
  await page.goto('/account');
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  const file = main.getByLabel('프로필 사진 파일');
  await file.setInputFiles({
    name: 'photo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>')
  });
  await expect(page.getByRole('alert').filter({
    hasText: 'PNG 또는 JPEG'
  })).toBeVisible();
  await file.setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
  });
  await expect(page.getByRole('alert').filter({
    hasText: '5MB 이하'
  })).toBeVisible();
  expect(state.photoWrites).toBe(0);
  await file.setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: PHOTO
  });
  await applyPhotoCrop(page);
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /^blob:/);
  await main.getByRole('textbox', {
    name: '이름',
    exact: true
  }).fill('실패 시 유지');
  state.photoFailure = true;
  await main.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(page.getByRole('alert').filter({
    hasText: '프로필을 저장하지 못했어요.'
  })).toBeVisible();
  await expect(main.getByRole('textbox', {
    name: '이름',
    exact: true
  })).toHaveValue('실패 시 유지');
  await expect(main.getByRole('img', {
    name: '프로필 사진',
    exact: true
  })).toHaveAttribute('src', /^blob:/);
  expect(state.user.profileImageUrl).toBe('/moahomeIcon.svg');
  state.photoFailure = false;
  await main.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(main.getByRole('textbox')).toHaveCount(0);
  expect(state.photoWrites).toBe(2);
});

test('이름 저장은 앞뒤 공백을 정리하고 헤더·조회 화면·새로고침에 반영하며 사진을 유지한다', async ({ page }) => {
  const state = await mockAccount(page);
  await page.goto('/account');
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await main.getByRole('textbox', {
    name: '이름',
    exact: true
  }).fill(' 새 이름 ');
  await main.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(main.getByRole('textbox')).toHaveCount(0);
  await expect(main.getByText('새 이름', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('banner').getByLabel('새 이름님 계정 정보')).toBeVisible();
  await expect(page.getByRole('status').filter({
    hasText: '이름을 변경했어요.'
  })).toBeVisible();
  expect(state.user.profileImageUrl).toBe('/moahomeIcon.svg');
  expect(state.writes).toBe(1);
  await page.reload();
  await expect(main.getByText('새 이름', {
    exact: true
  })).toBeVisible();
});

test('공백·50자 초과 입력은 저장하지 않고 실패에는 입력을 유지해 재시도한다', async ({ page }) => {
  const state = await mockAccount(page);
  state.failed = true;
  await page.goto('/account');
  const main = page.getByRole('main');
  await main.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  const input = main.getByRole('textbox', {
    name: '이름',
    exact: true
  });
  const save = main.getByRole('button', {
    name: '저장',
    exact: true
  });
  await input.fill(' ');
  await expect(save).toBeDisabled();
  await input.fill('가'.repeat(51));
  await expect(save).toBeDisabled();
  expect(state.writes).toBe(0);
  await input.fill('😀'.repeat(50));
  await save.click();
  await expect(main.getByRole('alert')).toContainText('이름을 저장하지 못했어요.');
  await expect(input).toHaveValue('😀'.repeat(50));
  await expect(page.getByRole('banner').getByLabel('기존 이름님 계정 정보')).toBeVisible();
  state.failed = false;
  await save.click();
  await expect(input).toHaveCount(0);
  expect(state.writes).toBe(2);
});

test('모바일 관리 메뉴·설정은 같은 계정 화면으로 연결하고 헤더 뒤로가기는 실제 출발 화면으로 돌아간다', async ({ page }) => {
  await page.setViewportSize({
    width: 320,
    height: 740
  });
  const state = await mockAccount(page);
  state.user.profileImageUrl = null;
  state.user.systemRole = 'ADMIN';
  state.managing = true;
  const settings = `/manage/${PROPERTY_ID}/settings`;
  await page.goto(settings);
  await page.getByRole('button', {
    name: '기존 이름님 메뉴 열기',
    exact: true
  }).click();
  const menu = page.getByRole('dialog', {
    name: '메뉴',
    exact: true
  });
  await expect(menu.getByText('프로필 및 계정 정보', {
    exact: true
  })).toBeVisible();
  await expect(menu.getByText('사용자 및 시스템 권한', {
    exact: true
  })).toBeVisible();
  await expect(menu.getByRole('link', {
    name: '시스템 관리',
    exact: true
  })).toBeVisible();
  await menu.getByRole('link', {
    name: '내 정보',
    exact: true
  }).click();
  await expect(page).toHaveURL('/account');
  await expect(page.getByRole('main').getByRole('img', {
    name: '기본 프로필',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', {
    name: '기존 이름님 메뉴 열기',
    exact: true
  }).click();
  await expect(menu.getByRole('navigation', {
    name: '관리 메뉴',
    exact: true
  })).toBeVisible();
  await expect(menu.getByRole('link', {
    name: '대시보드',
    exact: true
  }))
    .toHaveAttribute('href', `/manage/${PROPERTY_ID}/dashboard`);
  await expect(menu.getByRole('link', {
    name: '시작 화면',
    exact: true
  })).toHaveCount(0);
  await expect(menu.getByRole('link', {
    name: '내 정보',
    exact: true
  })).toHaveAttribute('aria-current', 'page');
  await menu.screenshot({
    path: test.info().outputPath('accountMenuMobile.png')
  });
  await menu.getByRole('button', {
    name: '메뉴 닫기',
    exact: true
  }).click();
  await expect(menu).not.toBeVisible();
  await page.getByRole('banner').getByRole('link', {
    name: '뒤로가기',
    exact: true
  }).click();
  await expect(page).toHaveURL(settings);
  await page.getByRole('main').getByRole('button', {
    name: '내 정보',
    exact: true
  }).click();
  await expect(page).toHaveURL('/account');
  await page.getByRole('main').getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('main').getByRole('button', {
    name: /목록/
  })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('accountEditMobile.png'),
    fullPage: true
  });
  await page.getByRole('banner').getByRole('link', {
    name: '뒤로가기',
    exact: true
  }).click();
  await expect(page).toHaveURL(settings);
});

test('관리 참여 없는 모바일 계정 메뉴는 참여 중인 곳으로 연결하며 시스템 관리 권한을 표시하지 않는다', async ({ page }) => {
  await mockAccount(page);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto('/account');
  await page.getByRole('button', {
    name: '기존 이름님 메뉴 열기',
    exact: true
  }).click();
  const menu = page.getByRole('dialog', {
    name: '메뉴',
    exact: true
  });
  await expect(menu.getByText('프로필 및 계정 정보', {
    exact: true
  })).toBeVisible();
  await expect(menu.getByRole('link', {
    name: '참여 중인 곳',
    exact: true
  })).toHaveAttribute('href', '/properties');
  await expect(menu.getByRole('link', {
    name: '시작 화면',
    exact: true
  })).toHaveCount(0);
  await expect(menu.getByRole('link', {
    name: '시스템 관리',
    exact: true
  })).toHaveCount(0);
});

test('계정 조회 장애는 재시도하고 이용 불가 계정은 개인정보를 표시하지 않는다', async ({ page }) => {
  const state = await mockAccount(page);
  state.sessionFailure = 503;
  await page.goto('/account');
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', {
    name: '수정',
    exact: true
  })).toHaveCount(0);
  state.sessionFailure = 0;
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('main').getByText('기존 이름', {
    exact: true
  })).toBeVisible();
  state.sessionFailure = 403;
  await page.reload();
  await expect(page).toHaveURL('/login');
  await expect(page.getByText('기존 이름', {
    exact: true
  })).toHaveCount(0);
});

test('프로필 카드는 계정 요약·내 정보·시스템 관리자 전용 메뉴와 로그아웃을 구분한다', async ({ page }) => {
  const state = await mockAccount(page);
  state.user.systemRole = 'ADMIN';
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  await page.goto('/account');
  const header = page.getByRole('banner');
  await header.getByLabel('기존 이름님 계정 정보').click();
  await expect(header.getByText('모아홈 계정', {
    exact: true
  })).toHaveCount(0);
  await expect(header.getByRole('group').getByText('계정 및 설정', {
    exact: true
  })).toBeVisible();
  await expect(header.getByRole('link', {
    name: '내 정보',
    exact: true
  })).toHaveAttribute('href', '/account');
  await expect(header.getByRole('link', {
    name: '시스템 관리',
    exact: true
  })).toHaveAttribute('href', '/admin');
  await expect(header.getByRole('button', {
    name: '로그아웃',
    exact: true
  })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('profileCardDesktop.png'),
    fullPage: true
  });
});

for (const canCreate of [false, true]) {
  test(`설정의 빌라 등록은 생성 권한 ${canCreate}에 따라 표시하며 기존 관리계좌 권한은 유지`, async ({ page }) => {
    const state = await mockAccount(page);
    state.user.canCreateProperty = canCreate;
    state.user.systemRole = 'ADMIN';
    await page.goto(`/manage/${PROPERTY_ID}/settings`);
    const main = page.getByRole('main');
    await expect(main.getByRole('button', {
      name: '계좌 관리',
      exact: true
    })).toBeVisible();
    const create = main.getByRole('button', {
      name: '관리할 곳 만들기',
      exact: true
    });
    await expect(create).toHaveCount(canCreate ? 1 : 0);
    await expect(main.getByRole('button', {
      name: '등록 및 참여',
      exact: true
    })).toHaveCount(0);
    await main.getByRole('button', {
      name: '참여 중인 곳',
      exact: true
    }).click();
    await expect(page.getByRole('dialog', {
      name: '참여 중인 곳',
      exact: true
    }).getByRole('textbox', {
      name: '초대코드',
      exact: true
    })).toBeVisible();
  });
}
