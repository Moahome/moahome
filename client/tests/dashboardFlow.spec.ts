import {
  expect,
  test,
  type Page
} from '@playwright/test';
import {
  dashboardFixture,
  emptyDashboardFixture
} from './support/dashboard';
import {
  mockSettlement,
  SETTLEMENT_PROPERTY,
  settlementId
} from './support/monthlySettlement';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/dashboard`;

async function mockDashboard(page: Page, state = {
  failure: false,
  wrongProperty: false,
  empty: false
}, createFixture = dashboardFixture) {
  await mockSettlement(page);
  await page.route('http://localhost:8080/api/properties/*/banking/account/*', (route) => route.fulfill({
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    },
    json: {
      propertyId: SETTLEMENT_PROPERTY,
      accountId: settlementId(2),
      updatedAt: '2026-10-31T00:00:00Z',
      bankCode: '081',
      bankName: '하나은행',
      last4: '1234',
      holderName: '테스트 예금주',
      alias: null,
      isPrimary: true,
      status: 'ACTIVE'
    }
  }));
  const requests: string[] = [];
  await page.route('http://localhost:8080/api/properties/*/dashboard*', async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({
      status: 200,
      headers
    });
    expect(route.request().headers().authorization).toBe('Bearer test-access');
    const month = new URL(route.request().url()).searchParams.get('month') ?? '2026-10';
    requests.push(month);
    const data = state.empty ? emptyDashboardFixture(SETTLEMENT_PROPERTY, month) : createFixture(month);
    if (state.wrongProperty) data.propertyId = settlementId(999);
    return route.fulfill({
      status: state.failure ? 503 : 200,
      headers,
      json: state.failure ? {
        code: 'PAYMENT_SERVICE_UNAVAILABLE'
      } : data
    });
  });

  return requests;
}

for (const width of [1440, 390, 320]) {
  test(`대시보드 ${width}px는 실제 요약·현재 업무·납부 현황·통장·6개월 추이를 표시`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const requests = await mockDashboard(page);
    await page.goto(`${BASE}?month=2026-10`);
    await expect(page).toHaveTitle('관리 대시보드 | 모아홈');
    await expect(page.getByRole('article', {
      name: '선택 월 청구액 50,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '청구 납부반영액 10,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '당월 청구 미수금 40,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '관리대상 부담 지출 12,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('link', {
      name: '가입·정보 수정 요청 3건'
    })).toHaveAttribute('href', `/manage/${SETTLEMENT_PROPERTY}/invitations`);
    await expect(page.getByRole('region', {
      name: '세대 납부 현황',
      exact: true
    })).toContainText('일부납부');
    await expect(page.getByRole('region', {
      name: '통장별 잔액',
      exact: true
    })).toContainText('120,000원');
    await expect(page.getByRole('table', {
      name: '최근 통장 거래',
      exact: true
    }).locator('tbody tr')).toHaveCount(5);
    await expect(page.getByRole('img', {
      name: /최근 6개월 청구액/
    })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(requests).toEqual(['2026-10']);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

test('월 전환은 URL과 전체 지표를 바꾸고 현재 업무 링크는 과거 월로 제한하지 않음', async ({ page }) => {
  const requests = await mockDashboard(page);
  await page.goto(`${BASE}?month=2026-10`);
  await page.getByRole('button', {
    name: '조회 월: 2026년 10월',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '2026년 9월',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}?month=2026-09`);
  await expect(page.getByRole('article', {
    name: '선택 월 청구액 40,000원',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('link', {
    name: '확인 필요 입금 3건'
  })).toHaveAttribute('href', /review=income&direction=INCOME&status=PENDING$/);
  expect(requests).toContain('2026-09');
  await page.reload();
  await expect(page.getByRole('button', {
    name: '조회 월: 2026년 9월',
    exact: true
  })).toBeVisible();
});

test('조회 실패·범위 오류는 0원으로 바꾸지 않고 현재 조회만 재시도', async ({ page }) => {
  const state = {
    failure: true,
    wrongProperty: false,
    empty: false
  };
  const requests = await mockDashboard(page, state);
  await page.goto(`${BASE}?month=2026-10`);
  await expect(page.getByRole('alert', {
    name: '서버에 연결하지 못했어요'
  })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  state.failure = false;
  state.wrongProperty = true;
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('alert', {
    name: '정보를 불러오지 못했어요'
  })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  state.wrongProperty = false;
  state.empty = true;
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('article', {
    name: '선택 월 청구액 0원',
    exact: true
  })).toBeVisible();
  await expect(page.getByText('수납 대상이 없어요.', {
    exact: true
  })).toBeVisible();
  expect(requests).toHaveLength(3);
});

test('잘못된 월은 API를 호출하지 않고 월 선택으로 복구', async ({ page }) => {
  const requests = await mockDashboard(page);
  await page.goto(`${BASE}?month=2026-13`);
  await expect(page.getByRole('heading', {
    name: '조회 월을 확인해주세요.'
  })).toBeVisible();
  expect(requests).toHaveLength(0);
});

test('PC 최근 수동 입금은 기존 모달을 열고 닫을 때 대시보드를 재조회', async ({ page }) => {
  const requests = await mockDashboard(page);
  await page.goto(`${BASE}?month=2026-10`);
  const row = page.getByRole('table', {
    name: '최근 통장 거래',
    exact: true
  }).locator('tbody tr').first();
  await row.click();
  await expect(page.getByRole('dialog', {
    name: '입금 처리 상세'
  })).toBeVisible();
  await page.getByRole('button', {
    name: '입금 상세 닫기'
  }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => requests.length).toBe(2);
});

test('모바일 최근 거래는 상세로 이동하고 헤더로 같은 월의 출발 대시보드에 복귀', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await mockDashboard(page);
  await page.goto(`${BASE}?month=2026-10`);
  await page.getByRole('table', {
    name: '최근 통장 거래',
    exact: true
  }).locator('tbody tr').first().click();
  await expect(page).toHaveURL(new RegExp(`/banking/receipts/${settlementId(72)}\\?month=2026-10$`));
  await expect(page.getByRole('heading', {
    name: '입금 처리 상세'
  })).toBeVisible();
  await page.getByRole('banner').getByRole('link', {
    name: '뒤로가기',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}?month=2026-10`);
});

test('그래프 호버·키보드 초점은 선택한 막대 하나의 금액만 보여주고 Escape로 닫음', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${BASE}?month=2026-10`);
  const bar = page.locator('rect[aria-label="2026-10 청구액 50,000원"]');
  await bar.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toContainText('2026년 10월');
  await expect(tooltip).toContainText('50,000원');
  await expect(tooltip).not.toContainText('10,000원');
  await page.locator('rect[aria-label="2026-10 납부반영액 10,000원"]').hover();
  await expect(tooltip).toContainText('10,000원');
  await expect(tooltip).not.toContainText('50,000원');
  await bar.focus();
  await bar.press('Escape');
  await expect(tooltip).toHaveCount(0);
});

test.describe('대시보드 모바일 반응형', () => {
  test.use({
    hasTouch: true
  });

  test('그래프 양 끝 툴팁은 잘리지 않고 360px부터 요약 카드를 두 열로 표시', async ({ page }, testInfo) => {
    await mockDashboard(page, undefined, (month) => {
      const data = dashboardFixture(month);
      data.payments.charges.find((charge) => charge.month === data.month)!.amount = '1000000';

      return data;
    });
    await page.goto(`${BASE}?month=2026-10`);
    const graph = page.getByRole('figure');
    const tooltip = page.getByRole('tooltip');
    const bars = graph.locator('rect');
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(4);

    for (const width of [320, 359, 360, 390, 424, 425, 600, 768]) {
      await page.setViewportSize({
        width,
        height: 1000
      });
      const bounds = await cards.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();

        return {
          x: box.x,
          y: box.y,
          bottom: box.bottom
        };
      }));
      if (width < 360) expect(bounds[1].y).toBeGreaterThanOrEqual(bounds[0].bottom);
      else {
        expect(Math.abs(bounds[0].y - bounds[1].y)).toBeLessThan(1);
        expect(Math.abs(bounds[2].y - bounds[3].y)).toBeLessThan(1);
        expect(Math.abs(bounds[0].x - bounds[2].x)).toBeLessThan(1);
        expect(bounds[2].y).toBeGreaterThanOrEqual(bounds[0].bottom);
        const amount = cards.first().locator('strong');
        const amountBox = (await amount.boundingBox())!;
        const cardBox = (await cards.first().boundingBox())!;
        const lineHeight = await amount.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));
        expect(amountBox.height).toBeLessThanOrEqual(lineHeight + 1);
        expect(amountBox.x + amountBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      }
      for (const bar of [bars.first(), bars.nth(10), bars.nth(11)]) {
        await bar.focus();
        await expect(tooltip).toBeVisible();
        const graphBox = (await graph.boundingBox())!;
        const tooltipBox = (await tooltip.boundingBox())!;
        const amountBox = (await tooltip.locator('b').boundingBox())!;
        expect(tooltipBox.x).toBeGreaterThanOrEqual(graphBox.x - 1);
        expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(graphBox.x + graphBox.width + 1);
        expect(amountBox.x + amountBox.width).toBeLessThanOrEqual(tooltipBox.x + tooltipBox.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({
      width: 425,
      height: 1000
    });
    await bars.nth(10).tap();
    await expect(tooltip).toContainText('1,000,000원');
    await page.screenshot({
      path: testInfo.outputPath('dashboard425Grid.png'),
      fullPage: true
    });
    await page.setViewportSize({
      width: 320,
      height: 1000
    });
    const resized = (await tooltip.boundingBox())!;
    expect(resized.x).toBeGreaterThanOrEqual(0);
    expect(resized.x + resized.width).toBeLessThanOrEqual(320);
    await bars.nth(11).tap();
    await expect(tooltip).toContainText('납부반영액');
    await page.screenshot({
      path: testInfo.outputPath('dashboard320Tooltip.png'),
      fullPage: true
    });
    await bars.nth(11).press('Escape');
    await expect(tooltip).toHaveCount(0);
  });
});

test('0건 업무도 클릭할 수 있고 중복 의심은 후보가 없는 목록으로 연결하며 가상 연도를 표시하지 않음', async ({ page }) => {
  await mockDashboard(page);
  await page.goto(`${BASE}?month=2026-10`);
  await page.getByRole('link', {
    name: '중복 의심 거래 0건'
  }).click();
  await expect(page).toHaveURL(/\/banking\/transactions\?review=duplicates$/);
  await expect(page.getByText('조건에 맞는 검색 결과가 없어요.', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('table', {
    name: '통장 거래',
    exact: true
  }).locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('main')).not.toContainText('1000.01.01');
});

for (const [label, direction, review] of [['확인 필요 입금', 'INCOME', 'income'], ['미분류 출금', 'EXPENSE', 'expenses']]) {
  test(`${label}은 해당 입출금 탭과 확인 필요 상태로 열고 완료 거래를 제외`, async ({ page }) => {
    await mockDashboard(page);
    await page.goto(`${BASE}?month=2026-10`);
    await page.getByRole('link', {
      name: new RegExp(`^${label} \\d+건$`)
    }).click();
    await expect(page).toHaveURL(new RegExp(`review=${review}&direction=${direction}&status=PENDING$`));
    await expect(page.getByRole('combobox', {
      name: '처리 상태',
      exact: true
    })).toContainText('확인 필요');
    await expect(page.getByRole('button', {
      name: direction === 'INCOME' ? '입금 (0)' : '출금 (0)',
      exact: true
    })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('조건에 맞는 검색 결과가 없어요.', {
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText('1000.01.01');
  });
}

test('기존 확인 잔액만 있는 통장은 상세에서 금액을 유지하고 초기 잔액 재설정을 요구하지 않음', async ({ page }) => {
  await mockDashboard(page);
  await page.route('http://localhost:8080/api/properties/*/dashboard*', (route) => {
    const data = dashboardFixture();
    data.balances.accounts![0].calculatedBalance = null;
    data.balances.accounts![0].calculationBasisDate = null;
    return route.fulfill({
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      json: data
    });
  });
  await page.route('http://localhost:8080/api/properties/*/banking/account/*', (route) => route.fulfill({
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    },
    json: {
      propertyId: SETTLEMENT_PROPERTY,
      accountId: settlementId(2),
      updatedAt: '2026-10-31T00:00:00Z',
      bankCode: '081',
      bankName: '하나은행',
      last4: '1234',
      holderName: '테스트 예금주',
      alias: null,
      isPrimary: true,
      status: 'ACTIVE'
    }
  }));
  await page.goto(`${BASE}?month=2026-10`);
  await page.getByRole('button', {
    name: '하나은행 1234 통장 상세',
    exact: true
  }).click();
  const detail = page.getByRole('dialog', {
    name: '통장 상세',
    exact: true
  });
  await expect(detail).toContainText('마지막 확인 잔액');
  await expect(detail.getByText('120,000원', {
    exact: true
  }).first()).toBeVisible();
  await expect(detail).not.toContainText('초기 잔액 설정 필요');
});

test('공용 새로고침은 업데이트 시각·파란 버튼과 실패 상태를 표시하고 현재 조회만 다시 실행', async ({ page }) => {
  const state = {
    failure: false,
    wrongProperty: false,
    empty: false
  };
  const requests = await mockDashboard(page, state);
  await page.goto(`${BASE}?month=2026-10`);
  const button = page.getByRole('button', {
    name: '대시보드 새로고침',
    exact: true
  });
  await expect(page.getByText('마지막 업데이트', {
    exact: true
  })).toBeVisible();
  await expect(button).toHaveText('새로고침');
  await expect(button).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  await button.click();
  await expect.poll(() => requests.length).toBe(2);
  state.failure = true;
  await button.click();
  await expect(page.getByText('업데이트 실패', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  state.failure = false;
  await button.click();
  await expect(page.getByRole('article', {
    name: '청구 납부반영액 10,000원',
    exact: true
  })).toBeVisible();
});


test('모바일 통장 상세의 헤더·기기 뒤로가기는 대시보드 또는 잔고의 실제 출발 화면과 조회 조건으로 복귀', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 900
  });
  await mockDashboard(page);
  for (const from of ['dashboard', 'balances']) {
    const origin = from === 'dashboard' ? `${BASE}?month=2026-10`
      : `/manage/${SETTLEMENT_PROPERTY}/banking/balances?account=${settlementId(2)}&month=2026-10`;
    await page.goto(origin);
    const open = () => page.getByRole('button', {
      name: from === 'dashboard' ? '하나은행 1234 통장 상세' : /하나은행.*통장 상세 보기/
    }).click();
    await open();
    await expect(page).toHaveURL(/banking\/balances\/details\/account/);
    await page.reload();
    await page.getByRole('banner').getByRole('link', {
      name: '뒤로가기',
      exact: true
    }).click();
    await expect(page).toHaveURL(origin);
    await open();
    await expect(page).toHaveURL(/banking\/balances\/details\/account/);
    await expect(page.getByRole('heading', {
      name: '통장 상세',
      exact: true
    })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(origin);
  }
});
