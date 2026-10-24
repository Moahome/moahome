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
  settlementDetailFixture,
  settlementId,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/banking/balances`;

for (const width of [1440, 390]) {
  test(`다운로드 ${width}px 모달은 Excel 전체 명세와 실제 PDF 페이지를 미리보고 같은 월의 파일을 저장`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({
      width,
      height: 900
    });
    const requested = await mockSettlement(page, undefined, 51, () => {
      const data = settlementDetailFixture();
      for (let index = 1; index <= 51; index++) data.balances.entries.push({
        id: settlementId(700 + index),
        buildingId: settlementId(3),
        date: '2026-10-18',
        time: null,
        label: `추가 입금 ${index}`,
        income: '50000',
        expense: '0'
      });
      return data;
    });
    await page.goto(`${BASE}?month=2026-10`);

    const opener = page.getByRole('button', {
      name: '다운로드',
      exact: true
    });
    await opener.click();
    const modal = page.getByRole('dialog', {
      name: '2026년 10월 동별 입출금 내역',
      exact: true
    });
    await expect(modal).toBeVisible();
    const bounds = await modal.boundingBox();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.y + bounds!.height / 2 - 450)).toBeLessThanOrEqual(1);
    await expect(modal.getByRole('combobox', {
      name: '조회 동',
      exact: true
    })).toHaveText('전체 동');
    await expect(modal.getByRole('columnheader', {
      name: '입금액',
      exact: true
    })).toBeVisible();
    await expect(modal.getByRole('columnheader', {
      name: '지출액',
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('추가 입금 51', {
      exact: true
    })).toBeVisible();
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`download-excel-${width}.png`)
    });
    const pdfRadio = modal.getByRole('radio', {
      name: 'PDF',
      exact: true
    });
    await pdfRadio.check();
    const firstPage = modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    });
    await expect(firstPage).toBeVisible({
      timeout: 30000
    });
    const pdfBounds = await firstPage.boundingBox();
    const pdfNextBounds = await modal.getByRole('button', {
      name: 'PDF 다음 페이지',
      exact: true
    }).boundingBox();
    expect(pdfNextBounds!.y).toBeGreaterThanOrEqual(pdfBounds!.y + pdfBounds!.height);
    await expect(modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath(`download-pdf-${width}.png`)
    });
    await modal.getByRole('button', {
      name: 'PDF 다음 페이지',
      exact: true
    }).click();
    await expect(modal.getByRole('img', {
      name: 'PDF 2페이지 미리보기',
      exact: true
    })).toBeVisible();
    const downloadReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10.pdf');
    await download.saveAs(testInfo.outputPath('settlement.pdf'));
    const bytes = new Uint8Array(await readFile((await download.path())!));
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    // 내려받은 실제 PDF의 텍스트·페이지를 검사해 한글과 화면 필터 밖의 마지막 행까지 보존되는지 확인합니다.
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfTask = getDocument({
      data: bytes,
      useSystemFonts: false
    });
    const document = await pdfTask.promise;
    expect(document.numPages).toBeGreaterThan(1);
    const text: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const pdfPage = await document.getPage(index);
      expect(pdfPage.view[2]).toBeLessThan(pdfPage.view[3]);
      const content = await pdfPage.getTextContent();
      text.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
    }
    const combined = text.join(' ');
    expect(combined).toContain('모아홈 동별 입출금 내역');
    expect(combined).toContain('추가 입금 51');
    expect(combined).toContain('전기요금 부담');
    expect(combined).not.toContain('월말 점검');
    expect(combined).toContain('기초 잔액');
    expect(combined).toContain('월말 잔액');
    expect(combined).not.toContain('마감 미확정');
    expect(combined).toContain('거래일 기준 오름차순');
    expect(combined).toContain('(한국시간)');
    expect(combined).not.toContain('2026-10-31T14:30:00Z');
    const collectionPages = text.filter((value) => value.includes('모아홈 동별 입출금 내역'));
    expect(collectionPages.length).toBe(4);
    expect(text[3]).not.toContain('조회 대상');
    for (const value of collectionPages) {
      expect(value).toContain('입금액');
      expect(value).toContain('지출액');
    }
    await pdfTask.destroy();
    await modal.getByRole('radio', {
      name: 'Excel',
      exact: true
    }).check();
    await expect(modal.getByText('추가 입금 51', {
      exact: true
    })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(requested).toEqual(['2026-10']);
  });
}

test('PDF 생성 실패는 다운로드를 막고 재시도하며 Excel 미리보기·닫기는 계속 사용 가능', async ({ page }) => {
  await mockSettlement(page);
  let fail = true;
  await page.route('**/fonts/pretendard/*.ttf', (route) => fail
    ? route.fulfill({
      status: 503,
      body: 'unavailable'
    }) : route.continue());
  await page.goto(`${BASE}?month=2026-10`);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('radio', {
    name: 'PDF',
    exact: true
  }).check();
  await expect(modal.getByRole('alert')).toHaveText('PDF 파일을 만들지 못했어요. 다시 시도해주세요.');
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
  })).toBeVisible({
    timeout: 30000
  });
  await expect(modal.getByRole('button', {
    name: 'PDF 다운로드',
    exact: true
  })).toBeEnabled();
  await modal.getByRole('radio', {
    name: 'Excel',
    exact: true
  }).check();
  await expect(modal.getByRole('table')).toBeVisible();
  await modal.getByRole('button', {
    name: '취소',
    exact: true
  }).click();
  await expect(modal).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`다운로드 동 필터 ${width}px는 Excel·PDF의 미리보기와 실제 파일·합계를 같은 동으로 제한`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({
      width,
      height: 900
    });
    const requested = await mockSettlement(page, undefined, 0, () => {
      const data = settlementDetailFixture();
      data.balances.entries.push({
        id: settlementId(910),
        buildingId: settlementId(203),
        date: '2026-10-20',
        time: null,
        label: '103동 청소비',
        income: '0',
        expense: '6000'
      });
      return data;
    });
    let holdFonts = false;
    let releaseFonts = () => {};
    const gate = new Promise<void>((resolve) => { releaseFonts = resolve; });
    await page.route('**/fonts/pretendard/*.ttf', async (route) => {
      if (holdFonts) await gate;
      await route.continue();
    });
    await page.goto(`${BASE}?month=2026-10`);
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    const modal = page.getByRole('dialog');
    const filter = modal.getByRole('combobox', {
      name: '조회 동',
      exact: true
    });
    await expect(filter).toHaveText('전체 동');
    await filter.click();
    await expect(page.getByRole('option')).toHaveText(['전체 동', '2동', '10동', '102동', '103동']);
    await page.getByRole('option', {
      name: '103동',
      exact: true
    }).click();
    await expect(modal.getByRole('table').locator('tbody tr td:first-child')).toHaveText(['103동', '103동', '선택 범위 합계']);
    await expect(modal.getByText('103동 청소비', {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('102동 101호 관리비', {
      exact: true
    })).toHaveCount(0);
    const excelReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'Excel 다운로드',
      exact: true
    }).click();
    const excel = await excelReady;
    expect(excel.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10_103동.xlsx');
    const archive = unzipSync(await readFile((await excel.path())!));
    const xml = Object.entries(archive).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
    expect(xml).toContain('103동 청소비');
    expect(xml).not.toContain('102동 101호 관리비');
    await page.screenshot({
      path: testInfo.outputPath(`building-filter-excel-${width}.png`)
    });
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
    expect(pdf.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10_103동.pdf');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(await readFile((await pdf.path())!)),
      useSystemFonts: false
    });
    const document = await task.promise;
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
    expect(text).toContain('103동 청소비');
    expect(text).toContain('6,000원');
    expect(text).not.toContain('102동 101호 관리비');
    await task.destroy();
    await page.screenshot({
      path: testInfo.outputPath(`building-filter-pdf-${width}.png`)
    });
    holdFonts = true;
    await filter.click();
    await page.getByRole('option', {
      name: '102동',
      exact: true
    }).click();
    // 새 동 PDF를 만드는 동안 이전 동의 미리보기와 파일을 내려받을 수 없어야 합니다.
    await expect(modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    })).toBeDisabled();
    await expect(modal.getByRole('img')).toHaveCount(0);
    releaseFonts();
    await expect(modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    })).toBeVisible({
      timeout: 30000
    });
    await modal.getByRole('radio', {
      name: 'Excel',
      exact: true
    }).check();
    await expect(filter).toHaveText('102동');
    await expect(modal.getByText('102동 101호 관리비', {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('103동 청소비', {
      exact: true
    })).toHaveCount(0);
    await filter.click();
    await page.getByRole('option', {
      name: '전체 동',
      exact: true
    }).click();
    await expect(modal.getByText('103동 청소비', {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('102동 101호 관리비', {
      exact: true
    })).toBeVisible();
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(requested).toEqual(['2026-10']);
  });
}

for (const width of [1440, 390]) {
  test(`동·계좌 조합 ${width}px는 Excel·PDF와 합계에 같은 범위를 적용하고 계좌 변경 시 이전 PDF를 제거`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({
      width,
      height: 900
    });
    await mockSettlement(page, undefined, 0, () => {
      const data = settlementDetailFixture();
      data.balances.entries.push(
        {
          id: settlementId(920),
          buildingId: settlementId(203),
          accountId: settlementId(201),
          date: '2026-10-20',
          time: null,
          label: '103동 카카오 입금',
          income: '9000',
          expense: '0'
        },
        {
          id: settlementId(921),
          buildingId: settlementId(203),
          accountId: settlementId(2),
          date: '2026-10-20',
          time: null,
          label: '103동 하나 지출',
          income: '0',
          expense: '6000'
        }
      );
      data.payments.accounts.push({
        id: settlementId(930),
        label: '숨겨진 예전 통장'
      });
      return data;
    });
    let holdFonts = false;
    let releaseFonts = () => {};
    const gate = new Promise<void>((resolve) => { releaseFonts = resolve; });
    await page.route('**/fonts/pretendard/*.ttf', async (route) => {
      if (holdFonts) await gate;
      await route.continue();
    });
    await page.goto(`${BASE}?month=2026-10`);
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    const modal = page.getByRole('dialog');
    const buildings = modal.getByRole('combobox', {
      name: '조회 동',
      exact: true
    });
    const accounts = modal.getByRole('combobox', {
      name: '조회 계좌',
      exact: true
    });
    await expect(accounts).toHaveText('전체 계좌');
    await buildings.click();
    await page.getByRole('option', {
      name: '103동',
      exact: true
    }).click();
    await accounts.click();
    await expect(page.getByRole('option', {
      name: '숨겨진 예전 통장',
      exact: true
    })).toHaveCount(0);
    await page.getByRole('option', {
      name: '카카오뱅크 ····1004',
      exact: true
    }).click();
    await expect(modal.getByText('103동 카카오 입금', {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('103동 하나 지출', {
      exact: true
    })).toHaveCount(0);
    const excelReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'Excel 다운로드',
      exact: true
    }).click();
    const excel = await excelReady;
    expect(excel.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10_103동_카카오뱅크 ····1004.xlsx');
    const files = unzipSync(await readFile((await excel.path())!));
    const xml = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
    expect(xml).toContain('103동 카카오 입금');
    expect(xml).not.toContain('103동 하나 지출');
    expect(xml).not.toContain('102동 101호 관리비');
    await page.screenshot({
      path: testInfo.outputPath(`download-filters-excel-${width}.png`)
    });
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
    expect(pdf.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10_103동_카카오뱅크 ····1004.pdf');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(await readFile((await pdf.path())!)),
      useSystemFonts: false
    });
    const document = await task.promise;
    const content = await (await document.getPage(1)).getTextContent();
    const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
    expect(text).toContain('103동 카카오 입금');
    expect(text).toContain('9,000원');
    expect(text).not.toContain('103동 하나 지출');
    await task.destroy();
    await page.screenshot({
      path: testInfo.outputPath(`download-filters-pdf-${width}.png`)
    });
    holdFonts = true;
    await accounts.click();
    await page.getByRole('option', {
      name: '하나은행 ····1234',
      exact: true
    }).click();
    await expect(modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    })).toBeDisabled();
    await expect(modal.getByRole('img')).toHaveCount(0);
    releaseFonts();
    await expect(modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    })).toBeVisible({
      timeout: 30000
    });
    await modal.getByRole('radio', {
      name: 'Excel',
      exact: true
    }).check();
    await expect(buildings).toHaveText('103동');
    await expect(accounts).toHaveText('하나은행 ····1234');
    await expect(modal.getByText('103동 하나 지출', {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('103동 카카오 입금', {
      exact: true
    })).toHaveCount(0);
    await buildings.click();
    await page.getByRole('option', {
      name: '전체 동',
      exact: true
    }).click();
    await accounts.click();
    await page.getByRole('option', {
      name: '전체 계좌',
      exact: true
    }).click();
    await expect(modal.getByText('103동 하나 지출', {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('103동 카카오 입금', {
      exact: true
    })).toBeVisible();
    await expect(modal.getByText('102동 101호 관리비', {
      exact: true
    })).toBeVisible();
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}


test('기존 응답도 계좌 잔액을 확인해 표시하고 9월 PDF는 1일부터 30일까지 잔액을 누적하며 17건을 한 페이지에 출력', async ({ page }, testInfo) => {
  const fixture = () => {
    const data = settlementFixture();
    data.month = '2026-09';
    data.balances.month = data.month;
    data.generatedAt = '2026-10-24T03:00:00Z';
    data.balances.cutoffDate = '2026-08-31';
    data.balances.entries.forEach((row, index) => { row.date = `2026-09-${String([7, 30, 11][index]).padStart(2, '0')}`; });
    const days = [1, 2, 3, 4, 5, 6, 8, 9, 12, 14, 18, 22, 25, 28];
    days.forEach((day, index) => data.balances.entries.push({
      id: settlementId(960 + index),
      buildingId: settlementId(3),
      accountId: settlementId(2),
      date: `2026-09-${String(day).padStart(2, '0')}`,
      time: '09:00:00',
      label: `예시 ${index % 2 ? '지출' : '입금'} ${index + 1}`,
      income: index % 2 ? '0' : '1000',
      expense: index % 2 ? '1000' : '0'
    }));
    data.balances.buildings[0].income = '47000';
    data.balances.buildings[0].expense = '19000';
    delete data.balances.buildings[0].accountBalances;
    return data;
  };
  await mockSettlement(page, undefined, 0, fixture);
  await page.route('http://localhost:8080/api/properties/*/banking/balances?*', async (route) => {
    if (!new URL(route.request().url()).searchParams.has('accountId')) return route.fallback();
    const balances = fixture().balances;
    balances.accountId = settlementId(2);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify(balances)
    });
  });
  await page.goto(`${BASE}?month=2026-09`);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('combobox', {
    name: '조회 계좌',
    exact: true
  }).click();
  await modal.getByRole('option', {
    name: '하나은행 ····1234',
    exact: true
  }).click();
  await expect(modal.getByText('설정 필요', {
    exact: true
  })).toHaveCount(0);
  await expect(modal.getByRole('table').locator('tbody tr').first()).toContainText('2026-09-01');
  await expect(modal.getByRole('table').locator('tbody tr').nth(16)).toContainText('2026-09-30');
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
  await download.saveAs(testInfo.outputPath('report-preview.pdf'));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(await readFile((await download.path())!)),
    useSystemFonts: false
  });
  const pdf = await task.promise;
  expect(pdf.numPages).toBe(1);
  const content = await (await pdf.getPage(1)).getTextContent();
  const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
  expect(text).toContain('9월 마감');
  expect(text).toContain('128,000원');
  expect(text).not.toContain('설정 필요');
  expect(text.indexOf('2026-09-01')).toBeLessThan(text.indexOf('2026-09-30'));
  await task.destroy();
});

for (const width of [1440, 390]) {
  test(`이미지 다운로드 ${width}px는 실제 PNG 미리보기와 같은 파일을 저장하고 전체 동의 모든 페이지를 ZIP에 포함`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const requested = await mockSettlement(page, undefined, 0, () => {
      const data = settlementFixture();
      data.balances.buildings.push({
        ...data.balances.buildings[0],
        id: settlementId(203),
        label: '103동',
        startBalance: '200000',
        income: '9000',
        expense: '0',
        balance: '209000'
      });
      data.balances.entries.push({
        id: settlementId(980),
        buildingId: settlementId(203),
        accountId: settlementId(2),
        date: '2026-10-20',
        time: '09:00:00',
        label: '103동 관리비',
        income: '9000',
        expense: '0'
      });
      return data;
    });
    await page.goto(`${BASE}?month=2026-10`);
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('radio', {
      name: '이미지 (PNG)',
      exact: true
    }).check();
    const first = modal.getByRole('img', {
      name: '이미지 1페이지 미리보기',
      exact: true
    });
    await expect(first).toBeVisible();
    await expect.poll(() => first.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(1000);
    const imageBounds = await first.boundingBox();
    const imageNextBounds = await modal.getByRole('button', {
      name: '이미지 다음 페이지',
      exact: true
    }).boundingBox();
    expect(imageNextBounds!.y).toBeGreaterThanOrEqual(imageBounds!.y + imageBounds!.height);
    const firstBytes = new Uint8Array(await first.evaluate(async (image: HTMLImageElement) => Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer()))));
    await modal.getByRole('button', {
      name: '이미지 다음 페이지',
      exact: true
    }).click();
    const second = modal.getByRole('img', {
      name: '이미지 2페이지 미리보기',
      exact: true
    });
    await expect(second).toBeVisible();
    const secondBytes = new Uint8Array(await second.evaluate(async (image: HTMLImageElement) => Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer()))));
    await expect(modal.getByText('총 2장의 PNG 이미지를 ZIP 파일로 저장합니다.', {
      exact: true
    })).toBeVisible();
    const zipReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: '이미지 다운로드',
      exact: true
    }).click();
    const zip = await zipReady;
    expect(zip.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10.zip');
    const files = unzipSync(await readFile((await zip.path())!));
    expect(Object.keys(files)).toEqual(['모아홈_동별입출금내역_2026-10_01.png', '모아홈_동별입출금내역_2026-10_02.png']);
    expect(files[Object.keys(files)[0]]).toEqual(firstBytes);
    expect(files[Object.keys(files)[1]]).toEqual(secondBytes);
    await modal.getByRole('combobox', {
      name: '조회 동',
      exact: true
    }).click();
    await modal.getByRole('option', {
      name: '103동',
      exact: true
    }).click();
    await expect(modal.getByText('PNG 이미지 1장으로 저장합니다.', {
      exact: true
    })).toBeVisible();
    const preview = modal.getByRole('img', {
      name: '이미지 1페이지 미리보기',
      exact: true
    });
    await expect(preview).toBeVisible();
    const previewBytes = new Uint8Array(await preview.evaluate(async (image: HTMLImageElement) => Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer()))));
    const pngReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: '이미지 다운로드',
      exact: true
    }).click();
    const png = await pngReady;
    expect(png.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10_103동.png');
    const bytes = await readFile((await png.path())!);
    expect(new Uint8Array(bytes)).toEqual(previewBytes);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(1000);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(bytes.readUInt32BE(16));
    await page.screenshot({
      path: testInfo.outputPath(`image-download-${width}.png`)
    });
    await modal.getByRole('radio', {
      name: 'PDF',
      exact: true
    }).check();
    await expect(modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    })).toBeVisible();
    await modal.getByRole('radio', {
      name: '이미지 (PNG)',
      exact: true
    }).check();
    await expect(preview).toBeVisible();
    expect(requested).toEqual(['2026-10']);
  });
}

test('이미지 변환 실패는 다운로드를 막고 재시도 뒤 실제 PNG 파일을 제공', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let fail = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (fail) { fail = false; callback(null); return; }
      original.call(this, callback, ...args);
    };
  });
  await mockSettlement(page);
  await page.goto(`${BASE}?month=2026-10`);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('radio', {
    name: '이미지 (PNG)',
    exact: true
  }).check();
  await expect(modal.getByRole('alert')).toHaveText('이미지를 만들지 못했어요. 다시 시도해주세요.');
  await expect(modal.getByRole('button', {
    name: '이미지 다운로드',
    exact: true
  })).toBeDisabled();
  await modal.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(modal.getByRole('img', {
    name: '이미지 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  const ready = page.waitForEvent('download');
  await modal.getByRole('button', {
    name: '이미지 다운로드',
    exact: true
  }).click();
  const download = await ready;
  expect(download.suggestedFilename()).toBe('모아홈_동별입출금내역_2026-10.png');
});
