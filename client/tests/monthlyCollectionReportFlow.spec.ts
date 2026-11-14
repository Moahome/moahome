import {
  reportPreview,
  closeReportPreview
} from './support/reportDownload';
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
  mockSettlement,
  settlementFixture,
  settlementId,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/banking/monthly`;

test('수납 요약 도움말은 음수 이월과 신규 청구·선입금 충당·당월 미수를 구분', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page, undefined, 0, () => {
    const data = settlementFixture();
    data.payments.charges[0].amount = '50000';
    data.payments.charges[1].amount = '1000000';
    data.payments.payments = [{
      ...data.payments.payments[1],
      amount: '50000'
    }];
    data.payments.openingCredits = [{
      id: settlementId(999),
      unitId: data.payments.units[0].id,
      date: '2026-09-30',
      amount: '200000',
      allocations: []
    }];
    return data;
  });
  await page.goto(`${BASE}?month=2026-10`);
  await expect(page.getByRole('article', {
    name: '전월 이월액 -150,000원',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('article', {
    name: '당월 청구 납부반영액 200,000원',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('article', {
    name: '당월 청구 미수금 800,000원',
    exact: true
  })).toBeVisible();
  for (const [label, text] of [
    ['전월 이월액', '전월 말 미납 잔액에서 선입금 잔액을 뺀 금액입니다.'],
    ['당월 관리비 발생액', '이번 달에 새로 부과한 관리비 청구액의 합계입니다.'],
    ['당월 청구 납부반영액', '이전 선입금으로 충당한 금액도 포함하며'],
    ['당월 청구 미수금', '이전 달 미납은 포함하지 않습니다.']
  ]) {
    await page.getByRole('button', {
      name: `${label} 도움말`,
      exact: true
    }).click();
    await expect(page.getByRole('tooltip')).toContainText(text);
    await page.keyboard.press('Escape');
  }
});

test('모바일 수납 상태는 한 줄에서 가로 이동하고 필터 아래 다운로드를 열 수 있음', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await mockSettlement(page);
  await page.goto(BASE);
  const tabs = page.getByRole('group', {
    name: '수납 상태',
    exact: true
  });
  await expect(tabs).toBeVisible();
  const positions = await tabs.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
  expect(new Set(positions).size).toBe(1);
  await tabs.getByRole('button', {
    name: /납부완료/
  }).click();
  expect(await tabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await tabs.getByRole('button', {
    name: /전체/
  }).click();
  const download = page.getByRole('button', {
    name: '다운로드',
    exact: true
  });
  await download.scrollIntoViewIfNeeded();
  await expect(download).toBeInViewport();
  await download.click();
  await expect(page).toHaveURL(/\/banking\/monthly\/download/);
  await expect(reportPreview(page).getByRole('button', {
    name: 'Excel 다운로드',
    exact: true
  })).toBeVisible();
});

for (const format of ['PDF', '이미지 (PNG)'] as const) {
  test(`getOrInsertComputed가 없는 환경에서도 ${format} 미리보기와 다운로드를 제공`, async ({ page }) => {
    // 앱에서 확인한 구형 엔진의 Map API 부재를 문서와 별도 전역을 사용하는 Worker 모두에 재현합니다.
    const removeMapMethods = `
      for (const prototype of [Map.prototype, WeakMap.prototype]) {
        Reflect.deleteProperty(prototype, 'getOrInsert');
        Reflect.deleteProperty(prototype, 'getOrInsertComputed');
      }
    `;
    await page.addInitScript(removeMapMethods);
    let workerLoaded = false;
    await page.route('**/pdf.worker*.mjs', async (route) => {
      const response = await route.fetch();
      workerLoaded = true;
      await route.fulfill({
        response,
        body: `${removeMapMethods}\n${await response.text()}`
      });
    });
    await page.setViewportSize({
      width: 390,
      height: 844
    });
    await mockSettlement(page);
    await page.goto(BASE);
    expect(await page.evaluate(() => 'getOrInsertComputed' in Map.prototype)).toBe(false);
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    const modal = reportPreview(page);
    await modal.getByRole('radio', {
      name: format,
      exact: true
    }).check();
    const isPdf = format === 'PDF';
    await expect(modal.getByRole('img', {
      name: isPdf ? 'PDF 1페이지 미리보기' : '이미지 1페이지 미리보기',
      exact: true
    })).toBeVisible();
    const ready = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: isPdf ? 'PDF 다운로드' : '이미지 다운로드',
      exact: true
    }).click();
    const download = await ready;
    const bytes = new Uint8Array(await readFile((await download.path())!));
    if (isPdf) expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    else expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(workerLoaded).toBe(true);
    await expect(modal.getByRole('alert')).toHaveCount(0);
  });
}

for (const status of ['미납', '납부완료'] as const) {
  test(`${status} 시안 보고서는 필요한 6개 열과 큰 조회 월·표 글씨를 Excel·PDF·PNG에 반영`, async ({ page }, testInfo) => {
    const fixture = () => {
      const data = settlementFixture();
      data.payments.units = [{
        ...data.payments.units[0],
        label: '103동 201호',
        buildingName: '103동',
        representativeName: '구영아',
      }];
      data.payments.charges = [data.payments.charges.find((charge) => charge.month === '2026-10')!];
      data.payments.payments = status === '미납' ? [] : [{
        ...data.payments.payments[2],
        amount: '50000',
      }];
      return data;
    };
    await mockSettlement(page, undefined, 0, fixture);
    await page.route('http://localhost:8080/api/properties/*/access-context', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        propertyId: SETTLEMENT_PROPERTY,
        name: '드림하이츠',
        role: 'ADMIN',
        residentEligible: false
      }),
    }));
    await page.goto(BASE);
    await expect(page.getByRole('columnheader', {
      name: '최근 입금자',
      exact: true
    })).toHaveCount(0);
    await page.getByRole('group', {
      name: '수납 상태'
    }).getByRole('button', {
      name: new RegExp(`^${status}`)
    }).click();
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    const modal = reportPreview(page);
    await expect(modal.getByRole('heading', {
      name: '드림하이츠 월별 수납 현황',
      exact: true
    })).toBeVisible();
    await expect(modal.getByRole('columnheader')).toHaveCount(6);
    for (const label of ['최근 입금자', '선입금 잔액', status === '미납' ? '당월 수납 반영액' : '미수금 잔액']) {
      await expect(modal.getByRole('columnheader', {
        name: label,
        exact: true
      })).toHaveCount(0);
    }
    const excelReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'Excel 다운로드',
      exact: true
    }).click();
    const excel = await excelReady;
    const workbook = unzipSync(new Uint8Array(await readFile((await excel.path())!)));
    const xml = Object.entries(workbook).filter(([name]) => name.endsWith('.xml')).map(([, value]) => strFromU8(value)).join('');
    expect(xml).toContain('드림하이츠 월별 수납 현황');
    expect(xml).not.toContain('선입금 잔액');
    expect(xml).not.toContain('최근 입금자');
    if (status === '납부완료') expect(xml).not.toContain('미수금 잔액');
    await modal.getByRole('radio', {
      name: 'PDF',
      exact: true
    }).check();
    await expect(modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    })).toBeVisible();
    const pdfReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    }).click();
    const pdfDownload = await pdfReady;
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(await readFile((await pdfDownload.path())!))
    });
    const pdf = await task.promise;
    expect(pdf.numPages).toBe(1);
    const items = (await (await pdf.getPage(1)).getTextContent()).items.filter((item) => 'str' in item);
    expect(items.find((item) => item.str === '2026년 10월')?.height).toBeGreaterThanOrEqual(18);
    expect(items.find((item) => item.str === '구영아')?.height).toBeGreaterThanOrEqual(14.5);
    const bodyAmounts = items.filter((item) => item.str === '50,000원' && item.height > 14.4 && item.height < 14.6);
    const totalAmounts = items.filter((item) => item.str === '50,000원' && item.height > 15.4 && item.height < 15.6);
    expect(bodyAmounts).toHaveLength(2);
    expect(totalAmounts).toHaveLength(2);
    for (const body of bodyAmounts) {
      const bodyRight = body.transform[4] + body.width;
      const closestTotal = Math.min(...totalAmounts.map((total) => Math.abs(total.transform[4] + total.width - bodyRight)));
      expect(closestTotal).toBeLessThan(1);
    }
    const text = items.map((item) => item.str).join(' ');
    expect(text).toContain('50,000원');
    expect(text).not.toContain('선입금 잔액');
    expect(text).not.toContain('최근 입금자');
    if (status === '납부완료') expect(text).not.toContain('미수금 잔액');
    await task.destroy();
    await modal.getByRole('radio', {
      name: '이미지 (PNG)',
      exact: true
    }).check();
    await expect(modal.getByRole('img', {
      name: '이미지 1페이지 미리보기',
      exact: true
    })).toBeVisible();
    const pngReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: '이미지 다운로드',
      exact: true
    }).click();
    const png = await pngReady;
    await png.saveAs(testInfo.outputPath(`monthly-redesign-${status}.png`));
    expect(png.suggestedFilename()).toBe(`드림하이츠_수납현황_2026-10_${status}.png`);
  });
}

/** 목록 한 페이지보다 많은 실제 청구 세대를 준비해 마지막 세대까지 파일에 남는지 확인합니다. */
function reportFixture() {
  const data = settlementFixture();
  for (let index = 0; index < 35; index++) {
    const unitId = settlementId(400 + index);
    const buildingName = `${102 + index % 2}동`;
    data.payments.units.push({
      id: unitId,
      label: `${buildingName} ${201 + index}호`,
      buildingName,
      representativeName: `대표 ${index + 1}`,
      status: 'ACTIVE',
    });
    data.payments.charges.push({
      id: settlementId(700 + index),
      unitId,
      month: '2026-10',
      amount: '10000',
      status: 'ISSUED',
    });
  }
  return data;
}

for (const width of [1440, 390]) {
  test(`${width}px 월별 수납은 빌라 이름으로 Excel·가로 PDF·전체 PNG 미리보기와 다운로드를 제공`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({
      width,
      height: 950,
    });
    await mockSettlement(page, undefined, 0, reportFixture);
    await page.goto(BASE);
    await expect(page.getByRole('table', {
      name: '세대별 월별 수납 현황',
    }).getByRole('rowheader')).toHaveCount(10);
    const opener = page.getByRole('button', {
      name: '다운로드',
      exact: true,
    });
    const filterBox = await page.getByRole('combobox', {
      name: '수납 현황 동 필터',
      exact: true
    }).boundingBox();
    const buttonBox = await opener.boundingBox();
    const editBox = await page.getByRole('button', {
      name: '편집',
      exact: true
    }).boundingBox();
    const tableBox = await page.getByRole('table', {
      name: '세대별 월별 수납 현황',
      exact: true
    }).boundingBox();
    expect(buttonBox!.y).toBeGreaterThanOrEqual(filterBox!.y + filterBox!.height);
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(tableBox!.y);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(editBox!.x);
    await opener.click();
    const modal = reportPreview(page);
    await expect(modal.getByRole('heading', {
      name: '모아빌라 월별 수납 현황',
      exact: true,
    })).toBeVisible();
    await expect(modal.getByText('102동 235호', {
      exact: true,
    })).toBeVisible();
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    const excelReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'Excel 다운로드',
      exact: true
    }).click();
    const excel = await excelReady;
    expect(excel.suggestedFilename()).toBe('모아빌라_수납현황_2026-10_전체.xlsx');
    const workbook = unzipSync(new Uint8Array(await readFile((await excel.path())!)));
    const xml = Object.entries(workbook).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
    expect(xml).toContain('모아빌라 월별 수납 현황');
    expect(xml).toContain('102동 235호');
    expect(xml).not.toContain('모아홈 월별 수납 현황');

    await modal.getByRole('radio', {
      name: 'PDF',
      exact: true
    }).check();
    await expect(modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    })).toBeVisible({
      timeout: 30000
    });
    const pdfReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    }).click();
    const pdfDownload = await pdfReady;
    expect(pdfDownload.suggestedFilename()).toBe('모아빌라_수납현황_2026-10_전체.pdf');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(await readFile((await pdfDownload.path())!)),
      useSystemFonts: false,
    });
    const pdf = await task.promise;
    expect(pdf.numPages).toBeGreaterThan(1);
    const pageCount = pdf.numPages;
    const text: string[] = [];
    for (let index = 1; index <= pageCount; index++) {
      const pdfPage = await pdf.getPage(index);
      expect(pdfPage.view[2]).toBeGreaterThan(pdfPage.view[3]);
      text.push((await pdfPage.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' '));
    }
    expect(text.join(' ')).toContain('모아빌라 월별 수납 현황');
    expect(text.join(' ')).toContain('102동 235호');
    expect(text.join(' ')).not.toContain('모아홈 월별 수납 현황');
    await task.destroy();

    await modal.getByRole('radio', {
      name: '이미지 (PNG)',
      exact: true
    }).check();
    await expect(modal.getByRole('img', {
      name: '이미지 1페이지 미리보기',
      exact: true
    })).toBeVisible({
      timeout: 30000
    });
    const zipReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: '이미지 다운로드',
      exact: true
    }).click();
    const zip = await zipReady;
    expect(zip.suggestedFilename()).toBe('모아빌라_수납현황_2026-10_전체.zip');
    const images = unzipSync(new Uint8Array(await readFile((await zip.path())!)));
    expect(Object.keys(images)).toHaveLength(pageCount);
    for (const [name, bytes] of Object.entries(images)) {
      expect(name).toMatch(/^모아빌라_수납현황_2026-10_전체_\d{2}\.png$/);
      const png = Buffer.from(bytes);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBeGreaterThan(png.readUInt32BE(20));
    }
    await closeReportPreview(page);
    await expect(modal).toHaveCount(0);
    if (width >= 768) await expect(opener).toBeFocused();
  });
}

test('검색으로 좁힌 세대만 PDF에 저장하며 새로 열면 최신 필터와 이름을 사용한다', async ({ page }) => {
  await mockSettlement(page, undefined, 0, reportFixture);
  await page.goto(BASE);
  await page.getByRole('textbox', {
    name: '수납 현황 세대 검색'
  }).fill('235');
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const modal = reportPreview(page);
  await expect(modal.getByText('102동 235호', {
    exact: true
  })).toBeVisible();
  await expect(modal.getByText('103동 202호', {
    exact: true
  })).toHaveCount(0);
  await modal.getByRole('radio', {
    name: 'PDF',
    exact: true
  }).check();
  await expect(modal.getByRole('img', {
    name: 'PDF 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  const ready = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: 'PDF 다운로드',
    exact: true
  }).click();
  const download = await ready;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(await readFile((await download.path())!))
  });
  const pdf = await task.promise;
  expect(pdf.numPages).toBe(1);
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
  expect(text).toContain('102동 235호');
  expect(text).not.toContain('103동 202호');
  await task.destroy();
  await modal.getByRole('button', {
    name: '다운로드 미리보기 닫기'
  }).click();
  await page.getByRole('textbox', {
    name: '수납 현황 세대 검색'
  }).fill('202');
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  await expect(modal.getByText('103동 202호', {
    exact: true
  })).toBeVisible();
  await expect(modal.getByText('102동 235호', {
    exact: true
  })).toHaveCount(0);
});

test('빈 결과는 안내와 0건 보고서를 제공하고 PDF 실패는 재시도 뒤 PNG로 저장한다', async ({ page }) => {
  await mockSettlement(page);
  let fail = true;
  await page.route('**/fonts/pretendard/*.ttf', (route) => fail ? route.fulfill({
    status: 503,
    body: 'unavailable'
  }) : route.continue());
  await page.goto(BASE);
  await page.getByRole('textbox', {
    name: '수납 현황 세대 검색'
  }).fill('없는세대');
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const modal = reportPreview(page);
  await expect(modal.getByText('조회 조건에 맞는 내역이 없습니다.', {
    exact: true
  })).toBeVisible();
  await modal.getByRole('radio', {
    name: 'PDF',
    exact: true
  }).check();
  await expect(modal.getByRole('alert')).toContainText('PDF 파일을 만들지 못했어요.');
  await expect(modal.getByRole('button', {
    name: 'PDF 다운로드',
    exact: true
  })).toBeDisabled();
  fail = false;
  await modal.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(modal.getByRole('img', {
    name: 'PDF 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  await modal.getByRole('radio', {
    name: '이미지 (PNG)',
    exact: true
  }).check();
  await expect(modal.getByRole('img', {
    name: '이미지 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  const ready = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: '이미지 다운로드',
    exact: true
  }).click();
  expect((await ready).suggestedFilename()).toBe('모아빌라_수납현황_2026-10_전체.png');
});

test('선입금 보고서는 이월·당월 발생 열 없이 차감 후 잔액만 PDF·이미지로 저장', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const fixture = () => {
    const data = settlementFixture();
    const names = ['예시 주민 1', '예시 주민 2'];
    const units = names.map((name, index) => ({
      ...data.payments.units[0],
      id: settlementId(9000 + index),
      label: `102동 ${201 + index}호`,
      buildingName: '102동',
      representativeName: name
    }));
    data.payments.units = units;
    data.payments.charges = [1].map((index) => ({
      id: settlementId(9100 + index),
      unitId: units[index].id,
      month: '2026-10',
      amount: '50000',
      status: 'ISSUED' as const
    }));
    data.payments.payments = [1].map((index) => ({
      ...data.payments.payments[2],
      id: settlementId(9200 + index),
      unitId: units[index].id,
      status: 'CONFIRMED' as const,
      date: '2026-10-10',
      amount: ['50000', '70000', '0', '120000', '150000', '30000'][index],
      allocations: []
    }));
    data.payments.openingCredits = [{
      id: settlementId(9300),
      unitId: units[0].id,
      date: '2026-09-30',
      amount: '100000',
      allocations: []
    }];
    return data;
  };
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await mockSettlement(page, undefined, 0, fixture);
  await page.goto(BASE);
  const tabs = page.getByRole('group', {
    name: '수납 상태'
  });
  await expect(tabs.getByRole('button')).toHaveText(['전체 (2)', '미납 (0)', '일부납부 (0)', '선입금 (2)', '납부완료 (1)']);
  await tabs.getByRole('button', {
    name: '선입금 (2)',
    exact: true
  }).click();
  const table = page.getByRole('table', {
    name: '세대별 월별 수납 현황'
  });
  await expect(table.getByRole('columnheader')).toHaveText(['세대', '세대 대표', '선입금 잔액', '상태', '최근 입금일']);
  await expect(table.getByRole('row').filter({
    hasText: '102동 202호'
  })).toContainText('20,000원');
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const modal = reportPreview(page);
  await expect(modal.getByRole('columnheader')).toHaveText(['세대', '세대 대표', '선입금 잔액', '상태']);
  await modal.getByRole('radio', {
    name: 'PDF',
    exact: true
  }).check();
  await expect(modal.getByRole('img', {
    name: 'PDF 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  const pdfReady = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: 'PDF 다운로드',
    exact: true
  }).click();
  const download = await pdfReady;
  await download.saveAs(testInfo.outputPath('prepaid-report.pdf'));
  await download.saveAs('/tmp/moahome-prepaid-report.pdf');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(await readFile((await download.path())!))
  });
  const pdf = await task.promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.filter((item) => 'str' in item).map((item) => item.str).join(' ');
  expect(text).toContain('선입금 잔액');
  expect(text).toContain('20,000원');
  expect(text).not.toContain('전월 이월액');
  expect(text).not.toContain('당월 발생액');
  await task.destroy();
  await modal.getByRole('radio', {
    name: '이미지 (PNG)',
    exact: true
  }).check();
  await expect(modal.getByRole('img', {
    name: '이미지 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  const pngReady = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: '이미지 다운로드',
    exact: true
  }).click();
  const png = await pngReady;
  await png.saveAs(testInfo.outputPath('prepaid-report.png'));
  await png.saveAs('/tmp/moahome-prepaid-report.png');
});

for (const width of [1440]) {
  test(`선택 수납 다운로드 ${width}px는 페이지 간 선택을 유지하고 선택한 세대만 Excel·PDF·PNG에 담는다`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({
      width,
      height: 1000
    });
    const fixture = () => {
      const data = settlementFixture();
      const source = data.payments.units[0];
      data.payments.units = Array.from({
        length: 20
      }, (_, index) => ({
        ...source,
        id: settlementId(10000 + index),
        label: `102동 ${201 + index}호`,
        buildingName: '102동',
        representativeName: `주민 ${index + 1}`
      }));
      data.payments.charges = data.payments.units.map((unit, index) => ({
        id: settlementId(12000 + index),
        unitId: unit.id,
        month: '2026-10',
        amount: '50000',
        status: 'ISSUED' as const
      }));
      data.payments.payments = [];
      data.payments.openingCredits = [];
      return data;
    };
    await mockSettlement(page, undefined, 0, fixture);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes(`/api/properties/${SETTLEMENT_PROPERTY}/`)) writes.push(request.url());
    });
    await page.goto(BASE);
    const table = page.getByRole('table', {
      name: '세대별 월별 수납 현황'
    });
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    const downloadButton = page.getByRole('button', {
      name: '선택 다운로드',
      exact: true
    });
    await expect(downloadButton).toBeDisabled();
    await table.getByRole('row').filter({
      hasText: '102동 201호'
    }).click();
    await table.getByRole('checkbox', {
      name: '102동 202호 선택',
      exact: true
    }).check();
    await expect(table.getByRole('checkbox', {
      name: '현재 페이지 세대 전체 선택'
    })).toHaveJSProperty('indeterminate', true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', {
      name: '2페이지',
      exact: true
    }).click();
    await table.getByRole('checkbox', {
      name: '102동 212호 선택',
      exact: true
    }).check();
    await table.getByRole('checkbox', {
      name: '현재 페이지 세대 전체 선택'
    }).check();
    await expect(page.getByRole('status')).toHaveText('12세대 선택');
    await table.getByRole('checkbox', {
      name: '현재 페이지 세대 전체 선택'
    }).uncheck();
    await expect(page.getByRole('status')).toHaveText('2세대 선택');
    await table.getByRole('checkbox', {
      name: '102동 212호 선택',
      exact: true
    }).check();
    await page.getByRole('button', {
      name: '1페이지',
      exact: true
    }).click();
    await expect(table.getByRole('checkbox', {
      name: '102동 201호 선택',
      exact: true
    })).toBeChecked();
    await expect(page.getByRole('status')).toHaveText('3세대 선택');
    await page.evaluate(() => window.scrollTo({
      top: 0,
      behavior: 'instant'
    }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await downloadButton.click();
    const modal = reportPreview(page);
    for (const label of ['102동 201호', '102동 202호', '102동 212호']) await expect(modal.getByText(label, {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('102동 203호', {
      exact: true
    })).toHaveCount(0);
    await expect(modal).toContainText('선택 3세대');
    const excelReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'Excel 다운로드',
      exact: true
    }).click();
    const excel = await excelReady;
    await excel.saveAs(`/tmp/moahome-monthly-selection-${width}.xlsx`);
    expect(excel.suggestedFilename()).toBe('모아빌라_수납현황_2026-10_전체_선택3세대.xlsx');
    const files = unzipSync(new Uint8Array(await readFile((await excel.path())!)));
    const xml = Object.values(files).map((file) => strFromU8(file)).join('');
    for (const label of ['102동 201호', '102동 202호', '102동 212호']) expect(xml).toContain(label);
    expect(xml).not.toContain('102동 203호');
    await modal.getByRole('radio', {
      name: 'PDF',
      exact: true
    }).check();
    await expect(modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    })).toBeVisible({
      timeout: 30000
    });
    const pdfReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    }).click();
    const pdf = await pdfReady;
    await pdf.saveAs(`/tmp/moahome-monthly-selection-${width}.pdf`);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(await readFile((await pdf.path())!)),
      useSystemFonts: true
    });
    const document = await task.promise;
    const pages: string[] = [];
    const pageCount = document.numPages;
    for (let index = 1; index <= pageCount; index++) {
      pages.push((await (await document.getPage(index)).getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' '));
    }
    const text = pages.join(' ');
    await task.destroy();
    for (const label of ['102동 201호', '102동 202호', '102동 212호']) expect(text).toContain(label);
    expect(text).not.toContain('102동 203호');
    expect(text).toContain('150,000');
    await modal.getByRole('radio', {
      name: '이미지 (PNG)',
      exact: true
    }).check();
    const pngReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: '이미지 다운로드',
      exact: true
    }).click();
    const png = await pngReady;
    expect(png.suggestedFilename()).toBe(`모아빌라_수납현황_2026-10_전체_선택3세대.${pageCount > 1 ? 'zip' : 'png'}`);
    const bytes = new Uint8Array(await readFile((await png.path())!));
    const images = pageCount > 1 ? Object.values(unzipSync(bytes)) : [bytes];
    expect(images).toHaveLength(pageCount);
    for (const image of images) expect(Array.from(image.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await closeReportPreview(page);
    await page.getByRole('textbox', {
      name: '수납 현황 세대 검색'
    }).fill('201');
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '다운로드',
      exact: true
    })).toBeEnabled();
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await expect(page.getByRole('status')).toHaveText('0세대 선택');
    await table.getByRole('checkbox', {
      name: '102동 201호 선택',
      exact: true
    }).check();
    await page.getByRole('button', {
      name: '완료',
      exact: true
    }).click();
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
