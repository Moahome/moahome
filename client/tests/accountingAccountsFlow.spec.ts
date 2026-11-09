import {
  expect,
  test
} from '@playwright/test';
import {
  mockSettlement,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';
import { mockAccountingAccounts } from './support/accountingAccounts';
import { accountingAccountsFixture } from './support/accountingAccounts';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/accounting/accounts`;

test('조회 중·잘못된 응답에는 제목·목록 카드 없이 공통 캐릭터 상태를 표시한다', async ({ page }) => {
  await mockSettlement(page);
  let release = () => {};
  const response = new Promise<void>((resolve) => { release = resolve; });
  await page.route('http://localhost:8080/api/properties/*/accounting/accounts', async (route) => {
    await response;
    await route.fulfill({
      json: {
        ...accountingAccountsFixture(),
        canManage: 'invalid'
      },
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  });
  await page.goto(BASE);
  await expect(page.locator('img[data-state="loading"]')).toBeVisible();
  await expect(page.getByRole('heading', {
    level: 1
  })).toHaveCount(0);
  release();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert').locator('img')).toHaveAttribute('src', /serverError/);
  await expect(page.getByRole('heading', {
    level: 1
  })).toHaveCount(0);
  await expect(page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  })).toHaveCount(0);
});

test('계정 목록은 코드순이고 기본 비용은 중지·재개하며 필수 과목은 보호한다', async ({ page }) => {
  await mockSettlement(page);
  await mockAccountingAccounts(page);
  await page.goto(BASE);
  const table = page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  });
  await expect(table.getByRole('row').nth(1)).toContainText('101');
  await expect(table.getByRole('row')).toHaveCount(11);
  await expect(page.getByRole('combobox', {
    name: '계정과목 표시 개수',
    exact: true
  })).toContainText('10개씩 보기');
  await expect(page.getByText('구현 예정', {
    exact: true
  })).toHaveCount(0);
  await table.getByRole('row').filter({
    hasText: '101'
  }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', {
    name: '계정과목 상세',
    exact: true
  })).toBeInViewport();
  await expect(dialog.getByText('아직 변경 이력이 없습니다.', {
    exact: true
  })).toBeVisible();
  await expect(dialog.getByRole('button', {
    name: '사용 중지',
    exact: true
  })).toHaveCount(0);
  await expect(dialog.getByRole('button', {
    name: '수정',
    exact: true
  })).toHaveCount(0);
  await dialog.getByRole('button', {
    name: '닫기',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '코드·과목명 검색',
    exact: true
  }).fill('802');
  await table.getByRole('row').nth(1).click();
  await expect(dialog.getByRole('button', {
    name: '삭제',
    exact: true
  })).toHaveCount(0);
  await dialog.getByRole('button', {
    name: '사용 중지',
    exact: true
  }).click();
  await expect(dialog).toContainText('기존 거래와 손익·원장 내역은 유지됩니다.');
  await dialog.getByRole('button', {
    name: '사용 중지',
    exact: true
  }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('사용 중지');
  await table.getByRole('row').nth(1).click();
  await dialog.getByRole('button', {
    name: '재개',
    exact: true
  }).click();
  await dialog.getByRole('button', {
    name: '사용 재개',
    exact: true
  }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('사용 중');
  await page.getByRole('textbox', {
    name: '코드·과목명 검색',
    exact: true
  }).clear();
});

test('사용한 추가 과목은 이름만 변경하며 충돌 때 입력을 유지한다', async ({ page }) => {
  await mockSettlement(page);
  const mock = await mockAccountingAccounts(page, {
    conflict: true
  });
  await page.goto(BASE);
  await page.getByRole('textbox', {
    name: '코드·과목명 검색',
    exact: true
  }).fill('814');
  await page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  }).getByRole('row').filter({
    hasText: '814'
  }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', {
    name: '삭제',
    exact: true
  })).toHaveCount(0);
  await dialog.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await expect(dialog.getByRole('textbox', {
    name: '코드',
    exact: true
  })).toHaveAttribute('readonly', '');
  await expect(dialog.getByRole('combobox', {
    name: '유형·손익 분류',
    exact: true
  })).toBeDisabled();
  await dialog.getByRole('textbox', {
    name: '과목명',
    exact: true
  }).fill('소방시설 점검비');
  await dialog.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(dialog.getByRole('alert')).toContainText('다른 변경이 저장됐습니다.');
  await expect(dialog.getByRole('textbox', {
    name: '과목명',
    exact: true
  })).toHaveValue('소방시설 점검비');
  expect(mock.requests[0].body).toEqual({
    name: '소방시설 점검비',
    code: '814',
    group: 'OPERATING_EXPENSE',
    expectedRevision: 0
  });
});

test('추가 과목은 생성하고 미사용일 때 코드·유형을 변경한 뒤 삭제한다', async ({ page }) => {
  await mockSettlement(page);
  const mock = await mockAccountingAccounts(page);
  await page.goto(BASE);
  await page.getByRole('button', {
    name: '과목 추가',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', {
    name: '과목명',
    exact: true
  }).fill('시설관리비');
  await dialog.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('textbox', {
    name: '코드·과목명 검색',
    exact: true
  }).fill('시설관리비');
  const table = page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  });
  await table.getByRole('row').nth(1).click();
  await dialog.getByRole('button', {
    name: '수정',
    exact: true
  }).click();
  await dialog.getByRole('combobox', {
    name: '유형·손익 분류',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '부채',
    exact: true
  }).click();
  await dialog.getByRole('textbox', {
    name: '코드',
    exact: true
  }).fill('203');
  await dialog.getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('203');
  await expect(table.getByRole('row').nth(1)).toContainText('부채');
  await table.getByRole('row').nth(1).click();
  await dialog.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await dialog.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(table).not.toContainText('시설관리비');
  expect(mock.requests.map((value) => value.method)).toEqual(['POST', 'PUT', 'DELETE']);
});

test('부담당자는 조회만 하고 조회 실패를 기본 과목으로 대체하지 않는다', async ({ page }) => {
  await mockSettlement(page);
  await mockAccountingAccounts(page, {
    manager: true
  });
  await page.goto(BASE);
  await expect(page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '과목 추가',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('textbox', {
    name: '코드·과목명 검색',
    exact: true
  }).fill('815');
  await page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  }).getByRole('row').filter({
    hasText: '815'
  }).click();
  const dialog = page.getByRole('dialog');
  for (const name of ['수정', '삭제', '사용 중지', '재개']) await expect(dialog.getByRole('button', {
    name,
    exact: true
  })).toHaveCount(0);
  await dialog.getByRole('button', {
    name: '닫기',
    exact: true
  }).click();
  await mockAccountingAccounts(page, {
    failure: true
  });
  await page.reload();
  await expect(page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '다시 시도',
    exact: true
  })).toBeVisible();
});

test('모바일에서 흰색 목록과 입력창이 화면을 넘지 않는다', async ({ page }) => {
  await mockSettlement(page);
  await mockAccountingAccounts(page);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto(BASE);
  await expect(page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  })).toBeVisible();
  expect(await page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  }).evaluate((element) => {
    let current: Element | null = element;
    while (current && getComputedStyle(current).backgroundColor === 'rgba(0, 0, 0, 0)') current = current.parentElement;
    return current && getComputedStyle(current).backgroundColor;
  })).toBe('rgb(255, 255, 255)');
  await page.getByRole('table', {
    name: '계정과목 목록',
    exact: true
  }).getByRole('row').nth(1).click();
  await expect(page.getByText('아직 변경 이력이 없습니다.', {
    exact: true
  })).toBeVisible();
  await page.getByText('변경이 발생하면 이 영역에 기록됩니다.', {
    exact: true
  }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', {
    name: '계정과목 상세',
    exact: true
  })).toBeInViewport();
  await page.getByRole('button', {
    name: '닫기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '과목 추가',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '과목명',
    exact: true
  }).fill('모바일 과목');
  await page.setViewportSize({
    width: 320,
    height: 700
  });
  await expect(page.getByRole('button', {
    name: '저장',
    exact: true
  })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
