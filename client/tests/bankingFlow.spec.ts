import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import { readFile } from 'node:fs/promises';
import type {
  BankingTransaction,
  BankingWorkspaceData
} from '../src/widgets/banking-workspace/api/bankingApiTypes';

const PROPERTY = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const ACCOUNT = '00000000-0000-4000-8000-000000000010';
const BUILDING_A = '00000000-0000-4000-8000-000000000102';
const BUILDING_B = '00000000-0000-4000-8000-000000000103';
const BASE = `/manage/${PROPERTY}/banking`;
const IMPORT_ACCOUNT = {
  id: ACCOUNT,
  bankName: '하나은행',
  bankCode: '081',
  importSupport: {
    enabled: true,
    extensions: ['.xls', '.xlsx', '.csv'],
    message: '지원 형식: .xls · .xlsx · .csv'
  },
  last4: '1234',
  alias: null,
  isPrimary: true,
  status: 'ACTIVE'
};
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

for (const width of [1440, 390]) {
  test(`외부 부담금 거래 삭제 ${width}px는 출금 전체 범위 확인·취소·실패 재시도 후 동별 잔고를 갱신`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const transactionId = id(900), externalId = id(901);
    let removed = false;
    const requests: unknown[] = [];
    let finishDelete: () => void = () => {};
    const deleteGate = new Promise<void>((resolve) => { finishDelete = resolve; });
    await page.route('http://localhost:8080/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({
        status: 200,
        headers
      });
      let body: unknown;
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        asOf: '2026-10-18',
        accounts: [{
          id: ACCOUNT,
          label: '하나은행 ····6546'
        }],
        units: [],
        charges: [],
        payments: []
      };
      else if (path.endsWith('/transactions/delete')) {
        expect(route.request().method()).toBe('POST');
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) return route.fulfill({
          status: 503,
          headers,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'SERVICE_UNAVAILABLE'
          })
        });
        await deleteGate;
        removed = true;
        body = {
          propertyId: PROPERTY,
          asOf: '2026-10-18',
          rows: [],
          buildings: [],
          units: [],
          rules: []
        };
      }
      else if (path.endsWith('/banking/balances')) body = {
        propertyId: PROPERTY,
        month: '2026-10',
        cutoffDate: '2026-07-01',
        accountId: ACCOUNT,
        bankBalance: null,
        bankAsOf: null,
        accounts: [{
          id: ACCOUNT,
          label: '하나은행 ····6546',
          status: 'ACTIVE',
          balance: null,
          asOf: null,
          calculatedBalance: removed ? '1000000' : '817310',
          calculationBasisDate: '2026-07-01'
        }],
        buildings: [BUILDING_A, BUILDING_B].map((buildingId, index) => ({
          id: buildingId,
          label: `${102 + index}동`,
          active: true,
          startBalance: '500000',
          income: '0',
          expense: removed ? '0' : index === 0 ? '45672' : '45673',
          balance: removed ? '500000' : index === 0 ? '454328' : '454327',
          status: 'READY',
          openingBalance: '500000',
          openingRevision: 0
        })),
        entries: [],
        incomes: [],
        pending: [],
        externals: [
          ...(!removed ? [{
            id: externalId,
            accountId: ACCOUNT,
            transactionId,
            transactionAmount: '182690',
            date: '2026-10-12',
            expenseName: '09전기요금',
            label: '101동',
            amount: '91345',
            received: '0',
            remaining: '91345',
            recoveries: [],
            excluded: false,
            decisionRevision: 0
          }] : []),
          {
            id: id(902),
            accountId: ACCOUNT,
            transactionId: id(903),
            transactionAmount: '187920',
            date: '2026-09-10',
            expenseName: '09전기요금',
            label: '101동',
            amount: '93960',
            received: '93960',
            remaining: '0',
            recoveries: [],
            excluded: false,
            decisionRevision: 0
          }
        ]
      };
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
          residentEligible: false,
          ...body
        } : body)
      });
    });
    const listUrl = `${BASE}/balances?month=2026-10&account=${ACCOUNT}`;
    await page.goto(listUrl);
    await page.getByRole('table', {
      name: '외부 부담금',
      exact: true
    }).getByRole('row').filter({
      hasText: '2026-10-12'
    }).click();
    if (width < 768) await expect(page).toHaveURL(new RegExp(`/details/settlement\\?month=2026-10&account=${ACCOUNT}&target=${externalId}`));
    await page.getByRole('button', {
      name: '거래 삭제',
      exact: true
    }).click();
    await expect(page.getByRole('heading', {
      name: '거래를 삭제할까요?',
      exact: true
    })).toBeVisible();
    await expect(page.getByText('2026-10-12 · 출금 182,690원', {
      exact: true
    })).toBeVisible();
    await expect(page.getByText('외부 부담금 91,345원과 이 출금에 연결된 모든 동별 지출을 계산에서 제거합니다. 처리 이력은 보관됩니다.', {
      exact: true
    })).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '거래 삭제',
      exact: true
    })).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', {
      name: '거래 삭제',
      exact: true
    }).click();
    await page.screenshot({
      path: testInfo.outputPath(`externalDelete${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(page.getByRole('alert').filter({
      hasText: '통장 정보를 처리하지 못했어요. 입력을 확인하고 다시 시도해주세요.'
    })).toBeVisible();
    await expect(page.getByRole('heading', {
      name: '거래를 삭제할까요?',
      exact: true
    })).toBeVisible();
    expect(requests).toEqual([{
      transactionIds: [transactionId]
    }]);
    await page.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '삭제',
      exact: true
    })).toBeDisabled();
    await expect(page.getByRole('button', {
      name: '취소',
      exact: true
    })).toBeDisabled();
    await expect.poll(() => requests.length).toBe(2);
    finishDelete();
    await expect(page.getByRole('article', {
      name: '동별 잔고 합계 1,000,000원',
      exact: true
    })).toBeVisible();
    await expect(page).toHaveURL(listUrl);
    const table = page.getByRole('table', {
      name: '외부 부담금',
      exact: true
    });
    await expect(table.getByText('2026-10-12')).toHaveCount(0);
    await expect(table.getByText('2026-09-10')).toBeVisible();
    expect(requests).toEqual([{
      transactionIds: [transactionId]
    }, {
      transactionIds: [transactionId]
    }]);
    await page.reload();
    await expect(page.getByRole('article', {
      name: '동별 잔고 합계 1,000,000원',
      exact: true
    })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('업로드 페이지에서 필터·페이지 선택을 유지하고 전기료 특수 배분을 함께 전송', async ({ page }) => {
  const diagnostics: Record<string, unknown>[] = [];
  page.on('console', async (message) => {
    if (message.type() === 'error' && message.text().startsWith('[모아홈 API 오류]')) {
      diagnostics.push(await message.args()[1].jsonValue());
    }
  });
  const rows = [...Array.from({
    length: 11
  }, (_, index) => row(200 + index, 'INCOME', `입금자${index}`, '50000')), row(300, 'EXPENSE', '07전기요금', '182660')];
  rows[2].unitId = id(400);
  rows[2].unitLabel = '102동 501호';
  let saved: BankingWorkspaceData = {
    accounts: [IMPORT_ACCOUNT],
    propertyId: PROPERTY,
    asOf: '2026-10-17',
    buildings: [{
      id: BUILDING_B,
      label: '103동'
    }, {
      id: BUILDING_A,
      label: '102동'
    }],
    units: [{
      id: id(400),
      label: '102동 501호'
    }],
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
    else if (path.endsWith('/access-context')) body = {
      residentEligible: false,
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
      body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
        residentEligible: false,
        ...body
      } : body)
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
  await expect(page.getByText('입금 11건 · 출금 1건')).toBeVisible();
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
  const processing = page.getByRole('combobox', {
    name: '처리 내용',
    exact: true
  });
  const chooseProcessing = async (name: string) => {
    await processing.click();
    await page.getByRole('option', {
      name,
      exact: true
    }).click();
  };
  await chooseProcessing('세대 수납 예정 (1)');
  await expect(page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  })).toContainText('102동 501호');
  await chooseProcessing('입금 분류 필요 (10)');
  await page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  })
    .getByRole('row').filter({
      hasText: '입금자1'
    }).first().click();
  const receiptEditor = page.getByRole('dialog');
  await receiptEditor.getByRole('combobox', {
    name: '입금 용도',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '외부 분담금·수리비 등 기타 입금',
    exact: true
  }).click();
  await receiptEditor.getByLabel('기타 입금 항목', {
    exact: true
  }).fill('공동 수리비');
  await receiptEditor.getByRole('button', {
    name: '설정 완료',
    exact: true
  }).click();
  await expect(processing).toContainText('입금 분류 필요 (9)');
  await chooseProcessing('기타 입금 (1)');
  const filteredPreview = page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  });
  await expect(filteredPreview.getByRole('row')).toHaveCount(2);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({
      width,
      height: 1000
    });
    // 화면 폭 변경 뒤 기존 거래 행의 스크롤 위치가 유지될 수 있으므로 실제 조작할 필터를 먼저 표시합니다.
    await processing.scrollIntoViewIfNeeded();
    await expect(processing).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await processing.click();
    await expect(page.getByRole('option', {
      name: '기타 입금 (1)',
      exact: true
    })).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath(`processingFilter${width}.png`),
      fullPage: true
    });
    await test.info().attach(`업로드 처리 필터 ${width}px`, {
      path: test.info().outputPath(`processingFilter${width}.png`),
      contentType: 'image/png'
    });
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await expect(page.getByLabel('선택 거래 저장', {
    exact: true
  })).toContainText('선택한 거래 11건');
  await page.getByLabel('거래 검색', {
    exact: true
  }).fill('검색결과없음');
  await expect(processing).toContainText('기타 입금 (0)');
  await expect(filteredPreview).not.toContainText('입금자1');
  await page.getByLabel('거래 검색', {
    exact: true
  }).fill('');
  await filteredPreview.getByRole('row').filter({
    hasText: '입금자1'
  }).click();
  await expect(receiptEditor.getByLabel('기타 입금 항목', {
    exact: true
  })).toHaveValue('공동 수리비');
  await receiptEditor.getByRole('combobox', {
    name: '입금 용도',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '명단 일치 자동 수납 · 미일치는 확인 필요',
    exact: true
  }).click();
  await receiptEditor.getByRole('button', {
    name: '설정 완료',
    exact: true
  }).click();
  await chooseProcessing('처리 내용 전체 (11)');
  await expect(page.getByLabel('입금자0 거래 선택', {
    exact: true
  })).not.toBeChecked();
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
  await expect(processing).toContainText('처리 내용 전체 (1)');
  await processing.click();
  await expect(page.getByRole('option', {
    name: '지출 (1)',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('option', {
    name: /세대 수납 예정/
  })).toHaveCount(0);
  await page.keyboard.press('Escape');
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
  await expect(settings.getByRole('checkbox', {
    name: '관리 통장 간 이체',
    exact: true
  })).toHaveCount(0);
  await expect(settings.getByText('등록한 다른 통장으로 옮긴 돈이에요.', {
    exact: true
  })).toHaveCount(0);
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
    name: '선택 거래 저장'
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
    name: '선택 거래 저장'
  }).click();
  await expect(page.getByText('서버에 연결하지 못했어요. 선택과 입력을 유지하고 다시 시도해주세요.')).toBeVisible();
  // 운영 번들은 진단 로그를 남기지 않습니다. 개발 로그의 내용·비밀값 제외는 customApi.spec.ts에서 검증합니다.
  expect(diagnostics).toEqual([]);
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
    name: '선택 거래 저장'
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
  await expect(page).toHaveURL(`${BASE}/transactions/${id(300)}?month=2026-10`);
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
  test.setTimeout(120_000);
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
    else if (path.endsWith('/access-context')) body = {
      residentEligible: false,
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
    name: '다운로드',
    exact: true
  });
  const startBounds = (await startButton.locator('..').boundingBox())!;
  const exportBounds = (await exportButton.boundingBox())!;
  expect(Math.abs(startBounds.y - exportBounds.y)).toBeLessThanOrEqual(1);
  expect(startBounds.height).toBe(exportBounds.height);
  expect(exportBounds.x - startBounds.x - startBounds.width).toBeGreaterThanOrEqual(12);
  const help = page.getByRole('button', {
    name: '기준 잔고 도움말',
    exact: true
  });
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveCount(0);
  await startButton.hover();
  await expect(tooltip).toContainText('기준일의 동별 보유금을 등록합니다.');
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('openingHelpDesktop.png'),
    fullPage: false
  });
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  await help.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.getByRole('heading', {
    name: '동별 잔고·정산',
    exact: true
  }).click();
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
  await expect(incomeTable).toContainText('조건에 맞는 검색 결과가 없어요.');
  await expect(incomeTable.locator('img')).toHaveAttribute('src', /noResults/);
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
  const differenceTrigger = differenceCard.getByRole('button', {
    name: '잔고 차이 내역 확인',
    exact: true
  });
  await differenceTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', {
    name: '잔고 차이 내역',
    exact: true
  })).toBeVisible();
  await page.keyboard.press('Escape');
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
    name: '동 선택',
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
    name: '다운로드',
    exact: true
  }).click();
  const downloadModal = page.getByRole('dialog', {
    name: '2026년 10월 동별 입출금 내역',
    exact: true
  });
  await expect(downloadModal.getByRole('combobox', {
    name: '조회 동',
    exact: true
  })).toHaveText('102동');
  await downloadModal.getByRole('button', {
    name: 'Excel 다운로드',
    exact: true
  }).click();
  const report = await exported;
  const reportPath = test.info().outputPath('buildingBalances.xlsx');
  await report.saveAs(reportPath);
  const reportZip = unzipSync(await readFile(reportPath));
  expect(strFromU8(reportZip['xl/workbook.xml']).match(/<sheet /g)).toHaveLength(1);
  await downloadModal.getByRole('button', {
    name: '다운로드 미리보기 닫기',
    exact: true
  }).click();
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
  // 모바일 진입은 모달을 열지 않고 새로고침·헤더 복귀가 가능한 페이지를 사용합니다.
  await help.dispatchEvent('click');
  await expect(tooltip).toContainText('등록한 동별 기준 잔고를 확인·수정합니다.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await tooltip.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth;
  })).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('openingHelpMobile.png'),
    fullPage: false
  });
  await page.getByRole('heading', {
    name: '동별 잔고·정산',
    exact: true
  }).click();
  await expect(tooltip).toHaveCount(0);
  const monthControl = page.getByRole('button', {
    name: '조회 월: 2026년 10월',
    exact: true
  });
  const availableMonthWidth = await monthControl.evaluate((button) => {
    const card = button.closest('section')!;
    const style = getComputedStyle(card);
    return card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });
  expect(Math.abs((await monthControl.boundingBox())!.width - availableMonthWidth)).toBeLessThanOrEqual(1);
  const backToBalances = page.getByRole('link', {
    name: '동별 잔고·정산으로 돌아가기',
    exact: true
  });
  await page.getByRole('button', {
    name: '동별 입금 출금 그래프',
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/balances\/details\/chart\?month=2026-10/);
  await expect(page.getByRole('heading', {
    name: '동별 입금·지출 비교',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('table', {
    name: '동별 입금 출금 비교',
    exact: true
  })).toContainText('109동');
  await page.screenshot({
    path: test.info().outputPath('graphMobilePage.png'),
    fullPage: true
  });
  await backToBalances.click();
  await expect(page).toHaveURL(`${BASE}/balances?month=2026-10`);
  await page.getByRole('button', {
    name: '잔고 차이 내역 확인',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances/details/difference?month=2026-10`);
  await expect(page.getByRole('heading', {
    name: '잔고 차이 내역',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await backToBalances.click();
  await page.getByRole('button', {
    name: '기준 잔고 확인',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances/details/opening?month=2026-10`);
  await expect(page.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveValue('600,000');
  await page.getByRole('button', {
    name: '기준 잔고 수정',
    exact: true
  }).click();
  await expect(page.getByLabel('102동 기준 잔고', {
    exact: true
  })).toHaveValue('600,000');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await backToBalances.click();
  await page.getByRole('table', {
    name: '입금 귀속 동 확인',
    exact: true
  }).getByRole('row').filter({
    hasText: '문영일'
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances/details/assignment?month=2026-10&target=${id(713)}`);
  await expect(page.getByRole('heading', {
    name: '입금 귀속 동 확인',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await backToBalances.click();
  await page.getByRole('table', {
    name: '외부 부담금',
    exact: true
  }).getByRole('row').filter({
    hasText: '외부 101동'
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances/details/settlement?month=2026-10&target=${externalId}`);
  await expect(page.getByRole('heading', {
    name: '외부 부담금 정산',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('combobox', {
    name: '연결할 기타 입금',
    exact: true
  })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('settlementMobilePage.png'),
    fullPage: true
  });
  await page.getByRole('button', {
    name: '정산에서 제외',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances?month=2026-10`);
  await expect(externalTable).not.toContainText('외부 101동');
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
  await page.getByRole('button', {
    name: '정산 대상으로 복원',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/balances?month=2026-10`);
  await expect(externalTable).toContainText('외부 101동');
  // 잘못된 대상이나 조회 오류에서도 월을 유지한 헤더 복귀를 제공합니다.
  await page.goto(`${BASE}/balances/details/settlement?month=2026-08&target=${id(999)}`);
  await expect(page.getByText('해당 내역을 찾을 수 없습니다.', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '입금 연결 확정',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await backToBalances.click();
  await expect(page).toHaveURL(`${BASE}/balances?month=2026-08`);
  await page.route('**/banking/balances?month=2026-08', (route) => route.fulfill({
    status: 503,
    json: {
      code: 'PAYMENT_SERVICE_UNAVAILABLE'
    }
  }));
  await page.goto(`${BASE}/balances/details/difference?month=2026-08`);
  await expect(page.getByRole('alert', {
    name: '서버에 연결하지 못했어요',
    exact: true
  })).toBeVisible();
  await expect(backToBalances).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute('**/banking/balances?month=2026-08');
  await backToBalances.click();
  await expect(page).toHaveURL(`${BASE}/balances?month=2026-08`);
  await page.goto(`${BASE}/balances?month=2026-10`);
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
  const mobileLedger = page.getByRole('table', {
    name: '동별 상세 원장',
    exact: true
  });
  await expect(mobileLedger.getByRole('cell').first().locator('span').first()).toHaveCSS('white-space', 'nowrap');
  for (const width of [320, 390]) {
    await page.setViewportSize({
      width,
      height: 844
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
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
    accounts: [IMPORT_ACCOUNT],
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
    else if (path.endsWith('/access-context')) body = {
      residentEligible: false,
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
  await expect(split.getByRole('table', {
    name: '동별 입금 배분표'
  })).toContainText('250원');
  await expect(split.getByRole('table', {
    name: '동별 입금 배분표'
  })).toContainText('750원');
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
    name: '거래를 삭제할까요?',
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
  await expect(table).toContainText('아직 등록된 거래가 없어요.');
  await expect(table.locator('img')).toHaveAttribute('src', /emptyData/);
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
    name: '동별 입금 · 직접 배분',
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
  await page.getByRole('combobox', {
    name: '처리 내용',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '동별 입금 (1)',
    exact: true
  }).click();
  await expect(page.getByRole('table', {
    name: '업로드 거래 미리보기',
    exact: true
  })).toContainText('예금이자');
  await page.getByRole('button', {
    name: '선택 거래 저장',
    exact: true
  }).click();
  await expect(page).toHaveURL(`${BASE}/transactions`);
  expect(uploaded).toContain('"incomeAllocation"');
  expect(uploaded).toContain('"amount":"500"');
  await expect(table).toContainText('동별 입금');
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

for (const width of [1440, 390]) {
  test(`다중 통장 ${width}px에서 통장별 조회·이체 연결·선택 통장 업로드 처리`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const second = id(11);
    const accounts = [
      {
        id: ACCOUNT,
        bankName: '하나은행',
        bankCode: '081',
        importSupport: IMPORT_ACCOUNT.importSupport,
        last4: '1234',
        alias: '관리비',
        isPrimary: true,
        status: 'ACTIVE'
      },
      {
        id: second,
        bankName: '카카오뱅크',
        bankCode: '090',
        importSupport: {
          enabled: true,
          extensions: ['.xls', '.xlsx', '.csv'],
          message: '지원 형식: .xls · .xlsx · .csv'
        },
        last4: '5678',
        alias: '자유 보관',
        isPrimary: false,
        status: 'ACTIVE'
      }
    ];
    let saved: BankingWorkspaceData = {
      propertyId: PROPERTY,
      asOf: '2026-10-17',
      accounts,
      buildings: [],
      units: [],
      rules: [],
      rows: [
        {
          ...row(901, 'EXPENSE', '옮긴 돈', '10000'),
          balance: '90000',
          transferCandidate: true,
          transferId: null,
          status: 'TRANSFER_PENDING'
        },
        {
          ...row(902, 'INCOME', '받은 돈', '10000'),
          accountId: second,
          balance: '110000',
          transferCandidate: true,
          transferId: null,
          status: 'TRANSFER_PENDING'
        }
      ]
    };
    let transferBody: Record<string, string> | null = null;
    let uploadBody = '';
    let previewBody = '';
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        asOf: saved.asOf,
        accounts: accounts.map((account) => ({
          ...account,
          label: account.bankName
        })),
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/banking/workspace')) body = saved;
      else if (path.endsWith('/banking/transfers')) {
        transferBody = route.request().postDataJSON();
        saved = {
          ...saved,
          rows: saved.rows.map((row) => ({
            ...row,
            transferId: transferBody!.id,
            status: 'TRANSFER'
          }))
        };
        body = saved;
      } else if (path.endsWith('/banking/import/preview')) {
        previewBody = route.request().postDataBuffer()!.toString('utf8');
        body = {
          propertyId: PROPERTY,
          rows: [{
            ...row(903, 'INCOME', '다음 이체', '20000'),
            accountId: second
          }],
          duplicateCount: 0,
          beforeCutoffCount: 0
        };
      } else if (path.endsWith('/banking/import')) {
        uploadBody = route.request().postDataBuffer()!.toString('utf8');body = saved;
      }
      await route.fulfill({
        status: route.request().method() === 'OPTIONS' ? 204 : 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
        },
        body: route.request().method() === 'OPTIONS' ? '' : JSON.stringify(body)
      });
    });
    await page.goto(`${BASE}/transactions`);
    const accountFilter = page.getByRole('combobox', {
      name: '조회 통장',
      exact: true
    });
    const transactionSearch = page.getByRole('textbox', {
      name: '거래 검색',
      exact: true
    });
    await expect(accountFilter).toBeVisible();
    const recentBalanceHelp = page.getByRole('button', {
      name: '최근 은행 확인 잔액 도움말',
      exact: true
    });
    const recentBalanceTooltip = page.getByRole('tooltip');
    await expect(recentBalanceHelp).toHaveCount(0);
    await expect(page.getByText('조회 월', {
      exact: true
    })).toHaveCSS('clip-path', 'inset(50%)');
    await expect(page.getByText('조회 통장', {
      exact: true
    })).toHaveCount(0);
    const searchBox = (await transactionSearch.boundingBox())!;
    const accountBox = (await accountFilter.boundingBox())!;
    if (width > 767) {
      expect(accountBox.x).toBeGreaterThan(searchBox.x + searchBox.width);
      expect(Math.abs(accountBox.y - searchBox.y)).toBeLessThanOrEqual(1);
    } else expect(accountBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
    await accountFilter.click();
    await expect(page.getByRole('option')).toHaveText(['전체 통장', '하나은행 ····1234 · 관리비', '카카오뱅크 ····5678 · 자유 보관']);
    await page.keyboard.press('Escape');
    await page.getByRole('row').filter({
      hasText: '옮긴 돈'
    }).click();
    const dialog = width < 768 ? page : page.getByRole('dialog', {
      name: '계좌 간 이체',
      exact: true
    });
    await dialog.getByRole('combobox', {
      name: '상대 통장 거래',
      exact: true
    }).click();
    await page.getByRole('option').filter({
      hasText: '받은 돈'
    }).click();
    await dialog.getByRole('button', {
      name: '이체 연결',
      exact: true
    }).click();
    if (width < 768) { await expect(page.getByRole('button', {
      name: '이체 연결 해제',
      exact: true
    })).toBeVisible();await page.goBack(); }
    else await expect(page.getByRole('dialog', {
      name: '계좌 간 이체',
      exact: true
    })).toHaveCount(0);
    expect(transferBody).toMatchObject({
      outgoingId: id(901),
      incomingId: id(902)
    });
    await page.getByRole('combobox', {
      name: '조회 통장',
      exact: true
    }).click();
    await page.getByRole('option').filter({
      hasText: '카카오뱅크'
    }).click();
    await expect(page.getByRole('row').filter({
      hasText: '옮긴 돈'
    })).toHaveCount(0);
    await expect(page.getByRole('row').filter({
      hasText: '받은 돈'
    })).toBeVisible();
    await expect(page.getByText('110,000', {
      exact: true
    })).toBeVisible();
    await recentBalanceHelp.focus();
    await expect(recentBalanceTooltip).toContainText('은행 거래 파일에 기록된 마지막 거래 후 잔액입니다.');
    await expect(recentBalanceTooltip).toContainText('수동 입출금은 반영되지 않습니다.');
    await page.screenshot({
      path: testInfo.outputPath(`transactionSelectedBankHelp${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await recentBalanceHelp.press('Escape');
    await page.screenshot({
      path: test.info().outputPath(`multipleBanking${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.getByRole('button', {
      name: '엑셀 업로드',
      exact: true
    }).click();
    await page.getByRole('combobox', {
      name: '가져올 통장',
      exact: true
    }).click();
    await page.getByRole('option').filter({
      hasText: '카카오뱅크'
    }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: '통장.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('거래일,입금자,입금액\n2026-10-15,이체,20000')
    });
    await page.getByRole('row').filter({
      hasText: '다음 이체'
    }).click();
    expect(previewBody).toContain(second);
    const editor = page.getByRole('dialog', {
      name: '다음 이체',
      exact: true
    });
    await editor.screenshot({
      path: testInfo.outputPath(`transactionSettings${width}.png`),
      animations: 'disabled'
    });
    const transfer = editor.getByRole('checkbox', {
      name: '관리 통장 간 이체',
      exact: true
    });
    await expect(transfer).toBeVisible();
    await expect(transfer).toHaveAccessibleDescription('등록한 다른 통장으로 옮긴 돈이에요.');
    await expect(editor.getByRole('combobox', {
      name: '입금 용도',
      exact: true
    })).toBeVisible();
    await transfer.check();
    await expect(editor.getByRole('combobox', {
      name: '입금 용도',
      exact: true
    })).toHaveCount(0);
    await transfer.uncheck();
    await expect(editor.getByRole('combobox', {
      name: '입금 용도',
      exact: true
    })).toBeVisible();
    await transfer.check();
    await editor.screenshot({
      path: testInfo.outputPath(`transferSettings${width}.png`),
      animations: 'disabled'
    });
    await expect(editor.getByText('수납·지출 집계에서 제외됩니다.', {
      exact: true
    })).toHaveCount(0);
    const description = editor.getByText('등록한 다른 통장으로 옮긴 돈이에요.', {
      exact: true
    });
    const bounds = (await editor.boundingBox())!;
    const text = (await description.boundingBox())!;
    const contentIndent = await description.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
    expect(text.x - bounds.x + contentIndent).toBeGreaterThanOrEqual(40);
    expect(text.x + text.width).toBeLessThan(bounds.x + bounds.width - 12);
    await page.getByRole('button', {
      name: '설정 완료',
      exact: true
    }).click();
    await page.getByRole('combobox', {
      name: '처리 내용',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '계좌 간 이체 (1)',
      exact: true
    }).click();
    await expect(page.getByRole('table', {
      name: '업로드 거래 미리보기',
      exact: true
    })).toContainText('다음 이체');
    await page.getByRole('button', {
      name: /선택.*가져오기|선택.*저장|선택.*처리/
    }).click();
    await expect(page).toHaveURL(/banking\/transactions/);
    expect(uploadBody).toContain(`"accountId":"${second}"`);
    expect(uploadBody).toContain('"transfer":true');
    expect(uploadBody).not.toContain('"incomeCategory"');
    await page.goto(`${BASE}/expenses`);
    await expect(accountFilter).toBeVisible();
    await expect(page.getByText('조회 월', {
      exact: true
    })).toHaveCSS('clip-path', 'inset(50%)');
    await expect(page.getByText('조회 통장', {
      exact: true
    })).toHaveCount(0);
    const expenseSearchBox = (await transactionSearch.boundingBox())!;
    const expenseAccountBox = (await accountFilter.boundingBox())!;
    if (width > 767) {
      expect(expenseAccountBox.x).toBeGreaterThan(expenseSearchBox.x + expenseSearchBox.width);
      expect(Math.abs(expenseAccountBox.y - expenseSearchBox.y)).toBeLessThanOrEqual(1);
    } else expect(expenseAccountBox.y).toBeGreaterThanOrEqual(expenseSearchBox.y + expenseSearchBox.height);
    await page.screenshot({
      path: testInfo.outputPath(`expenseAccountFilter${width}.png`),
      fullPage: true
    });
  });
}

for (const width of [1440, 390, 320]) {
  test(`통장별 확인 잔액 ${width}px는 은행 로고·확인 시각과 터치·키보드 도움말을 표시`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    await page.route('http://localhost:8080/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        accounts: [],
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/banking/workspace')) body = {
        propertyId: PROPERTY,
        asOf: '2026-10-17',
        accounts: [],
        buildings: [],
        units: [],
        rules: [],
        rows: []
      };
      else if (path.endsWith('/banking/balances')) body = {
        propertyId: PROPERTY,
        month: url.searchParams.get('month'),
        cutoffDate: null,
        bankBalance: null,
        bankAsOf: null,
        buildings: [],
        entries: [],
        externals: [],
        incomes: [],
        pending: [],
        accounts: [
          {
            id: ACCOUNT,
            label: '신한은행 ····6546',
            status: 'ACTIVE',
            balance: '815204',
            asOf: '2026-10-15 14:12:59'
          },
          {
            id: id(11),
            label: '카카오뱅크 ····5678 · 공용 통장',
            status: 'ACTIVE',
            balance: null,
            asOf: null
          },
          {
            id: id(12),
            label: '하나은행 ····4321',
            status: 'CLOSED',
            balance: '0',
            asOf: '2026-09-30'
          }
        ]
      };
      await route.fulfill({
        status: route.request().method() === 'OPTIONS' ? 204 : 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
        },
        body: route.request().method() === 'OPTIONS' ? '' : JSON.stringify(body)
      });
    });
    await page.goto(`${BASE}/balances?month=2026-10`);
    const card = page.getByRole('region', {
      name: '통장별 확인 잔액',
      exact: true
    });
    await expect(card).toBeVisible();
    const rows = card.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('815,204원');
    await expect(rows.nth(0)).toContainText('10.15 14:12 확인');
    await expect(rows.nth(0).locator('img')).toHaveAttribute('src', '/banks/bank088.png');
    await expect(rows.nth(0).locator('time')).toHaveAttribute('datetime', '2026-10-15T14:12:59');
    await expect(rows.nth(1)).toContainText('은행 확인 자료 없음');
    await expect(rows.nth(1)).toContainText('잔액이 0원이라는 뜻은 아닙니다.');
    await expect(rows.nth(2)).toContainText('사용 종료');
    await expect(rows.nth(2)).toContainText('09.30 확인');
    await expect(rows.nth(2)).not.toContainText('00:00');
    await expect(card.getByRole('tooltip')).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({
      path: test.info().outputPath(`accountBalances${width}.png`)
    });
    const info = card.getByRole('button', {
      name: '통장별 확인 잔액 도움말',
      exact: true
    });
    if (width > 767) await info.hover();
    else await info.click();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('확인값 또는 계산 잔액입니다.');
    await expect(tooltip).toContainText('실시간 조회가 아닙니다.');
    expect((await tooltip.boundingBox())!.y).toBeGreaterThanOrEqual((await info.boundingBox())!.y + (await info.boundingBox())!.height);
    const bounds = await tooltip.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`accountBalanceHelp${width}.png`),
      fullPage: true
    });
    await card.getByRole('heading').click();
    await expect(tooltip).toHaveCount(0);
    await info.focus();
    await expect(tooltip).toBeVisible();
    await info.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(page.getByRole('article', {
      name: '은행 확인 잔고 은행 확인 자료 없음',
      exact: true
    })).toBeVisible();
    for (const [label, copy] of [
      ['은행 확인 잔고', '은행 거래 파일·잔액 인계·직접 확인 기록의 기준시점을 비교한 확인 잔액입니다.'],
      ['동별 잔고 합계', '조회 중인 모든 통장의 동별 잔고를 합한 금액입니다.'],
      ['잔고 비교 차이', '화면의 통장 잔액에서 동별 잔고 합계를 뺀 금액입니다.']
    ]) {
      const help = page.getByRole('button', {
        name: `${label} 도움말`,
        exact: true
      });
      if (width > 767) await help.hover();
      else await help.click();
      const explanation = page.getByRole('tooltip');
      await expect(explanation).toContainText(copy);
      await expect(explanation.locator('strong')).toHaveCSS('font-size', '17px');
      const helpBounds = await help.boundingBox();
      const tipBounds = await explanation.boundingBox();
      expect(tipBounds!.y).toBeGreaterThanOrEqual(helpBounds!.y + helpBounds!.height);
      expect(tipBounds!.x).toBeGreaterThanOrEqual(0);
      expect(tipBounds!.x + tipBounds!.width).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath(`summaryHelp${label}${width}.png`),
        fullPage: true,
        animations: 'disabled'
      });
      await help.press('Escape');
      await expect(explanation).toHaveCount(0);
      await page.getByRole('heading', {
        name: '동별 잔고·정산',
        exact: true
      }).click();
      await help.focus();
      await expect(explanation).toBeVisible();
      await page.getByRole('heading', {
        name: '동별 잔고·정산',
        exact: true
      }).click();
      await expect(explanation).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

for (const { width, unassigned } of [{
  width: 1440,
  unassigned: false
}, {
  width: 390,
  unassigned: false
}, {
  width: 1440,
  unassigned: true
}, {
  width: 390,
  unassigned: true
}]) {
  test(`통장 선택과 동별 기준 잔고 ${width}px는 입력·조회 범위와 공통 필터 디자인을 유지${unassigned ? ' · 기존 잔고 확인' : ''}`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const second = id(11);
    const labels = ['하나은행 ····1234 · 운영비', '카카오뱅크 ····1020 · 예비비'];
    const openings: Record<string, { cutoffDate: string; amount: string; revision: number }> = {
      [ACCOUNT]: {
        cutoffDate: '2026-07-01',
        amount: '688582',
        revision: 1
      },
      [second]: {
        cutoffDate: '2026-09-30',
        amount: '200000',
        revision: 0
      }
    };
    const data: import('../src/widgets/banking-workspace/api/bankingBalanceApiTypes').BalanceWorkspace = {
      propertyId: PROPERTY,
      month: '2026-10',
      cutoffDate: null,
      bankBalance: '1000000',
      bankAsOf: '2026-10-18',
      buildings: [],
      entries: [],
      externals: [],
      incomes: [],
      pending: [],
      accounts: [
        {
          id: ACCOUNT,
          label: labels[0],
          status: 'ACTIVE',
          balance: '700000',
          asOf: '2026-10-18'
        },
        {
          id: second,
          label: labels[1],
          status: 'ACTIVE',
          balance: '300000',
          asOf: '2026-10-18'
        }
      ]
    };
    let needsConfirmation = unassigned;
    function workspace(accountId: string | null) {
      const opening = accountId ? openings[accountId] : null;
      const amount = opening?.amount ?? Object.values(openings).reduce((sum, item) => sum + BigInt(item.amount), BigInt(0)).toString();
      if (accountId && needsConfirmation) return {
        ...data,
        accountId,
        cutoffDate: null,
        legacyOpening: {
          cutoffDate: '2026-07-01',
          buildings: [{
            buildingId: BUILDING_A,
            amount: '688582'
          }]
        },
        buildings: [{
          id: BUILDING_A,
          label: '102동',
          active: true,
          startBalance: null,
          income: '0',
          expense: '0',
          balance: null,
          status: 'OPENING_REQUIRED',
          openingBalance: null,
          openingRevision: 0
        }]
      };
      return {
        ...data,
        accountId,
        cutoffDate: opening?.cutoffDate ?? null,
        bankBalance: accountId ? data.accounts!.find((a) => a.id === accountId)!.balance : data.bankBalance,
        buildings: [{
          id: BUILDING_A,
          label: '102동',
          active: true,
          startBalance: amount,
          income: '0',
          expense: '0',
          balance: amount,
          status: 'READY',
          openingBalance: opening?.amount ?? null,
          openingRevision: opening?.revision ?? 0
        }]
      };
    }
    type Correction = { id: string; accountId: string; cutoffDate: string; buildings: { buildingId: string; amount: string; revision: number }[] };
    const requests: Correction[] = [];
    let failFirst = true;
    await page.route('http://localhost:8080/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({
        status: 200,
        headers
      });
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        asOf: '2026-10-18',
        accounts: data.accounts,
        buildings: [],
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/banking/workspace')) body = {
        propertyId: PROPERTY,
        asOf: '2026-10-18',
        buildings: [],
        units: [],
        rows: [],
        rules: [],
        accounts: [{
          id: ACCOUNT,
          bankName: '하나은행',
          last4: '1234',
          alias: '운영비',
          isPrimary: true,
          status: 'ACTIVE'
        }, {
          id: second,
          bankName: '카카오뱅크',
          last4: '1020',
          alias: '예비비',
          isPrimary: false,
          status: 'ACTIVE'
        }]
      };

      else if (path.endsWith('/balances/openings')) {
        const input = route.request().postDataJSON() as Correction;
        requests.push(input);
        openings[input.accountId] = {
          cutoffDate: input.cutoffDate,
          amount: input.buildings[0].amount,
          revision: 0
        };
        needsConfirmation = false;
        body = {
          saved: true
        };
      }
      else if (path.endsWith('/balances/openings/corrections')) {
        const input = route.request().postDataJSON() as Correction;
        requests.push(input);
        if (failFirst) {
          failFirst = false;
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers,
            body: JSON.stringify({
              code: 'PAYMENT_SERVICE_UNAVAILABLE'
            })
          });
        }
        openings[input.accountId] = {
          cutoffDate: input.cutoffDate,
          amount: input.buildings[0].amount,
          revision: input.buildings[0].revision + 1
        };
        body = {
          saved: true
        };
      } else if (path.endsWith('/banking/balances')) body = workspace(url.searchParams.get('accountId'));
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
          residentEligible: false,
          ...body
        } : body)
      });
    });
    await page.goto(`${BASE}/balances?month=2026-10`);
    await expect(page.getByRole('button', {
      name: '선택 통장 거래 보기',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '기초 잔액 등록',
      exact: true
    })).toHaveCount(0);
    const selector = page.getByRole('combobox', {
      name: '조회 통장',
      exact: true
    });
    await expect(selector).toBeVisible();
    const monthControl = page.getByRole('button', {
      name: '조회 월: 2026년 10월',
      exact: true
    });
    expect((await selector.boundingBox())!.height).toBe((await monthControl.boundingBox())!.height);
    await expect(page.getByText('조회 월', {
      exact: true
    })).toHaveCSS('clip-path', 'inset(50%)');
    await expect(page.getByText('조회 통장', {
      exact: true
    })).toHaveCount(0);
    await page.getByRole('button', {
      name: '기준 잔고 확인',
      exact: true
    }).click();
    if (width < 768) await expect(page).toHaveURL(/details\/opening/);
    const bank = page.getByRole('combobox', {
      name: '통장 선택',
      exact: true
    });
    const amount = page.getByRole('textbox', {
      name: '102동 기준 잔고',
      exact: true
    });
    async function choose(label: string) {
      await bank.click(); await page.getByRole('option', {
        name: label,
        exact: true
      }).click();
    }
    if (unassigned) {
      const existingAmount = page.getByRole('textbox', {
        name: '102동 시작 잔고',
        exact: true
      });
      await expect(existingAmount).toHaveValue('688,582');
      await expect(page.getByText('통장 구분 전에 저장한 기준일과 잔고를 표시했습니다.', {
        exact: false
      })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`legacyCashConfirmation${width}.png`),
        fullPage: true,
        animations: 'disabled'
      });
      await page.getByRole('button', {
        name: '확정',
        exact: true
      }).click();
      await expect(page.getByRole('heading', {
        name: '동별 잔고·정산',
        exact: true
      })).toBeVisible();
      expect(requests[0]).toMatchObject({
        accountId: ACCOUNT,
        cutoffDate: '2026-07-01',
        buildings: [{
          buildingId: BUILDING_A,
          amount: '688582'
        }]
      });
      await page.getByRole('button', {
        name: '기준 잔고 확인',
        exact: true
      }).click();
      await expect(amount).toHaveValue('688,582');
      await expect(page.getByRole('button', {
        name: '기준 잔고 수정',
        exact: true
      })).toBeVisible();
      return;
    }
    await expect(amount).toHaveValue('688,582');
    await expect(page.getByText('잔고 기준일: 2026-07-01', {
      exact: true
    })).toBeVisible();
    await choose(labels[1]);
    await expect(amount).toHaveValue('200,000');
    await expect(page.getByText('잔고 기준일: 2026-09-30', {
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '통장별 기초 잔액',
      exact: true
    })).toHaveCount(0);
    await page.getByRole('button', {
      name: '기준 잔고 수정',
      exact: true
    }).click();
    await amount.fill('500000');
    await choose(labels[0]); await expect(amount).toHaveValue('688,582');
    await choose(labels[1]); await expect(amount).toHaveValue('500,000');
    await page.screenshot({
      path: testInfo.outputPath(`buildingAccountOpening${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.getByRole('button', {
      name: '변경 저장',
      exact: true
    }).click();
    await expect(page.getByRole('alert').filter({
      hasText: '처리하지 못했어요. 입력을 유지하고 다시 시도해주세요.'
    })).toBeVisible();
    await expect(amount).toHaveValue('500,000');
    await page.getByRole('button', {
      name: '변경 저장',
      exact: true
    }).click();
    await expect(page.getByRole('heading', {
      name: '동별 잔고·정산',
      exact: true
    })).toBeVisible();
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1]).toMatchObject({
      accountId: second,
      cutoffDate: '2026-09-30',
      buildings: [{
        buildingId: BUILDING_A,
        amount: '500000',
        revision: 0
      }]
    });
    expect(openings[ACCOUNT].amount).toBe('688582');
    await selector.click(); await page.getByRole('option', {
      name: labels[1],
      exact: true
    }).click();
    await expect(page).toHaveURL(new RegExp(`account=${second}`));
    await page.reload(); await expect(selector).toContainText('카카오뱅크');
    await expect(page.getByText('500,000', {
      exact: true
    }).first()).toBeVisible();
    await page.getByRole('button', {
      name: '기준 잔고 확인',
      exact: true
    }).click();
    await expect(bank).toHaveValue(labels[1]);
    await expect(amount).toHaveValue('500,000');
    if (width < 768) {
      await page.getByRole('link', {
        name: '동별 잔고·정산으로 돌아가기',
        exact: true
      }).click();
      await expect(selector).toContainText('카카오뱅크');
      await expect(page).toHaveURL(new RegExp(`account=${second}`));
    } else await page.getByRole('button', {
      name: '기준 잔고 확인 닫기',
      exact: true
    }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`accountBalanceFilter${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

for (const width of [1440, 390]) {
  test(`기준 잔고와 입금이 있는 통장 ${width}px는 계산 잔액을 표시하고 혼합 합계와 차액도 같은 기준으로 비교`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const account = {
      id: ACCOUNT,
      label: '카카오뱅크 ····1020 · 예비비',
      status: 'ACTIVE',
      balance: null,
      asOf: null,
      calculatedBalance: '1522910',
      calculationBasisDate: '2026-09-30'
    };
    let mixed = false;
    await page.route('http://localhost:8080/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({
        status: 200,
        headers
      });
      let body: unknown;
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'ADMIN'
      };
      else if (path.endsWith('/payments/workspace')) body = {
        propertyId: PROPERTY,
        asOf: '2026-10-18',
        accounts: [account],
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/banking/balances')) body = {
        propertyId: PROPERTY,
        month: '2026-10',
        accountId: mixed ? null : ACCOUNT,
        cutoffDate: mixed ? null : '2026-09-30',
        bankBalance: null,
        bankAsOf: null,
        accounts: mixed ? [account, {
          id: id(11),
          label: '신한은행 ····6546 · 공용 계좌',
          status: 'ACTIVE',
          balance: '815204',
          asOf: '2026-10-15 14:12:00'
        }] : [account],
        buildings: [{
          id: BUILDING_A,
          label: '102동',
          active: true,
          startBalance: mixed ? '2381922' : '1500000',
          income: '22910',
          expense: '0',
          balance: mixed ? '2404832' : '1522910',
          status: 'READY',
          openingBalance: '1500000',
          openingRevision: 0
        }],
        entries: [],
        incomes: [],
        externals: [],
        pending: []
      };
      else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
          residentEligible: false,
          ...body
        } : body)
      });
    });
    await page.goto(`${BASE}/balances?month=2026-10&account=${ACCOUNT}`);
    const summary = page.getByRole('article', {
      name: '선택 통장 계산 잔액 1,522,910원',
      exact: true
    });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('2026-09-30 기준');
    const buildingTotal = page.getByRole('article', {
      name: '동별 잔고 합계 1,522,910원',
      exact: true
    });
    await expect(buildingTotal.locator('svg').first()).toHaveCSS('color', 'rgb(245, 158, 11)');
    const calculatedHelp = summary.getByRole('button', {
      name: '선택 통장 계산 잔액 도움말',
      exact: true
    });
    await calculatedHelp.focus();
    await expect(page.getByRole('tooltip')).toContainText('시작 잔고에 등록된 통장 입출금을 반영한 금액입니다.');
    await calculatedHelp.press('Escape');
    const buildingHelp = buildingTotal.getByRole('button', {
      name: '동별 잔고 합계 도움말',
      exact: true
    });
    await buildingHelp.focus();
    await expect(page.getByRole('tooltip')).toContainText('선택한 통장 안에서 각 동에 귀속된 잔고를 합한 금액입니다.');
    await buildingHelp.press('Escape');
    if (width < 768) {
      const firstCard = await summary.boundingBox();
      const nextCard = await buildingTotal.boundingBox();
      expect(nextCard!.x).toBe(firstCard!.x);
      expect(nextCard!.y).toBeGreaterThanOrEqual(firstCard!.y + firstCard!.height);
      const opening = await page.getByRole('button', {
        name: '기준 잔고 확인',
        exact: true
      }).boundingBox();
      const download = await page.getByRole('button', {
        name: '다운로드',
        exact: true
      }).boundingBox();
      expect(download!.y).toBeGreaterThanOrEqual(opening!.y + opening!.height);
    }
    await expect(page.getByText('원본 없음', {
      exact: true
    })).toHaveCount(0);
    const accounts = page.getByRole('region', {
      name: '통장별 확인 잔액',
      exact: true
    });
    await expect(accounts).toContainText('1,522,910원');
    await expect(accounts).toContainText('계산 잔액');
    await expect(page.getByRole('article', {
      name: '잔고 비교 차이 0원',
      exact: true
    })).toContainText('계산 잔액 포함');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`calculatedAccountBalance${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
    await page.reload();
    await expect(summary).toBeVisible();
    mixed = true;
    await page.goto(`${BASE}/balances?month=2026-10`);
    await expect(page.getByRole('article', {
      name: '통장 잔액 합계 2,338,114원',
      exact: true
    })).toBeVisible();
    const difference = page.getByRole('article', {
      name: '잔고 비교 차이 -66,718원',
      exact: true
    });
    await expect(difference).toContainText('계산 잔액 포함');
    await expect(difference.locator('strong')).toHaveCSS('color', 'rgb(239, 68, 68)');
    await expect(difference.locator('svg').first()).toHaveCSS('color', 'rgb(22, 163, 74)');
    await expect(page.getByRole('heading', {
      name: '잔고 차이 확인',
      exact: true
    }).locator('..').locator('dd').first()).toHaveText('-66,718원');
    await page.screenshot({
      path: testInfo.outputPath(`mixedBalanceDifference${width}.png`),
      fullPage: true
    });
    await page.getByRole('button', {
      name: '잔고 차이 내역 확인',
      exact: true
    }).click();
    await expect(page.getByRole('heading', {
      name: '잔고 차이 내역',
      exact: true
    })).toBeVisible();
    await expect(page.getByText('-66,718원', {
      exact: true
    }).last()).toBeVisible();
  });
}

for (const width of [1440, 390]) {
  test(`사용 전 월의 통장 ${width}px는 선택 목록과 합계에서 빠지고 오래된 URL도 전체 통장으로 복원`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const second = id(11);
    const accounts = [{
      id: ACCOUNT,
      label: '신한은행 ····6546 · 공용 계좌',
      status: 'ACTIVE',
      balance: '300000',
      asOf: '2026-08-31'
    },
    {
      id: second,
      label: '카카오뱅크 ····1020 · 예비비',
      status: 'ACTIVE',
      balance: null,
      asOf: null,
      calculatedBalance: '1500000',
      calculationBasisDate: '2026-09-30'
    }];
    await page.route('http://localhost:8080/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({
        status: 200,
        headers
      });
      let body: unknown;
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
        propertyId: PROPERTY,
        name: '모아빌라',
        role: 'ADMIN'
      };
      else if (path.endsWith('/payments/workspace')) body = {
        propertyId: PROPERTY,
        asOf: '2026-10-18',
        accounts,
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/banking/balances')) {
        const month = url.searchParams.get('month')!;
        const available = month < '2026-09' ? accounts.slice(0, 1) : accounts;
        const selected = available.find((account) => account.id === url.searchParams.get('accountId'));
        let amount = '1800000';
        if (month < '2026-09' || selected) amount = '300000';
        if (selected?.id === second) amount = '1500000';
        body = {
          propertyId: PROPERTY,
          month,
          accountId: selected?.id ?? null,
          cutoffDate: selected?.id === second ? '2026-09-30' : '2026-07-01',
          bankBalance: selected?.id === second ? null : '300000',
          bankAsOf: '2026-08-31',
          accounts: available,
          buildings: [{
            id: BUILDING_A,
            label: '102동',
            active: true,
            startBalance: amount,
            income: '0',
            expense: '0',
            balance: amount,
            status: 'READY',
            openingBalance: amount,
            openingRevision: 0
          }],
          entries: [],
          externals: [],
          incomes: [],
          pending: []
        };
      } else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
          residentEligible: false,
          ...body
        } : body)
      });
    });
    await page.goto(`${BASE}/balances?month=2026-08&account=${second}`);
    const selector = page.getByRole('combobox', {
      name: '조회 통장',
      exact: true
    });
    await expect(page).toHaveURL(/month=2026-08&account=ALL/);
    await expect(selector).toContainText('전체 통장');
    await expect(page.getByRole('article', {
      name: '동별 잔고 합계 300,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('region', {
      name: '통장별 확인 잔액',
      exact: true
    })).not.toContainText('카카오뱅크');
    await selector.click();
    await expect(page.getByRole('option', {
      name: /카카오뱅크/
    })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.screenshot({
      path: testInfo.outputPath(`accountBeforeUse${width}.png`),
      fullPage: true
    });
    await page.reload();
    await expect(selector).toContainText('전체 통장');
    await page.getByRole('button', {
      name: '조회 월: 2026년 8월',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '2026년 9월',
      exact: true
    }).click();
    await expect(page).toHaveURL(/month=2026-09/);
    await selector.click();
    await page.getByRole('option', {
      name: accounts[1].label,
      exact: true
    }).click();
    await expect(page.getByRole('article', {
      name: '선택 통장 계산 잔액 1,500,000원',
      exact: true
    })).toBeVisible();
    await page.getByRole('button', {
      name: '조회 월: 2026년 9월',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '2026년 8월',
      exact: true
    }).click();
    await expect(page).toHaveURL(/month=2026-08&account=ALL/);
    await expect(selector).toContainText('전체 통장');
    await expect(page.getByRole('article', {
      name: '동별 잔고 합계 300,000원',
      exact: true
    })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const width of [1440, 390, 320]) {
  test(`통장 상세 ${width}px는 선택 통장·번호 공개와 숨김·재진입 마스킹·모바일 복귀를 유지`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const second = id(11);
    const unknown = id(12);
    const updatedAt = '2026-10-18T00:00:00Z';
    const number = '00012345678';
    let reveals = 0;
    let failDetail = false;
    let malformedDetail = false;
    let finishReveal: (() => void) | undefined;
    const details: string[] = [];
    const completedDetails: string[] = [];
    // 개발 Strict Mode의 취소된 첫 GET은 응답 중복과 구분하고 완료된 상세 응답만 집계합니다.
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (response.request().method() === 'GET' && response.ok()
        && path.startsWith(`/api/properties/${PROPERTY}/banking/account/`)) {
        completedDetails.push(path.split('/').at(-1)!);
      }
    });
    const balances = [
      {
        id: ACCOUNT,
        label: '하나은행 ····6546 · 운영비',
        status: 'ACTIVE',
        balance: '815204',
        asOf: '2026-10-15 14:12:59'
      },
      {
        id: second,
        label: '카카오뱅크 ····5678 · 예비비',
        status: 'CLOSED',
        balance: null,
        asOf: null,
        calculatedBalance: '200000',
        calculationBasisDate: '2026-09-30'
      },
      {
        id: unknown,
        label: '신한은행 ····4321',
        status: 'ACTIVE',
        balance: null,
        asOf: null
      }
    ];
    await page.route('http://localhost:8080/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({
        status: 204,
        headers
      });
      let body: unknown;
      let status = 200;
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        asOf: '2026-10-18',
        accounts: [],
        units: [],
        charges: [],
        payments: []
      };
      else if (path.endsWith('/banking/balances')) body = {
        propertyId: PROPERTY,
        month: url.searchParams.get('month'),
        accountId: url.searchParams.get('accountId'),
        cutoffDate: null,
        bankBalance: null,
        bankAsOf: null,
        buildings: [],
        entries: [],
        externals: [],
        incomes: [],
        pending: [],
        accounts: balances
      };
      else if (path.endsWith('/number-reveal')) {
        expect(route.request().method()).toBe('POST');
        expect(path).toBe(`/api/properties/${PROPERTY}/banking/account/${second}/number-reveal`);
        reveals += 1;
        if (reveals === 1) {
          status = 503;
          body = {
            code: 'SERVICE_UNAVAILABLE'
          };
        } else {
          if (reveals === 4) await new Promise<void>((resolve) => { finishReveal = resolve; });
          body = {
            propertyId: PROPERTY,
            accountId: second,
            updatedAt,
            accountNumber: number
          };
        }
      } else if (path.includes('/banking/account/')) {
        expect(route.request().method()).toBe('GET');
        const accountId = path.split('/').at(-1)!;
        details.push(accountId);
        if (failDetail) {
          status = 403;
          body = {
            code: 'ACCESS_DENIED'
          };
        } else body = {
          propertyId: PROPERTY,
          accountId,
          updatedAt,
          bankCode: accountId === second ? '090' : '088',
          bankName: accountId === second ? '카카오뱅크' : '신한은행',
          last4: accountId === second ? '5678' : '4321',
          holderName: '테스트 예금주',
          alias: accountId === second ? '예비비' : null,
          isPrimary: false,
          status: accountId === second ? 'CLOSED' : 'ACTIVE',
          ...(malformedDetail ? {
            accountNumber: number
          } : {})
        };
      } else throw new Error(`Unexpected API ${path}`);
      await route.fulfill({
        status,
        headers: {
          ...headers,
          'Cache-Control': 'no-store'
        },
        contentType: 'application/json',
        body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
          residentEligible: false,
          ...body
        } : body)
      });
    });
    const listHref = `${BASE}/balances?month=2026-10&account=${second}`;
    const openRow = () => page.getByRole('button', {
      name: '카카오뱅크 ····5678 · 예비비 통장 상세 보기',
      exact: true
    });
    const back = () => page.getByRole('link', {
      name: '동별 잔고·정산으로 돌아가기',
      exact: true
    });
    const closeDetail = async () => {
      if (width > 767) await page.getByRole('button', {
        name: '통장 상세 닫기',
        exact: true
      }).click();
      else await back().click();
      await expect(openRow()).toBeVisible();
    };
    await page.goto(listHref);
    await expect(openRow()).toBeVisible();
    expect(details).toEqual([]);
    await openRow().focus();
    await openRow().press('Enter');
    const detail = width > 767 ? page.getByRole('dialog', {
      name: '통장 상세',
      exact: true
    }) : page.getByRole('region', {
      name: '통장 상세',
      exact: true
    });
    await expect(detail).toContainText('테스트 예금주');
    await expect(detail).toContainText('카카오뱅크');
    await expect(detail).toContainText('사용 종료');
    await expect(detail).toContainText('계산 잔액');
    await expect(detail).toContainText('200,000원');
    await expect(detail).toContainText('2026-09-30 기준');
    await expect(detail).toContainText('···· 5678');
    expect(reveals).toBe(0);
    expect(details.every((accountId) => accountId === second)).toBe(true);
    await expect.poll(() => completedDetails).toEqual([second]);
    if (width <= 767) {
      await expect(page).toHaveURL(new RegExp(`/details/account\\?month=2026-10&account=${second}&target=${second}$`));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.reload();
      await expect(detail).toContainText('테스트 예금주');
    }
    await detail.getByRole('button', {
      name: '전체 보기',
      exact: true
    }).click();
    await expect(detail.getByRole('alert')).toContainText('계좌번호를 확인하지 못했어요.');
    await expect(detail).not.toContainText(number);
    await detail.getByRole('button', {
      name: '전체 보기',
      exact: true
    }).click();
    await expect(detail).toContainText(number);
    await expect(detail.getByRole('button', {
      name: '숨기기',
      exact: true
    })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate((raw) => [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) => value.includes(raw)), number)).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`bankAccountDetail${width}.png`),
      fullPage: true
    });
    await testInfo.attach(`통장 상세 ${width}px`, {
      path: testInfo.outputPath(`bankAccountDetail${width}.png`),
      contentType: 'image/png'
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await detail.getByRole('button', {
      name: '숨기기',
      exact: true
    }).click();
    await expect(detail).not.toContainText(number);
    await detail.getByRole('button', {
      name: '전체 보기',
      exact: true
    }).click();
    await expect(detail).toContainText(number);
    await closeDetail();
    if (width > 767) await expect(openRow()).toBeFocused();
    else await expect(page).toHaveURL(listHref);
    await openRow().click();
    await expect(detail).toContainText('···· 5678');
    await expect(detail).not.toContainText(number);
    // 닫은 뒤 도착한 공개 응답도 다음 상세의 번호를 다시 노출하지 않습니다.
    await detail.getByRole('button', {
      name: '전체 보기',
      exact: true
    }).click();
    await expect.poll(() => finishReveal !== undefined).toBe(true);
    await closeDetail();
    finishReveal!();
    await openRow().click();
    await expect(detail).toContainText('···· 5678');
    await expect(detail).not.toContainText(number);
    if (width > 767) {
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);
      await expect(openRow()).toBeFocused();
    } else await closeDetail();
    // 상세 권한 실패와 잘못된 원문 포함 응답은 모두 마스킹 상세로 재시도합니다.
    failDetail = true;
    await openRow().click();
    await expect(detail.getByRole('alert')).toBeVisible();
    failDetail = false;
    malformedDetail = true;
    await detail.getByRole('button', {
      name: '다시 조회',
      exact: true
    }).click();
    await expect(detail.getByRole('alert')).toBeVisible();
    await expect(detail).not.toContainText(number);
    malformedDetail = false;
    await detail.getByRole('button', {
      name: '다시 조회',
      exact: true
    }).click();
    await expect(detail).toContainText('테스트 예금주');
    await closeDetail();
    // 직접 URL에서는 부모의 전체 통장 범위와 열어 볼 통장을 별도로 유지합니다.
    await page.goto(`${BASE}/balances/details/account?month=2026-10&target=${unknown}`);
    const direct = page.getByRole('region', {
      name: '통장 상세',
      exact: true
    });
    await expect(direct).toContainText('은행 확인 자료 없음');
    await expect(direct).toContainText('잔액이 0원이라는 뜻은 아닙니다.');
    await page.reload();
    await expect(direct).toContainText('···· 4321');
    if (width <= 767) {
      await back().click();
      await expect(page).toHaveURL(`${BASE}/balances?month=2026-10`);
      await page.goto(`${BASE}/balances/details/account?month=2026-10&target=${id(99)}`);
      await expect(page.getByRole('region', {
        name: '통장 상세',
        exact: true
      }).getByRole('alert')).toContainText('해당 조회 월의 통장 정보를 찾을 수 없어요.');
      await back().click();
      await expect(page).toHaveURL(`${BASE}/balances?month=2026-10`);
    }
  });
}

for (const width of [1440, 390, 320]) {
  test(`은행 코드별 업로드 ${width}px는 두 Excel 형식·CSV와 전체 입출금 합계·차액을 표시하고 미지원 통장을 차단`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const unsupported = id(8100);
    let previews = 0;
    const accounts = [IMPORT_ACCOUNT, {
      ...IMPORT_ACCOUNT,
      id: unsupported,
      bankName: '부산은행',
      bankCode: '032',
      isPrimary: false,
      importSupport: {
        enabled: false,
        extensions: [],
        message: '이 은행의 거래내역 업로드는 아직 지원하지 않습니다.'
      }
    }];
    const saved = {
      propertyId: PROPERTY,
      asOf: '2026-10-23',
      accounts,
      buildings: [],
      units: [],
      rows: [],
      rules: []
    };
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        asOf: saved.asOf,
        accounts: [],
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/banking/workspace')) body = saved;
      else if (path.endsWith('/banking/import/preview')) {
        previews++;
        expect(route.request().postDataBuffer()?.toString()).toContain(ACCOUNT);
        body = {
          propertyId: PROPERTY,
          rows: [
            ...Array.from({
              length: 12
            }, (_, index) => row(8200 + index, 'INCOME', `검증상대${index}`, index === 11 ? '812833' : '1000000')),
            row(8300, 'EXPENSE', '검증출금', ['20000', '11812833', '12406340'][previews - 1])
          ],
          duplicateCount: 0,
          beforeCutoffCount: 0,
          period: {
            from: '2026-07-01',
            to: '2026-09-30'
          }
        };
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
          residentEligible: false,
          ...body
        } : body)
      });
    });
    await page.goto(`${BASE}/upload?account=${unsupported}`);
    await expect(page.getByRole('button', {
      name: '파일 선택',
      exact: true
    })).toBeDisabled();
    await expect(page.getByLabel('통장 거래 파일 선택')).toBeDisabled();
    await expect(page.getByRole('region', {
      name: '통장 거래 파일 업로드'
    })).toContainText('부산은행');
    await page.getByRole('region', {
      name: '통장 거래 파일 업로드'
    }).evaluate((element) => {
      const data = new DataTransfer();
      data.items.add(new File(['test'], 'test.xls', {
        type: 'application/vnd.ms-excel'
      }));
      element.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: data
      }));
    });
    expect(previews).toBe(0);
    await page.getByRole('combobox', {
      name: '가져올 통장',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '하나은행 ····1234',
      exact: true
    }).click();
    await expect(page.getByLabel('통장 거래 파일 선택')).toBeEnabled();
    await expect(page.getByLabel('통장 거래 파일 선택')).toHaveAttribute('accept', '.xls,.xlsx,.csv');
    for (const [index, extension] of ['xls', 'xlsx', 'csv'].entries()) {
      if (index > 0) await page.getByRole('button', {
        name: '다른 파일 선택',
        exact: true
      }).click();
      await page.getByLabel('통장 거래 파일 선택').setInputFiles({
        name: `test.${extension}`,
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('test')
      });
      await expect(page.getByRole('heading', {
        name: '업로드 미리보기',
        exact: true
      })).toBeVisible();
      await expect(page.getByText('거래 기간 2026-07-01 ~ 2026-09-30')).toBeVisible();
      const actions = page.getByLabel('선택 거래 저장', {
        exact: true
      });
      const save = actions.getByRole('button', {
        name: '선택 거래 저장',
        exact: true
      });
      await expect(actions).toHaveCSS('position', 'fixed');
      await expect(actions).toContainText('선택한 거래 13건');
      await expect(actions).toContainText('입금 12건 · 출금 1건');
      await expect(save).toBeEnabled();
      if (index === 0) {
        await expect(actions).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(actions).toHaveCSS('border-top', '1px solid rgb(226, 232, 240)');
        await expect(actions.locator('strong')).toHaveCSS('color', 'rgb(15, 23, 42)');
        await expect(actions.locator('[role="status"] > span')).toHaveCSS('color', 'rgb(15, 23, 42)');
        await expect(save).toHaveCSS('background-color', 'rgb(37, 99, 235)');
        await expect(save).toHaveCSS('color', 'rgb(255, 255, 255)');
        await page.getByRole('combobox', {
          name: '표시 개수'
        }).click();
        await page.getByRole('option', {
          name: '50개씩 보기',
          exact: true
        }).click();
        const all = page.getByLabel('현재 페이지 거래 전체 선택', {
          exact: true
        });
        await all.uncheck();
        await expect(actions).toContainText('거래를 선택해 주세요');
        await expect(save).toBeDisabled();
        await expect(actions).not.toContainText('입금 0건');
        if (width <= 767) {
          await expect(actions).toHaveCSS('background-color', 'rgb(255, 255, 255)');
          await expect(save).toHaveCSS('opacity', '1');
          await page.screenshot({
            path: test.info().outputPath(`bankImportEmptySelection${width}.png`),
            fullPage: true
          });
        }
        await all.check();
        await expect(actions).toContainText('선택한 거래 13건');
      }

      const income = page.getByRole('article', {
        name: '입금 합계 11,812,833원',
        exact: true
      });
      const expense = page.getByRole('article', {
        name: `출금 합계 ${['20,000', '11,812,833', '12,406,340'][index]}원`,
        exact: true
      });
      const net = page.getByRole('article', {
        name: `입출금 차액 ${['11,792,833', '0', '-593,507'][index]}원`,
        exact: true
      });
      await expect(income).toBeVisible();
      await expect(expense).toBeVisible();
      await expect(net).toBeVisible();
      await expect(income.locator('small')).toHaveCount(0);
      await expect(expense.locator('small')).toHaveCount(0);
      await expect(net.locator('small')).toHaveCount(0);
      for (const card of [income, expense, net]) {
        // 8자리 금액을 실제 모바일 폭에서 한 줄로 읽을 수 있어야 합니다.
        const size = await card.locator('strong').evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(element).lineHeight)
        }));
        expect(size.height).toBeLessThanOrEqual(size.lineHeight + 1);
      }
      const netHelp = net.getByRole('button', {
        name: '입출금 차액 도움말',
        exact: true
      });
      if (width > 767) await netHelp.hover();
      else await netHelp.click();
      const tooltip = page.getByRole('tooltip');
      await expect(tooltip).toContainText('입금 합계 − 출금 합계');
      const bounds = await tooltip.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(tooltip).toHaveCount(0);
      await netHelp.focus();
      // 닫은 버튼이 이미 포커스 중이면 다른 요소에서 다시 포커스를 이동합니다.
      await income.getByRole('button', {
        name: '입금 합계 도움말',
        exact: true
      }).focus();
      await expect(tooltip).toContainText('중복·인계 이전 제외 후 전체 거래 기준');
      await page.keyboard.press('Escape');
      await expect(tooltip).toHaveCount(0);
      if (index === 2) await income.locator('..').screenshot({
        path: test.info().outputPath(`bankImportSummary${width}.png`)
      });
      await expect(net).toHaveAttribute('data-value-tone', index === 2 ? 'danger' : 'neutral');
      // 검색·선택·입출금 필터로 파일 전체 합계를 줄이지 않습니다.
      await page.getByLabel('검증상대0 거래 선택', {
        exact: true
      }).uncheck();
      await page.getByRole('textbox', {
        name: '거래 검색'
      }).fill('검증상대0');
      await expect(income).toBeVisible();
      await expect(expense).toBeVisible();
      await expect(net).toBeVisible();
      await page.getByRole('textbox', {
        name: '거래 검색'
      }).fill('');
      await page.getByRole('group', {
        name: '입출금 필터'
      }).getByRole('button', {
        name: /^출금/
      }).click();
      await expect(income).toBeVisible();
      await expect(expense).toBeVisible();
      await expect(net).toBeVisible();
      await expect(actions).toContainText('선택한 거래 12건');
      await expect(actions).toContainText('입금 11건 · 출금 1건');
      if (index === 2) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const pagination = page.getByRole('navigation', {
          name: '거래 페이지',
          exact: true
        });
        const paginationBox = await pagination.boundingBox();
        const actionBox = await actions.boundingBox();
        expect(paginationBox!.y + paginationBox!.height).toBeLessThanOrEqual(actionBox!.y);
        expect(actionBox!.y + actionBox!.height).toBeCloseTo(width <= 767 ? 884 : 876, 0);
        await page.screenshot({
          path: test.info().outputPath(`bankImportActionBar${width}.png`),
          fullPage: true
        });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('combobox', {
      name: '가져올 통장',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '부산은행 ····1234',
      exact: true
    }).click();
    await expect(page.getByRole('heading', {
      name: '거래내역 가져오기',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '파일 선택',
      exact: true
    })).toBeDisabled();
    expect(previews).toBe(3);
    await page.screenshot({
      path: test.info().outputPath('bankImportUnsupported.png'),
      fullPage: true
    });
  });
}

for (const width of [1440, 390]) {
  test(`수동 지출 등록 ${width}px는 통장 거래 진입·입력 정렬·배분·과거 날짜·실패 재시도·목록 복귀를 처리`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const saved: BankingWorkspaceData = {
      propertyId: PROPERTY,
      asOf: '2026-10-23',
      accounts: [IMPORT_ACCOUNT, {
        ...IMPORT_ACCOUNT,
        id: id(9801),
        alias: '정산 완료 통장',
        isPrimary: false,
        status: 'CLOSED',
        availableFrom: '2026-09-15',
        closedOn: '2026-09-30',
        hasHistory: true
      }, {
        ...IMPORT_ACCOUNT,
        id: id(9802),
        alias: '미사용 테스트 통장',
        isPrimary: false,
        status: 'CLOSED',
        availableFrom: '2026-10-01',
        closedOn: '2026-10-23',
        hasHistory: false
      }],
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
    let incomeLinked = false;
    const requests: Record<string, unknown>[] = [];
    let completeSave: () => void = () => {};
    const saveGate = new Promise<void>((resolve) => { completeSave = resolve; });
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        asOf: saved.asOf,
        accounts: [],
        units: [],
        charges: [],
        payments: [{
          id: id(9700),
          accountId: ACCOUNT,
          date: '2026-10-18',
          payer: '드림하이수선충당금',
          amount: '22910',
          source: 'MANUAL',
          status: 'CONFIRMED',
          receiptType: 'OTHER',
          incomeCategory: '수선충당금',
          unitId: '',
          bankTransactionId: incomeLinked ? id(9701) : null,
          allocations: [],
          incomeAllocation: {
            id: id(9700),
            category: '수선충당금',
            note: '',
            mode: 'EQUAL',
            saveAsRule: false,
            allocations: [{
              buildingId: BUILDING_A,
              label: '102동',
              amount: '11455',
              percentage: null
            },
            {
              buildingId: BUILDING_B,
              label: '103동',
              amount: '11455',
              percentage: null
            }]
          }
        }, {
          id: id(9702),
          accountId: ACCOUNT,
          date: '2026-10-18',
          payer: '취소 입금',
          amount: '90000',
          source: 'MANUAL',
          status: 'CANCELED',
          receiptType: 'OTHER',
          incomeCategory: '취소 입금',
          unitId: '',
          bankTransactionId: null,
          allocations: []
        }],
        history: []
      };
      else if (path.endsWith('/banking/workspace')) body = saved;
      else if (path.endsWith('/expenses/manual')) {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'SERVICE_UNAVAILABLE'
          })
        });
        await saveGate;
        const input = route.request().postDataJSON();
        saved.rows = [...saved.rows, {
          ...row(9500, 'EXPENSE', input.category, input.amount),
          id: input.id,
          sourceType: 'MANUAL',
          date: input.date,
          time: null,
          balance: null,
          status: 'CONFIRMED',
          memo: input.note,
          expense: {
            id: input.id,
            category: input.category,
            note: input.note,
            mode: input.mode,
            saveAsRule: false,
            allocations: input.allocations
          }
        }];
        body = saved;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(route.request().url().endsWith('/access-context') && body && typeof body === 'object' ? {
          residentEligible: false,
          ...body
        } : body)
      });
    });
    await page.goto(`${BASE}/expenses?month=2026-10&account=${ACCOUNT}`);
    await expect(page.getByRole('heading', {
      name: '지출 내역',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: '수동 지출 등록',
      exact: true
    })).toHaveCount(0);
    // 숨겨진 종료 통장을 직접 선택한 URL도 전체로 복귀하고, 종료 월에는 과거 통장을 조회할 수 있습니다.
    await page.goto(`${BASE}/transactions?month=2026-10&account=${id(9801)}`);
    await expect(page).toHaveURL(`${BASE}/transactions?month=2026-10`);
    const accountFilter = page.getByRole('combobox', {
      name: '조회 통장',
      exact: true
    });
    await accountFilter.click();
    await expect(page.getByRole('option', {
      name: /정산 완료 통장|미사용 테스트 통장/
    })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/transactions?month=2026-09&account=${id(9801)}`);
    await expect(accountFilter).toHaveText(/정산 완료 통장/);
    await accountFilter.click();
    await expect(page.getByRole('option', {
      name: /정산 완료 통장/
    })).toBeVisible();
    await expect(page.getByRole('option', {
      name: /미사용 테스트 통장/
    })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/transactions?month=2026-10&account=${ACCOUNT}`);
    const register = page.getByRole('button', {
      name: '수동 지출 등록',
      exact: true
    });
    await expect(register).toBeVisible();
    await expect(page.getByRole('article', {
      name: '입금 합계 22,910원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '입출금 차액 22,910원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '최근 은행 확인 잔액 은행 확인 자료 없음',
      exact: true
    })).toBeVisible();
    // 나중에 은행 원본과 연결되면 수동 행은 빠지고 원본 금액만 한 번 합산해야 합니다.
    incomeLinked = true;
    saved.rows.push({
      ...row(9701, 'INCOME', '드림하이수선충당금', '22910'),
      date: '2026-10-18',
      paymentId: id(9700),
      receiptType: 'OTHER',
      status: 'CONFIRMED',
      balance: '500000'
    });
    await page.reload();
    await expect(page.getByRole('article', {
      name: '입금 합계 22,910원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '입출금 차액 22,910원',
      exact: true
    })).toBeVisible();

    await expect(page.getByRole('button', {
      name: '수동 입금 등록',
      exact: true
    })).toBeVisible();
    await register.click();
    if (width === 390) {
      await expect(page).toHaveURL(`${BASE}/manual-expense?month=2026-10&account=${ACCOUNT}`);
      await expect(page.getByRole('link', {
        name: '통장 거래로 돌아가기'
      })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', {
        name: '수동 지출 등록',
        exact: true
      })).toBeVisible();
      await expect(page.getByRole('dialog', {
        name: '수동 지출 등록',
        exact: true
      })).toHaveCount(0);
      await expect(page.getByRole('button', {
        name: '취소',
        exact: true
      })).toHaveCount(0);
    } else {
      await expect(page.getByRole('dialog', {
        name: '수동 지출 등록',
        exact: true
      })).toBeVisible();
      await page.getByRole('button', {
        name: '수동 지출 등록 닫기'
      }).click();
      await register.click();
    }
    for (const title of ['기본 정보', '배분 설정', '배분 금액', '메모']) {
      await expect(page.getByRole('heading', {
        name: new RegExp(title)
      })).toBeVisible();
    }
    const nameControl = page.getByRole('textbox', {
      name: '지출명',
      exact: true
    }).locator('..');
    await expect(nameControl).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('combobox', {
      name: '출금 통장',
      exact: true
    }).locator('..')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('button', {
      name: /^출금일:/
    })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('button', {
      name: '등록',
      exact: true
    })).toHaveCSS('background-color', 'rgb(239, 246, 255)');
    await expect(page.getByRole('button', {
      name: '등록',
      exact: true
    })).toBeDisabled();
    await expect(page.getByRole('button', {
      name: '등록',
      exact: true
    })).toHaveCSS('color', 'rgb(37, 99, 235)');

    const targets = page.getByRole('group', {
      name: '부담 동',
      exact: true
    });
    const chips = targets.locator('label');
    const addTarget = targets.getByRole('button', {
      name: '외부·공통 부담처 추가'
    });
    await expect(chips).toHaveCount(2);
    const addSize = (await addTarget.boundingBox())!;
    for (const chip of await chips.all()) {
      expect((await chip.boundingBox())!.height).toBe(addSize.height);
      await expect(chip).toHaveCSS('font-size', '16px');
      await expect(chip).toHaveCSS('padding', '10px 18px');
    }
    await expect(addTarget).toHaveCSS('font-size', '16px');
    await expect(addTarget).toHaveCSS('padding', '10px 18px');
    if (width === 390) {
      const targetSize = (await targets.boundingBox())!;
      expect(addSize.width).toBe(targetSize.width);
      expect(addSize.x).toBe(targetSize.x);
      const lastChip = (await chips.last().boundingBox())!;
      expect(addSize.y).toBeGreaterThanOrEqual(lastChip.y + lastChip.height);
    }

    await page.screenshot({
      path: testInfo.outputPath(`manual-expense-design-${width}.png`),
      fullPage: true
    });
    if (width === 1440) {
      await page.setViewportSize({
        width,
        height: 600
      });
      const close = page.getByRole('button', {
        name: '수동 지출 등록 닫기'
      });
      const top = (await close.boundingBox())!.y;
      await page.getByLabel('메모', {
        exact: true
      }).scrollIntoViewIfNeeded();
      expect((await close.boundingBox())!.y).toBe(top);
      await expect(page.getByRole('button', {
        name: '등록',
        exact: true
      })).toBeInViewport();
      await page.getByRole('textbox', {
        name: '지출명',
        exact: true
      }).scrollIntoViewIfNeeded();
      await page.setViewportSize({
        width,
        height: 900
      });
      const accountBox = (await page.getByRole('combobox', {
        name: '출금 통장',
        exact: true
      }).locator('..').boundingBox())!;
      const dateBox = (await page.getByRole('button', {
        name: /^출금일:/
      }).boundingBox())!;
      expect(Math.abs(accountBox.y - dateBox.y)).toBeLessThan(1);
      expect(Math.abs(accountBox.height - dateBox.height)).toBeLessThan(1);
      for (const name of ['지출명', '출금액']) {
        const inputSize = (await page.getByRole('textbox', {
          name,
          exact: true
        }).locator('..').boundingBox())!;
        expect(inputSize.height).toBe(dateBox.height);
        expect(inputSize.width).toBe(accountBox.width);
      }

    }
    await expect(page.getByRole('group', {
      name: '지출 설정',
      exact: true
    })
      .locator('strong').filter({
        hasText: /^[0-9]+동$/
      })).toHaveText(['102동', '103동']);
    await page.getByRole('textbox', {
      name: '지출명',
      exact: true
    }).fill('공용 청소비');
    await page.getByRole('textbox', {
      name: '출금액',
      exact: true
    }).fill('10001');
    await expect(page.getByRole('status').filter({
      hasText: '원 미만'
    })).toBeVisible();
    await page.getByRole('combobox', {
      name: '나누는 방법'
    }).click();
    await page.getByRole('option', {
      name: '금액 직접 입력',
      exact: true
    }).click();
    await addTarget.click();
    await page.getByRole('textbox', {
      name: '외부 부담처 3',
      exact: true
    }).fill('외부 부담처');
    const amountSize = (await page.getByLabel('102동 부담액', {
      exact: true
    }).locator('..').boundingBox())!;
    for (const label of ['103동', '외부 부담처']) {
      const size = (await page.getByLabel(`${label} 부담액`, {
        exact: true
      }).locator('..').boundingBox())!;
      expect(size.x).toBe(amountSize.x);
      expect(size.width).toBe(amountSize.width);
      expect(size.height).toBe(amountSize.height);
    }
    await expect(page.locator('[popover]:popover-open')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`manual-expense-amount-${width}.png`),
      fullPage: true
    });
    await page.getByRole('combobox', {
      name: '나누는 방법'
    }).click();
    await page.getByRole('option', {
      name: '비율 지정',
      exact: true
    }).click();
    const ratioSize = (await page.getByLabel('102동 부담 비율', {
      exact: true
    }).locator('..').boundingBox())!;
    expect(ratioSize.width).toBe(amountSize.width);
    for (const label of ['103동', '외부 부담처']) {
      const size = (await page.getByLabel(`${label} 부담 비율`, {
        exact: true
      }).locator('..').boundingBox())!;
      expect(size.x).toBe(ratioSize.x);
      expect(size.width).toBe(ratioSize.width);
      expect(size.height).toBe(ratioSize.height);
    }
    await expect(page.locator('[popover]:popover-open')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`manual-expense-ratio-${width}.png`),
      fullPage: true
    });
    await page.getByRole('combobox', {
      name: '나누는 방법'
    }).click();
    await page.getByRole('option', {
      name: '금액 직접 입력',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '외부 부담처 제거',
      exact: true
    }).click();
    await page.getByLabel('102동 부담액', {
      exact: true
    }).fill('5000');
    await page.getByLabel('103동 부담액', {
      exact: true
    }).fill('5001');
    const registration = page.getByRole('button', {
      name: '등록',
      exact: true
    });
    const totals = page.getByText('부담액 합계 10,001원', {
      exact: true
    }).locator('..');
    await expect(registration).toBeEnabled();
    await expect(totals).toHaveCSS('color', 'rgb(22, 163, 74)');
    await page.getByLabel('103동 부담액', {
      exact: true
    }).fill('6001');
    await expect(registration).toBeDisabled();
    await expect(page.getByText('초과 금액 1,000원', {
      exact: true
    }).locator('..')).toHaveCSS('color', 'rgb(239, 68, 68)');
    await expect(page.getByText('남은 금액 -1,000원', {
      exact: true
    })).toHaveCount(0);
    // 비활성 버튼의 우회 제출도 기존 제출 검증에서 차단해 초과 배분 요청을 전송하지 않습니다.
    await registration.evaluate((button) => (button as HTMLButtonElement).form!.requestSubmit());
    expect(requests).toHaveLength(0);
    await page.getByLabel('103동 부담액', {
      exact: true
    }).fill('4000');
    await expect(registration).toBeDisabled();
    await expect(page.getByText('남은 금액 1,001원', {
      exact: true
    }).locator('..')).toHaveCSS('color', 'rgb(245, 158, 11)');
    await page.getByLabel('103동 부담액', {
      exact: true
    }).fill('5001');
    await expect(registration).toBeEnabled();
    await expect(totals).toHaveCSS('color', 'rgb(22, 163, 74)');
    await page.getByRole('textbox', {
      name: '지출명',
      exact: true
    }).fill('');
    await expect(registration).toBeDisabled();
    await page.getByRole('textbox', {
      name: '지출명',
      exact: true
    }).fill('공용 청소비');
    await expect(registration).toBeEnabled();

    await page.getByLabel('메모', {
      exact: true
    }).fill('직접 등록');
    await expect(page.getByLabel('같은 내용의 거래에 이 설정 사용')).toHaveCount(0);
    await page.getByRole('button', {
      name: /^출금일:/
    }).click();
    const calendar = page.getByRole('dialog', {
      name: '출금일',
      exact: true
    });
    await expect(calendar).toBeVisible();
    const bounds = (await calendar.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await calendar.getByRole('button', {
      name: '이전 달',
      exact: true
    }).click();
    await calendar.getByRole('button', {
      name: '2026년 9월 15일',
      exact: true
    }).click();
    await expect(page.locator('[popover]:popover-open')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`manual-expense-${width}.png`),
      fullPage: true
    });
    const submit = page.getByRole('button', {
      name: '등록',
      exact: true
    });
    await submit.click();
    await expect(page.getByRole('alert').filter({
      hasText: '통장 정보를 처리하지 못했어요. 입력을 확인하고 다시 시도해주세요.'
    })).toBeVisible();
    await expect(page.getByRole('textbox', {
      name: '지출명',
      exact: true
    })).toHaveValue('공용 청소비');
    await expect(page.getByRole('textbox', {
      name: '출금액',
      exact: true
    })).toHaveValue('10,001');
    await submit.click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(submit).toBeDisabled();
    if (width === 1440) {
      await expect(page.getByRole('button', {
        name: '수동 지출 등록 닫기'
      })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', {
        name: '수동 지출 등록',
        exact: true
      })).toBeVisible();
    }
    completeSave();
    await expect(page).toHaveURL(`${BASE}/transactions?month=2026-09&account=${ACCOUNT}`);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0]).toMatchObject({
      date: '2026-09-15',
      amount: '10001',
      mode: 'AMOUNT'
    });
    await expect(page.getByRole('table', {
      name: '통장 거래'
    }).getByRole('row').filter({
      hasText: '공용 청소비'
    })).toContainText('10,001원');
    await expect(page.getByText('지출을 등록했어요.', {
      exact: true
    })).toBeVisible();
    await page.reload();
    const resultRow = page.getByRole('table', {
      name: '통장 거래'
    }).getByRole('row').filter({
      hasText: '공용 청소비'
    });
    await expect(resultRow).toContainText('수동 등록');
    await page.goto(`${BASE}/expenses?month=2026-09&account=${ACCOUNT}`);
    const expenseRow = page.getByRole('table', {
      name: '지출 내역'
    }).getByRole('row').filter({
      hasText: '공용 청소비'
    });
    await expect(expenseRow).toContainText('10,001원');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', {
      name: '엑셀 다운로드',
      exact: true
    }).click();
    const workbook = unzipSync(await readFile((await (await downloaded).path())!));
    const xml = Object.values(workbook).map((bytes) => strFromU8(bytes)).join('\n');
    expect(xml).toContain('공용 청소비');
    expect(xml).toContain('10001');
    await expenseRow.click();
    await expect(page.getByText('등록 방식', {
      exact: true
    })).toBeVisible();
    await expect(page.getByText('수동 등록', {
      exact: true
    }).last()).toBeVisible();
    await expect(page.getByText('원본에 없음', {
      exact: true
    })).toHaveCount(0);
    if (width === 390) {
      await page.getByRole('link', {
        name: '지출 내역으로 돌아가기'
      }).click();
      await expect(page).toHaveURL(`${BASE}/expenses?month=2026-09&account=${ACCOUNT}`);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}


for (const width of [1440, 425, 390]) {
  test(`은행 잔액 직접 확인과 이력 ${width}px는 중앙 모달·모바일 페이지와 실패 재시도·취소를 유지`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const creates: Record<string, unknown>[] = [];
    const cancels: Record<string, unknown>[] = [];
    let saved = false;
    let canceled = false;
    await page.route('http://localhost:8080/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      let status = method === 'OPTIONS' ? 204 : 200;
      let body: unknown = {};
      if (path.endsWith('/csrf')) body = {
        csrfToken: 'csrf'
      };
      else if (path.endsWith('/refresh')) body = {
        accessToken: 'access',
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
      else if (path.endsWith('/payments/workspace')) body = {
        propertyId: PROPERTY,
        asOf: '2026-10-24',
        accounts: [],
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
      else if (path.endsWith('/banking/balances/checks') && method === 'POST') {
        creates.push(route.request().postDataJSON());
        if (creates.length === 1) { status = 503; body = {
          code: 'TEMPORARY_ERROR'
        }; }
        else { saved = true; body = {
          saved: true
        }; }
      } else if (path.endsWith('/cancel')) {
        cancels.push(route.request().postDataJSON());
        if (cancels.length === 1) { status = 503; body = {
          code: 'TEMPORARY_ERROR'
        }; }
        else { canceled = true; body = {
          saved: true
        }; }
      } else if (path.endsWith('/banking/balances/checks')) body = {
        propertyId: PROPERTY,
        accountId: ACCOUNT,
        checks: saved ? Array.from({
          length: 12
        }, (_, index) => ({
          id: id(700 + index),
          amount: '2338114',
          checkedAt: `2026-10-${String(14 - index).padStart(2, '0')}T09:20:00+09:00`,
          sourceType: 'BANK_APP',
          checkedBy: id(1),
          checkedByName: '관리자',
          memo: '은행 앱 확인',
          createdAt: '2026-10-24T09:30:00+09:00',
          canceledAt: canceled && index === 0 ? '2026-10-24T09:31:00+09:00' : null,
          canceledBy: canceled && index === 0 ? id(1) : null,
          cancelReason: canceled && index === 0 ? '금액 오입력' : null
        })) : []
      };
      else if (path.endsWith('/banking/balances')) body = {
        propertyId: PROPERTY,
        month: '2026-10',
        cutoffDate: null,
        bankBalance: saved && !canceled ? '2338114' : null,
        bankAsOf: null,
        buildings: [],
        entries: [],
        externals: [],
        incomes: [],
        pending: [],
        accounts: [{
          id: ACCOUNT,
          label: '하나은행 ····1234 · 관리비',
          status: 'ACTIVE',
          balance: saved && !canceled ? '2338114' : null,
          asOf: saved && !canceled ? '2026-10-14 09:20:00' : null
        }, {
          id: id(11),
          label: '카카오뱅크 ····1020 · 예비비',
          status: 'ACTIVE',
          balance: null,
          asOf: null,
          calculatedBalance: '1522910',
          calculationBasisDate: '2026-09-30'
        }]
      };
      await route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-TOKEN',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: status === 204 ? '' : JSON.stringify(body)
      });
    });
    await page.goto(`${BASE}/balances?month=2026-10`);
    if (width === 425) {
      const sizes = page.getByRole('combobox', {
        name: '동별 잔고 표시 개수',
        exact: true
      });
      const state = page.getByRole('combobox', {
        name: '잔고 상태',
        exact: true
      });
      await expect(sizes).toBeVisible();
      expect((await sizes.boundingBox())!.width).toBeGreaterThan((await state.boundingBox())!.width * 1.8);
    }

    await page.getByRole('button', {
      name: '하나은행 ····1234 · 관리비 잔액 메뉴',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '하나은행 ····1234 · 관리비 잔액 메뉴',
      exact: true
    })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const item = page.getByRole('menuitem', {
      name: '확인 이력 보기',
      exact: true
    });
    await expect(item).toBeVisible();
    await expect(page.getByRole('menu', {
      name: '하나은행 ····1234 · 관리비 잔액 메뉴 작업',
      exact: true
    })).toHaveCSS('opacity', '1');
    expect(await item.evaluate((element) => { const b = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); })).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`accountBalanceMenu${width}.png`),
      fullPage: true
    });
    await page.getByRole('menuitem', {
      name: '은행 잔액 직접 확인',
      exact: true
    }).click();
    if (width > 767) {
      const modal = page.getByRole('dialog', {
        name: '은행 잔액 직접 확인',
        exact: true
      });
      await expect(modal).toBeVisible();
      const bounds = await modal.boundingBox();
      expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(2);
      expect(Math.abs(bounds!.y + bounds!.height / 2 - 500)).toBeLessThan(2);
    } else {
      await expect(page).toHaveURL(/details\/check\?/);
      await expect(page.getByRole('link', {
        name: '동별 잔고·정산으로 돌아가기'
      })).toBeVisible();
    }
    await page.getByLabel('은행에서 확인한 잔액', {
      exact: true
    }).fill('2338114');
    await page.getByLabel('확인 시각 (한국시간)', {
      exact: true
    }).fill('09:20:00');
    await page.getByLabel('메모 (선택)', {
      exact: true
    }).fill('은행 앱 확인');
    await page.screenshot({
      path: testInfo.outputPath(`balanceCheck${width}.png`),
      fullPage: true
    });
    await page.getByRole('button', {
      name: '기록',
      exact: true
    }).click();
    await expect(page.getByLabel('은행에서 확인한 잔액', {
      exact: true
    })).toHaveValue('2,338,114');
    await page.getByRole('button', {
      name: '기록',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '하나은행 ····1234 · 관리비 잔액 메뉴',
      exact: true
    })).toBeVisible();
    expect(creates).toHaveLength(2);
    expect(creates[0]).toEqual(creates[1]);
    await page.getByRole('button', {
      name: '하나은행 ····1234 · 관리비 잔액 메뉴',
      exact: true
    }).click();
    await page.getByRole('menuitem', {
      name: '확인 이력 보기',
      exact: true
    }).click();
    if (width > 767) {
      const modal = page.getByRole('dialog', {
        name: '은행 잔액 확인 이력',
        exact: true
      });
      const bounds = await modal.boundingBox();
      expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(2);
      expect(Math.abs(bounds!.y + bounds!.height / 2 - 500)).toBeLessThan(2);
    } else await expect(page).toHaveURL(/details\/checks\?/);

    const records = page.locator('li').filter({
      has: page.getByText('확인 기준일시', {
        exact: true
      })
    });
    await expect(records).toHaveCount(5);
    const sizePicker = page.getByRole('combobox', {
      name: '확인 이력 표시 개수',
      exact: true
    });
    // 모바일 스크롤 복원 도중 두 좌표를 서로 다른 시점에 읽지 않고 한 번에 배치를 비교합니다.
    await expect.poll(() => records.first().evaluate((record) => {
      const picker = record.closest('dialog, section')?.querySelector('[aria-label="확인 이력 표시 개수"]');

      return Boolean(picker && picker.getBoundingClientRect().bottom <= record.getBoundingClientRect().top);
    })).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`balanceCheckHistoryDefault${width}.png`),
      fullPage: width <= 767
    });
    await testInfo.attach(`은행 잔액 확인 이력 ${width}px`, {
      path: testInfo.outputPath(`balanceCheckHistoryDefault${width}.png`),
      contentType: 'image/png'
    });
    await sizePicker.click();
    await page.getByRole('option', {
      name: '10개씩 보기',
      exact: true
    }).click();
    await expect(records).toHaveCount(10);
    const pagination = page.getByRole('navigation', {
      name: '확인 이력 페이지',
      exact: true
    });
    await pagination.getByRole('button', {
      name: '다음 페이지',
      exact: true
    }).click();
    await expect(records).toHaveCount(2);
    await pagination.getByRole('button', {
      name: '이전 페이지',
      exact: true
    }).click();
    await expect(records).toHaveCount(10);
    await page.getByRole('button', {
      name: /확인 기록 메뉴$/
    }).first().click();
    await page.getByRole('menuitem', {
      name: '확인 기록 취소',
      exact: true
    }).click();
    await page.getByLabel('취소 사유', {
      exact: true
    }).fill('금액 오입력');
    await page.getByRole('button', {
      name: '취소 기록',
      exact: true
    }).click();
    await expect(page.getByLabel('취소 사유', {
      exact: true
    })).toHaveValue('금액 오입력');
    await page.getByRole('button', {
      name: '취소 기록',
      exact: true
    }).click();
    await expect(records.getByText('취소됨', {
      exact: true
    })).toBeVisible();
    expect(cancels).toHaveLength(2);
    expect(cancels[0]).toEqual(cancels[1]);
    await page.screenshot({
      path: testInfo.outputPath(`balanceCheckHistory${width}.png`),
      fullPage: true
    });
  });
}

for (const width of [1920, 390, 320]) {
  test(`전체 통장은 잔액을 숨기고 통장 선택과 필터에 맞춰 요약 카드가 전체 너비를 채운다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
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
      else if (path.endsWith('/access-context')) body = {
        residentEligible: false,
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
        asOf: '2026-10-15',
        accounts: [{
          id: ACCOUNT,
          label: '가상 통장'
        }],
        units: [],
        charges: [],
        payments: [],
        history: []
      };
      else if (path.endsWith('/banking/workspace')) body = {
        propertyId: PROPERTY,
        asOf: '2026-10-15',
        accounts: [IMPORT_ACCOUNT],
        buildings: [],
        units: [],
        rows: [row(700, 'INCOME', '가상입금', '50000'), row(701, 'EXPENSE', '가상지출', '20000')],
        rules: []
      };
      await route.fulfill({
        json: body
      });
    });
    await page.goto(`${BASE}/transactions`);
    const summary = page.locator('[data-view="transactions"]');
    const filters = page.getByRole('group', {
      name: '입출금 필터'
    });
    const balance = summary.getByRole('article').filter({
      hasText: '최근 은행 확인 잔액'
    });
    const accountFilter = page.getByRole('combobox', {
      name: '조회 통장',
      exact: true
    });
    for (const specific of [false, true]) {
      if (specific) {
        await accountFilter.click();
        await page.getByRole('option', {
          name: /하나은행/
        }).click();
      }
      for (const direction of ['전체', '입금', '출금']) {
        await filters.getByRole('button', {
          name: new RegExp(`^${direction}`)
        }).click();
        const expected = (direction === '전체' ? 4 : 3) + Number(specific);
        await expect(summary.getByRole('article')).toHaveCount(expected);
        await expect(balance).toHaveCount(Number(specific));
        const parent = (await summary.boundingBox())!;
        const cards = await summary.getByRole('article').evaluateAll((elements) => elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            width: bounds.width,
            top: bounds.top
          };
        }));
        expect(Math.abs(cards[0].left - parent.x)).toBeLessThan(1);
        expect(Math.abs(cards.at(-1)!.right - (parent.x + parent.width))).toBeLessThan(1);
        expect(Math.max(...cards.map((c) => c.width)) - Math.min(...cards.map((c) => c.width))).toBeLessThan(1);
        if (width === 1920) {
          expect(cards.every((card) => Math.abs(card.top - cards[0].top) < 1)).toBe(true);
          await summary.screenshot({
            path: test.info().outputPath(`summary-${specific ? 'account' : 'all'}-${direction}-${width}.png`)
          });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    await accountFilter.click();
    await page.getByRole('option', {
      name: '전체 통장',
      exact: true
    }).click();
    await expect(balance).toHaveCount(0);
    await expect(summary.getByRole('article')).toHaveCount(3);
  });
}
