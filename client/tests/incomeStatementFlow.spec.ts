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
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';
import { selectMonthRange } from './support/monthRange';
import {
  mockIncomeStatement,
  INCOME_BUILDING_A,
  mockAccountingLifecycle
} from './support/incomeStatement';
import { closeReportPreview } from './support/reportDownload';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/accounting/income-statement`;

test('손익 조회는 기간·동·누계와 점 말풍선을 연결하고 같은 자료를 Excel·PDF·PNG로 저장한다', async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page);
  await mockIncomeStatement(page);
  await page.goto(BASE);
  await expect(page.getByRole('note')).toContainText('등록·확인 자료 기준');
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
  await trend.screenshot({
    path: testInfo.outputPath('income-point-tooltip.png')
  });
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: testInfo.outputPath('income-desktop.png'),
    fullPage: true
  });

  await selectMonthRange(page, '2026-08', '2026-09');
  await page.getByRole('combobox', {
    name: '조회 동',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: 'A동',
    exact: true
  }).click();
  // 편집 중인 기간·동은 조회 버튼을 누르기 전까지 결과·다운로드에 섞이지 않습니다.
  await expect(page.getByRole('article', {
    name: '기간 순손익 1,000,000원',
    exact: true
  })).toBeVisible();
  await page.getByRole('form', {
    name: '손익 조회 조건'
  }).getByRole('button', {
    name: '조회',
    exact: true
  }).click();
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
  const excelReady = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: 'Excel 다운로드',
    exact: true
  }).click();
  const excel = await excelReady;
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
  await modal.getByRole('img', {
    name: 'PDF 1페이지 미리보기',
    exact: true
  }).screenshot({
    path: testInfo.outputPath('income-pdf-1.png')
  });
  await modal.getByRole('button', {
    name: 'PDF 다음 페이지',
    exact: true
  }).click();
  await expect(modal.getByRole('img', {
    name: 'PDF 2페이지 미리보기',
    exact: true
  })).toBeVisible();
  await modal.getByRole('img', {
    name: 'PDF 2페이지 미리보기',
    exact: true
  }).screenshot({
    path: testInfo.outputPath('income-pdf-2.png')
  });
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

test('360px까지 페이지 넘침 없이 표시하고 모바일 다운로드 복귀·직접 접근·자료 없는 기간을 구분한다', async ({ page }, testInfo) => {
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
    await page.screenshot({
      path: testInfo.outputPath(`income-${width}.png`),
      fullPage: true
    });
  }
  await page.setViewportSize({
    width: 375,
    height: 900
  });
  const point = page.locator('circle[aria-label^="2026-07"]');
  await point.click();
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
  await expect(page.getByText('회계 시작 월 이전의 기간입니다.', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '다운로드',
    exact: true
  })).toBeDisabled();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('실제 API 설정·수익 성격·비용 귀속 확인 뒤 손익을 갱신하고 정정 실패는 입력을 보존한다', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page);
  const state = await mockAccountingLifecycle(page);
  await page.goto(`${BASE}?startMonth=2026-10&endMonth=2026-10`);
  await page.getByRole('button', {
    name: '회계 시작 설정',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: /^회계 시작 월:/
  }).click();
  await page.getByRole('dialog', {
    name: '회계 시작 월',
    exact: true
  }).getByRole('button', {
    name: '2026년 10월',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '회계연도 시작 월',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '1월',
    exact: true
  }).click();
  await page.getByRole('dialog', {
    name: '회계 시작 기준',
    exact: true
  }).getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(page.getByRole('note')).toContainText('잠정 손익');
  await page.getByRole('button', {
    name: '확인 필요 2건',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '일반관리비 분류',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '항목 성격',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '일반 관리비수익',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '변경 사유',
    exact: true
  }).fill('일반 부과 항목 확인');
  await page.getByRole('dialog', {
    name: '수익 분류',
    exact: true
  }).getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(page.getByRole('article', {
    name: '수익 합계 1,000,000원',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '청소비 분류',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '과목명',
    exact: true
  }).fill('청소비');
  await expect(page.getByRole('dialog', {
    name: '지출 분류',
    exact: true
  }).getByText('전체 기간', {
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: /^비용 귀속 월:/
  }).click();
  await page.getByRole('dialog', {
    name: '비용 귀속 월',
    exact: true
  }).getByRole('button', {
    name: '2026년 10월',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '변경 사유',
    exact: true
  }).fill('9월 지급한 10월 비용');
  await page.getByRole('dialog', {
    name: '지출 분류',
    exact: true
  }).getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  const profit = page.getByRole('article', {
    name: '기간 순손익 -500,000원',
    exact: true
  });
  await expect(profit).toBeVisible();
  await expect(profit.locator('strong')).toHaveCSS('color', 'rgb(239, 68, 68)');
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
    name: '청소비 분류',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '변경 사유',
    exact: true
  }).fill('정정 입력 보존');
  await page.getByRole('dialog', {
    name: '지출 분류',
    exact: true
  }).getByRole('button', {
    name: '저장',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '지출 분류',
    exact: true
  }).getByRole('alert')).toContainText('최신 회계 자료');
  await expect(page.getByRole('textbox', {
    name: '변경 사유',
    exact: true
  })).toHaveValue('정정 입력 보존');
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
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '다운로드',
    exact: true
  })).toBeDisabled();
});


test('원천 목록은 페이지를 나누고 PC에서 기존 지출·수납·입금 상세 모달을 연다', async ({ page }, testInfo) => {
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
  await expect(list.getByRole('row')).toHaveCount(11);
  await list.getByRole('button', {
    name: '2페이지',
    exact: true
  }).click();
  await expect(list.getByRole('row').nth(1)).toContainText('미반영 자료 11');
  await list.getByRole('combobox', {
    name: '손익 반영 자료 표시 개수',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '20개씩 보기',
    exact: true
  }).click();
  await expect(list.getByRole('row')).toHaveCount(21);
  await list.getByRole('row', {
    name: /지출 확인/
  }).click();
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
  await list.getByRole('row', {
    name: /음수 청구 확인/
  }).click();
  const monthly = page.getByRole('dialog', {
    name: /수납 상세/
  });
  await expect(monthly).toBeVisible();
  await monthly.getByRole('button', {
    name: /닫기/
  }).click();
  await list.getByRole('row', {
    name: /기타 입금 확인/
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
  await list.screenshot({
    path: testInfo.outputPath('income-sources.png')
  });
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
  const list = page.getByRole('dialog', {
    name: '손익 반영 자료',
    exact: true
  });
  await list.getByRole('button', {
    name: '2페이지',
    exact: true
  }).click();
  await list.getByRole('row').nth(1).click();
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
  await expect(list.getByRole('row').nth(1)).toContainText('미반영 자료 11');
  await expect(list.getByRole('button', {
    name: '2페이지',
    exact: true
  })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
