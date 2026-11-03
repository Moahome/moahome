import {
  expect,
  test
} from '@playwright/test';
import {
  mockSettlement,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';
import {
  reportPreview,
  closeReportPreview
} from './support/reportDownload';

const BASE = `/manage/${SETTLEMENT_PROPERTY}`;

test('PNG 미리보기 자체가 열리지 않아도 공통 그림과 재시도로 다시 표시한다', async ({ page }) => {
  await page.addInitScript(() => {
    const original = URL.createObjectURL.bind(URL);
    let fail = true;
    URL.createObjectURL = (blob) => {
      if (fail && blob instanceof Blob && blob.type === 'image/png') {
        fail = false;
        return 'data:image/png;base64,broken';
      }
      return original(blob);
    };
  });
  await mockSettlement(page);
  await page.goto(`${BASE}/banking/balances?month=2026-10`);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const preview = reportPreview(page);
  await preview.getByRole('radio', {
    name: '이미지 (PNG)',
    exact: true
  }).check();
  await expect(preview.getByRole('alert').getByRole('heading', {
    name: '이미지 미리보기를 표시하지 못했어요'
  })).toBeVisible();
  await expect(preview.getByRole('alert').locator('img')).toBeVisible();
  await preview.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(preview.getByRole('img', {
    name: '이미지 1페이지 미리보기',
    exact: true
  })).toBeVisible();
});

test('모바일 다운로드는 실제 이전 조회로 복귀하고 새로고침·직접 접근에서 선택 범위를 넓히지 않는다', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await mockSettlement(page);
  const origin = `${BASE}/banking/monthly?month=2026-10&startMonth=2026-10&endMonth=2026-10`;
  await page.goto(origin);
  await expect(page.getByRole('button', {
    name: '수납 자료 새로고침'
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/banking\/monthly\/download/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(reportPreview(page)).toBeVisible();
  await expect(page.getByRole('button', {
    name: '취소',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '다운로드 미리보기 닫기'
  })).toHaveCount(0);
  await closeReportPreview(page);
  await expect(page).toHaveURL(origin);
  await page.goForward();
  await expect(page.getByRole('heading', {
    name: '다운로드할 자료를 다시 선택해주세요'
  })).toBeVisible();
  await closeReportPreview(page);
  await expect(page).toHaveURL(origin);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/banking\/monthly\/download/);
  await page.reload();
  await expect(page.getByRole('heading', {
    name: '다운로드할 자료를 다시 선택해주세요'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Excel 다운로드',
    exact: true
  })).toHaveCount(0);
  await closeReportPreview(page);
  await expect(page).toHaveURL(origin);
  await page.goto(`${BASE}/banking/balances/download?month=2026-10`);
  await expect(page.getByRole('heading', {
    name: '다운로드할 자료를 다시 선택해주세요'
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: '뒤로가기',
    exact: true
  })).toBeVisible();
});

test('한 장 PDF의 그리기 실패도 공통 그림과 같은 페이지 재시도로 복구한다', async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillRect;
    let fail = true;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (fail) { fail = false; throw new Error('미리보기 그리기 실패'); }
      return original.apply(this, args);
    };
  });
  await mockSettlement(page);
  await page.goto(`${BASE}/banking/monthly?month=2026-10`);
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  const preview = reportPreview(page);
  await preview.getByRole('radio', {
    name: 'PDF',
    exact: true
  }).check();
  await expect(preview.getByRole('alert').getByRole('heading', {
    name: '페이지를 표시하지 못했어요'
  })).toBeVisible();
  await expect(preview.getByRole('alert').locator('img')).toBeVisible();
  await expect(preview.getByRole('button', {
    name: 'PDF 이전 페이지'
  })).toBeDisabled();
  await expect(preview.getByRole('button', {
    name: 'PDF 다음 페이지'
  })).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('mobile-pdf-error.png'),
    fullPage: true
  });
  await preview.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(preview.getByRole('img', {
    name: 'PDF 1페이지 미리보기',
    exact: true
  })).toBeVisible();
  await expect(preview.getByText(/^A4 가로 ·/)).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`다운로드 미리보기 ${width}px는 형식 선택·오류 그림·저장 버튼이 넘치지 않는다`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 950
    });
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      let fail = true;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
        if (fail) { fail = false; callback(null); return; }
        original.call(this, callback, ...args);
      };
    });
    await mockSettlement(page);
    await page.goto(`${BASE}/banking/balances?month=2026-10`);
    await expect(page.getByRole('button', {
      name: '잔고·정산 새로고침'
    })).toHaveCount(0);
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    const preview = reportPreview(page);
    await preview.getByRole('radio', {
      name: '이미지 (PNG)',
      exact: true
    }).check();
    await expect(preview.getByRole('alert').locator('img')).toBeVisible();
    await expect(preview.getByRole('button', {
      name: '이미지 다운로드',
      exact: true
    })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`download-error-${width}.png`),
      fullPage: width < 768
    });
    await preview.getByRole('button', {
      name: '다시 시도',
      exact: true
    }).click();
    await expect(preview.getByRole('img', {
      name: '이미지 1페이지 미리보기',
      exact: true
    })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`download-ready-${width}.png`),
      fullPage: width < 768
    });
  });
}

test('통장 관리와 월별 정산의 일반 새로고침을 표시하지 않는다', async ({ page }, testInfo) => {
  await mockSettlement(page);
  for (const path of ['transactions', 'balances', 'monthly', 'expenses']) {
    await page.goto(`${BASE}/banking/${path}?month=2026-10`);
    await expect(page.getByRole('button', {
      name: /(?:통장 거래|잔고·정산|수납 자료) 새로고침/
    })).toHaveCount(0);
    await expect(page.getByText('마지막 업데이트', {
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('table').first()).toBeVisible();
    if (path === 'transactions') await page.screenshot({
      path: testInfo.outputPath('banking-no-refresh.png')
    });
  }
  await page.goto(`${BASE}/closing/monthly?month=2026-10`);
  await expect(page.getByRole('button', {
    name: '정산 자료 새로고침',
    exact: true
  })).toHaveCount(0);
});
