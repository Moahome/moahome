import {
  expect,
  test
} from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  mockSettlement,
  settlementFixture,
  settlementId,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';
import {
  selectDateRange,
  selectMonthRange
} from './support/monthRange';

const BASE = `/manage/${SETTLEMENT_PROPERTY}`;

/** 과거 선입금이 월마다 충당되는 같은 세대를 연도 경계 양쪽에서 확인합니다. */
function fixture() {
  const data = settlementFixture();
  const ledger = data.payments;
  ledger.asOf = '2027-03-31';
  ledger.units = [ledger.units[0]];
  ledger.payments = [];
  ledger.openingCredits = [{
    id: settlementId(880),
    unitId: ledger.units[0].id,
    date: '2026-10-31',
    amount: '30000',
    allocations: []
  }];
  ledger.charges = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((month, index) => ({
    id: settlementId(800 + index),
    unitId: ledger.units[0].id,
    month,
    amount: '10000',
    status: 'ISSUED'
  }));
  data.banking.asOf = '2027-03-31';
  data.banking.rows = [
    {
      ...data.banking.rows[0],
      id: settlementId(900),
      date: '2026-10-31',
      payer: '기간 이전'
    },
    {
      ...data.banking.rows[0],
      id: settlementId(901),
      date: '2026-11-01',
      payer: '시작 월 입금'
    },
    {
      ...data.banking.rows[0],
      id: settlementId(902),
      date: '2027-03-31',
      payer: '종료 월 입금'
    },
    {
      ...data.banking.rows[0],
      id: settlementId(903),
      date: '2027-04-01',
      payer: '기간 이후'
    }
  ];
  return data;
}

for (const width of [1440, 320]) {
  test(`월 기간 ${width}px는 연도 경계·최신순 월별 내역·취소·역전 검증과 모바일 복귀를 유지`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mockSettlement(page, {
      failure: false,
      wrongProperty: false
    }, 0, fixture);
    await page.goto(`${BASE}/banking/monthly?month=2026-11`);
    await selectMonthRange(page, '2026-11', '2027-03');
    await expect(page).toHaveURL(/startMonth=2026-11&endMonth=2027-03/);
    const table = page.getByRole('table', {
      name: '세대별 월별 수납 현황',
      exact: true
    });
    const rows = table.getByRole('row').filter({
      has: page.locator('td')
    });
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('2027-03');
    await expect(rows.last()).toContainText('2026-11');
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await rows.first().getByRole('checkbox').check();
    await expect(rows.first().getByRole('checkbox')).toBeChecked();
    await expect(rows.nth(1).getByRole('checkbox')).not.toBeChecked();
    await expect(rows.last().getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByRole('status').filter({
      hasText: '1건 선택'
    })).toBeVisible();
    await page.getByRole('button', {
      name: '선택 다운로드',
      exact: true
    }).click();
    const selectedReport = page.getByRole('region', {
      name: 'Excel 미리보기',
      exact: true
    });
    await expect(selectedReport.getByRole('table').getByRole('row').filter({
      hasText: '2027-03'
    })).toHaveCount(1);
    await expect(selectedReport.getByRole('table').getByRole('row').filter({
      hasText: '2026-11'
    })).toHaveCount(0);
    await page.getByRole('button', {
      name: '다운로드 미리보기 닫기',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '완료',
      exact: true
    }).click();

    await expect(table.getByRole('row').filter({
      hasText: '2027-01'
    })).toContainText('납부완료');
    await expect(table.getByRole('row').filter({
      hasText: '2027-01'
    })).not.toContainText('선입금 사용');
    await expect(page.getByRole('article', {
      name: '시작 월 이월액 -30,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '기간 관리비 발생액 50,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '기간 청구 미수금 20,000원',
      exact: true
    })).toBeVisible();
    await page.getByRole('button', {
      name: /^조회 기간:/
    }).click();
    await page.getByRole('button', {
      name: '이번 달',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(rows).toHaveCount(5);
    await page.getByRole('button', {
      name: /^조회 기간:/
    }).click();
    const panel = page.getByRole('dialog', {
      name: '조회 기간 선택',
      exact: true
    });
    const preset = panel.getByRole('button', {
      name: '최근 3개월',
      exact: true
    });
    const appearance = await preset.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        width: style.borderWidth
      };
    });
    expect(appearance.background).toBe('rgb(255, 255, 255)');
    expect(appearance.width).toBe('1px');
    await preset.hover();
    expect(await preset.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(appearance.background);
    expect(await preset.evaluate((element) => getComputedStyle(element).borderColor)).toBe(appearance.border);
    await panel.screenshot({
      path: testInfo.outputPath(`periodPanel${width}.png`)
    });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', {
      name: /^시작 월:/
    }).click();
    const calendar = page.getByRole('dialog', {
      name: '시작 월',
      exact: true
    });
    await calendar.getByRole('button', {
      name: '다음 연도',
      exact: true
    }).click();
    await calendar.getByRole('button', {
      name: '2027년 4월',
      exact: true
    }).click();
    await panel.getByRole('button', {
      name: '조회',
      exact: true
    }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rows).toHaveCount(5);
    await page.screenshot({
      path: testInfo.outputPath(`monthRange${width}.png`),
      fullPage: true
    });
    if (width < 768) {
      await rows.first().click();
      await expect(page).toHaveURL(/monthly\/2027-03\/.*startMonth=2026-11&endMonth=2027-03/);
      await page.reload();
      await page.getByRole('link', {
        name: '월별 수납 현황으로 돌아가기',
        exact: true
      }).click();
      await expect(rows).toHaveCount(5);
      await expect(rows.first()).toContainText('2027-03');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('통장 거래 기간은 시작·종료 월 전체 날짜를 포함하고 경계 밖 거래를 제외한다', async ({ page }) => {
  await mockSettlement(page, {
    failure: false,
    wrongProperty: false
  }, 0, fixture);
  await page.goto(`${BASE}/banking/transactions?startDate=2026-11-01&endDate=2027-03-31`);
  const table = page.getByRole('table', {
    name: '통장 거래',
    exact: true
  });
  await expect(table).toContainText('시작 월 입금');
  await expect(table).toContainText('종료 월 입금');
  await expect(table).not.toContainText('기간 이전');
  await expect(table).not.toContainText('기간 이후');
  await selectDateRange(page, '2026-11-02', '2027-03-30');
  await expect(table).not.toContainText('시작 월 입금');
  await expect(table).not.toContainText('종료 월 입금');
  await expect(page).toHaveURL(/startDate=2026-11-02&endDate=2027-03-30/);
  await page.getByRole('button', {
    name: /^조회 기간:/
  }).click();
  await expect(page.getByRole('button', {
    name: /^시작일:/
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: /^시작 월:/
  })).toHaveCount(0);
  await page.keyboard.press('Escape');

});

test('기간 보고서는 월 범위와 최신 월부터의 내역을 PDF·PNG에 겹침 없이 저장한다', async ({ page }, testInfo) => {
  await mockSettlement(page, {
    failure: false,
    wrongProperty: false
  }, 0, fixture);
  await page.goto(`${BASE}/banking/monthly?startMonth=2026-11&endMonth=2027-03`);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: /월별 수납 현황/
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', {
    name: 'PDF',
    exact: true
  }).check();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', {
    name: 'PDF 다운로드',
    exact: true
  }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toContain('2026-11_2027-03');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(await readFile((await download.path())!)),
    useSystemFonts: false
  });
  const pdf = await task.promise;
  const pageCount = pdf.numPages;
  const months: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    if (pageNumber === 1) {
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
      expect(text).toContain('2026년 11월 ~ 2027년 3월');
    }
    months.push(...content.items.flatMap((item) => 'str' in item && /^\d{4}-\d{2}$/.test(item.str) ? [item.str] : []));
  }
  expect(months).toEqual(['2027-03', '2027-02', '2027-01', '2026-12', '2026-11']);
  await task.destroy();
  await dialog.getByRole('radio', {
    name: '이미지 (PNG)',
    exact: true
  }).check();
  await expect(dialog.getByRole('img', {
    name: /미리보기/
  }).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('monthRangeReport.png'),
    fullPage: true
  });
  const image = page.waitForEvent('download');
  await dialog.getByRole('button', {
    name: '이미지 다운로드',
    exact: true
  }).click();
  expect((await image).suggestedFilename()).toMatch(pageCount === 1 ? /\.png$/ : /\.zip$/);
});
