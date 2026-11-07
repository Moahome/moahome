import {
  expect,
  test
} from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  mockLedger,
  mockLedgerBilling,
  LEDGER_PAYABLE,
  LEDGER_COST,
  LEDGER_REVENUE,
  LEDGER_BUILDING
} from './support/accountLedger';
import {
  mockSettlement,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';
import { closeReportPreview } from './support/reportDownload';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/accounting/ledger`;
const RANGE = 'startMonth=2026-10&endMonth=2026-10';

for (const width of [1440, 390]) {
  test(`일반관리비 ${width}px는 100만원 부과 한 행에서 동·호수순 부과 상세를 연다`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    await mockSettlement(page);
    await mockLedgerBilling(page);
    const origin = `${BASE}?startMonth=2026-11&endMonth=2026-11&account=${LEDGER_REVENUE}`;
    await page.goto(origin);
    const table = page.getByRole('table', {
      name: '계정별 원장',
      exact: true
    });
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByRole('row').nth(1)).toContainText('1,000,000원');
    await expect(table.getByRole('columnheader')).toHaveText(['계정과목', '적요', '동', '귀속 월', '부과일', '반영액', '과목별 기간 누계']);
    await expect(table.getByRole('row').nth(1)).toContainText('2026-11-01');
    await table.getByRole('row').nth(1).click();
    if (width >= 768) await expect(page.getByRole('dialog')).toHaveCount(1);
    else await expect(page).toHaveURL(/\/accounting\/ledger\/billing\?/);
    const detail = page.getByRole('table', {
      name: '확정 세대 내역',
      exact: true
    });
    await expect(detail.getByRole('row').nth(1)).toContainText('102동');
    await expect(detail.getByRole('row').nth(1)).toContainText('201호');
    await expect(detail.getByRole('row').nth(2)).toContainText('202호');
    await expect(page.getByText('남은 미납금액', {
      exact: true
    })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`billing-from-ledger-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    if (width >= 768) await page.keyboard.press('Escape');
    else await page.getByRole('link', {
      name: '뒤로가기',
      exact: true
    }).click();
    await expect(page).toHaveURL(origin);
    if (width >= 768) {
      await page.goto(`${origin}&building=${LEDGER_BUILDING}`);
      await expect(table.getByRole('row').nth(1)).toContainText('500,000원');
      await table.getByRole('row').nth(1).click();
      await expect(detail.getByRole('row')).toHaveCount(11);
      await expect(detail).not.toContainText('103동');
    }
  });
}

for (const width of [1440, 360]) {
  test(`원장 표 ${width}px는 흰색 카드·공통 빈 상태 그림·한 줄 적요를 표시한다`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    await mockSettlement(page);
    await mockLedger(page);
    await page.goto(`${BASE}?${RANGE}`);
    const filters = page.getByRole('form', {
      name: '원장 조회 조건'
    });
    const period = await filters.getByRole('button', {
      name: /^조회 기간:/
    }).boundingBox();
    const account = await filters.getByRole('combobox', {
      name: '계정과목',
      exact: true
    }).boundingBox();
    expect(period).not.toBeNull();
    expect(account).not.toBeNull();
    if (width >= 768) {
      expect(period!.width).toBeLessThanOrEqual(280);
      expect(period!.x).toBeLessThan(account!.x);
    } else {
      expect(period!.y).toBeLessThan(account!.y);
    }
    const region = page.getByRole('region', {
      name: '계정별 거래 내역',
      exact: true
    });
    const table = region.getByRole('table', {
      name: '계정별 원장',
      exact: true
    });
    await expect(table.getByRole('rowheader').first()).toHaveText('일반관리비');
    await expect(table).not.toContainText('부담처');
    expect(await region.evaluate((element) => getComputedStyle(element.parentElement!).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`ledger-table-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.goto(`${BASE}?startMonth=2026-11&endMonth=2026-11`);
    const empty = region.getByRole('status', {
      name: '선택한 조건의 반영 내역이 없습니다.',
      exact: true
    });
    await expect(empty.locator('img')).toHaveAttribute('src', /noResults/);
    await expect.poll(() => empty.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`ledger-empty-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

for (const width of [1440, 360]) {
  test(`계정별 원장 ${width}px는 필터·누계·페이지·원본 복귀·전체 다운로드를 유지한다`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    await mockSettlement(page);
    await mockLedger(page);
    await page.goto(`${BASE}?${RANGE}&sort=latest`);
    await expect(page.getByRole('article', {
      name: '수익 반영액 100,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '수익 반영액 도움말',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '비용 반영액 도움말',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '반영 내역 도움말',
      exact: true
    })).toBeVisible();
    const table = page.getByRole('table', {
      name: '계정별 원장',
      exact: true
    });
    await expect(table.getByRole('row')).toHaveCount(11);
    await expect(table.getByRole('row').nth(1)).toContainText('일반관리비');
    await page.getByRole('combobox', {
      name: '계정과목',
      exact: true
    }).click();
    await expect(page.getByRole('option')).toHaveText(['전체 계정과목', '101 통장', '202 미지급금', '401 관리비수입', '802 청소비']);
    await page.getByRole('option', {
      name: '802 청소비',
      exact: true
    }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', {
      name: '조회',
      exact: true
    }).click();
    await expect(page).toHaveURL(new RegExp(`account=${LEDGER_COST}`));
    await expect(page.getByRole('article', {
      name: '반영 내역 23건',
      exact: true
    })).toBeVisible();
    await page.getByRole('button', {
      name: '2페이지',
      exact: true
    }).click();
    await expect(table.getByRole('row').nth(1)).toContainText('청소 작업 13');
    await expect(table.getByRole('row').nth(1)).toContainText('13,078원');
    const origin = page.url();
    await table.getByRole('row').nth(1).click();
    if (width >= 768) {
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } else {
      await expect(page).toHaveURL(/\/banking\/transactions\//);
      await page.getByRole('link', {
        name: '뒤로가기',
        exact: true
      }).click();
      await expect(page).toHaveURL(origin);
    }
    await expect(table.getByRole('row').nth(1)).toContainText('청소 작업 13');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`ledger-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    if (width < 768) {
      await expect(page).toHaveURL(/\/accounting\/ledger\/download/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await expect(page.getByRole('heading', {
      name: '테스트 관리대상 계정별 원장',
      exact: true
    }).locator('..').locator('p')).toHaveCount(0);
    const preview = page.getByRole('table', {
      name: '계정별 원장 다운로드 미리보기',
      exact: true
    });
    await expect(preview).toContainText('청소 작업 1');
    await expect(preview).toContainText('청소 작업 23');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', {
      name: 'Excel 다운로드',
      exact: true
    }).click();
    const download = await downloadEvent;
    const workbook = unzipSync(await readFile((await download.path())!));
    const sheet = strFromU8(workbook['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('23253');
    await page.getByRole('radio', {
      name: 'PDF',
      exact: true
    }).check();
    await expect(page.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    })).toBeEnabled();
    if (width >= 768) {
      const pdfEvent = page.waitForEvent('download');
      await page.getByRole('button', {
        name: 'PDF 다운로드',
        exact: true
      }).click();
      await (await pdfEvent).saveAs(testInfo.outputPath('accountLedgerDesign.pdf'));
    }
    await expect(page.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`ledger-pdf-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    if (width >= 768) {
      await page.getByRole('radio', {
        name: '이미지 (PNG)',
        exact: true
      }).check();
      await expect(page.getByRole('img', {
        name: '이미지 1페이지 미리보기',
        exact: true
      })).toBeVisible();
      const imageEvent = page.waitForEvent('download');
      await page.getByRole('button', {
        name: '이미지 다운로드',
        exact: true
      }).click();
      const imageFile = await imageEvent;
      const bytes = new Uint8Array(await readFile((await imageFile.path())!));
      const images = imageFile.suggestedFilename().endsWith('.zip') ? Object.values(unzipSync(bytes)) : [bytes];
      for (const image of images) expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
    await closeReportPreview(page);
    await expect(page).toHaveURL(origin);
    await page.reload();
    await expect(table.getByRole('row').nth(1)).toContainText('청소 작업 13');
  });
}

test('미지급금 계정과 시작 전·설정 전·빈 목록·조회 실패를 분리한다', async ({ page }) => {
  await mockSettlement(page);
  await mockLedger(page);
  await page.goto(`${BASE}?${RANGE}&account=${LEDGER_PAYABLE}`);
  await expect(page.getByRole('table', {
    name: '계정별 원장',
    exact: true
  })).toContainText('선택한 조건의 반영 내역이 없습니다.');
  await page.goto(`${BASE}?startMonth=2026-09&endMonth=2026-09`);
  await expect(page.getByRole('heading', {
    name: '회계 시작 월 이전의 기간입니다.'
  })).toBeVisible();
  await page.goto(`${BASE}?startMonth=2026-11&endMonth=2026-11`);
  await expect(page.getByRole('table', {
    name: '계정별 원장',
    exact: true
  })).toContainText('선택한 조건의 반영 내역이 없습니다.');
  await mockLedger(page, {
    setup: true
  });
  await page.reload();
  await expect(page.getByRole('heading', {
    name: '회계 시작 기준을 설정해주세요.'
  })).toBeVisible();
  await mockLedger(page, {
    failure: true
  });
  await page.reload();
  await expect(page.getByRole('button', {
    name: /다시 시도|재시도/
  })).toBeVisible();
  await expect(page.getByRole('table', {
    name: '계정별 원장',
    exact: true
  })).toHaveCount(0);
});

test('확인 필요 자료를 표시하고 모바일 다운로드 직접 접근은 자료 재선택을 요구한다', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await mockSettlement(page);
  await mockLedger(page, {
    review: true
  });
  await page.goto(`${BASE}?${RANGE}`);
  await expect(page.getByRole('note').filter({
    hasText: '확인 필요 1건'
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: '확인 내역',
    exact: true
  })).toHaveAttribute('href', /income-statement\/sources\?startMonth=2026-10/);
  await page.goto(`${BASE}/download?${RANGE}`);
  await expect(page.getByRole('heading', {
    name: '다운로드할 자료를 다시 선택해주세요'
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: '뒤로가기',
    exact: true
  })).toBeVisible();
});


test('계정 목록 조회 실패에 UUID를 표시하지 않고 재조회하면 선택한 코드·명칭을 복원한다', async ({ page }, testInfo) => {
  await mockSettlement(page);
  await mockLedger(page, {
    failure: true
  });
  await page.goto(`${BASE}?${RANGE}&account=${LEDGER_COST}&building=${LEDGER_BUILDING}`);
  const account = page.getByRole('combobox', {
    name: '계정과목',
    exact: true
  });
  await expect(account).toHaveText('계정과목 조회 실패');
  await expect(page.getByRole('combobox', {
    name: '조회 동',
    exact: true
  })).toHaveText('조회 동 확인 필요');
  await expect(page.getByRole('button', {
    name: '다운로드',
    exact: true
  })).toBeDisabled();
  await expect(page.locator('body')).not.toContainText(LEDGER_COST);
  await expect(page.locator('body')).not.toContainText(LEDGER_BUILDING);
  await page.screenshot({
    path: testInfo.outputPath('ledger-lookup-failure.png'),
    fullPage: true
  });
  await mockLedger(page);
  await page.getByRole('button', {
    name: /다시 시도|재시도/
  }).click();
  await expect(account).toHaveText('802 청소비');
  await expect(page.getByRole('combobox', {
    name: '조회 동',
    exact: true
  })).toHaveText('102동');
  await expect(page.getByRole('table', {
    name: '계정별 원장',
    exact: true
  })).toBeVisible();
});

test('100·200 원장을 코드순으로 표시하고 날짜 정렬·페이지·다운로드에서 누계를 유지한다', async ({ page }, testInfo) => {
  const { assetLedgerFixture, LEDGER_ADVANCE } = await import('./support/accountLedger');
  await mockSettlement(page);
  await page.route('http://localhost:8080/api/properties/*/accounting/ledger**', (route) => route.fulfill({
    json: assetLedgerFixture(new URL(route.request().url()).searchParams)
  }));
  await page.goto(`${BASE}?startMonth=2026-10&endMonth=2026-11`);
  const table = page.getByRole('table', {
    name: '계정별 원장',
    exact: true
  });
  await expect(table.getByRole('row')).toHaveCount(9);
  await expect(table.getByRole('row').nth(1)).toContainText('101 통장');
  await expect(table.getByRole('row').nth(1)).toContainText('관리비 출금');
  await expect(table.getByRole('row').nth(1)).toContainText('2026-10-20');
  const sort = page.getByRole('combobox', {
    name: '원장 정렬',
    exact: true
  });
  await expect(sort).toHaveText('최신순');
  await sort.click();
  await page.getByRole('option', {
    name: '최신순',
    exact: true
  }).click();
  await expect(page).not.toHaveURL(/sort=account/);
  await expect(table.getByRole('row').nth(1)).toContainText('101 통장');
  await expect(table.getByRole('row').nth(1)).toContainText('290,000원');
  await sort.click();
  await page.getByRole('option', {
    name: '오래된순',
    exact: true
  }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('101 통장');
  await expect(table.getByRole('row').nth(1)).toContainText('관리비 입금');
  await page.reload();
  await expect(sort).toHaveText('오래된순');
  await page.goto(`${BASE}?startMonth=2026-10&endMonth=2026-11&account=${LEDGER_ADVANCE}&sort=latest`);
  await expect(page.getByRole('article', {
    name: '증가 반영액 70,000원',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('article', {
    name: '감소 반영액 50,000원',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  await expect(page.getByRole('dialog')).toContainText('감소 반영액');
  await page.keyboard.press('Escape');
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await expect(sort).toBeVisible();
  await expect(page.getByRole('combobox', {
    name: '원장 표시 개수',
    exact: true
  })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('ledger-advance-mobile.png'),
    fullPage: true
  });
});

for (const width of [1440, 390]) {
  test(`${width}px 계정 다중 선택은 코드순을 고정하고 과목 안의 날짜 방향만 바꾼다`, async ({ page }, testInfo) => {
    const { assetLedgerFixture, ledgerFixture, LEDGER_BANK } = await import('./support/accountLedger');
    await page.setViewportSize({
      width,
      height: 1000
    });
    await mockSettlement(page);
    await page.route('http://localhost:8080/api/properties/*/accounting/ledger**', (route) => {
      const params = new URL(route.request().url()).searchParams;
      const normal = ledgerFixture(params), assets = assetLedgerFixture(params);
      assets.rows = [...assets.rows, ...normal.rows].sort((a, b) => b.entry.source.date!.localeCompare(a.entry.source.date!));
      assets.revenue = normal.revenue;
      assets.expense = normal.expense;
      return route.fulfill({
        json: assets
      });
    });
    await page.goto(`${BASE}?${RANGE}`);
    const account = page.getByRole('combobox', {
      name: '계정과목',
      exact: true
    });
    await account.click();
    await expect(page.getByRole('listbox', {
      name: '계정과목',
      exact: true
    })).toHaveAttribute('aria-multiselectable', 'true');
    await page.getByRole('option', {
      name: '101 통장',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '802 청소비',
      exact: true
    }).click();
    await expect(page.getByRole('option', {
      name: '101 통장',
      exact: true
    })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('button', {
      name: '조회',
      exact: true
    }).click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll('account').sort()).toEqual([LEDGER_BANK, LEDGER_COST].sort());
    await expect(account).toContainText('101 통장 외 1개');
    const table = page.getByRole('table', {
      name: '계정별 원장',
      exact: true
    });
    await expect(table.getByRole('row').nth(1)).toContainText('101 통장');
    await expect(table.getByRole('row').nth(1)).toContainText('관리비 출금');
    await expect(table.getByRole('row').nth(1)).toContainText('290,000원');
    await expect(table.getByRole('row').nth(3)).toContainText('802 청소비');
    await expect(table.getByRole('row').nth(3)).toContainText('청소 작업 23');
    await expect(page.getByRole('table', {
      name: '통장 잔액',
      exact: true
    })).toHaveCount(0);
    await expect(table.getByRole('columnheader', {
      name: '은행 거래 잔액',
      exact: true
    })).toHaveCount(0);
    const sort = page.getByRole('combobox', {
      name: '원장 정렬',
      exact: true
    });
    await sort.click();
    await expect(page.getByRole('option', {
      name: '계정과목순',
      exact: true
    })).toHaveCount(0);
    await page.getByRole('option', {
      name: '오래된순',
      exact: true
    }).click();
    await expect(table.getByRole('row').nth(1)).toContainText('101 통장');
    await expect(table.getByRole('row').nth(1)).toContainText('관리비 입금');
    await expect(table.getByRole('row').nth(3)).toContainText('청소 작업 1');
    await page.reload();
    await expect(account).toContainText('101 통장 외 1개');
    await expect(sort).toHaveText('오래된순');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`ledger-multiple-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

for (const width of [1440, 390]) {
  test(`${width}px 101 전체 계좌는 합산 잔액이고 계좌 선택 조건을 복원한다`, async ({ page }) => {
    const { assetLedgerFixture, LEDGER_BANK } = await import('./support/accountLedger');
    const { settlementId } = await import('./support/monthlySettlement');
    const firstBank = settlementId(9961), secondBank = settlementId(9962);
    await page.setViewportSize({
      width,
      height: 1000
    });
    await mockSettlement(page);
    await page.route('http://localhost:8080/api/properties/*/accounting/ledger**', (route) => {
      const params = new URL(route.request().url()).searchParams;
      const value = assetLedgerFixture(params);
      value.bankBalances.push({
        accountId: secondBank,
        name: '예비비',
        openingBalance: '100000',
        income: '0',
        expense: '0',
        closingBalance: '100000'
      });
      if (!params.get('bankAccountId')) {
        value.rows.forEach((row) => { if (row.cashBalance?.ledgerBalance) row.cashBalance.ledgerBalance = String(BigInt(row.cashBalance.ledgerBalance) + BigInt(100000)); });
      }
      return route.fulfill({
        json: value
      });
    });
    await page.goto(`${BASE}?${RANGE}&account=${LEDGER_BANK}`);
    const table = page.getByRole('table', {
      name: '계정별 원장',
      exact: true
    });
    await expect(table.getByRole('row').nth(1)).toContainText('390,000원');
    await expect(table.getByRole('columnheader', {
      name: '통장',
      exact: true
    })).toHaveCount(0);
    const bank = page.getByRole('combobox', {
      name: '조회 계좌',
      exact: true
    });
    await expect(bank).toHaveText('전체 계좌');
    await bank.click();
    await page.getByRole('option', {
      name: '공용 통장',
      exact: true
    }).click();
    await expect(page).toHaveURL(new RegExp(`bank=${firstBank}`));
    await expect(table.getByRole('row').nth(1)).toContainText('290,000원');
    await page.reload();
    await expect(bank).toHaveText('공용 통장');
    await bank.click();
    await page.getByRole('option', {
      name: '예비비',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await expect(page.getByRole('status', {
      name: '선택한 조건의 반영 내역이 없습니다.',
      exact: true
    })).toBeVisible();
    await bank.click();
    await page.getByRole('option', {
      name: '전체 계좌',
      exact: true
    }).click();
    await expect(table.getByRole('row').nth(1)).toContainText('390,000원');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
