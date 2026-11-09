import {
  expect,
  test
} from '@playwright/test';
import {
  readFile,
  writeFile
} from 'node:fs/promises';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  mockSettlement,
  settlementId,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';
import { selectMonthRange } from './support/monthRange';
import {
  mockIncomeStatement,
  incomeFixture,
  INCOME_BUILDING_A,
  mockAccountingLifecycle
} from './support/incomeStatement';
import { closeReportPreview } from './support/reportDownload';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/accounting/income-statement`;

test('기타 입금만 있는 기간에도 반영 내역에서 901 자동 매칭을 확인한다', async ({ page }) => {
  await mockSettlement(page);
  const source = incomeFixture();
  const account = {
    id: settlementId(9500),
    code: '901',
    name: '영업외수익',
    group: 'otherRevenue',
    systemKey: 'OTHER_INCOME'
  };
  await page.route('http://localhost:8080/api/properties/*/accounting/income-statement**', (route) => route.fulfill({
    json: {
      ...source,
      range: {
        startMonth: '2026-09',
        endMonth: '2026-09'
      },
      accounts: [...source.accounts, account],
      records: [{
        id: 'income:interest',
        accountId: account.id,
        accountName: account.name,
        group: account.group,
        month: '2026-09',
        buildingId: INCOME_BUILDING_A,
        amount: '218'
      }],
      otherIncomes: [{
        id: settlementId(9530),
        transactionId: settlementId(9531),
        date: '2026-09-15',
        name: '예금이자',
        amount: '218',
        accountId: account.id
      }]
    },
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true'
    }
  }));
  await page.goto(`${BASE}?startMonth=2026-09&endMonth=2026-09`);
  await expect(page.getByRole('article', {
    name: '기간 순손익 218원',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '반영 내역',
    exact: true
  }).click();
  const income = page.getByRole('listitem', {
    name: '예금이자',
    exact: true
  });
  await expect(income).toContainText('218원');
  await expect(income).toContainText('901 영업외수익');
});

test('확인 목록은 선택 월의 미수금만 거래일 내림차순으로 표시하고 0원 회수 완료를 강조한다', async ({ page }) => {
  await mockSettlement(page);
  const source = incomeFixture();
  const cost = source.accounts.find((account) => account.group === 'operatingExpense')!;
  const otherAccount = {
    id: settlementId(9500),
    code: '901',
    name: '영업외수익',
    group: 'otherRevenue',
    systemKey: 'OTHER_INCOME'
  };
  const data = {
    ...source,
    range: {
      startMonth: '2026-09',
      endMonth: '2026-09'
    },
    accounts: [...source.accounts, otherAccount],
    records: [],
    revenueItems: [],
    expenses: ['2026-09-03', '2026-09-28'].map((date, index) => ({
      id: settlementId(9510 + index),
      transactionId: settlementId(9520 + index),
      date,
      name: index === 0 ? '월초 지출' : '월말 지출',
      amount: '100',
      accountId: cost.id,
      recognitionMonth: '2026-09',
      revision: 1
    })),
    otherIncomes: [{
      id: settlementId(9530),
      transactionId: settlementId(9531),
      date: '2026-09-15',
      name: '예금이자',
      amount: '218',
      accountId: otherAccount.id
    }],
    receivables: ['2026-07-10', '2026-09-10', '2026-09-19', '2026-10-10'].map((date, index) => ({
      id: settlementId(9540 + index),
      accountCode: '102',
      name: `외부 부담 ${index}`,
      date,
      counterparty: '외부 부담처',
      amount: '100',
      received: index === 2 ? '60' : '100',
      remaining: index === 2 ? '40' : '0',
      path: `/banking/transactions/${settlementId(9550 + index)}`
    }))
  };
  await page.route('http://localhost:8080/api/properties/*/accounting/income-statement**', (route) => route.fulfill({
    json: data,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true'
    }
  }));
  await page.goto(`${BASE}?startMonth=2026-09&endMonth=2026-09`);
  await page.getByRole('button', {
    name: '반영 내역',
    exact: true
  }).click();
  const list = page.getByRole('dialog', {
    name: '손익 반영 자료',
    exact: true
  });
  await list.getByRole('combobox', {
    name: '반영 상태',
    exact: true
  }).click();
  await expect(page.getByRole('option')).toHaveText(['전체', '확인 필요']);
  await page.getByRole('option', {
    name: '전체',
    exact: true
  }).click();
  expect(await list.getByRole('listitem').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))))
    .toEqual(['월말 지출', '102 미수금 · 외부 부담 2', '예금이자', '102 미수금 · 외부 부담 1', '월초 지출']);
  const recovered = list.getByRole('listitem', {
    name: '102 미수금 · 외부 부담 1',
    exact: true
  });
  await expect(recovered.getByText('0원', {
    exact: true
  })).toBeVisible();
  await expect(recovered.getByText('회수 완료', {
    exact: true
  })).toHaveCSS('background-color', 'rgb(236, 252, 203)');
  const partial = list.getByRole('listitem', {
    name: '102 미수금 · 외부 부담 2',
    exact: true
  });
  await expect(partial).toContainText('40원');
  await expect(partial).toContainText('일부 회수');
});

test('모바일 확인 목록과 분류는 독립 페이지이며 헤더 뒤로가기로 같은 목록을 복원한다', async ({ page }) => {
  await page.setViewportSize({
    width: 375,
    height: 900
  });
  await mockSettlement(page);
  const state = await mockAccountingLifecycle(page, {
    accounts: [{
      id: settlementId(9401),
      code: '802',
      name: '청소비',
      group: 'operatingExpense',
      systemKey: null
    }]
  });
  state.configured = true;
  await page.goto(`${BASE}?startMonth=2026-10&endMonth=2026-10`);
  await page.getByRole('button', {
    name: '확인 필요 2건',
    exact: true
  }).click();
  await expect(page).toHaveURL(/income-statement\/sources\?/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('손익 반영 자료', {
    exact: true
  })).toHaveCount(1);
  await expect(page.getByRole('main').getByText('손익계산서', {
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '청소비 매칭',
    exact: true
  }).click();
  await expect(page).toHaveURL(/income-statement\/review\?.*kind=expense/);
  await expect(page.getByRole('banner').getByText('지출 매칭', {
    exact: true
  })).toBeVisible();
  await expect(page.getByText('지출 매칭', {
    exact: true
  })).toHaveCount(1);
  await expect(page.getByRole('main').getByText('손익계산서', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', {
    name: '뒤로가기',
    exact: true
  }).click();
  await expect(page).toHaveURL(/income-statement\/sources\?/);
  await expect(page.getByRole('banner').getByText('손익 반영 자료', {
    exact: true
  })).toBeVisible();
});

test('비용 과목은 서버 반환 순서와 관계없이 801부터 계정 코드 오름차순으로 표시한다', async ({ page }) => {
  await mockSettlement(page);
  const names = ['일반관리비', '청소비', '엘리베이터비', '수도전기료', '모아홈비', '수선비', '정화조비', '통신비', '지급수수료', '소모품', '보험료', '잡비'];
  const codes = [801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 812, 813];
  const state = await mockAccountingLifecycle(page, {
    accounts: names.map((name, index) => ({
      id: settlementId(9000 + index),
      code: String(codes[index]),
      name,
      group: 'operatingExpense' as const,
      systemKey: null
    })).reverse()
  });
  state.configured = true;
  state.revenue = true;
  await page.goto(`${BASE}?startMonth=2026-10&endMonth=2026-10`);
  await page.getByRole('button', {
    name: '확인 필요 1건',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '청소비 매칭',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '계정과목',
    exact: true
  }).click();
  await expect(page.getByRole('option')).toHaveText([...names.map((name, index) => `${codes[index]} ${name}`), '새 비용 과목']);
});

test('손익 조회는 기간·동·누계와 점 말풍선을 연결하고 같은 자료를 Excel·PDF·PNG로 저장한다', async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page);
  await mockIncomeStatement(page);
  await page.goto(BASE);
  await expect(page.getByRole('note')).toContainText('등록·확인 자료 기준');
  await expect(page.locator('rect[data-series="expense"]').first()).toHaveCSS('fill', 'rgb(244, 162, 97)');
  await expect(page.locator('span[data-series="expense"] i')).toHaveCSS('background-color', 'rgb(244, 162, 97)');
  await expect(page.getByRole('article', {
    name: '기간 순손익 1,000,000원',
    exact: true
  })).toBeVisible();
  await expect(page.getByText('12개월 비교', {
    exact: true
  })).toHaveCount(0);
  const statement = page.getByRole('region', {
    name: '손익계산서',
    exact: true
  });
  const trend = page.getByRole('region', {
    name: '월별 손익 추이',
    exact: true
  });
  const accounts = statement.getByRole('table', {
    name: '계정과목별 손익계산서',
    exact: true
  });
  await expect(statement).toHaveCSS('border-color', 'rgb(191, 211, 234)');
  await expect(statement).toHaveCSS('border-radius', '12px');
  await expect(accounts.locator('thead')).toHaveCSS('background-color', 'rgb(224, 242, 254)');
  await expect(accounts.getByRole('columnheader').first()).toHaveCSS('height', '48px');
  await expect(accounts.getByRole('row', {
    name: /^Ⅰ\. 운영수익/
  })).toHaveCSS('background-color', 'rgb(219, 234, 254)');
  await expect(accounts.locator('tr:has([data-row-kind="account"])').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(accounts.getByRole('row', {
    name: /^기간 순손익/
  })).toHaveCSS('background-color', 'rgb(191, 219, 254)');
  const statementBounds = (await statement.boundingBox())!;
  const trendBounds = (await trend.boundingBox())!;
  expect(trendBounds.y).toBeGreaterThanOrEqual(statementBounds.y + statementBounds.height);
  const description = page.getByText('그래프의 점을 선택하면 해당 월의 금액을 확인할 수 있습니다.', {
    exact: true
  });
  const point = page.locator('circle[aria-label^="2026-07"]');
  await point.scrollIntoViewIfNeeded();
  const before = await description.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
  await point.click();
  await expect(page.getByRole('tooltip')).toContainText('240,000원');
  await expect(page.getByRole('tooltip')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await description.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)).toBe(before);
  await page.keyboard.press('Escape');

  const filters = page.getByRole('form', {
    name: '손익 조회 조건'
  });
  const buildingBounds = (await filters.getByRole('combobox', {
    name: '조회 동',
    exact: true
  }).boundingBox())!;
  const periodBounds = (await filters.getByRole('button', {
    name: /^조회 기간:/
  }).boundingBox())!;
  expect(buildingBounds.x).toBeLessThan(periodBounds.x);
  await page.getByRole('combobox', {
    name: '조회 동',
    exact: true
  }).click();
  // 삭제 후 같은 이름으로 다시 만든 동은 현재 선택 목록에 중복 표시하지 않습니다.
  await expect(page.getByRole('option', {
    name: 'A동',
    exact: true
  })).toHaveCount(1);
  await expect(page.getByRole('option', {
    name: /삭제된 동/
  })).toHaveCount(0);
  await page.getByRole('option', {
    name: 'A동',
    exact: true
  }).click();
  // 동만 선택한 단계에서는 결과를 유지하고 기간 선택창에서 조회하면 새 기간·동을 즉시 함께 적용합니다.
  await expect(page.getByRole('article', {
    name: '기간 순손익 1,000,000원',
    exact: true
  })).toBeVisible();
  await selectMonthRange(page, '2026-08', '2026-09');
  await expect(page).toHaveURL(new RegExp(`startMonth=2026-08&endMonth=2026-09&building=${INCOME_BUILDING_A}`));
  await expect(page.getByRole('article', {
    name: '기간 순손익 270,000원',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '누계',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '누계 손익 내역',
    exact: true
  }).getByRole('row').last()).toContainText('1,410,000');
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '테스트 관리대상 손익계산서',
    exact: true
  });
  await expect(modal).toBeVisible();
  const excelTable = modal.getByRole('table', {
    name: '손익계산서 다운로드 미리보기',
    exact: true
  });
  await expect(excelTable.getByRole('row', {
    name: /^Ⅰ\. 운영수익/
  })).toHaveCSS('background-color', 'rgb(219, 234, 254)');
  await expect(excelTable.getByRole('row', {
    name: /^기간 순손익/
  })).toHaveCSS('background-color', 'rgb(191, 219, 254)');
  const excelReady = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: 'Excel 다운로드',
    exact: true
  }).click();
  const excel = await excelReady;
  await excel.saveAs(testInfo.outputPath('income-report.xlsx'));
  expect(excel.suggestedFilename()).toContain('테스트 관리대상');
  const workbook = unzipSync(new Uint8Array(await readFile((await excel.path())!)));
  const xml = Object.entries(workbook).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(xml).toContain('테스트 관리대상');
  expect(xml).not.toContain('예시 데이터');
  expect(xml).toContain('1410000');
  expect(xml).toContain('270000');
  expect(xml).not.toContain('4760000');
  await modal.getByRole('radio', {
    name: 'PDF',
    exact: true
  }).check();
  await expect(modal.getByRole('img', {
    name: 'PDF 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  await modal.getByRole('button', {
    name: 'PDF 다음 페이지',
    exact: true
  }).click();
  await expect(modal.getByRole('img', {
    name: 'PDF 2페이지 미리보기',
    exact: true
  })).toBeVisible();
  const pdfReady = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: 'PDF 다운로드',
    exact: true
  }).click();
  const pdf = await pdfReady;
  await pdf.saveAs(testInfo.outputPath('income-example.pdf'));
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
  await modal.getByRole('radio', {
    name: '이미지 (PNG)',
    exact: true
  }).check();
  await expect(modal.getByRole('img', {
    name: '이미지 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  const imageReady = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: '이미지 다운로드',
    exact: true
  }).click();
  const images = await imageReady;
  const zip = unzipSync(new Uint8Array(await readFile((await images.path())!)));
  expect(Object.keys(zip)).toHaveLength(2);
  for (const [index, bytes] of Object.values(zip).entries()) {
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await writeFile(testInfo.outputPath(`income-image-${index + 1}.png`), bytes);
  }
  await closeReportPreview(page);
});

test.describe('손익 모바일 반응형', () => {
  test.use({
    hasTouch: true
  });

  test('360px까지 페이지 넘침 없이 표시하고 모바일 다운로드 복귀·직접 접근·자료 없는 기간을 구분한다', async ({ page }) => {
    await mockSettlement(page);
    await mockIncomeStatement(page);
    await page.setViewportSize({
      width: 375,
      height: 900
    });
    await page.goto(BASE);
    for (const width of [375, 360, 320, 768]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      await expect(page.getByRole('heading', {
        name: '손익계산서',
        exact: true,
        level: 1
      })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({
      width: 375,
      height: 900
    });
    const point = page.locator('circle[aria-label^="2026-07"]');
    await point.tap();
    await expect(page.getByRole('tooltip')).toBeVisible();
    const tooltip = (await page.getByRole('tooltip').boundingBox())!;
    expect(tooltip.x).toBeGreaterThanOrEqual(0);
    expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(375);
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    await expect(page).toHaveURL(/income-statement\/download/);
    await expect(page.getByRole('region', {
      name: '테스트 관리대상 손익계산서',
      exact: true
    })).toBeVisible();
    await closeReportPreview(page);
    await expect(page).toHaveURL(new RegExp(`${BASE}$`));
    await page.goto(`${BASE}/download`);
    await expect(page.getByRole('button', {
      name: 'Excel 다운로드',
      exact: true
    })).toHaveCount(0);
    await page.goto(`${BASE}?startMonth=2026-06&endMonth=2026-10`);
    await expect(page.getByText('첫 부과월 이전의 기간입니다.', {
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '다운로드',
      exact: true
    })).toBeDisabled();
    await expect(page.getByRole('article')).toHaveCount(0);
  });
});

test('별도 날짜·사유 입력 없이 과목을 매칭하고 실패 시 선택을 보존한다', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page);
  const state = await mockAccountingLifecycle(page);
  await page.goto(`${BASE}?startMonth=2026-10&endMonth=2026-10`);
  await expect(page.getByRole('button', {
    name: '회계 시작 설정',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('note')).toContainText('잠정 손익');
  await page.getByRole('button', {
    name: '확인 필요 2건',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '일반관리비 매칭',
    exact: true
  }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('textbox', {
    name: '계정과목',
    exact: true
  })).toHaveValue('401 관리비수입');
  await expect(page.getByText('예치·적립 등 별도 확인', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('textbox', {
    name: '변경 사유',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('dialog', {
    name: '수익 매칭',
    exact: true
  }).getByRole('button', {
    name: '매칭',
    exact: true
  }).click();
  await expect(page.getByRole('article', {
    name: '수익 합계 1,000,000원',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '청소비 매칭',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '과목명',
    exact: true
  }).fill('청소비');
  await expect(page.getByRole('dialog', {
    name: '지출 매칭',
    exact: true
  }).getByText('전체 기간', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: /^비용 귀속 월:/
  })).toHaveCount(0);
  await expect(page.getByRole('textbox', {
    name: '변경 사유',
    exact: true
  })).toHaveCount(0);
  const [matchingRequest] = await Promise.all([
    page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/accounting/expenses/')),
    page.getByRole('dialog', {
      name: '지출 매칭',
      exact: true
    }).getByRole('button', {
      name: '매칭',
      exact: true
    }).click()
  ]);
  expect(matchingRequest.postDataJSON()).toMatchObject({
    recognitionMonth: '2026-10',
    reason: '계정과목 매칭'
  });
  const profit = page.getByRole('article', {
    name: '기간 순손익 -500,000원',
    exact: true
  });
  await expect(profit).toBeVisible();
  await expect(profit.locator('strong')).toHaveCSS('color', 'rgb(239, 68, 68)');
  await expect(page.getByRole('table', {
    name: '계정과목별 손익계산서',
    exact: true
  })
    .getByRole('row', {
      name: /^기간 순손익/
    }).getByText('-500,000', {
      exact: true
    }))
    .toHaveCSS('color', 'rgb(220, 38, 38)');
  await expect(page.getByRole('note')).not.toContainText('잠정 손익');
  await page.getByRole('button', {
    name: '손익 반영 자료 닫기',
    exact: true
  }).click();
  await page.locator('circle[aria-label^="2026-10"]').click();
  await expect(page.getByRole('tooltip').getByText('-500,000원', {
    exact: true
  })).toHaveCSS('color', 'rgb(239, 68, 68)');
  await page.keyboard.press('Escape');
  state.conflict = true;
  await page.getByRole('button', {
    name: '반영 내역',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '청소비 매칭',
    exact: true
  }).click();
  const selectedAccount = page.getByRole('combobox', {
    name: '계정과목',
    exact: true
  });
  await expect(selectedAccount).toHaveText('청소비');
  await page.getByRole('dialog', {
    name: '지출 매칭',
    exact: true
  }).getByRole('button', {
    name: '매칭',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '지출 매칭',
    exact: true
  }).getByRole('alert')).toContainText('최신 회계 자료');
  await expect(selectedAccount).toHaveText('청소비');
});

test('MANAGER 조회는 확인 버튼을 숨기고 조회 장애는 예시나 0원으로 대체하지 않는다', async ({ page }) => {
  await mockSettlement(page);
  await mockIncomeStatement(page, {
    manager: true
  });
  await page.goto(BASE);
  await expect(page.getByRole('article', {
    name: '기간 순손익 1,000,000원',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: /정정|회계 시작 설정/
  })).toHaveCount(0);
  await mockIncomeStatement(page, {
    failure: true
  });
  await page.reload();
  await expect(page.getByRole('alert').locator('img')).toHaveAttribute('src', /serverError/);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '다운로드',
    exact: true
  })).toBeDisabled();
});

test('잘못된 손익 서버 응답도 공통 서버 오류 이미지를 표시한다', async ({ page }) => {
  await mockSettlement(page);
  await mockIncomeStatement(page);
  await page.route('http://localhost:8080/api/properties/*/accounting/income-statement**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      contentType: 'application/json',
      body: JSON.stringify({
        propertyId: 'invalid'
      })
    });
  });
  await page.goto(BASE);
  const error = page.getByRole('alert', {
    name: '서버에 연결하지 못했어요'
  });
  await expect(error.locator('img')).toHaveAttribute('src', /serverError/);
  await expect(error.getByRole('button', {
    name: '다시 시도',
    exact: true
  })).toBeVisible();
});


test('원천 목록은 페이지를 나누고 PC에서 기존 지출·수납·입금 상세 모달을 연다', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page);
  await mockIncomeStatement(page, {
    sources: true,
    manager: true
  });
  await page.goto(BASE);
  await expect(page.getByText('회계 확인 내역', {
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '확인 필요 23건',
    exact: true
  }).click();
  const list = page.getByRole('dialog', {
    name: '손익 반영 자료',
    exact: true
  });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  const first = list.getByRole('listitem').first();
  await expect(first).toContainText('전기요금');
  await expect(first).toContainText('거래일 2026-10-15');
  await expect(first).not.toContainText('부담처');
  await expect(list.getByRole('columnheader', {
    name: '분류',
    exact: true
  })).toHaveCount(0);
  await list.getByRole('button', {
    name: '2페이지',
    exact: true
  }).click();
  await expect(list.getByRole('listitem').first()).toContainText('미반영 자료 12');
  await list.getByRole('combobox', {
    name: '손익 반영 자료 표시 개수',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '20개씩 보기',
    exact: true
  }).click();
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await list.getByRole('button', {
    name: '전기요금 내역',
    exact: true
  }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const expense = page.getByRole('dialog', {
    name: '지출 상세',
    exact: true
  });
  await expect(expense.getByText('전기요금', {
    exact: true
  })).toBeVisible();
  const bounds = (await expense.boundingBox())!;
  expect(Math.abs(bounds.x + bounds.width / 2 - 720)).toBeLessThan(2);
  expect(Math.abs(bounds.y + bounds.height / 2 - 500)).toBeLessThan(2);
  await expect(page).toHaveURL(/sources=1/);
  await expense.getByRole('button', {
    name: '지출 상세 닫기',
    exact: true
  }).click();
  // 거래일이 없는 부과 합계는 날짜 있는 원천 뒤에 표시됩니다.
  await list.getByRole('button', {
    name: '2페이지',
    exact: true
  }).click();
  await expect(list.getByRole('listitem', {
    name: '관리비 부과',
    exact: true
  })).toContainText('2026-10 부과 · 동 정보 없음 · 101호');
  await list.getByRole('button', {
    name: '관리비 부과 내역',
    exact: true
  }).click();
  const monthly = page.getByRole('dialog', {
    name: /수납 상세/
  });
  await expect(monthly).toBeVisible();
  await monthly.getByRole('button', {
    name: /닫기/
  }).click();
  await list.getByRole('button', {
    name: '1페이지',
    exact: true
  }).click();
  await list.getByRole('button', {
    name: '기타 입금 내역',
    exact: true
  }).click();
  const receipt = page.getByRole('dialog', {
    name: '입금 처리 상세',
    exact: true
  });
  await expect(receipt).toBeVisible();
  await receipt.getByRole('button', {
    name: '입금 상세 닫기',
    exact: true
  }).click();
});


test('모바일 원천은 독립 상세와 헤더 뒤로가기로 목록의 페이지·표시 개수를 복원한다', async ({ page }) => {
  await page.setViewportSize({
    width: 375,
    height: 900
  });
  await mockSettlement(page);
  await mockIncomeStatement(page, {
    sources: true,
    manager: true
  });
  await page.goto(BASE);
  await page.getByRole('button', {
    name: '확인 필요 23건',
    exact: true
  }).click();
  const list = page.getByRole('region', {
    name: '손익 반영 자료',
    exact: true
  });
  await list.getByRole('button', {
    name: '2페이지',
    exact: true
  }).click();
  await list.getByRole('listitem').first().getByRole('button').first().click();
  await expect(page).toHaveURL(/banking\/transactions\//);
  await expect(page.getByRole('heading', {
    name: '지출 상세',
    exact: true
  })).toBeVisible();
  await page.getByRole('link', {
    name: '뒤로가기',
    exact: true
  }).click();
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem').first()).toContainText('미반영 자료 12');
  await expect(list.getByRole('button', {
    name: '2페이지',
    exact: true
  })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('수동 지출의 103 매칭은 기존 상대 입금까지 연결하고 미납 102·선입금 201을 손익에 합산하지 않는다', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page);
  const ids = {
    revenue: settlementId(9701),
    transfer: settlementId(9702),
    receivable: settlementId(9703),
    advance: settlementId(9704),
    other: settlementId(9705),
    expense: settlementId(9706),
    receipt: settlementId(9707),
    interest: settlementId(9708)
  };
  let matched = false;
  const accounts = [
    {
      id: ids.revenue,
      code: '401',
      name: '관리비수입',
      group: 'operatingRevenue',
      systemKey: 'MANAGEMENT_REVENUE'
    },
    {
      id: ids.transfer,
      code: '103',
      name: '통장간 거래',
      group: 'asset',
      systemKey: null
    },
    {
      id: ids.receivable,
      code: '102',
      name: '미수금',
      group: 'asset',
      systemKey: 'RECEIVABLE'
    },
    {
      id: ids.advance,
      code: '201',
      name: '선수금',
      group: 'liability',
      systemKey: 'ADVANCE_RECEIPT'
    },
    {
      id: ids.other,
      code: '901',
      name: '영업외수익',
      group: 'otherRevenue',
      systemKey: 'OTHER_INCOME'
    }
  ];
  const workspace = () => ({
    ...incomeFixture(),
    range: {
      startMonth: '2026-10',
      endMonth: '2026-10'
    },
    buildings: [],
    accounts,
    completeness: matched ? 'READY' : 'REVIEW_REQUIRED',
    records: [
      {
        id: 'charge:1',
        accountId: ids.revenue,
        accountName: '관리비수입',
        group: 'operatingRevenue',
        month: '2026-10',
        buildingId: null,
        amount: '1000000'
      },
      {
        id: 'income:interest',
        accountId: ids.other,
        accountName: '영업외수익',
        group: 'otherRevenue',
        month: '2026-10',
        buildingId: null,
        amount: '106'
      },
      ...(!matched ? [{
        id: 'income:transfer',
        accountId: ids.other,
        accountName: '영업외수익',
        group: 'otherRevenue',
        month: '2026-10',
        buildingId: null,
        amount: '1523016'
      }] : [])
    ],
    issues: matched ? [] : [{
      id: 'expense:1',
      code: 'EXPENSE_ACCOUNTING_REVIEW_REQUIRED',
      label: '과목 확인 필요',
      sourceName: '하나은행계좌로',
      amount: '1523016',
      path: `/banking/transactions/${ids.expense}`,
      expenseId: ids.expense,
      revenueItemId: null
    }],
    expenses: [{
      id: ids.expense,
      transactionId: ids.expense,
      date: '2026-10-15',
      name: '하나은행계좌로',
      amount: '1523016',
      accountId: matched ? ids.transfer : null,
      recognitionMonth: '2026-10',
      revision: matched ? 1 : 0,
      transferCandidates: [{
        paymentId: ids.receipt,
        accountName: '기본 관리 통장',
        name: '카카오뱅크',
        date: '2026-10-15',
        amount: '1523016'
      }],
      transferPaymentId: matched ? ids.receipt : null
    }],
    otherIncomes: [{
      id: ids.receipt,
      transactionId: ids.receipt,
      date: '2026-10-15',
      name: '카카오뱅크',
      amount: '1523016',
      accountId: matched ? ids.transfer : ids.other
    }],
    households: [{
      unitId: settlementId(9710),
      label: '103동 201호',
      receivableAccountId: ids.receivable,
      advanceAccountId: ids.advance,
      receivable: '50000',
      advance: '30000',
      path: `/banking/monthly/2026-10/${settlementId(9710)}?month=2026-10`
    }]
  });
  await page.route('http://localhost:8080/api/properties/*/accounting/income-statement**', (route) => route.fulfill({
    json: workspace()
  }));
  let saved: unknown;
  await page.route('http://localhost:8080/api/properties/*/accounting/expenses/*/reviews', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({
      status: 200
    });
    saved = route.request().postDataJSON();
    matched = true;
    await route.fulfill({
      status: 204
    });
  });
  await page.goto(`${BASE}?startMonth=2026-10&endMonth=2026-10`);
  await expect(page.getByRole('button', {
    name: '회계 시작 설정',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '확인 필요 1건',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '하나은행계좌로 매칭',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '계정과목',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '103 통장간 거래',
    exact: true
  }).click();
  await expect(page.getByRole('combobox', {
    name: '상대 입금',
    exact: true
  })).toContainText('카카오뱅크');
  await page.getByRole('dialog', {
    name: '지출 매칭',
    exact: true
  }).getByRole('button', {
    name: '매칭',
    exact: true
  }).click();
  expect(saved).toMatchObject({
    accountId: ids.transfer,
    counterpartPaymentId: ids.receipt,
    expectedRevision: 0
  });
  await expect(page.getByRole('article', {
    name: '기간 순손익 1,000,106원',
    exact: true
  })).toBeVisible();
  await page.getByRole('combobox', {
    name: '반영 상태',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '전체',
    exact: true
  }).click();
  await expect(page.getByText('102 미수금 · 103동 201호', {
    exact: true
  })).toBeVisible();
  await expect(page.getByText('201 선수금 · 103동 201호', {
    exact: true
  })).toBeVisible();
  await expect(page.getByText('미납 자동 연결', {
    exact: true
  })).toBeVisible();
  await expect(page.getByText('선입금 자동 연결', {
    exact: true
  })).toBeVisible();
});
