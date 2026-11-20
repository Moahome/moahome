import {
  expect,
  test,
  type Page
} from '@playwright/test';
import {
  mockSettlement,
  SETTLEMENT_PROPERTY,
  settlementId
} from './support/monthlySettlement';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/notices`;
const CONTENT = JSON.stringify({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{
      type: 'text',
      text: '공용 시설을 점검합니다.'
    }]
  }]
});

/** 공지 API만 모의 처리하고 실제 관리 레이아웃·검색·편집·상세·모바일 표시를 연결합니다. */
async function mockNotices(page: Page, content = CONTENT, canDeleteOthers = true) {
  await mockSettlement(page);
  const rows = [
    ['11월 공용 전기설비 점검 안내', true],
    ['관리비 납부 계좌 안내', true],
    ['11월 정기 소독 일정 안내', false],
    ['주차장 보수공사 일정', false],
    ['엘리베이터 안전 점검 안내', false],
    ['분리수거 배출 시간 변경', false]
  ].map(([title, important], index) => ({
    id: settlementId(200 + index),
    propertyId: SETTLEMENT_PROPERTY,
    number: 6 - index,
    title: String(title),
    important: Boolean(important),
    content,
    createdAt: '2026-11-13T01:00:00Z',
    updatedAt: '2026-11-13T01:00:00Z',
    views: 42 + index,
    version: 1,
    authorName: '관리자',
    canEdit: index !== 1,
    canDelete: index !== 1 || canDeleteOthers
  }));
  const saves: unknown[] = [];
  await page.route(/\/api\/properties\/[^/]+\/notices(?:\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split('/notices/')[1];
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({
      status: 200,
      headers
    });
    expect(request.headers().authorization).toBe('Bearer test-access');
    if (id?.startsWith('assets/')) {
      const assetId = id.slice('assets/'.length);
      if (request.method() === 'GET') return route.fulfill({
        headers,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64')
      });
      const body = request.postDataBuffer()!;
      const text = body.toString();
      const name = /filename="([^"]+)"/.exec(text)?.[1] ?? '';
      const start = body.indexOf('\r\n\r\n') + 4;
      const end = body.indexOf('\r\n--', start);
      return route.fulfill({
        headers,
        json: {
          id: assetId,
          name,
          size: end - start,
          data: `/api/properties/${SETTLEMENT_PROPERTY}/notices/assets/${assetId}`
        }
      });
    }
    if (request.method() === 'DELETE') {
      const index = rows.findIndex((row) => row.id === id);
      rows.splice(index, 1);
      return route.fulfill({
        status: 204,
        headers
      });
    }
    if (request.method() === 'PUT') {
      const input = request.postDataJSON();
      saves.push(input);
      const existing = rows.find((row) => row.id === id);
      const result = {
        id,
        propertyId: SETTLEMENT_PROPERTY,
        number: existing?.number ?? 7,
        title: input.title,
        content: input.content,
        important: input.important,
        createdAt: existing?.createdAt ?? '2026-11-13T02:00:00Z',
        updatedAt: '2026-11-13T02:00:00Z',
        views: existing?.views ?? 0,
        canEdit: true,
        canDelete: true,
        authorName: existing?.authorName ?? '관리자',
        version: input.expectedVersion + 1
      };
      if (existing) Object.assign(existing, result);
      else rows.unshift(result);
      return route.fulfill({
        headers,
        json: result
      });
    }
    if (id) return route.fulfill({
      headers,
      json: rows.find((row) => row.id === id)
    });
    const keyword = url.searchParams.get('query') ?? '';
    const items = rows.filter((row) => row.title.includes(keyword));
    return route.fulfill({
      headers,
      json: {
        propertyId: SETTLEMENT_PROPERTY,
        items,
        page: 1,
        pageCount: 1,
        total: items.length
      }
    });
  });

  return saves;
}

test('별도 공개 설정 없이 공지를 관리하고 건물 링크를 발급·회수', async ({ page }) => {
  await mockNotices(page);
  let link: { id: string; token: string; createdAt: string } | null = null;
  await page.route(/\/api\/properties\/[^/]+\/resident-notices\//, async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS'
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({
      status: 204,
      headers
    });
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PUT') {
      const id = path.split('/').at(-1)!;
      link = {
        id,
        token: `${id}.${'A'.repeat(43)}`,
        createdAt: '2026-11-14T00:00:00Z'
      };
    }
    if (route.request().method() === 'DELETE') { link = null; return route.fulfill({
      headers,
      status: 204
    }); }
    return route.fulfill({
      headers,
      json: link
    });
  });
  await page.goto(`${BASE}/${settlementId(200)}`);
  await expect(page.getByText('관리자 전용', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '주민 공개',
    exact: true
  })).toHaveCount(0);
  await page.goto(BASE);
  await page.getByRole('button', {
    name: '주민 열람 링크',
    exact: true
  }).click();
  const links = page.getByRole('dialog', {
    name: '주민 열람 링크',
    exact: true
  });
  await links.getByRole('button', {
    name: '링크 발급'
  }).click();
  await expect(links.getByRole('textbox', {
    name: '주민 열람 주소'
  })).toHaveValue(/\/notices#token=/);
  await links.getByRole('button', {
    name: '링크 회수'
  }).click();
  await expect(links).toContainText('기존 링크와 열람 중인 화면');
  await links.getByRole('button', {
    name: '회수',
    exact: true
  }).click();
  await expect(links.getByRole('button', {
    name: '링크 발급'
  })).toBeVisible();
});


test('파일 첨부·저장 후 목록·상세 다운로드·작성자 수정·삭제를 연결한다', async ({ page }) => {
  const saves = await mockNotices(page);
  await page.goto(BASE);
  await page.getByRole('button', {
    name: '공지 작성',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '임시저장',
    exact: true
  })).toBeDisabled();
  await page.getByRole('textbox', {
    name: '제목',
    exact: true
  }).fill('시설 점검');
  await page.getByRole('textbox', {
    name: '공지 내용 편집기',
    exact: true
  }).fill('내일 점검합니다.');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('본문 이미지 선택', {
    exact: true
  }).setInputFiles([
    {
      name: '점검1.png',
      mimeType: 'image/png',
      buffer: png
    },
    {
      name: '점검2.png',
      mimeType: 'image/png',
      buffer: png
    }
  ]);
  await expect(page.getByRole('textbox', {
    name: '공지 내용 편집기',
    exact: true
  }).locator('img')).toHaveCount(2);
  await page.getByLabel('첨부파일 선택', {
    exact: true
  }).setInputFiles([
    {
      name: '점검 안내.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('점검 안내 내용')
    },
    {
      name: '첨부 사진.png',
      mimeType: 'image/png',
      buffer: png
    }
  ]);
  await page.getByRole('button', {
    name: '첨부 사진.png 미리보기',
    exact: true
  }).click();
  await expect(page.getByRole('dialog').getByRole('img', {
    name: '첨부 사진.png',
    exact: true
  })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {
    name: '닫기',
    exact: true
  }).click();
  await expect.poll(() => page.getByRole('textbox', {
    name: '공지 내용 편집기',
    exact: true
  }).locator('img').evaluateAll((items) => items.every((item) => (item as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.getByText('점검 안내.txt', {
    exact: false
  }).first()).toBeVisible();
  await page.getByRole('button', {
    name: '공지 등록',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  expect(saves).toHaveLength(1);
  const stored = JSON.parse((saves[0] as {content:string}).content);
  const images = stored.content.filter((node: {type:string}) => node.type === 'image');
  expect(images).toHaveLength(2);
  expect(images.every((node: {attrs:{src:string}}) => node.attrs.src.includes('/notices/assets/'))).toBe(true);
  expect(stored.files[0].data).toContain('/notices/assets/');
  expect(JSON.stringify(stored)).not.toContain('base64');
  await page.getByRole('rowheader', {
    name: '시설 점검',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: '시설 점검',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '점검 안내.txt 다운로드',
    exact: true
  })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {
    name: '점검 안내.txt 다운로드',
    exact: true
  }).click();
  expect((await downloading).suggestedFilename()).toBe('점검 안내.txt');
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('textbox', {
    name: '제목',
    exact: true
  })).toHaveValue('시설 점검');
  await expect(page.getByRole('button', {
    name: '임시저장',
    exact: true
  })).toBeVisible();
  await page.getByRole('textbox', {
    name: '제목',
    exact: true
  }).fill('점검 시간 변경');
  await page.getByRole('button', {
    name: '변경 저장',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  await page.getByRole('rowheader', {
    name: '점검 시간 변경',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '점검 안내.txt 다운로드',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await page.getByRole('dialog').getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
});

test('작성 초안과 해당 글 수정 초안을 분리하고 복구 확인 뒤 불러온다', async ({ page }) => {
  await mockNotices(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${BASE}/new`);
  await page.getByRole('textbox', {
    name: '제목',
    exact: true
  }).fill('작성 중인 새 글');
  await page.getByRole('textbox', {
    name: '공지 내용 편집기',
    exact: true
  }).fill('초안 내용');
  await page.getByRole('button', {
    name: '임시저장',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toBeVisible();
  await page.goto(`${BASE}/${settlementId(200)}/edit`);
  await expect(page.getByRole('textbox', {
    name: '제목',
    exact: true
  })).toHaveValue('11월 공용 전기설비 점검 안내');
  await page.goto(`${BASE}/new`);
  await expect(page.getByRole('textbox', {
    name: '제목',
    exact: true
  })).toHaveValue('작성 중인 새 글');
});

test('임시저장 창은 헤더 X로 닫고 삭제한 초안은 입력을 유지하며 재진입 때 복원하지 않는다', async ({ page }) => {
  await mockNotices(page);
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  await page.goto(`${BASE}/new`);
  const title = page.getByRole('textbox', {
    name: '제목',
    exact: true
  });
  await title.fill('삭제할 임시저장');
  await page.getByRole('button', {
    name: '임시저장',
    exact: true
  }).click();
  const open = page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  });
  await open.click();
  const modal = page.getByRole('dialog', {
    name: '임시저장한 글',
    exact: true
  });
  await modal.getByRole('button', {
    name: '닫기',
    exact: true
  }).click();
  await expect(modal).toHaveCount(0);
  await open.click();
  await modal.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(modal).toHaveCount(0);
  await expect(title).toHaveValue('삭제할 임시저장');
  await expect(open).toHaveCount(0);

  // 삭제 뒤 실제로 수정한 내용은 다시 자동 저장할 수 있어야 합니다.
  await title.fill('새로 작성한 초안');
  await open.click();
  await expect(modal.getByText('새로 작성한 초안', {
    exact: true
  })).toBeVisible();
  await modal.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  await page.getByRole('button', {
    name: '공지 작성',
    exact: true
  }).click();
  await expect(title).toHaveValue('');
  expect(dialogs.some((message) => message.includes('불러올까요'))).toBe(false);
});

test('상세의 목록 버튼은 수정 화면을 거쳐도 검색한 목록으로 복귀한다', async ({ page }) => {
  await mockNotices(page);
  const list = `${BASE}?query=${encodeURIComponent('전기')}`;
  await page.goto(list);
  await page.getByRole('rowheader', {
    name: '11월 공용 전기설비 점검 안내',
    exact: true
  }).click();
  await expect(page.getByRole('article')).toContainText('중요');
  await expect(page.getByRole('article')).toContainText('조회 42');
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('textbox', {
    name: '제목',
    exact: true
  })).toHaveValue('11월 공용 전기설비 점검 안내');
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '목록',
    exact: true
  }).click();
  await expect(page).toHaveURL(list);
  await expect(page.getByRole('textbox', {
    name: '공지 제목 검색',
    exact: true
  })).toHaveValue('전기');
});

test('선택한 글자색과 크기를 저장하고 기본색 복원은 크기를 유지한다', async ({ page }) => {
  const saves = await mockNotices(page);
  await page.goto(`${BASE}/new`);
  await page.getByRole('textbox', {
    name: '제목',
    exact: true
  }).fill('색상 공지');
  const editor = page.getByRole('textbox', {
    name: '공지 내용 편집기',
    exact: true
  });
  await editor.fill('색상을 적용할 문장');
  await editor.press('ControlOrMeta+a');
  await page.getByRole('combobox', {
    name: '글자 크기',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '20px',
    exact: true
  }).click();

  const color = page.getByLabel('글자 색상', {
    exact: true
  });
  await color.fill('#7b2dc9');
  await expect(editor.locator('span')).toHaveCSS('color', 'rgb(123, 45, 201)');
  await page.getByRole('button', {
    name: '기본색',
    exact: true
  }).click();
  await expect(editor.locator('span')).toHaveCSS('color', 'rgb(15, 23, 42)');
  await expect(editor.locator('span')).toHaveCSS('font-size', '20px');
  await color.fill('#123abc');
  await page.getByRole('button', {
    name: '공지 등록',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  const stored = JSON.parse((saves[0] as { content: string }).content);
  expect(stored.content[0].content[0].marks).toContainEqual({
    type: 'textStyle',
    attrs: {
      fontSize: '20px',
      color: '#123abc'
    }
  });
  await page.getByRole('rowheader', {
    name: '색상 공지',
    exact: true
  }).click();
  await expect(page.getByRole('document', {
    name: '공지 본문',
    exact: true
  }).locator('span')).toHaveCSS('color', 'rgb(18, 58, 188)');
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(editor.locator('span')).toHaveCSS('color', 'rgb(18, 58, 188)');
  await expect(color).toHaveValue('#123abc');
});

test('기존 토큰 색상을 RGB 선택기로 불러오고 기본색 복원은 다른 서식을 유지한다', async ({ page }) => {
  await mockNotices(page, JSON.stringify({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: '기존 색상 공지',
        marks: [{
          type: 'textStyle',
          attrs: {
            color: 'var(--danger)',
            fontSize: '20px'
          }
        }]
      }]
    }]
  }));
  await page.goto(`${BASE}/${settlementId(200)}/edit`);
  const editor = page.getByRole('textbox', {
    name: '공지 내용 편집기',
    exact: true
  });
  await expect(editor.locator('span')).toHaveCSS('color', 'rgb(239, 68, 68)');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await expect(page.getByLabel('글자 색상', {
    exact: true
  })).toHaveValue('#ef4444');
  await page.getByRole('button', {
    name: '기본색',
    exact: true
  }).click();
  await expect(editor.locator('span')).toHaveCSS('color', 'rgb(15, 23, 42)');
  await expect(editor.locator('span')).toHaveCSS('font-size', '20px');
});

test('모바일은 번호·카드·건수를 유지하고 삭제 권한이 있는 타인 글은 수정 없이 삭제한다', async ({ page }) => {
  await mockNotices(page);
  await page.setViewportSize({
    width: 390,
    height: 900
  });
  await page.goto(BASE);
  const table = page.getByRole('table', {
    name: '공지사항',
    exact: true
  });
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(`${BASE}/${settlementId(201)}`);
  await expect(page.getByRole('button', {
    name: '수정',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '삭제',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await page.getByRole('dialog').getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  await expect(page.getByRole('rowheader', {
    name: '관리비 납부 계좌 안내',
    exact: true
  })).toHaveCount(0);
});

test('삭제 권한이 없는 타인 글에서는 수정·삭제 버튼을 모두 숨긴다', async ({ page }) => {
  await mockNotices(page, CONTENT, false);
  await page.goto(`${BASE}/${settlementId(201)}`);
  await expect(page.getByRole('heading', {
    name: '관리비 납부 계좌 안내',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '수정',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '삭제',
    exact: true
  })).toHaveCount(0);
});

test('수정 초안만 복구하고 반복 임시저장과 브라우저 뒤로가기 취소에서 입력을 유지한다', async ({ page }) => {
  await mockNotices(page);
  const dialogs: string[] = [];
  let allowLeave = false;
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    if (dialog.message().includes('나가시겠습니까') && !allowLeave) await dialog.dismiss();
    else await dialog.accept();
  });
  await page.goto(BASE);
  await page.getByRole('rowheader', {
    name: '11월 공용 전기설비 점검 안내',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('textbox', {
    name: '제목',
    exact: true
  })).toHaveValue('11월 공용 전기설비 점검 안내');
  expect(dialogs).toHaveLength(0);
  await page.getByRole('textbox', {
    name: '제목',
    exact: true
  }).fill('수정 초안 첫 저장');
  await page.getByRole('button', {
    name: '임시저장',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toBeVisible();
  await page.getByRole('textbox', {
    name: '제목',
    exact: true
  }).fill('수정 초안 두 번째 저장');
  await page.getByRole('button', {
    name: '임시저장',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  }).click();
  await expect(page.getByRole('dialog').getByText('수정 초안 두 번째 저장', {
    exact: true
  })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {
    name: '닫기',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '제목',
    exact: true
  }).fill('저장하지 않은 마지막 수정');
  await page.evaluate(() => history.back());
  await expect.poll(() => dialogs.some((text) => text.includes('나가시겠습니까'))).toBe(true);
  await expect(page).toHaveURL(`${BASE}/${settlementId(200)}/edit`);
  await expect(page.getByRole('textbox', {
    name: '제목',
    exact: true
  })).toHaveValue('저장하지 않은 마지막 수정');
  allowLeave = true;
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/${settlementId(200)}`);
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(page.getByRole('textbox', {
    name: '제목',
    exact: true
  })).toHaveValue('저장하지 않은 마지막 수정');
  expect(dialogs.filter((text) => text.includes('불러올까요'))).toHaveLength(1);
});

test('복구 확인·취소는 초안을 한 번만 소비하고 다시 진입하면 반복해서 묻지 않는다', async ({ page }) => {
  await mockNotices(page);
  let acceptRestore = true;
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    if (dialog.message().includes('불러올까요') && !acceptRestore) await dialog.dismiss();
    else await dialog.accept();
  });
  await page.goto(`${BASE}/new`);
  const title = page.getByRole('textbox', {
    name: '제목',
    exact: true
  });
  await title.fill('한 번 불러올 초안');
  await page.getByRole('button', {
    name: '임시저장',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  await page.getByRole('button', {
    name: '공지 작성',
    exact: true
  }).click();
  await expect(title).toHaveValue('한 번 불러올 초안');
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  await page.getByRole('button', {
    name: '공지 작성',
    exact: true
  }).click();
  await expect(title).toHaveValue('');
  expect(dialogs.filter((text) => text.includes('불러올까요'))).toHaveLength(1);
  await title.fill('취소해서 버릴 초안');
  await page.getByRole('button', {
    name: '임시저장',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  acceptRestore = false;
  await page.getByRole('button', {
    name: '공지 작성',
    exact: true
  }).click();
  await expect(title).toHaveValue('');
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(BASE);
  await page.getByRole('button', {
    name: '공지 작성',
    exact: true
  }).click();
  await expect(title).toHaveValue('');
  expect(dialogs.filter((text) => text.includes('불러올까요'))).toHaveLength(2);
});

test('원문 그대로인 수정과 원문으로 되돌린 입력에서는 이탈·복구 확인을 띄우지 않는다', async ({ page }) => {
  await mockNotices(page);
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(`${BASE}/${settlementId(200)}`);
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  const title = page.getByRole('textbox', {
    name: '제목',
    exact: true
  });
  await expect(title).toHaveValue('11월 공용 전기설비 점검 안내');
  await page.getByRole('button', {
    name: '왼쪽 정렬',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/${settlementId(200)}`);
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(title).toHaveValue('11월 공용 전기설비 점검 안내');
  expect(dialogs).toHaveLength(0);
  await title.fill('다시 원문으로 되돌릴 임시 입력');
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toBeVisible();
  await title.fill('11월 공용 전기설비 점검 안내');
  await expect(page.getByRole('button', {
    name: '임시저장 목록',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/${settlementId(200)}`);
  await page.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(title).toHaveValue('11월 공용 전기설비 점검 안내');
  expect(dialogs).toHaveLength(0);
});
