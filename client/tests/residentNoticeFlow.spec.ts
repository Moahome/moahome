import {
  expect,
  test,
  type Page
} from '@playwright/test';

const PROPERTY = 'b06f4ab1-0331-41c2-8304-d20f062298a0';
const NOTICE = 'c54cd857-fd59-4123-a38a-12497e6c82ba';
const ASSET = 'c54cd857-fd59-4123-a38a-12497e6c82bb';
const TOKEN = `${NOTICE}.${'A'.repeat(43)}`;
const CONTENT = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{
        type: 'text',
        text: '입주민 여러분께 안내드립니다.'
      }]
    },
    {
      type: 'blockquote',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: '11월 공용 전기설비 점검을 진행합니다.',
          marks: [{
            type: 'bold'
          }]
        }]
      }]
    },
    {
      type: 'bulletList',
      content: [{
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: '점검 일시: 2026년 11월 15일 09:00 ~ 12:00'
          }]
        }]
      }, {
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: '점검 장소: 지하 전기실 및 공용 전기설비'
          }]
        }]
      }]
    },
    {
      type: 'paragraph',
      content: [{
        type: 'text',
        text: '안전한 시설 운영을 위한 정기 점검이오니 양해와 협조 부탁드립니다.'
      }]
    }
  ],
  files: [{
    id: ASSET,
    name: '전기설비 점검 안내문.pdf',
    size: 32000,
    data: `/api/properties/${PROPERTY}/notices/assets/${ASSET}`
  }]
});

/** 읽기 API만 모의 처리하고 실제 공통 표·문서·첨부·라우팅을 사용합니다. */
async function mockResidentNotices(page: Page, initialAuthorized = false) {
  let authorized = initialAuthorized;
  let revoked = false;
  let exchanges = 0;
  const adminRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(?:auth|properties)\//.test(request.url())) adminRequests.push(request.url());
  });
  const rows = [
    {
      id: NOTICE,
      title: '11월 공용 전기설비 점검 안내',
      important: true,
      createdAt: '2026-11-13T01:24:00Z'
    },
    {
      id: ASSET,
      title: '분리수거 배출 시간 안내',
      important: false,
      createdAt: '2026-11-12T01:24:00Z'
    }
  ];
  await page.route(/\/api\/notice-access(?:\/|\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({
      status: 204,
      headers
    });
    if (url.pathname.endsWith('/sessions')) {
      exchanges += 1;
      authorized = !revoked;
      return route.fulfill({
        status: authorized ? 204 : 401,
        headers,
        body: authorized ? '' : JSON.stringify({
          code: 'NOTICE_ACCESS_REQUIRED'
        })
      });
    }
    if (!authorized || revoked) return route.fulfill({
      status: 401,
      headers,
      json: {
        code: 'NOTICE_ACCESS_REQUIRED'
      }
    });
    if (url.pathname.endsWith('/context')) return route.fulfill({
      headers,
      json: {
        propertyId: PROPERTY,
        name: '모아하이츠'
      }
    });
    if (url.pathname.endsWith('/notices')) {
      const matchingRows = rows.filter((row) => row.title.includes(url.searchParams.get('query') ?? ''));
      const items = matchingRows.filter((row) => !row.important);
      return route.fulfill({
        headers,
        json: {
          propertyId: PROPERTY,
          page: Number(url.searchParams.get('page') ?? 1),
          pageCount: 1,
          total: items.length,
          importantItems: matchingRows.filter((row) => row.important),
          items
        }
      });
    }
    if (url.pathname.includes('/assets/')) return route.fulfill({
      headers,
      contentType: 'application/pdf',
      body: '%PDF-1.4\n%%EOF'
    });
    return route.fulfill({
      headers,
      json: {
        ...rows[0],
        propertyId: PROPERTY,
        authorName: '김관리',
        content: CONTENT
      }
    });
  });
  return {
    exchanges: () => exchanges,
    adminRequests,
    revoke: () => { revoked = true; }
  };
}

test('링크를 열면 중간 화면 없이 공지 목록·본문·첨부를 읽고 관리자 API를 호출하지 않음', async ({ page }) => {
  const state = await mockResidentNotices(page);
  await page.goto(`/notices#token=${TOKEN}`);
  await expect(page.getByRole('heading', {
    name: '공지사항',
    exact: true
  })).toBeVisible();
  await expect(page.getByText('모아하이츠', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: '중요 공지',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: '전체 공지',
    exact: true
  })).toBeVisible();
  const allNotices = page.getByRole('table', {
    name: '주민 공지사항',
    exact: true
  });
  await expect(allNotices.getByRole('row')).toHaveCount(2);
  await expect(allNotices).not.toContainText('11월 공용 전기설비 점검 안내');
  await expect(allNotices).toContainText('분리수거 배출 시간 안내');
  await expect(allNotices.getByText('중요', {
    exact: true
  })).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/resident-notices-desktop.png',
    fullPage: true
  });
  await page.getByRole('table', {
    name: '중요 공지사항',
    exact: true
  }).getByRole('row', {
    name: /11월 공용 전기설비/
  }).click();
  await expect(page.getByRole('heading', {
    name: '11월 공용 전기설비 점검 안내'
  })).toBeVisible();
  await expect(page.getByRole('document', {
    name: '공지 본문'
  })).toContainText('양해와 협조');
  await expect(page.getByText('작성자 김관리', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: /^(수정|삭제|공지 작성)$/
  })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', {
    name: '전기설비 점검 안내문.pdf 다운로드'
  }).click();
  expect((await download).suggestedFilename()).toBe('전기설비 점검 안내문.pdf');
  await page.screenshot({
    path: 'test-results/resident-notice-detail-desktop.png',
    fullPage: true
  });
  await expect(page.getByRole('button', {
    name: '공지 보기',
    exact: true
  })).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(TOKEN);
  expect(state.exchanges()).toBe(1);
  expect(state.adminRequests).toEqual([]);
});

test('모바일에서 검색·상세·헤더 복귀와 화면 폭을 유지', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await mockResidentNotices(page, true);
  await page.goto(`/notices/${PROPERTY}`);
  await page.getByRole('textbox', {
    name: '공지 제목 검색'
  }).fill('전기');
  await page.getByRole('button', {
    name: '검색',
    exact: true
  }).click();
  await expect(page).toHaveURL(/query=/);
  await expect(page.getByRole('row', {
    name: /분리수거/
  })).toHaveCount(0);
  // 중요 공지만 검색돼도 상단에서 열 수 있으며 전체 목록에는 같은 글을 반복하지 않습니다.
  await expect(page.getByRole('heading', {
    name: '전체 공지',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('table', {
    name: '주민 공지사항',
    exact: true
  }).getByRole('row', {
    name: /11월 공용 전기설비/
  })).toHaveCount(0);
  await expect(page.getByRole('table', {
    name: '중요 공지사항',
    exact: true
  }).getByRole('row', {
    name: /11월 공용 전기설비/
  })).toBeVisible();
  await expect(page.getByText('일반 공지 검색 결과가 없어요', {
    exact: true
  })).toBeVisible();
  await page.screenshot({
    path: 'test-results/resident-notices-mobile.png',
    fullPage: true
  });
  await page.getByRole('table', {
    name: '중요 공지사항',
    exact: true
  }).getByRole('row', {
    name: /11월 공용 전기설비/
  }).click();
  await expect(page.getByRole('document', {
    name: '공지 본문'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '목록',
    exact: true
  })).toBeHidden();
  await page.screenshot({
    path: 'test-results/resident-notice-detail-mobile.png',
    fullPage: true
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', {
    name: '공지사항 목록'
  }).click();
  await expect(page.getByRole('textbox', {
    name: '공지 제목 검색'
  })).toHaveValue('전기');
});

test('일반 주소·다른 건물·회수된 링크는 로그인으로 보내지 않고 안내만 표시', async ({ page }) => {
  const state = await mockResidentNotices(page);
  await page.goto(`/notices/${PROPERTY}/${NOTICE}`);
  await expect(page.getByRole('heading', {
    name: '안내받은 링크로 접속해주세요'
  })).toBeVisible();
  await expect(page.getByRole('document', {
    name: '공지 본문'
  })).toHaveCount(0);
  await page.goto(`/notices#token=${TOKEN}`);
  await expect(page.getByRole('heading', {
    name: '공지사항',
    exact: true
  })).toBeVisible();
  await page.goto(`/notices/${ASSET}`);
  await expect(page.getByRole('heading', {
    name: '이 링크로 열람할 수 없는 건물이에요'
  })).toBeVisible();
  state.revoke();
  await page.goto(`/notices/${PROPERTY}/${NOTICE}`);
  await expect(page.getByRole('heading', {
    name: '안내받은 링크로 접속해주세요'
  })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/notices/${PROPERTY}/${NOTICE}$`));
});
