import { readFile } from 'node:fs/promises';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  expect,
  test
} from '@playwright/test';
import type {
  BankingTransaction,
  BankingWorkspaceData
} from '../src/widgets/banking-workspace/api/bankingApi';

const PROPERTY = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const ACCOUNT = '00000000-0000-4000-8000-000000000010';
const BUILDING_A = '00000000-0000-4000-8000-000000000102';
const BUILDING_B = '00000000-0000-4000-8000-000000000103';
const BASE = `/manage/${PROPERTY}/banking`;
function id(index: number) { return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }
function row(index: number, direction: 'INCOME' | 'EXPENSE', payer: string, amount: string): BankingTransaction {
  return {
    id: id(index),
    accountId: ACCOUNT,
    date: '2026-10-15',
    time: '09:00:00',
    payer,
    memo: payer,
    amount,
    balance: '500000',
    direction,
    ruleKey: id(index),
    paymentId: null,
    status: 'PENDING',
    unitId: '',
    unitLabel: '',
    expense: null
  };
}

test('업로드 페이지에서 필터·페이지 선택을 유지하고 전기료 특수 배분을 함께 전송', async ({ page }) => {
  const rows = [...Array.from({
    length: 11
  }, (_, index) => row(200 + index, 'INCOME', `입금자${index}`, '50000')), row(300, 'EXPENSE', '07전기요금', '182660')];
  let saved: BankingWorkspaceData = {
    propertyId: PROPERTY,
    asOf: '2026-10-17',
    buildings: [{
      id: BUILDING_B,
      label: '103동'
    }, {
      id: BUILDING_A,
      label: '102동'
    }],
    units: [],
    rows: [],
    rules: []
  };
  let uploaded = '';
  let failFirst = true;
  await page.route('http://localhost:8080/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith('/csrf')) body = {
      csrfToken: 'test-csrf'
    };
    else if (path.endsWith('/refresh')) body = {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
    };
    else if (path === '/api/users/me') body = {
      id: id(1),
      displayName: '관리자',
      profileImageUrl: null,
      systemRole: 'USER',
      status: 'ACTIVE'
    };
    else if (path.endsWith('/management-context')) body = {
      propertyId: PROPERTY,
      name: '모아빌라',
      role: 'ADMIN'
    };
    else if (path.endsWith('/managed-properties')) body = {
      properties: [{
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'ADMIN'
      }]
    };
    else if (path.endsWith('/payments/workspace')) body = {
      propertyId: PROPERTY,
      asOf: '2026-10-17',
      accounts: [{
        id: ACCOUNT,
        label: '공용 통장'
      }],
      units: [],
      charges: [],
      payments: [],
      history: []
    };
    else if (path.endsWith('/banking/workspace')) body = saved;
    else if (path.endsWith('/banking/import/preview')) body = {
      propertyId: PROPERTY,
      rows,
      duplicateCount: 2,
      beforeCutoffCount: 0
    };
    else if (path.endsWith('/banking/import')) {
      uploaded = route.request().postDataBuffer()!.toString('utf8');
      if (failFirst) { failFirst = false; await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'NETWORK_ERROR',
          message: '재시도'
        })
      }); return; }
      saved = {
        ...saved,
        rows: [{
          ...rows[11],
          status: 'CONFIRMED',
          expense: {
            id: id(500),
            category: '전기료',
            note: '',
            mode: 'RATIO',
            saveAsRule: true,
            allocations: [
              {
                buildingId: BUILDING_A,
                label: '102동',
                amount: '45665',
                percentage: '25'
              }, {
                buildingId: BUILDING_B,
                label: '103동',
                amount: '45665',
                percentage: '25'
              }, {
                buildingId: null,
                label: '외부 101동',
                amount: '91330',
                percentage: '50'
              }
            ]
          }
        }]
      }; body = saved;
    } else throw new Error(`Unexpected API ${path}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(`${BASE}/transactions`);
  await expect(page).toHaveTitle('통장 거래 | 모아홈');
  await page.getByRole('button', {
    name: '엑셀 업로드',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/upload`);
  await expect(page).toHaveTitle('통장 거래 업로드 | 모아홈');
  await expect(page.getByRole('heading', {
    name: '거래내역 가져오기',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '엑셀 업로드',
    exact: true
  })).toHaveCount(0);
  await page.getByLabel('통장 거래 파일 선택').setInputFiles({
    name: '거래내역.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('은행 원본')
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', {
    name: '업로드 미리보기',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '엑셀 업로드',
    exact: true
  })).toHaveCount(0);
  const pageSize = page.getByRole('combobox', {
    name: '표시 개수',
    exact: true
  });
  await pageSize.click();
  await page.getByRole('option', {
    name: '20개씩 보기',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  }).getByRole('row')).toHaveCount(13);
  await pageSize.click();
  await page.getByRole('option', {
    name: '10개씩 보기',
    exact: true
  }).click();
  await expect(page.getByText('선택 입금 11건 · 출금 1건')).toBeVisible();
  await page.getByRole('button', {
    name: '입금 (11)',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  }).getByRole('columnheader')).toHaveText(['', '거래일시', '입금자', '입금', '처리 내용', '처리']);
  await page.getByLabel('입금자0 거래 선택', {
    exact: true
  }).uncheck();
  await page.getByRole('button', {
    name: '다음 페이지',
    exact: true
  }).click();
  await expect(page.getByText('입금자10', {
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '출금 (1)',
    exact: true
  }).click();
  const previewTable = page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  });
  await expect(previewTable.getByRole('columnheader', {
    name: '입금',
    exact: true
  })).toHaveCount(0);
  await expect(previewTable.getByRole('columnheader', {
    name: '지출명',
    exact: true
  })).toBeVisible();
  await expect(previewTable.getByRole('columnheader', {
    name: /적요|매칭|배분/
  })).toHaveCount(0);
  await expect(previewTable.getByRole('columnheader')).toHaveText(['', '거래일시', '지출명', '출금', '처리 내용', '처리']);
  expect(await previewTable.locator('th, td').evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center'))).toBe(true);
  await expect(previewTable.getByRole('cell', {
    name: '182,660원',
    exact: true
  })).toHaveCSS('text-align', 'center');
  await expect(previewTable.getByRole('cell', {
    name: '지출 2동 부담',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '전체 (12)',
    exact: true
  }).click();
  await expect(previewTable.getByRole('columnheader')).toHaveText(['', '거래일시', '입금자', '지출명', '입금', '출금', '처리 내용', '처리']);
  await expect(previewTable.getByRole('row').filter({
    hasText: '입금자1'
  }).first().getByRole('cell').nth(2)).toContainText('입금자1');
  await page.getByRole('button', {
    name: '출금 (1)',
    exact: true
  }).click();
  const openExpense = () => page.getByRole('row').filter({
    hasText: /07전기요금|전기료/
  }).first().click();
  await openExpense();
  const editor = page.getByRole('group', {
    name: '지출 설정',
    exact: true
  });
  const settings = page.getByRole('dialog');
  await expect(settings).toBeVisible();
  await expect(editor.getByLabel('지출명', {
    exact: true
  })).toHaveValue('07전기요금');
  await editor.getByLabel('지출명', {
    exact: true
  }).fill('전기료');
  await editor.getByRole('combobox', {
    name: '나누는 방법'
  }).click();
  await page.getByRole('option', {
    name: '비율 지정',
    exact: true
  }).click();
  await editor.getByLabel('102동 부담 비율', {
    exact: true
  }).fill('25');
  await editor.getByLabel('103동 부담 비율', {
    exact: true
  }).fill('25');
  await expect(editor.getByText('남은 금액 91,330원', {
    exact: true
  })).toBeVisible();
  await expect(settings.getByRole('button', {
    name: '설정 완료',
    exact: true
  })).toBeDisabled();
  await settings.getByRole('button', {
    name: '거래 설정 닫기',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '선택 거래 처리 (11)'
  }).click();
  await expect(settings).toBeVisible();
  expect(uploaded).toBe('');
  await editor.getByRole('button', {
    name: '외부·공통 부담처 추가'
  }).click();
  await editor.getByLabel('외부 부담처 3', {
    exact: true
  }).fill('외부 101동');
  await editor.getByLabel('외부 101동 부담 비율', {
    exact: true
  }).fill('50');
  await editor.getByRole('checkbox', {
    name: '같은 내용의 거래에 이 설정 사용'
  }).check();
  await expect(editor.getByText('남은 금액 0원', {
    exact: true
  })).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('expenseSettingsDesktop.png'),
    fullPage: true
  });
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await expect(settings).toBeVisible();
  expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('expenseSettingsMobile.png'),
    fullPage: true
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await settings.getByRole('button', {
    name: '설정 완료',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '입금 (11)',
    exact: true
  }).click();
  await expect(page.getByLabel('입금자0 거래 선택', {
    exact: true
  })).not.toBeChecked();
  await page.getByRole('button', {
    name: '출금 (1)',
    exact: true
  }).click();
  await openExpense();
  await expect(editor.getByLabel('102동 부담 비율', {
    exact: true
  })).toHaveValue('25');
  await page.keyboard.press('Escape');
  await page.getByRole('button', {
    name: '선택 거래 처리 (11)'
  }).click();
  await expect(page.getByText('서버에 연결하지 못했어요. 선택과 입력을 유지하고 다시 시도해주세요.')).toBeVisible();
  await openExpense();
  await expect(editor.getByLabel('외부 101동 부담 비율', {
    exact: true
  })).toHaveValue('50');
  await settings.getByRole('button', {
    name: '설정 완료',
    exact: true
  }).click();
  expect(uploaded).toContain('"amount":"45665"');
  expect(uploaded).toContain('"amount":"91330"');
  expect(uploaded).not.toContain(`"id":"${id(200)}"`);
  await page.getByRole('button', {
    name: '선택 거래 처리 (11)'
  }).click();
  await expect(page).toHaveURL(`${BASE}/transactions`);
  await expect(page.getByRole('table', {
    name: '통장 거래',
    exact: true
  }).getByRole('cell', {
    name: '지출 3동 부담',
    exact: true
  })).toBeVisible();

  await openExpense();
  await expect(page).toHaveURL(`${BASE}/transactions`);
  await expect(page.getByRole('dialog', {
    name: '지출 상세',
    exact: true
  })).toBeVisible();
  const allocations = page.getByRole('list', {
    name: '동별 배분 내역',
    exact: true
  });
  await expect(allocations.getByRole('listitem')).toHaveText(['102동25%45,665원', '103동25%45,665원', '외부 101동50%91,330원']);
  await expect(page.getByRole('dialog', {
    name: '지출 상세',
    exact: true
  })).toContainText('지출 확정 완료');
  const detail = page.getByRole('dialog', {
    name: '지출 상세',
    exact: true
  });
  await expect(detail.getByText('2026-10-15 09:00:00', {
    exact: true
  })).toHaveCount(1);
  await expect(detail.getByText('전기료', {
    exact: true
  })).toHaveCount(1);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('bankingDesktop.png'),
    fullPage: true
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await openExpense();
  await expect(page).toHaveURL(`${BASE}/transactions/${id(300)}`);
  await expect(page).toHaveTitle('지출 상세 | 모아홈');
  await expect(page.getByRole('link', {
    name: '통장 거래로 돌아가기',
    exact: true
  })).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({
      width,
      height: 844
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByText('2026-10-15 09:00:00', {
      exact: true
    })).toHaveCount(1);
    await expect(allocations.getByRole('listitem')).toHaveText(['102동25%45,665원', '103동25%45,665원', '외부 101동50%91,330원']);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('bankingMobile.png'),
    fullPage: true
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(`${BASE}/expenses`);
  await expect(page).toHaveTitle('지출 내역 | 모아홈');
  const expenseTable = page.getByRole('table', {
    name: '지출 내역',
    exact: true
  });
  await expect(expenseTable.getByRole('columnheader')).toHaveText(['거래일시', '지출명', '지출액']);
  expect(await expenseTable.locator('th, td').evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center'))).toBe(true);
  await expect(expenseTable.getByText('91,330원', {
    exact: true
  })).toHaveCount(1);
  await expect(page.getByRole('article', {
    name: '지출 합계 91,330원',
    exact: true
  })).toBeVisible();
  await expect(page.getByText('182,660원', {
    exact: true
  })).toHaveCount(0);
  await expect(page.getByText(/매칭|배분|적요|비용 항목/)).toHaveCount(0);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('expenseDesktop.png'),
    fullPage: true
  });
  const building = page.getByRole('combobox', {
    name: '부담 동',
    exact: true
  });
  await building.click();
  await expect(page.getByRole('option')).toHaveText(['전체 동', '102동', '103동']);
  await page.getByRole('option', {
    name: '102동',
    exact: true
  }).click();
  await expect(building).toHaveAttribute('aria-expanded', 'false');
  await expect(expenseTable.getByRole('columnheader')).toHaveText(['거래일시', '지출명', '지출액']);
  expect(await expenseTable.locator('th, td').evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center'))).toBe(true);
  await expect(expenseTable.getByText('45,665원', {
    exact: true
  })).toHaveCount(1);
  await expect(page.getByRole('article', {
    name: '지출 합계 45,665원',
    exact: true
  })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({
      width,
      height: 900
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const overflowedCards = await page.getByRole('article').evaluateAll((cards) => cards.filter((card) => card.scrollWidth > card.clientWidth + 1).length);
    expect(overflowedCards).toBe(0);
  }
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('expenseMobile.png'),
    fullPage: true
  });
  const current = saved.rows[0];
  saved = {
    ...saved,
    rows: [{
      ...current,
      payer: '관리실공동전기료'.repeat(12),
      amount: '999999999999996',
      expense: {
        ...current.expense!,
        category: '관리실공동전기료'.repeat(12),
        allocations: current.expense!.allocations.map((part) => ({
          ...part,
          amount: part.buildingId ? '249999999999999' : '499999999999998'
        }))
      }
    }]
  };
  await page.reload();
  await expect(page.getByRole('article', {
    name: '지출 합계 499,999,999,999,998원',
    exact: true
  })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({
      width,
      height: 900
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await page.getByRole('article').evaluateAll((cards) => cards.filter((card) => card.scrollWidth > card.clientWidth + 1).length)).toBe(0);
  }

  saved = {
    ...saved,
    rows: Array.from({
      length: 25
    }, (_, index) => ({
      ...current,
      id: id(700 + index),
      payer: `관리실${index}`,
      expense: {
        ...current.expense!,
        id: id(800 + index)
      }
    }))
  };
  await page.reload();
  await expect(expenseTable.getByRole('row')).toHaveCount(11);
  await pageSize.click();
  await page.getByRole('option', {
    name: '20개씩 보기',
    exact: true
  }).click();
  await expect(expenseTable.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', {
    name: '다음 페이지',
    exact: true
  }).click();
  await expect(expenseTable.getByRole('row')).toHaveCount(6);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {
    name: '엑셀 다운로드',
    exact: true
  }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('모아홈_지출내역_2026-10_전체동.xlsx');
  const downloadPath = test.info().outputPath('expenses.xlsx');
  await download.saveAs(downloadPath);
  const workbook = unzipSync(await readFile(downloadPath));
  const sheet = strFromU8(workbook['xl/worksheets/sheet1.xml']);
  const strings = strFromU8(workbook['xl/sharedStrings.xml']);
  // 두 번째 페이지에 5건만 보여도 현재 월·동의 전체 25건과 합계를 내려받습니다.
  expect((sheet.match(/<row /g) ?? []).length).toBe(36);
  expect(sheet).toContain('<v>91330</v>');
  expect(sheet).toContain('<v>2283250</v>');
  expect(strings).not.toContain('182660');
  await pageSize.click();
  await page.getByRole('option', {
    name: '50개씩 보기',
    exact: true
  }).click();
  await expect(expenseTable.getByRole('row')).toHaveCount(26);
  const pagination = page.getByRole('navigation', {
    name: '거래 페이지',
    exact: true
  });
  const paginationBounds = await pagination.boundingBox();
  const paginationArea = await pagination.locator('../..').boundingBox();
  expect(paginationArea!.y + paginationArea!.height - paginationBounds!.y - paginationBounds!.height).toBeGreaterThanOrEqual(20);
  await expect(pagination.locator('../..')).toHaveCSS('border-top-width', '0px');
  await page.goto(`${BASE}/transactions`);
  await expect(pageSize).toHaveText('10개씩 보기');
  await pageSize.click();
  await page.getByRole('option', {
    name: '20개씩 보기',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '통장 거래',
    exact: true
  }).getByRole('row')).toHaveCount(21);

});

test('동별 시작 잔고·상세 원장·부분 회수·실패 재시도와 모바일 상세를 연결', async ({ page }) => {
  const buildings = Array.from({
    length: 8
  }, (_, index) => ({
    id: id(102 + index),
    label: `${102 + index}동`,
    active: true,
    startBalance: null as string | null,
    income: '0',
    expense: '0',
    balance: null as string | null,
    status: 'OPENING_REQUIRED'
  }));
  let opened = false;
  let openingDate = '2026-09-30';
  let firstOpening = '600000';
  let openingRevision = 0;
  const correctionRequests: string[] = [];
  let received = 0;
  let excluded = false;
  let decisionRevision = 0;
  const decisionRequests: string[] = [];
  let settlementAttempts = 0;
  const requests: string[] = [];
  const externalId = id(700), repaymentId = id(701);
  await page.route('http://localhost:8080/**', async (route) => {
    const url = new URL(route.request().url());const path = url.pathname;
    let body: unknown = {};
    if (path.endsWith('/csrf')) body = {
      csrfToken: 'test-csrf'
    };
    else if (path.endsWith('/refresh')) body = {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
    };
    else if (path === '/api/users/me') body = {
      id: id(1),
      displayName: '관리자',
      profileImageUrl: null,
      systemRole: 'USER',
      status: 'ACTIVE'
    };
    else if (path.endsWith('/management-context')) body = {
      propertyId: PROPERTY,
      name: '모아빌라',
      role: 'ADMIN'
    };
    else if (path.endsWith('/managed-properties')) body = {
      properties: [{
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'ADMIN'
      }]
    };
    else if (path.endsWith('/payments/workspace')) body = {
      propertyId: PROPERTY,
      asOf: '2026-10-17',
      accounts: [{
        id: ACCOUNT,
        label: '공용 통장'
      }],
      units: [{
        id: id(401),
        label: '102동 401호',
        status: 'ACTIVE',
        buildingName: '102동',
        representativeName: '관리비'
      }],
      charges: [],
      payments: [{
        id: id(620),
        accountId: ACCOUNT,
        unitId: id(401),
        date: '2026-10-15',
        payer: '관리비',
        amount: '50000',
        source: 'BANK_IMPORT',
        status: 'CONFIRMED',
        receiptType: 'HOUSEHOLD',
        bankTransactionId: id(600),
        allocations: []
      }],
      history: []
    };
    else if (path.endsWith('/banking/workspace')) body = {
      propertyId: PROPERTY,
      asOf: '2026-10-17',
      buildings: buildings.map((building) => ({
        id: building.id,
        label: building.label
      })),
      units: [],
      rules: [],
      rows: [{
        ...row(601, 'EXPENSE', '전기료', '182660'),
        status: 'CONFIRMED',
        expense: {
          id: id(621),
          category: '전기료',
          note: '',
          mode: 'RATIO',
          saveAsRule: false,
          allocations: [
            {
              buildingId: id(102),
              label: '102동',
              amount: '45665',
              percentage: '25'
            },
            {
              buildingId: id(103),
              label: '103동',
              amount: '45665',
              percentage: '25'
            },
            {
              buildingId: null,
              label: '외부 101동',
              amount: '91330',
              percentage: '50'
            }
          ]
        }
      }]
    };
    else if (path.endsWith('/banking/balances/openings')) {
      const input = route.request().postDataJSON();
      expect(input.cutoffDate).toBe('2026-09-30');expect(input.buildings).toHaveLength(8);opened = true;body = {
        saved: true
      };
    } else if (path.endsWith('/banking/balances/openings/corrections')) {
      correctionRequests.push(route.request().postData()!);
      const correction = route.request().postDataJSON();
      expect(correction.cutoffDate).toBe('2026-06-30');
      expect(correction.buildings).toHaveLength(8);
      expect(correction.buildings.every((part: { revision: number }) => part.revision === 0)).toBe(true);
      if (correctionRequests.length === 1) {
        await route.fulfill({
          status: 503,
          json: {
            code: 'PAYMENT_SERVICE_UNAVAILABLE'
          }
        });
        return;
      }
      expect(correctionRequests[1]).toBe(correctionRequests[0]);
      openingDate = correction.cutoffDate;
      firstOpening = correction.buildings.find((part: { buildingId: string }) => part.buildingId === id(102)).amount;
      openingRevision++;
      body = {
        saved: true
      };
    } else if (path.endsWith('/banking/balances/settlement-decisions')) {
      decisionRequests.push(route.request().postData()!);
      if (decisionRequests.length === 1) {
        await route.fulfill({
          status: 503,
          json: {
            code: 'PAYMENT_SERVICE_UNAVAILABLE'
          }
        });
        return;
      }
      if (decisionRequests.length === 2) expect(decisionRequests[1]).toBe(decisionRequests[0]);
      const decision = route.request().postDataJSON();
      expect(decision.revision).toBe(decisionRevision);
      expect(decision.allocationId).toBe(externalId);
      excluded = decision.excluded;
      decisionRevision++;
      body = {
        saved: true
      };
    } else if (path.endsWith('/banking/balances/settlements')) {
      requests.push(route.request().postData()!);settlementAttempts++;
      if (settlementAttempts === 1) { await route.fulfill({
        status: 503,
        json: {
          code: 'PAYMENT_SERVICE_UNAVAILABLE'
        }
      });return; }
      expect(requests[1]).toBe(requests[0]);received = 30000;body = {
        saved: true
      };
    } else if (path.endsWith('/banking/balances')) {
      body = {
        propertyId: PROPERTY,
        month: url.searchParams.get('month'),
        cutoffDate: opened ? openingDate : null,
        bankBalance: '807340',
        bankAsOf: '2026-10-15 10:00:00',
        buildings: buildings.map((b, index) => opened ? {
          ...b,
          openingBalance: index === 0 ? firstOpening : index === 1 ? '300000' : '0',
          openingRevision,
          startBalance: index === 0 ? firstOpening : index === 1 ? '300000' : '0',
          income: index === 0 ? '50000' : '0',
          expense: index < 2 ? '45665' : '0',
          balance: index === 0 ? (BigInt(firstOpening) + BigInt(4335)).toString() : index === 1 ? '254335' : '0',
          status: 'READY'
        } : b),
        entries: opened ? [{
          id: id(600),
          paymentId: id(620),
          buildingId: id(102),
          date: '2026-10-15',
          time: '08:00:00',
          label: '관리비',
          income: '50000',
          expense: '0'
        }, {
          id: id(601),
          buildingId: id(102),
          date: '2026-10-15',
          time: '09:00:00',
          label: '전기료',
          income: '0',
          expense: '45665'
        }] : [],
        externals: opened ? [{
          id: externalId,
          label: '외부 101동',
          expenseName: '전기료',
          date: '2026-10-15',
          amount: '91330',
          received: String(received),
          remaining: String(91330 - received),
          excluded,
          decisionRevision,
          recoveries: received ? [{
            id: id(702),
            paymentId: repaymentId,
            date: '2026-10-15',
            payer: '외부 반환',
            amount: String(received)
          }] : []
        }] : [],
        incomes: opened ? [{
          id: repaymentId,
          transactionId: id(703),
          date: '2026-10-15',
          payer: '외부 반환',
          amount: '40000',
          available: decisionRevision < 2 ? '0' : String(40000 - received),
          kind: 'OTHER'
        }, {
          id: id(711),
          transactionId: id(712),
          date: '2026-10-13',
          payer: '서찬우',
          amount: '50000',
          available: '50000',
          kind: 'HOUSEHOLD',
          linkedBuildingId: null,
          linkedUnitLabel: '402호'
        }, {
          id: id(713),
          transactionId: id(714),
          date: '2026-10-12',
          payer: '문영일',
          amount: '50000',
          available: '50000',
          kind: 'HOUSEHOLD',
          linkedBuildingId: null,
          linkedUnitLabel: '201호'
        }, {
          id: id(715),
          transactionId: id(716),
          date: '2026-10-11',
          payer: '미확인',
          amount: '50000',
          available: '50000',
          kind: 'HOUSEHOLD',
          linkedBuildingId: null,
          linkedUnitLabel: null
        }] : [],
        pending: []
      };
    }
    await route.fulfill({
      status: 200,
      json: body
    });
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(`${BASE}/balances?month=2026-10`);
  await expect(page).toHaveTitle('동별 잔고·정산 | 모아홈');
  const bankingGroup = page.getByRole('navigation', {
    name: '관리 메뉴'
  }).getByRole('button', {
    name: '통장 관리',
    exact: true
  });
  await bankingGroup.click();
  await expect(bankingGroup).toHaveAttribute('aria-expanded', 'false');
  await expect(bankingGroup).toHaveCSS('color', 'rgb(37, 99, 235)');
  await expect(bankingGroup.locator('svg').first()).toHaveCSS('color', 'rgb(37, 99, 235)');
  await page.screenshot({
    path: test.info().outputPath('currentBankingGroupClosed.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await bankingGroup.click();

  const table = page.getByRole('table', {
    name: '동별 잔고',
    exact: true
  });
  await expect(table.getByRole('row')).toHaveCount(9);
  await expect(page.getByRole('article', {
    name: '동별 잔고 합계 설정 필요',
    exact: true
  })).toBeVisible();
  // 시작값이 없는 화면에서도 버튼과 표 도구가 같은 기준선에 정렬되는지 확인합니다.
  const startButton = page.getByRole('button', {
    name: '시작 잔고 설정',
    exact: true
  });
  const exportButton = page.getByRole('button', {
    name: '엑셀 다운로드',
    exact: true
  });
  const startBounds = (await startButton.boundingBox())!;
  const exportBounds = (await exportButton.boundingBox())!;
  expect(Math.abs(startBounds.y - exportBounds.y)).toBeLessThanOrEqual(1);
  expect(startBounds.height).toBe(exportBounds.height);
  expect(exportBounds.x - startBounds.x - startBounds.width).toBeGreaterThanOrEqual(12);
  const externalSize = page.getByRole('combobox', {
    name: '외부 부담금 표시 개수',
    exact: true
  });
  expect((await externalSize.boundingBox())!.width).toBeLessThanOrEqual(160);
  await page.screenshot({
    path: test.info().outputPath('balancesBeforeSetup.png'),
    fullPage: true
  });
  await page.getByRole('button', {
    name: '시작 잔고 설정',
    exact: true
  }).click();
  const setup = page.getByRole('dialog', {
    name: '동별 시작 잔고 설정',
    exact: true
  });
  const closeButton = setup.getByRole('button', {
    name: '동별 시작 잔고 설정 닫기',
    exact: true
  });
  await expect(closeButton).toHaveCSS('color', 'rgb(100, 116, 139)');
  await expect(closeButton).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  const buildingSelect = setup.getByRole('combobox', {
    name: '동 선택',
    exact: true
  });
  const initialHeight = (await setup.boundingBox())!.height;
  await expect(setup.locator('input[inputmode="text"]')).toHaveCount(1);
  await setup.getByLabel('102동 시작 잔고', {
    exact: true
  }).fill('600000');
  await buildingSelect.fill('109');
  await setup.getByRole('option', {
    name: '109동',
    exact: true
  }).click();
  await setup.getByLabel('109동 시작 잔고', {
    exact: true
  }).fill('0');
  await buildingSelect.fill('102');
  await setup.getByRole('option', {
    name: '102동',
    exact: true
  }).click();
  await expect(setup.getByLabel('102동 시작 잔고', {
    exact: true
  })).toHaveValue('600,000');
  expect((await setup.boundingBox())!.height).toBe(initialHeight);
  await page.screenshot({
    path: test.info().outputPath('openingDesktop.png'),
    fullPage: false
  });
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.screenshot({
    path: test.info().outputPath('openingMobile.png'),
    fullPage: false
  });
  await expect(setup.getByRole('button', {
    name: '확정',
    exact: true
  })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await setup.getByRole('button', {
    name: '확정',
    exact: true
  }).click();
  await expect(setup.getByRole('alert')).toContainText('기준일');
  await setup.getByRole('button', {
    name: '기준일',
    exact: false
  }).click();
  await page.getByRole('button', {
    name: '이전 달',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '2026년 9월 30일',
    exact: true
  }).click();
  for (let index = 0; index < 8; index++) {
    await buildingSelect.fill(String(102 + index));
    await setup.getByRole('option', {
      name: `${102 + index}동`,
      exact: true
    }).click();
    await setup.getByLabel(`${102 + index}동 시작 잔고`, {
      exact: true
    }).fill(index === 0 ? '600000' : index === 1 ? '300000' : '0');
  }
  await expect(setup.getByRole('status')).toContainText('8 / 8개 동');
  await setup.getByRole('button', {
    name: '확정',
    exact: true
  }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.getByRole('article', {
    name: '동별 잔고 합계 858,670원',
    exact: true
  })).toBeVisible();
  await expect(table.getByRole('columnheader', {
    name: '확인',
    exact: true
  })).toHaveCount(0);
  await page.getByRole('button', {
    name: '기준 잔고 확인',
    exact: true
  }).click();
  const anchorDialog = page.getByRole('dialog', {
    name: '기준 잔고 확인',
    exact: true
  });
  await expect(anchorDialog).toContainText('2026-09-30');
  await expect(anchorDialog.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveValue('600,000');
  await expect(anchorDialog.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveAttribute('readonly', '');
  await page.keyboard.press('Escape');
  const incomeTable = page.getByRole('table', {
    name: '입금 귀속 동 확인',
    exact: true
  });
  await expect(incomeTable).toContainText('402호');
  await expect(incomeTable).not.toContainText('관리비');
  const incomeFilter = page.getByRole('combobox', {
    name: '연결 세대 동',
    exact: true
  });
  await incomeFilter.fill('103');
  await page.getByRole('option', {
    name: '103동',
    exact: true
  }).click();
  await expect(incomeTable).toContainText('조회할 내역이 없습니다.');
  await incomeFilter.fill('전체');
  await page.getByRole('option', {
    name: '전체 동',
    exact: true
  }).click();
  await page.getByRole('textbox', {
    name: '입금 검색',
    exact: true
  }).fill('문영일');
  await expect(incomeTable.getByRole('row')).toHaveCount(2);
  await expect(incomeTable).toContainText('문영일');
  await page.getByRole('textbox', {
    name: '입금 검색',
    exact: true
  }).fill('');
  await incomeFilter.fill('미확인');
  await page.getByRole('option', {
    name: '세대 미확인',
    exact: true
  }).click();
  await expect(incomeTable.getByRole('row')).toHaveCount(4);
  await expect(incomeTable).toContainText('세대 미확인');
  await incomeFilter.fill('전체');
  await page.getByRole('option', {
    name: '전체 동',
    exact: true
  }).click();
  const comparisonCard = page.getByRole('heading', {
    name: '월 입금·출금 비중',
    exact: true
  }).locator('..');
  const differenceCard = page.getByRole('heading', {
    name: '잔고 차이 확인',
    exact: true
  }).locator('..');
  expect((await comparisonCard.boundingBox())!.height).toBe((await differenceCard.boundingBox())!.height);
  await expect(differenceCard.locator('dd').first()).toHaveCSS('color', 'rgb(239, 68, 68)');
  await page.getByRole('button', {
    name: '동별 입금 출금 그래프',
    exact: true
  }).click();
  const graphDialog = page.getByRole('dialog', {
    name: '동별 입금·지출 비교',
    exact: true
  });
  await expect(graphDialog).toContainText('109동');
  await graphDialog.getByRole('combobox', {
    name: '그래프 동 선택',
    exact: true
  }).fill('103');
  await graphDialog.getByRole('option', {
    name: '103동',
    exact: true
  }).click();
  await expect(graphDialog.getByRole('table', {
    name: '동별 입금 출금 비교',
    exact: true
  }).getByRole('row')).toHaveCount(2);
  await expect(graphDialog).toContainText('-45,665원');
  await expect(graphDialog.getByRole('img')).toHaveAccessibleName(/월 입출금 차액 -45,665원/);
  await page.screenshot({
    path: test.info().outputPath('graphDesktop.png'),
    fullPage: false
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await table.getByRole('row').filter({
    hasText: '102동'
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances?month=2026-10`);
  const detail = page.getByRole('dialog', {
    name: '102동 상세 원장',
    exact: true
  });
  await expect(detail.getByRole('table', {
    name: '동별 상세 원장',
    exact: true
  })).toContainText('604,335원');
  const direction = detail.getByRole('combobox', {
    name: '입출금 구분',
    exact: true
  });
  const ledgerTable = detail.getByRole('table', {
    name: '동별 상세 원장',
    exact: true
  });
  await direction.click();
  await detail.getByRole('option', {
    name: '출금',
    exact: true
  }).click();
  await expect(ledgerTable.getByRole('row')).toHaveCount(2);
  await expect(ledgerTable).toContainText('604,335원');
  await expect(ledgerTable.getByRole('columnheader', {
    name: '입금',
    exact: true
  })).toHaveCount(0);
  await expect(ledgerTable.getByRole('columnheader', {
    name: '지출명',
    exact: true
  })).toBeVisible();
  await expect(ledgerTable).toContainText('-45,665원');
  await ledgerTable.getByRole('row').filter({
    hasText: '전기료'
  }).click();
  const expenseDialog = page.getByRole('dialog', {
    name: '지출 상세',
    exact: true
  });
  await expect(expenseDialog).toContainText('182,660원');
  await page.keyboard.press('Escape');
  await expect(detail).toBeVisible();
  await direction.click();
  await detail.getByRole('option', {
    name: '입금',
    exact: true
  }).click();
  await expect(ledgerTable).toContainText('650,000원');
  await expect(ledgerTable.getByRole('columnheader', {
    name: '출금',
    exact: true
  })).toHaveCount(0);
  await expect(ledgerTable.getByRole('columnheader', {
    name: '입금자',
    exact: true
  })).toBeVisible();
  await ledgerTable.getByRole('row').filter({
    hasText: '관리비'
  }).click();
  await expect(page.getByRole('dialog', {
    name: '입금 처리 상세',
    exact: true
  })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('table', {
    name: '외부 부담금',
    exact: true
  }).getByRole('row').filter({
    hasText: '외부 101동'
  }).click();
  const settle = page.getByRole('dialog', {
    name: '외부 부담금 정산',
    exact: true
  });
  // 연결 가능한 입금이 없는 지급 건도 바로 제외하고 복원할 수 있어야 합니다.
  await expect(settle.getByText('연결 가능한 기타 입금이 없습니다.', {
    exact: false
  })).toBeVisible();
  await expect(settle.getByRole('button', {
    name: '입금 연결 확정',
    exact: true
  })).toBeDisabled();
  await settle.getByRole('button', {
    name: '정산에서 제외',
    exact: true
  }).click();
  await expect(settle.getByRole('alert')).toBeVisible();
  await expect(settle).toBeVisible();
  await settle.getByRole('button', {
    name: '정산에서 제외',
    exact: true
  }).click();
  await expect(settle).toHaveCount(0);
  const externalTable = page.getByRole('table', {
    name: '외부 부담금',
    exact: true
  });
  await expect(externalTable).not.toContainText('외부 101동');
  await expect(differenceCard.locator('dd').nth(1)).toHaveText('0원');
  await page.getByRole('combobox', {
    name: '정산 대상',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '정산에서 제외',
    exact: true
  }).click();
  await externalTable.getByRole('row').filter({
    hasText: '외부 101동'
  }).click();
  await expect(settle).toContainText('정산에서 제외한 내역입니다.');
  await expect(settle.getByRole('combobox', {
    name: '연결할 기타 입금',
    exact: true
  })).toHaveCount(0);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await expect(settle.getByRole('button', {
    name: '정산 대상으로 복원',
    exact: true
  })).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath('excludedSettlementMobile.png'),
    fullPage: false
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await settle.getByRole('button', {
    name: '정산 대상으로 복원',
    exact: true
  }).click();
  await expect(settle).toHaveCount(0);
  await expect(differenceCard.locator('dd').nth(1)).toHaveText('91,330원');
  await page.getByRole('combobox', {
    name: '정산 대상',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '정산 대상',
    exact: true
  }).click();
  await externalTable.getByRole('row').filter({
    hasText: '외부 101동'
  }).click();
  await settle.getByRole('combobox', {
    name: '연결할 기타 입금',
    exact: true
  }).fill('외부 반환');
  await page.getByRole('option', {
    name: /외부 반환/
  }).click();
  await settle.getByLabel('연결 금액', {
    exact: true
  }).fill('30000');
  await settle.getByRole('button', {
    name: '입금 연결 확정',
    exact: true
  }).click();
  await expect(settle.getByRole('alert')).toBeVisible();
  await expect(settle.getByLabel('연결 금액', {
    exact: true
  })).toHaveValue('30,000');
  await settle.getByRole('button', {
    name: '입금 연결 확정',
    exact: true
  }).click();
  await expect(settle).toHaveCount(0);
  await expect(page.getByRole('table', {
    name: '외부 부담금',
    exact: true
  })).toContainText('61,330원');
  await table.getByLabel('102동 선택', {
    exact: true
  }).check();
  const exported = page.waitForEvent('download');
  await page.getByRole('button', {
    name: '엑셀 다운로드',
    exact: true
  }).click();
  const report = await exported;
  const reportPath = test.info().outputPath('buildingBalances.xlsx');
  await report.saveAs(reportPath);
  const reportZip = unzipSync(await readFile(reportPath));
  expect(strFromU8(reportZip['xl/workbook.xml']).match(/<sheet /g)).toHaveLength(2);
  expect(strFromU8(reportZip['xl/sharedStrings.xml'])).not.toContain('103동');
  await page.getByRole('button', {
    name: '선택 해제',
    exact: true
  }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath('balancesDesktop.png'),
    fullPage: true,
    animations: 'disabled'
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({
      width,
      height: 1000
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await table.getByRole('row').filter({
    hasText: '102동'
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances/${id(102)}?month=2026-10`);
  await expect(page.getByRole('link', {
    name: '동별 잔고·정산으로 돌아가기',
    exact: true
  })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', {
    name: '동별 상세 원장',
    exact: true
  })).toContainText('604,335원');
  await page.screenshot({
    path: test.info().outputPath('balancesMobile.png'),
    fullPage: true,
    animations: 'disabled'
  });  await page.getByRole('table', {
    name: '동별 상세 원장',
    exact: true
  }).getByRole('row').filter({
    hasText: '관리비'
  }).click();
  await expect(page).toHaveURL(`${BASE}/receipts/${id(620)}?from=balance&buildingId=${id(102)}&month=2026-10`);
  await page.getByRole('link', {
    name: '동별 상세 원장으로 돌아가기',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances/${id(102)}?month=2026-10`);
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(`${BASE}/balances?month=2026-10`);
  await page.getByRole('button', {
    name: '기준 잔고 확인',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '기준 잔고 수정',
    exact: true
  }).click();
  const correction = page.getByRole('dialog', {
    name: '기준 잔고 수정',
    exact: true
  });
  await correction.getByRole('button', {
    name: '기준일',
    exact: false
  }).click();
  for (let month = 0; month < 3; month++) {
    await page.getByRole('button', {
      name: '이전 달',
      exact: true
    }).click();
  }
  await page.getByRole('button', {
    name: '2026년 6월 30일',
    exact: true
  }).click();
  await correction.getByLabel('102동 기준 잔고', {
    exact: true
  }).fill('610000');
  const correctionBuilding = correction.getByRole('combobox', {
    name: '동 선택',
    exact: true
  });
  await correctionBuilding.fill('103');
  await correction.getByRole('option', {
    name: '103동',
    exact: true
  }).click();
  await expect(correction.getByLabel('103동 기준 잔고', {
    exact: true
  })).toHaveValue('300,000');
  await correctionBuilding.fill('102');
  await correction.getByRole('option', {
    name: '102동',
    exact: true
  }).click();
  await expect(correction.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveValue('610,000');
  await expect(correction.getByRole('status')).toContainText('입력 완료 8 / 8개 동');
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await expect(correction.getByRole('button', {
    name: '변경 저장',
    exact: true
  })).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath('openingCorrectionMobile.png'),
    fullPage: false
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await correction.getByRole('button', {
    name: '변경 저장',
    exact: true
  }).click();
  await expect(correction.getByRole('alert')).toBeVisible();
  await expect(correction.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveValue('610,000');
  await correction.getByRole('button', {
    name: '변경 저장',
    exact: true
  }).click();
  await expect(correction).toHaveCount(0);
  await expect(page.getByRole('table', {
    name: '동별 잔고',
    exact: true
  })).toContainText('614,335원');
  await page.getByRole('button', {
    name: '기준 잔고 확인',
    exact: true
  }).click();
  const corrected = page.getByRole('dialog', {
    name: '기준 잔고 확인',
    exact: true
  });
  await expect(corrected).toContainText('2026-06-30');
  await expect(corrected.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveValue('610,000');
  await expect(corrected.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveAttribute('readonly', '');
});

test('기타 입금을 동별로 배분하고 편집에서 입출금 선택 삭제 후 다시 가져오기', async ({ page }) => {
  let rows: BankingTransaction[] = [{
    ...row(901, 'INCOME', '예금이자', '1000'),
    paymentId: id(911),
    status: 'CONFIRMED',
    receiptType: 'OTHER',
    unitLabel: '예금이자'
  }, row(902, 'EXPENSE', '문자수수료', '200')];
  const buildings = [{
    id: BUILDING_B,
    label: '103동'
  }, {
    id: BUILDING_A,
    label: '102동'
  }];
  const workspace = () => ({
    propertyId: PROPERTY,
    asOf: '2026-10-17',
    buildings,
    units: [],
    rows,
    rules: []
  });
  const allocationRequests: string[] = [];
  const deleteRequests: string[] = [];
  let uploaded = '';
  await page.route('http://localhost:8080/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith('/csrf')) body = {
      csrfToken: 'test-csrf'
    };
    else if (path.endsWith('/refresh')) body = {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now() + 3600000).toISOString()
    };
    else if (path === '/api/users/me') body = {
      id: id(1),
      displayName: '관리자',
      profileImageUrl: null,
      systemRole: 'USER',
      status: 'ACTIVE'
    };
    else if (path.endsWith('/management-context')) body = {
      propertyId: PROPERTY,
      name: '모아빌라',
      role: 'ADMIN'
    };
    else if (path.endsWith('/managed-properties')) body = {
      properties: [{
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'ADMIN'
      }]
    };
    else if (path.endsWith('/payments/workspace')) body = {
      propertyId: PROPERTY,
      asOf: '2026-10-17',
      accounts: [{
        id: ACCOUNT,
        label: '공용 통장'
      }],
      units: [],
      charges: [],
      history: [],
      payments: rows.filter((item) => item.paymentId).map((item) => ({
        id: item.paymentId,
        accountId: ACCOUNT,
        date: item.date,
        payer: item.payer,
        amount: item.amount,
        source: 'BANK_IMPORT',
        status: 'CONFIRMED',
        receiptType: 'OTHER',
        incomeCategory: '예금이자',
        unitId: '',
        bankTransactionId: item.id,
        allocations: []
      }))
    };
    else if (path.endsWith('/banking/workspace')) body = workspace();
    else if (path.endsWith('/income-allocation')) {
      allocationRequests.push(route.request().postData()!);
      const allocation = route.request().postDataJSON();
      expect(allocation.mode).toBe('RATIO');
      expect(allocation.allocations.map((part: { amount: string }) => part.amount)).toEqual(['250', '750']);
      if (allocationRequests.length === 1) { await route.fulfill({
        status: 503,
        json: {
          code: 'PAYMENT_SERVICE_UNAVAILABLE'
        }
      }); return; }
      expect(allocationRequests[0]).toBe(allocationRequests[1]);
      rows = rows.map((item) => item.id === id(901) ? {
        ...item,
        incomeAllocation: {
          ...allocation,
          id: id(911)
        }
      } : item);
      body = workspace();
    } else if (path.endsWith('/transactions/delete')) {
      deleteRequests.push(route.request().postData()!);
      const selected = route.request().postDataJSON().transactionIds;
      expect(selected.sort()).toEqual([id(901), id(902)]);
      if (deleteRequests.length === 1) { await route.fulfill({
        status: 503,
        json: {
          code: 'PAYMENT_SERVICE_UNAVAILABLE'
        }
      }); return; }
      expect(deleteRequests[0]).toBe(deleteRequests[1]);
      rows = []; body = workspace();
    } else if (path.endsWith('/banking/import/preview')) body = {
      propertyId: PROPERTY,
      rows: [row(920, 'INCOME', '예금이자', '1000')],
      duplicateCount: 0,
      beforeCutoffCount: 0
    };
    else if (path.endsWith('/banking/import')) {
      uploaded = route.request().postDataBuffer()!.toString('utf8');
      rows = [{
        ...row(921, 'INCOME', '예금이자', '1000'),
        paymentId: id(922),
        status: 'CONFIRMED',
        receiptType: 'OTHER',
        incomeAllocation: {
          id: id(922),
          category: '예금이자',
          note: '',
          mode: 'EQUAL',
          saveAsRule: false,
          allocations: [{
            buildingId: BUILDING_A,
            label: '102동',
            amount: '500',
            percentage: null
          }, {
            buildingId: BUILDING_B,
            label: '103동',
            amount: '500',
            percentage: null
          }]
        }
      }]; body = workspace();
    } else throw new Error(`Unexpected API ${path}`);
    await route.fulfill({
      status: 200,
      json: body
    });
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(`${BASE}/transactions`);
  const table = page.getByRole('table', {
    name: '통장 거래',
    exact: true
  });
  await expect(table.getByRole('checkbox')).toHaveCount(0);
  await table.getByRole('row').filter({
    hasText: '예금이자'
  }).click();
  const detail = page.getByRole('dialog', {
    name: '입금 처리 상세',
    exact: true
  });
  const split = detail.getByRole('region', {
    name: '기타 입금 동별 배분',
    exact: true
  });
  await expect(split).toContainText('배분액 합계 1,000원');
  await expect(split.getByRole('button', {
    name: '외부·공통 부담처 추가'
  })).toHaveCount(0);
  await split.getByRole('combobox', {
    name: '나누는 방법',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '비율 지정',
    exact: true
  }).click();
  await split.getByLabel('102동 배분 비율', {
    exact: true
  }).fill('25');
  await split.getByLabel('103동 배분 비율', {
    exact: true
  }).fill('75');
  await split.getByRole('button', {
    name: '입금 배분 확정',
    exact: true
  }).click();
  await expect(split.getByRole('alert')).toBeVisible();
  await expect(split.getByLabel('102동 배분 비율', {
    exact: true
  })).toHaveValue('25');
  await split.getByRole('button', {
    name: '입금 배분 확정',
    exact: true
  }).click();
  await expect(split.getByRole('list')).toContainText('250원');
  await expect(split.getByRole('list')).toContainText('750원');
  await detail.getByRole('button', {
    name: '입금 상세 닫기',
    exact: true
  }).click();
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto(`${BASE}/receipts/${id(911)}`);
  await expect(page.getByRole('region', {
    name: '기타 입금 동별 배분',
    exact: true
  })).toContainText('750원');
  await page.screenshot({
    path: test.info().outputPath('incomeAllocationMobile.png'),
    fullPage: true
  });
  await page.goto(`${BASE}/transactions`);
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.getByRole('button', {
    name: '편집',
    exact: true
  }).click();
  await table.getByRole('row').filter({
    hasText: '예금이자'
  }).click();
  await expect(table.getByLabel('예금이자 거래 선택', {
    exact: true
  })).toBeChecked();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('textbox', {
    name: '거래 검색',
    exact: true
  }).fill('문자');
  await page.getByRole('textbox', {
    name: '거래 검색',
    exact: true
  }).fill('');
  await expect(table.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', {
    name: '편집',
    exact: true
  }).click();
  await table.getByLabel('현재 페이지 거래 전체 선택', {
    exact: true
  }).check();
  await page.getByRole('button', {
    name: '선택 삭제',
    exact: true
  }).click();
  const deletion = page.getByRole('dialog', {
    name: '선택한 거래를 삭제할까요?',
    exact: true
  });
  await expect(deletion.getByRole('listitem')).toHaveCount(2);
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await expect(deletion.getByRole('button', {
    name: '삭제',
    exact: true
  })).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath('deleteTransactionsMobile.png'),
    fullPage: false
  });
  await deletion.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(deletion.getByRole('alert')).toBeVisible();
  await deletion.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(deletion).toHaveCount(0);
  await expect(table).toContainText('조회할 거래가 없습니다.');
  await page.getByRole('button', {
    name: '엑셀 업로드',
    exact: true
  }).click();
  await page.getByLabel('통장 거래 파일 선택', {
    exact: true
  }).setInputFiles({
    name: 'interest.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('거래일,입금액,출금액,적요\n2026-10-15,1000,0,예금이자')
  });
  await page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  }).getByRole('row').filter({
    hasText: '예금이자'
  }).click();
  const upload = page.getByRole('dialog', {
    name: '예금이자',
    exact: true
  });
  await upload.getByRole('combobox', {
    name: '입금 용도',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '이자 등 기타 입금 · 동별 배분',
    exact: true
  }).click();
  await expect(upload).toContainText('배분액 합계 1,000원');
  await expect(upload.getByRole('checkbox', {
    name: '102동',
    exact: true
  })).toBeChecked();
  await upload.getByRole('button', {
    name: '설정 완료',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  })).toContainText('2개 동 배분 예정');
  await page.getByRole('button', {
    name: '선택 거래 처리 (1)',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/transactions`);
  expect(uploaded).toContain('"incomeAllocation"');
  expect(uploaded).toContain('"amount":"500"');
  await expect(table).toContainText('기타 입금');
  await expect(table).toContainText('2개 동 배분');
  await expect(table).not.toContainText('102동 · 103동');

  // 외부 입금 항목과 세대 연결을 구분하고 동 수가 늘어도 목록에는 개수만 표시합니다.
  rows = [{
    ...rows[0],
    incomeAllocation: {
      ...rows[0].incomeAllocation!,
      category: '(예금이자 248 소득세 30 지방소득세 0)',
      allocations: Array.from({
        length: 8
      }, (_, index) => ({
        buildingId: id(102 + index),
        label: `${102 + index}동`,
        amount: '125',
        percentage: null
      }))
    }
  }, {
    ...row(930, 'INCOME', '전시현', '93960'),
    paymentId: id(931),
    status: 'CONFIRMED',
    receiptType: 'OTHER',
    unitLabel: '전기료'
  }, {
    ...row(940, 'INCOME', '103동202호', '50000'),
    paymentId: id(941),
    status: 'CONFIRMED',
    receiptType: 'HOUSEHOLD',
    unitId: id(942),
    unitLabel: '103동 202호'
  }];
  await page.reload();
  await expect(table.getByRole('columnheader', {
    name: '처리 내용',
    exact: true
  })).toBeVisible();
  await expect(table.getByRole('row').filter({
    hasText: '전시현'
  }).getByRole('cell', {
    name: '기타 입금',
    exact: true
  })).toBeVisible();
  await expect(table.getByRole('row').filter({
    hasText: '103동202호'
  })).toContainText('세대 수납');
  await expect(table.getByRole('row').filter({
    hasText: '예금이자'
  })).toContainText('8개 동 배분');
  await expect(table).not.toContainText('109동');
  await expect(table).not.toContainText('회수 완료');
  await expect(table).not.toContainText('기타 입금 ·');
  await expect(table).not.toContainText('소득세');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({
      width,
      height: 900
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath('transactionProcessingContent.png'),
    fullPage: true,
    animations: 'disabled'
  });
});
