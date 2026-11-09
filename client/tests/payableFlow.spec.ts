import {
  expect,
  test
} from '@playwright/test';
import {
  mockSettlement,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';
import { LEDGER_PAYABLE } from './support/accountLedger';
import { getCurrentMonth } from '../src/shared/lib/month-range';
import {
  mockPayables,
  PAYABLE_ID
} from './support/payable';

const LEDGER = `/manage/${SETTLEMENT_PROPERTY}/accounting/ledger`;
const MONTH = getCurrentMonth();
const ORIGIN = `${LEDGER}?startMonth=${MONTH}&endMonth=${MONTH}&account=${LEDGER_PAYABLE}`;

for (const width of [1440, 390]) {
  test(`${width}px 미지급 등록·부분 지급·해제는 원본을 보존하고 202 원장에 반영한다`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    await mockSettlement(page);
    const mock = await mockPayables(page);
    await page.goto(`/manage/${SETTLEMENT_PROPERTY}/banking/manual-expense`);
    await page.getByRole('combobox', {
      name: '지급 상태',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '미지급',
      exact: true
    }).click();
    await page.getByRole('textbox', {
      name: '미지급 금액',
      exact: true
    }).fill('100000');
    await page.getByRole('textbox', {
      name: '내용',
      exact: true
    }).fill('청소 용역비');
    await page.getByRole('textbox', {
      name: '지급처',
      exact: true
    }).fill('청소 업체');
    await page.getByRole('combobox', {
      name: '비용 계정과목',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '802 청소비',
      exact: true
    }).click();
    await page.getByRole('combobox', {
      name: '부담 동',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '102동',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '등록',
      exact: true
    }).click();
    await expect(page.getByText('남은 미지급금', {
      exact: true
    })).toBeVisible();
    expect(mock.workspace.items).toHaveLength(1);
    const payable = mock.workspace.items[0].id;
    for (const [name, remaining] of [['청소비 1차 지급', '60000'], ['청소비 2차 지급', '0']]) {
      await page.getByRole('combobox', {
        name: '지급 출금',
        exact: true
      }).click();
      await page.getByRole('option').filter({
        hasText: name
      }).click();
      await page.getByRole('button', {
        name: '지급 연결',
        exact: true
      }).click();
      await page.getByRole('button', {
        name: '확인',
        exact: true
      }).click();
      await expect.poll(() => mock.workspace.items[0].remaining).toBe(remaining);
    }
    await expect(page.getByText('지급 완료', {
      exact: true
    })).toBeVisible();
    await page.goto(ORIGIN);
    await expect(page.getByRole('button', {
      name: '미지급 등록',
      exact: true
    })).toHaveCount(0);
    const table = page.getByRole('table', {
      name: '계정별 원장',
      exact: true
    });
    await expect(table.getByRole('row')).toHaveCount(4);
    await table.getByRole('row').nth(1).click();
    if (width >= 768) await expect(page.getByRole('dialog')).toHaveCount(1);
    else await expect(page).toHaveURL(new RegExp(`/accounting/payables/${payable}`));
    await page.getByRole('button', {
      name: '연결 해제',
      exact: true
    }).first().click();
    await page.getByRole('button', {
      name: '확인',
      exact: true
    }).click();
    await expect.poll(() => mock.workspace.items[0].remaining).toBe('40000');
    await expect(page.getByText('일부 지급', {
      exact: true
    })).toBeVisible();
    expect(mock.workspace.items[0].payments.filter((v) => v.status === 'CANCELED')).toHaveLength(1);
  });
}

test('지급 응답 유실을 재시도해도 같은 요청 ID를 사용하고 MANAGER는 변경 동작을 보지 않는다', async ({ page }) => {
  await mockSettlement(page);
  const mock = await mockPayables(page, {
    withItem: true,
    lostFirstPaymentResponse: true
  });
  await page.goto(`/manage/${SETTLEMENT_PROPERTY}/accounting/payables/${PAYABLE_ID}`);
  await page.getByRole('combobox', {
    name: '지급 출금',
    exact: true
  }).click();
  await page.getByRole('option').filter({
    hasText: '1차 지급'
  }).click();
  await page.getByRole('button', {
    name: '지급 연결',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(page.getByRole('alert').filter({
    hasText: 'API 요청을 처리하지 못했습니다.'
  })).toBeVisible();
  await page.getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(page.getByText('일부 지급', {
    exact: true
  })).toBeVisible();
  expect(mock.receivedPaymentIds[0]).toBe(mock.receivedPaymentIds[1]);
  expect(mock.workspace.items[0].payments).toHaveLength(1);
  await mockPayables(page, {
    withItem: true,
    manager: true
  });
  await page.reload();
  await expect(page.getByRole('button', {
    name: '지급 연결',
    exact: true
  })).toHaveCount(0);
  await expect(page.getByRole('button', {
    name: '등록 취소',
    exact: true
  })).toHaveCount(0);
});
