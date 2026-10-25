import type { BillingSettings } from '../src/entities/billing';
import {
  expect,
  test,
  type Page,
  type Route
} from '@playwright/test';
const API = 'http://localhost:8080';
const PROPERTY = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const USER = '00000000-0000-0000-0000-000000000001';
const BASE = `/manage/${PROPERTY}/billing/monthly`;
const id = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const items = [{
  id: id(2),
  code: null,
  name: '기본 관리비',
  amount: '15000'
}, {
  id: id(3),
  code: null,
  name: '조정',
  amount: '0'
}];
async function json(route: Route, body: unknown, status = 200) {
  if (route.request().url().endsWith('/access-context') && status === 200 && body && typeof body === 'object') {
    body = {
      residentEligible: false,
      ...body
    };
  }
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'X-CSRF-TOKEN, Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  });
}
async function mockBilling(page: Page) {
  let settings: BillingSettings = {
    propertyId: PROPERTY,
    hasBuildings: true,
    buildings: [{
      id: id(11),
      name: '102동'
    }, {
      id: id(10),
      name: '101동'
    }],
    currentMonth: '2026-10',
    firstBillingMonth: '2026-01',
    nextBillingDate: '2026-11-01',
    revisionId: id(4),
    current: {
      id: id(4),
      effectiveMonth: '2026-01',
      items,
      reason: null,
      changedAt: '2026-01-01T00:00:00Z'
    },
    scheduled: null as null | {id: string; effectiveMonth: string; items: typeof items; reason: string; changedAt: string}
  };
  const state = {
    fail: 0,
    writes: [] as Record<string, unknown>[],
    monthFailure: 0,
    wrongScope: false,
    hasBuildings: true,
    currentMonth: '2026-10',
    millionSummary: false,
    currentAdditions: [] as { id: string; buildingId: string | null; code: null; name: string; amount: string }[]
  };
  await page.route(`${API}/**`, async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return json(route, {});
    if (path === '/api/auth/web/csrf') return json(route, {
      csrfToken: 'test-csrf'
    });
    if (path === '/api/auth/web/refresh') return json(route, {
      accessToken: 'test-access',
      tokenType: 'Bearer',
      accessExpiresAt: new Date(Date.now()+3600000).toISOString()
    });
    if (path === '/api/users/me') return json(route, {
      id: USER,
      displayName: '관리자',
      profileImageUrl: '/moahomeIcon.svg',
      systemRole: 'USER',
      status: 'ACTIVE'
    });
    expect(request.headers().authorization).toBe('Bearer test-access');
    const property = {
      propertyId: PROPERTY,
      name: '성내빌라',
      role: 'ADMIN'
    };
    if (path === '/api/users/me/managed-properties') return json(route, {
      properties: [property]
    });
    if (path.endsWith('/access-context')) return json(route, property);
    if (path.endsWith('/billing/settings')) {
      const [year, month] = state.currentMonth.split('-').map(Number);
      settings = {
        ...settings,
        currentMonth: state.currentMonth,
        nextBillingDate: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
      };
      if (request.method() === 'PUT') {
        const body = request.postDataJSON(); state.writes.push(body);
        if (state.fail) return json(route, {
          code: state.fail === 409 ? 'BILLING_SETTINGS_CONFLICT' : 'BILLING_SERVICE_UNAVAILABLE'
        }, state.fail);
        expect(body.revisionId).toBe(settings.revisionId);
        state.currentAdditions.push(...(body.temporaryItems ?? []).filter((item: { month?: string }) => (item.month ?? body.temporaryMonth ?? body.effectiveMonth) === state.currentMonth)
          .map((item: { buildingId: string | null; itemCode: null; itemName: string; defaultAmount: number }, index: number) => ({
            id: id(800 + state.currentAdditions.length + index),
            buildingId: item.buildingId,
            code: item.itemCode ?? null,
            name: item.itemName,
            amount: String(item.defaultAmount)
          })));

        settings = {
          ...settings,
          revisionId: id(5),
          scheduled: {
            id: id(5),
            effectiveMonth: body.effectiveMonth,
            mode: body.mode ?? 'ALL',
            buildingItems: (body.buildingItems ?? []).map((group: { buildingId: string; items: {itemCode: null; itemName: string; defaultAmount: number}[] }, groupIndex: number) => ({
              buildingId: group.buildingId,
              items: group.items.map((item, index) => ({
                id: id(500 + groupIndex * 100 + index),
                code: item.itemCode,
                name: item.itemName,
                amount: String(item.defaultAmount)
              }))
            })),
            temporaryMode: body.temporaryMode ?? 'ALL',
            temporaryItems: (body.temporaryItems ?? []).filter((item: { month?: string }) => (item.month ?? body.temporaryMonth ?? body.effectiveMonth) !== state.currentMonth).map((item: { buildingId: string | null; itemName: string; itemCode: null; defaultAmount: number; note: string }, index: number) => ({
              id: id(900 + index),
              buildingId: item.buildingId,
              code: item.itemCode ?? null,
              name: item.itemName,
              amount: String(item.defaultAmount),
              note: item.note
            })),
            items: body.items.map((item: {itemName: string; defaultAmount: number}, index: number) => ({
              id: id(50+index),
              code: null,
              name: item.itemName,
              amount: String(item.defaultAmount)
            })),
            reason: body.reason,
            changedAt: '2026-10-10T00:00:00Z'
          }
        };
      }
      return json(route, {
        ...settings,
        hasBuildings: state.hasBuildings,
        buildings: state.hasBuildings ? settings.buildings : []
      });
    }
    if (path.endsWith('/billing/history')) return json(route, {
      propertyId: PROPERTY,
      periods: Array.from({
        length:12
      }, (_,index) => {
        const month = `2026-${String(12-index).padStart(2,'0')}`; const last = new Date(Date.UTC(2026,12-index,0)).getUTCDate();
        return {
          month,
          billingDate:`${month}-01`,
          dueDate:`${month}-${last}`,
          unitCount:25,
          totalAmount:String(25 * 15000),
          confirmedAt:`${month}-01T00:00:00Z`
        };
      })
    });
    const match = path.match(/\/billing\/monthly\/(\d{4}-\d{2})(?:\/units\/([^/]+))?$/);
    if (match) {
      if (state.monthFailure) return json(route, {
        code:'ACCESS_DENIED'
      },state.monthFailure);
      const month = match[1]; const selected = state.millionSummary ? [{
        ...items[0],
        amount: '50000'
      }] : month >= '2026-11' ? settings.scheduled?.items ?? items : items;
      let charges = Array.from({
        length: state.millionSummary ? 20 : 25
      }, (_,index) => ({
        id:id(100+index),
        unitId:id(200+index),
        building:state.hasBuildings ? (index < 15 ? '101동' : '102동') : '',
        room:String(101+index),
        displayName:index===0?'관리실':null,
        representativeName:index===0?'김모아':null,
        items:[...selected, ...(month === state.currentMonth ? state.currentAdditions.filter((item) => !item.buildingId || item.buildingId === (index < 15 ? id(10) : id(11))) : [])]
      })).reverse();
      if (match[2]) charges = charges.filter(charge => charge.unitId === match[2]);
      return json(route, {
        propertyId: state.wrongScope ? id(99) : PROPERTY,
        hasBuildings: state.hasBuildings,
        month,
        billingDate:`${month}-01`,
        dueDate:`${month}-${new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate()}`,
        status:month>'2026-10'?'SCHEDULED':'ISSUED',
        baseAmount:selected.reduce((sum,item)=>sum+BigInt(item.amount),BigInt(0)).toString(),
        charges
      });
    }
    throw new Error(`Unexpected API ${path}`);
  });
  return state;
}
for (const width of [1440, 390]) {
  test(`관리비 상세 ${width}px는 당월·과거·예정 모두 청구 삭제 없이 조회와 닫기를 제공`, async ({ page }) => {
    await mockBilling(page);
    await page.setViewportSize({
      width,
      height: 960
    });
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'DELETE') writes.push(request.url());
    });
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      await page.goto(`${BASE}?month=${month}`);
      await page.getByRole('table', {
        name: '세대별 관리비',
        exact: true
      }).getByRole('button').first().click();
      const detail = width >= 768 ? page.getByRole('dialog') : page.getByRole('main');
      await expect(detail.getByRole('table', {
        name: '청구 상세 항목',
        exact: true
      })).toBeVisible();
      await expect(detail.getByText('청구 합계', {
        exact: true
      })).toBeVisible();
      await expect(detail.getByRole('button', {
        name: '청구 삭제',
        exact: true
      })).toHaveCount(0);
      await expect(detail).not.toContainText('당월 청구를 삭제하면');
      if (width >= 768) {
        await detail.getByRole('button', {
          name: '상세 닫기',
          exact: true
        }).click();
      } else {
        await expect(detail.getByRole('button', {
          name: /목록/
        })).toHaveCount(0);
        await page.getByRole('banner').getByRole('link', {
          name: '목록',
          exact: true
        }).click();
      }
      await expect(page.getByRole('table', {
        name: '세대별 관리비',
        exact: true
      })).toBeVisible();
    }
    expect(writes).toEqual([]);
  });
}
for (const width of [1440,390,320]) {
  test(`관리비 ${width}px 검색·페이지·달력·행 상세와 직접 재진입`, async ({page}) => {
    await mockBilling(page); await page.setViewportSize({
      width,
      height:960
    }); await page.goto(BASE);
    const main=page.getByRole('main'); const table=main.getByRole('table',{
      name:'세대별 관리비',
      exact:true
    });
    await expect(table.getByRole('row')).toHaveCount(11);
    await expect(table.getByRole('columnheader', {
      name: '대표 주민',
      exact: true
    })).toBeVisible();
    await expect(table.getByRole('row').nth(1)).toContainText('김모아');
    await expect(table.getByRole('row').nth(2)).toContainText('—');
    await expect(main.getByText('부과 방식', {
      exact: true
    })).toHaveCount(0);
    await expect(main.getByText('스케줄 자동 확정', {
      exact: true
    })).toHaveCount(0);
    await expect(table.getByRole('columnheader',{
      name:'상세',
      exact:true
    })).toHaveCount(0);
    await main.getByRole('navigation',{
      name:'관리비 페이지',
      exact:true
    }).getByRole('button',{
      name:'다음 페이지',
      exact:true
    }).click();
    await expect(table.getByRole('button').first()).toHaveText('111호');
    await main.getByRole('combobox', {
      name: '동 필터',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '102동',
      exact: true
    }).click();
    await expect(table.getByRole('button').first()).toHaveText('116호');
    await expect(table.getByRole('row')).toHaveCount(11);
    await main.getByRole('textbox', {
      name: '관리비 세대 검색',
      exact: true
    }).fill('김모아');
    await expect(table).toContainText('검색 결과가 없어요.');
    await main.getByRole('combobox', {
      name: '동 필터',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '전체 동',
      exact: true
    }).click();
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByRole('row').nth(1)).toContainText('김모아');
    await main.getByRole('textbox',{
      name:'관리비 세대 검색',
      exact:true
    }).fill('관리실');
    await expect(table.getByRole('row')).toHaveCount(2);
    await main.getByRole('button',{
      name:'초기화',
      exact:true
    }).click();
    await main.getByRole('button',{
      name:'조회 월: 2026년 10월',
      exact:true
    }).click();
    const calendar=page.getByRole('dialog',{
      name:'조회 월',
      exact:true
    });
    await expect(calendar.getByRole('button',{
      name:'2026년 10월',
      exact:true
    })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(calendar).not.toBeVisible();
    await main.getByRole('button',{
      name:'조회 월: 2026년 10월',
      exact:true
    }).click();
    await calendar.getByRole('button',{
      name:'2026년 11월',
      exact:true
    }).click();
    await expect(page).toHaveURL(/month=2026-11/); await expect(main.getByText('청구 예정 합계',{
      exact:true
    }).first()).toBeVisible();
    await main.getByRole('button',{
      name:'조회 월: 2026년 11월',
      exact:true
    }).click();
    await page.screenshot({
      path:test.info().outputPath(`billingCalendar${width}.png`),
      fullPage:true
    });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await table.getByRole('row').nth(1).getByRole('cell').last().click();
    if (width===1440) {
      const modal=page.getByRole('dialog'); await expect(modal.getByRole('table',{
        name:'청구 상세 항목',
        exact:true
      })).toContainText('15,000원');
      await expect(modal.getByRole('button', {
        name: '닫기',
        exact: true
      })).toHaveCount(0);
      await page.screenshot({
        path: test.info().outputPath(`billingDetail${width}.png`),
        fullPage: true
      });
      await modal.getByRole('button', {
        name: '상세 닫기',
        exact: true
      }).click();
      await expect(modal).not.toBeVisible();
    } else {
      await expect(page).toHaveURL(new RegExp(`/2026-11/${id(200)}$`)); await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.reload(); await expect(main.getByRole('table',{
        name:'청구 상세 항목',
        exact:true
      })).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`billingDetail${width}.png`),
        fullPage: true
      });
      await page.getByRole('link',{
        name:'목록',
        exact:true
      }).click();
      await expect(page).toHaveURL(/tab=monthly&month=2026-11/);
    }
    await main.getByRole('tab',{
      name:'부과 이력',
      exact:true
    }).click();
    const history=main.getByRole('table',{
      name:'관리비 부과 이력',
      exact:true
    }); await expect(history.getByRole('row')).toHaveCount(11);
    if (width < 768) {
      const monthFilter = main.getByRole('button', {
        name: '이력 조회 월: 전체 기간',
        exact: true
      });
      const header = main.getByRole('heading', {
        name: '확정된 부과 이력',
        exact: true
      }).locator('../..');
      const filterBounds = await monthFilter.boundingBox();
      const headerBounds = await header.boundingBox();
      expect(filterBounds).not.toBeNull();
      expect(headerBounds).not.toBeNull();
      expect(Math.abs(filterBounds!.width - headerBounds!.width)).toBeLessThanOrEqual(1);
    }
    await main.getByRole('textbox',{
      name:'부과 이력 검색',
      exact:true
    }).fill('2026-10'); await expect(history.getByRole('row')).toHaveCount(2);
    await history.getByRole('button').first().click();
    const expectedRooms = Array.from({
      length: 25
    }, (_, index) => `${101 + index}호`);
    if (width < 768) {
      await expect(page).toHaveURL(/history\/2026-10$/);
      await page.reload();
    }
    const detail = width >= 768 ? page.getByRole('dialog') : main;
    const detailTable = detail.getByRole('table', {
      name: '확정 세대 내역',
      exact: true
    });
    const detailPages = detail.getByRole('navigation', {
      name: '부과 상세 페이지',
      exact: true
    });
    await expect(detailTable.getByRole('row')).toHaveCount(11);
    await expect(detailTable.getByRole('rowheader')).toHaveText(expectedRooms.slice(0, 10));
    await detailPages.getByRole('button', {
      name: '다음 페이지',
      exact: true
    }).click();
    await expect(detailTable.getByRole('rowheader')).toHaveText(expectedRooms.slice(10, 20));
    await detailPages.getByRole('button', {
      name: '다음 페이지',
      exact: true
    }).click();
    await expect(detailTable.getByRole('rowheader')).toHaveText(expectedRooms.slice(20));
    await expect(detailPages.getByRole('button', {
      name: '다음 페이지',
      exact: true
    })).toBeDisabled();
    await expect(detail.getByText('375,000원', {
      exact: true
    })).toBeVisible();
    const detailSize = detail.getByRole('combobox', {
      name: '부과 상세 표시 개수',
      exact: true
    });
    for (const size of [20, 50]) {
      await detailSize.click();
      await page.getByRole('option', {
        name: `${size}개씩 보기`,
        exact: true
      }).click();
      await expect(detailTable.getByRole('rowheader')).toHaveText(expectedRooms.slice(0, size));
      await expect(detailPages.getByRole('button', {
        name: '1페이지',
        exact: true
      })).toHaveAttribute('aria-current', 'page');
    }
    await page.screenshot({
      path: test.info().outputPath(`billingHistoryDetail${width}.png`),
      fullPage: true
    });
    if (width >= 768) {
      await page.keyboard.press('Escape');
    } else {
      await expect(main.getByRole('button', {
        name: /목록/
      })).toHaveCount(0);
      await page.getByRole('banner').getByRole('link', {
        name: '목록',
        exact: true
      }).click();
    }
    await main.getByRole('tab',{
      name:'관리비 설정',
      exact:true
    }).click(); await expect(main.getByRole('textbox')).toHaveCount(0);
    await page.screenshot({
      path:test.info().outputPath(`billingSettings${width}.png`),
      fullPage:true
    });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    {
      await main.getByRole('button', {
        name: '설정하기',
        exact: true
      }).click();
      await main.getByRole('textbox', {
        name: '항목 1 기본 금액',
        exact: true
      }).waitFor();
      await page.screenshot({
        path: test.info().outputPath(`billingSettingsEdit${width}.png`),
        fullPage: true
      });
      const currentToggle = page.getByRole('button', {
        name: /현재 적용 항목/
      });
      await currentToggle.hover();
      await expect(currentToggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const currentSettings = main.getByRole('region', {
        name: '현재 적용 항목',
        exact: true
      });
      await expect(currentToggle).toContainText('당월 기준');
      await expect(currentToggle).toContainText('15,000원');
      await expect(currentToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(currentSettings.getByRole('table', {
        name: '현재 적용 항목',
        exact: true
      })).toBeHidden();
      await currentToggle.click();
      await expect(currentToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(currentSettings.getByRole('rowheader')).toHaveText(['기본 관리비', '조정']);
      await expect(currentSettings).toContainText('15,000원');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await currentSettings.evaluate(async (element) => {
        await Promise.all(element.getAnimations({
          subtree: true
        }).map((animation) => animation.finished));
      });
      await page.screenshot({
        path: test.info().outputPath(`billingSettingsExpanded${width}.png`),
        fullPage: true
      });
      await currentToggle.focus();
      await page.keyboard.press('Enter');
      await expect(currentToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(currentSettings.getByRole('table', {
        name: '현재 적용 항목',
        exact: true
      })).toBeHidden();
    }
  });
}
test('동 구분이 없으면 동 필터·동 열을 숨기고 대표 주민 검색을 유지한다', async ({ page }) => {
  const state = await mockBilling(page);
  state.hasBuildings = false;
  await page.setViewportSize({
    width: 390,
    height: 960
  });
  await page.goto(BASE);
  const main = page.getByRole('main');
  const table = main.getByRole('table', {
    name: '세대별 관리비',
    exact: true
  });
  await expect(table.getByRole('row')).toHaveCount(11);
  await expect(main.getByRole('combobox', {
    name: '동 필터',
    exact: true
  })).toHaveCount(0);
  await expect(table.getByRole('columnheader', {
    name: '동',
    exact: true
  })).toHaveCount(0);
  await main.getByRole('textbox', {
    name: '관리비 세대 검색',
    exact: true
  }).fill('김모아');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('row').nth(1)).toContainText('김모아');
  await main.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await expect(table.getByRole('row')).toHaveCount(11);
  await page.screenshot({
    path: test.info().outputPath('billingNoBuildings.png'),
    fullPage: true
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('현재 월 납부기한과 다음 달 변경 적용월을 구분하고 월 전환 때 갱신한다', async ({ page }) => {
  const state = await mockBilling(page);
  await page.clock.install();
  await page.goto(`${BASE}?tab=items`);
  const panel = page.getByRole('tabpanel', {
    name: '관리비 설정',
    exact: true
  });
  await expect(panel.getByText('10월 31일', {
    exact: true
  })).toBeVisible();
  await expect(panel.getByText('2026년 11월', {
    exact: true
  })).toBeVisible();
  await expect(panel.getByText('첫 부과월', {
    exact: true
  })).toHaveCount(0);
  for (const [month, dueDate, effectiveMonth] of [
    ['2026-11', '11월 30일', '2026년 12월'],
    ['2026-12', '12월 31일', '2027년 1월'],
    ['2028-02', '2월 29일', '2028년 3월']
  ]) {
    state.currentMonth = month;
    await page.clock.fastForward(61_000);
    await expect(panel.getByText(dueDate, {
      exact: true
    })).toBeVisible();
    await expect(panel.getByText(effectiveMonth, {
      exact: true
    })).toBeVisible();
  }
});

test('오류 모달은 헤더 X·바깥 클릭으로 닫고 재시도하면 상세를 보여준다', async ({ page }) => {
  const state = await mockBilling(page);
  await page.goto(`${BASE}?tab=history`);
  const history = page.getByRole('table', {
    name: '관리비 부과 이력',
    exact: true
  });
  await expect(history.getByRole('row')).toHaveCount(11);
  state.monthFailure = 503;
  await history.getByRole('button').first().click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('alert')).toContainText('다시 시도');
  await expect(modal.getByRole('button', {
    name: '닫기',
    exact: true
  })).toHaveCount(0);
  await expect(modal.getByRole('button', {
    name: '상세 닫기',
    exact: true
  })).toBeVisible();
  await modal.getByRole('heading', {
    name: '서버에 연결하지 못했어요',
    exact: true
  }).click();
  await expect(modal).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('billingErrorModal.png'),
    fullPage: true
  });
  await page.mouse.click(8, 8);
  await expect(modal).not.toBeVisible();
  await history.getByRole('button').first().click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await modal.getByRole('button', {
    name: '상세 닫기',
    exact: true
  }).click();
  await expect(modal).not.toBeVisible();
  await history.getByRole('button').first().click();
  state.monthFailure = 0;
  await modal.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(modal.getByRole('table', {
    name: '확정 세대 내역',
    exact: true
  })).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(modal).not.toBeVisible();
});
test('설정하기는 별도 편집 페이지·사유 필수·음수와 0원 저장·새로고침 보존', async ({page}) => {
  const state=await mockBilling(page); await page.goto(`${BASE}?tab=items`); const main=page.getByRole('main');
  await main.getByRole('button',{
    name:'설정하기',
    exact:true
  }).click(); await expect(page).toHaveURL(`${BASE}/settings`);
  await expect(main.getByRole('button', {
    name: '목록',
    exact: true
  })).toBeVisible();
  await expect(main.getByRole('button', {
    name: '설정 목록으로',
    exact: true
  })).toHaveCount(0);
  await main.getByRole('textbox',{
    name:'항목 1 기본 금액',
    exact:true
  }).fill('-1000');
  const save=main.getByRole('button',{
    name:'다음 달 예약 저장',
    exact:true
  }); await save.click();
  await expect(main.getByText('수정 사유를 입력해주세요.',{
    exact:true
  })).toBeVisible(); expect(state.writes).toHaveLength(0);
  await main.getByRole('textbox',{
    name:'수정 사유',
    exact:true
  }).fill('공용 비용 조정');
  state.fail=503; await save.click(); await expect(main.getByRole('alert')).toContainText('다시 시도');
  await expect(main.getByRole('textbox',{
    name:'항목 1 기본 금액',
    exact:true
  })).toHaveValue('-1,000');
  state.fail=409; await save.click(); await expect(main.getByRole('alert')).toContainText('최신 설정');
  state.fail=0; await save.click(); await expect(page).toHaveURL(/tab=items/);
  expect(state.writes[2]).toMatchObject({
    effectiveMonth:'2026-11',
    reason:'공용 비용 조정',
    items:[{
      defaultAmount:-1000
    },{
      defaultAmount:0
    }]
  });
  await expect(main.getByRole('table',{
    name:'현재 적용 중인 기본 항목',
    exact:true
  })).toContainText('15,000원');
  await expect(main.getByRole('table',{
    name:'다음 달 적용 예정 항목',
    exact:true
  })).toContainText('-1,000원');
  await page.reload(); await expect(main.getByText('수정 사유: 공용 비용 조정',{
    exact:true
  })).toBeVisible();
  await main.getByRole('button',{
    name:'설정하기',
    exact:true
  }).click();
  await expect(main.getByRole('textbox',{
    name:'항목 1 기본 금액',
    exact:true
  })).toHaveValue('-1,000');
  await expect(main.getByRole('textbox',{
    name:'수정 사유',
    exact:true
  })).toHaveValue('');
});
test('업무 API 권한·장애·다른 대상 응답을 빈 청구로 숨기지 않음', async ({page}) => {
  const state=await mockBilling(page); state.monthFailure=403; await page.goto(BASE); const main=page.getByRole('main');
  await expect(main.getByText('접근 권한을 확인해주세요',{
    exact:true
  })).toBeVisible();
  await expect(main.getByRole('table',{
    name:'세대별 관리비',
    exact:true
  })).toHaveCount(0);
  state.monthFailure=0; state.wrongScope=true; await main.getByRole('button',{
    name:'다시 시도',
    exact:true
  }).click();
  await expect(main.getByText('정보를 불러오지 못했어요',{
    exact:true
  })).toBeVisible();
  state.wrongScope=false; await main.getByRole('button',{
    name:'다시 시도',
    exact:true
  }).click();
  await expect(main.getByRole('table',{
    name:'세대별 관리비',
    exact:true
  })).toBeVisible();
});


for (const width of [1600, 1280, 390, 320]) {
  test(`백만 원 부과 합계 ${width}px는 숫자를 한 줄에 유지하고 실제 본문 폭에 맞춰 배치`, async ({ page }) => {
    const state = await mockBilling(page); state.millionSummary = true;
    await page.setViewportSize({
      width,
      height: 1000
    });
    await page.goto(`${BASE}?month=2026-10`);
    const amount = page.getByRole('article', {
      name: '확정 청구 합계 1,000,000원',
      exact: true
    });
    await expect(amount).toBeVisible();
    const metrics = await amount.locator('strong').evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      line: Number.parseFloat(getComputedStyle(element).lineHeight),
      width: element.getBoundingClientRect().width,
      card: element.closest('article')!.getBoundingClientRect().width
    }));
    expect(metrics.height).toBeLessThanOrEqual(metrics.line + 1);
    expect(metrics.width).toBeLessThan(metrics.card);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`millionSummary${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

for (const width of [1440, 390]) {
  test(`기본 전체와 임시 동별을 독립 선택하고 저장·재진입한다 ${width}px`, async ({ page }) => {
    const state = await mockBilling(page);
    await page.setViewportSize({
      width,
      height: 1000
    });
    await page.goto(`${BASE}/settings`);
    const base = page.getByRole('group', {
      name: '기본 부과 방식',
      exact: true
    });
    const temporary = page.getByRole('group', {
      name: '임시 부과 방식',
      exact: true
    });
    await temporary.getByRole('radio', {
      name: /^동별 부과/
    }).check();
    await expect(base.getByRole('radio', {
      name: /^전체 부과/
    })).toBeChecked();
    await page.getByRole('button', {
      name: '임시 부과 추가',
      exact: true
    }).click();
    await page.getByRole('combobox', {
      name: '부과 대상 동',
      exact: true
    }).click();
    await expect(page.getByRole('option')).toHaveText(['101동', '102동']);
    await page.getByRole('option', {
      name: '102동',
      exact: true
    }).click();
    const temporaryRow = page.getByRole('group', {
      name: '임시 부과 1',
      exact: true
    });
    const effectiveMonth = temporaryRow.getByRole('combobox', {
      name: '적용 월',
      exact: true
    }).getByText('2026년 11월', {
      exact: true
    });
    await expect(effectiveMonth).toBeVisible();
    await expect(effectiveMonth).toHaveCSS('font-size', '16px');
    await expect(effectiveMonth).toHaveCSS('color', 'rgb(15, 23, 42)');
    await expect(temporaryRow).not.toContainText('11월만');
    if (width < 768) {
      const baseRow = page.getByRole('group', {
        name: '항목 1',
        exact: true
      });
      const baseDelete = baseRow.getByRole('button', {
        name: '항목 1 삭제',
        exact: true
      });
      const temporaryDelete = temporaryRow.getByRole('button', {
        name: '임시 부과 1 삭제',
        exact: true
      });
      for (const [row, button] of [[baseRow, baseDelete], [temporaryRow, temporaryDelete]]) {
        const rowBounds = await row.boundingBox();
        const buttonBounds = await button.boundingBox();
        expect(rowBounds).not.toBeNull();
        expect(buttonBounds).not.toBeNull();
        expect(buttonBounds!.y - rowBounds!.y).toBeLessThanOrEqual(24);
        expect(rowBounds!.x + rowBounds!.width - buttonBounds!.x - buttonBounds!.width).toBeLessThanOrEqual(24);
        await expect(button.locator('svg:visible')).toHaveCount(1);
      }
    }
    const temporaryKind = page.getByRole('combobox', {
      name: '임시 항목 1 종류',
      exact: true
    });
    await expect(page.getByRole('textbox', {
      name: '임시 항목 1 이름',
      exact: true
    })).toHaveCount(0);
    await temporaryKind.click();
    await page.getByRole('option', {
      name: '청소비',
      exact: true
    }).click();
    await expect(page.getByRole('textbox', {
      name: '임시 항목 1 이름',
      exact: true
    })).toHaveCount(0);
    await temporaryKind.click();
    await page.getByRole('option', {
      name: '기타',
      exact: true
    }).click();
    await expect(page.getByRole('textbox', {
      name: '임시 항목 1 이름',
      exact: true
    })).toHaveCSS('color', 'rgb(15, 23, 42)');
    await page.getByRole('textbox', {
      name: '임시 항목 1 이름',
      exact: true
    }).fill('수선비');
    await page.getByRole('textbox', {
      name: '세대당 추가 금액',
      exact: true
    }).fill('100000');
    const preview = page.getByRole('table', {
      name: '동별 부과 미리보기',
      exact: true
    });
    await expect(preview.getByRole('row').filter({
      hasText: '102동'
    })).toContainText('115,000원');
    await expect(preview.getByRole('row').filter({
      hasText: '101동'
    })).toContainText('15,000원');
    await page.getByRole('textbox', {
      name: '수정 사유',
      exact: true
    }).fill('102동 다음 달 수선비');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`billingIndependentModes${width}.png`),
      fullPage: true
    });
    await page.getByRole('button', {
      name: '다음 달 예약 저장',
      exact: true
    }).click();
    await expect(page).toHaveURL(/tab=items/);
    expect(state.writes[0]).toMatchObject({
      mode: 'ALL',
      temporaryMode: 'BUILDING',
      temporaryItems: [{
        buildingId: id(11),
        defaultAmount: 100000
      }]
    });
    await page.getByRole('button', {
      name: '설정하기',
      exact: true
    }).click();
    await expect(page.getByRole('textbox', {
      name: '세대당 추가 금액',
      exact: true
    })).toHaveValue('100,000');
    await expect(base.getByRole('radio', {
      name: /^전체 부과/
    })).toBeChecked();
    await expect(temporary.getByRole('radio', {
      name: /^동별 부과/
    })).toBeChecked();
    await base.getByRole('radio', {
      name: /^동별 부과/
    }).check();
    await expect(page.getByRole('region', {
      name: '전체 동 기본 항목 설정',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('region', {
      name: '동별 기본 항목 설정',
      exact: true
    })).toBeVisible();
    await page.getByRole('region', {
      name: '동별 기본 항목 설정',
      exact: true
    }).getByRole('button', {
      name: /^102동/
    }).click();
    const building = page.getByRole('region', {
      name: '102동',
      exact: true
    });
    await building.getByRole('textbox', {
      name: '항목 1 기본 금액',
      exact: true
    }).fill('60000');
    await temporary.getByRole('radio', {
      name: /^전체 부과/
    }).check();
    await page.getByRole('textbox', {
      name: '수정 사유',
      exact: true
    }).fill('동별 기본과 전체 임시 부과');
    await page.getByRole('button', {
      name: '다음 달 예약 저장',
      exact: true
    }).click();
    await expect(page).toHaveURL(/tab=items/);
    expect(state.writes[1]).toMatchObject({
      mode: 'BUILDING',
      items: [],
      temporaryMode: 'ALL',
      temporaryItems: [{
        buildingId: null,
        defaultAmount: 100000
      }]
    });
    await page.reload();
    const scheduled = page.getByRole('table', {
      name: '다음 달 적용 예정 항목',
      exact: true
    });
    await expect(scheduled).toContainText('동별 금액 다름');
    await scheduled.getByRole('button', {
      name: '기본 관리비 동별 금액',
      exact: true
    }).click();
    await expect(scheduled).toContainText('60,000원');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`billingBuildingSummary${width}.png`),
      fullPage: true
    });
  });
}

for (const width of [1440, 390]) {
  test(`임시 항목마다 적용월 드롭다운을 선택해 이번 달 추가와 다음 달 예약을 함께 저장 ${width}px`, async ({ page }) => {
    const state = await mockBilling(page);
    await page.setViewportSize({
      width,
      height: 1000
    });
    await page.goto(`${BASE}/settings`);
    await expect(page.getByRole('group', {
      name: '임시 부과 적용 월',
      exact: true
    })).toHaveCount(0);
    const add = page.getByRole('button', {
      name: '임시 부과 추가',
      exact: true
    });
    await add.click();
    const current = page.getByRole('group', {
      name: '임시 부과 1',
      exact: true
    });
    await current.getByRole('combobox', {
      name: '적용 월',
      exact: true
    }).click();
    await expect(page.getByRole('option')).toHaveText(['2026년 10월', '2026년 11월']);
    await page.getByRole('option', {
      name: '2026년 10월',
      exact: true
    }).click();
    await current.getByRole('combobox', {
      name: '임시 항목 1 종류',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '청소비',
      exact: true
    }).click();
    await current.getByRole('textbox', {
      name: '세대당 추가 금액',
      exact: true
    }).fill('100000');
    await add.click();
    const next = page.getByRole('group', {
      name: '임시 부과 2',
      exact: true
    });
    await expect(next.getByRole('combobox', {
      name: '적용 월',
      exact: true
    })).toContainText('2026년 11월');
    await next.getByRole('combobox', {
      name: '임시 항목 2 종류',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '승강기 유지비',
      exact: true
    }).click();
    await next.getByRole('textbox', {
      name: '세대당 추가 금액',
      exact: true
    }).fill('20000');
    await page.getByRole('textbox', {
      name: '수정 사유',
      exact: true
    }).fill('긴급 청소와 다음 달 점검');
    const save = page.getByRole('button', {
      name: '이번 달 추가 부과',
      exact: true
    });
    state.fail = 503;
    await save.click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('다시 시도');
    const requestId = state.writes[0].requestId;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    state.fail = 0;
    await save.click();
    await expect(page).toHaveURL(/tab=monthly&month=2026-10/);
    expect(state.writes[1].requestId).toBe(requestId);
    expect(state.writes[1]).toMatchObject({
      temporaryItems: [{
        month: '2026-10',
        defaultAmount: 100000
      }, {
        month: '2026-11',
        defaultAmount: 20000
      }]
    });
    const monthly = page.getByRole('table', {
      name: '세대별 관리비',
      exact: true
    });
    await expect(monthly.getByRole('row').nth(1)).toContainText('115,000원');
    await page.goto(`${BASE}/settings`);
    await expect(page.getByRole('textbox', {
      name: '세대당 추가 금액',
      exact: true
    })).toHaveValue('20,000');
    await expect(page.getByRole('combobox', {
      name: '적용 월',
      exact: true
    })).toContainText('2026년 11월');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [1440, 390, 320]) {
  test(`참고용 금액 계산·복사는 부과 초안과 저장에 영향을 주지 않는다 ${width}px`, async ({ page }) => {
    const state = await mockBilling(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            document.documentElement.dataset.copiedAmount = value;
          }
        }
      });
    });
    await page.setViewportSize({
      width,
      height: 900
    });
    await page.goto(`${BASE}/settings`);
    const baseAmount = page.getByRole('textbox', {
      name: '항목 1 기본 금액',
      exact: true
    });
    await baseAmount.fill('50000');
    await page.getByRole('button', {
      name: '임시 부과 추가',
      exact: true
    }).click();
    const temporaryAmount = page.getByRole('textbox', {
      name: '세대당 추가 금액',
      exact: true
    });
    await temporaryAmount.fill('10000');
    const trigger = page.getByRole('button', {
      name: '계산기 열기',
      exact: true
    });
    await trigger.click();
    const dialog = page.getByRole('dialog', {
      name: '금액 계산기',
      exact: true
    });
    const amount = dialog.getByRole('textbox', {
      name: '필요한 총금액',
      exact: true
    });
    const count = dialog.getByRole('textbox', {
      name: '나눌 수',
      exact: true
    });
    await expect(dialog.getByRole('textbox', {
      name: '계산식',
      exact: true
    })).toBeFocused();
    await dialog.getByRole('tab', {
      name: '분담 계산',
      exact: true
    }).click();
    await page.keyboard.press('Tab');
    await expect(amount).toBeFocused();
    await expect(dialog).toContainText('참고용 · 계산 결과는 자동으로 적용되지 않습니다.');
    await amount.fill('1500000');
    await count.fill('0');
    await expect(dialog).toContainText('나눌 수는 1 이상으로 입력해주세요.');
    await expect(dialog.getByRole('region', {
      name: '분담 금액 계산 결과'
    })).toHaveCount(0);
    await count.fill('20');
    const exact = dialog.getByRole('article', {
      name: '분담 금액',
      exact: true
    });
    await expect(exact).toContainText('75,000원');
    await expect(exact).toContainText('1,500,000원');
    await expect(exact).toContainText('차이 없음');
    await count.fill('17');
    const lower = dialog.getByRole('article', {
      name: '원 단위 내림',
      exact: true
    });
    const upper = dialog.getByRole('article', {
      name: '원 단위 올림',
      exact: true
    });
    await expect(lower).toContainText('88,235원');
    await expect(lower).toContainText('1,499,995원');
    await expect(lower).toContainText('5원 부족');
    await expect(upper).toContainText('88,236원');
    await expect(upper).toContainText('1,500,012원');
    await expect(upper).toContainText('12원 초과');
    await lower.getByRole('button', {
      name: '원 단위 내림 복사',
      exact: true
    }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.copiedAmount)).toBe('88235');
    await expect(dialog).toContainText('88,235원을 복사했어요.');
    await count.press('Enter');
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`billingCalculator${width}.png`),
      fullPage: true
    });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(baseAmount).toHaveValue('50,000');
    await expect(temporaryAmount).toHaveValue('10,000');
    expect(state.writes).toHaveLength(0);
    await trigger.click();
    await dialog.getByRole('tab', {
      name: '분담 계산',
      exact: true
    }).click();
    await expect(count).toHaveValue('17');
    // 복사 권한이 없는 환경에서도 계산 결과와 입력을 잃지 않습니다.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => { throw new Error('clipboard unavailable'); }
      }
    }));
    await upper.getByRole('button', {
      name: '원 단위 올림 복사',
      exact: true
    }).click();
    await expect(dialog).toContainText('복사하지 못했어요. 금액을 선택해 복사해주세요.');
    await expect(upper).toContainText('88,236원');
    await dialog.getByRole('button', {
      name: '계산기 닫기',
      exact: true
    }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.writes).toHaveLength(0);
  });
}

for (const width of [1440, 390, 320]) {
  test(`기본 항목은 전체·동별 모두 마지막 한 개를 삭제할 수 없다 ${width}px`, async ({ page }) => {
    const state = await mockBilling(page);
    await page.setViewportSize({
      width,
      height: 1000
    });
    await page.goto(`${BASE}/settings`);
    await expect(page.getByRole('button', {
      name: '금액 계산기',
      exact: true
    })).toHaveCount(0);
    await page.getByRole('button', {
      name: '항목 2 삭제',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '항목 1 삭제',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('textbox', {
      name: '항목 1 기본 금액',
      exact: true
    })).toHaveValue('15,000');
    await page.getByRole('button', {
      name: '항목 추가',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '항목 1 삭제',
      exact: true
    })).toBeVisible();
    await page.getByRole('button', {
      name: '항목 2 삭제',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '항목 1 삭제',
      exact: true
    })).toHaveCount(0);
    await page.getByRole('group', {
      name: '기본 부과 방식',
      exact: true
    }).getByRole('radio', {
      name: /^동별 부과/
    }).check();
    await page.getByRole('button', {
      name: /^101동/
    }).click();
    const building = page.getByRole('region', {
      name: '101동',
      exact: true
    });
    await expect(building.getByRole('button', {
      name: /항목 [0-9]+ 삭제/
    })).toHaveCount(0);
    await building.getByRole('button', {
      name: '항목 추가',
      exact: true
    }).click();
    await expect(building.getByRole('button', {
      name: '항목 1 삭제',
      exact: true
    })).toBeVisible();
    await building.getByRole('button', {
      name: '항목 2 삭제',
      exact: true
    }).click();
    await expect(building.getByRole('button', {
      name: /항목 [0-9]+ 삭제/
    })).toHaveCount(0);
    await page.getByRole('button', {
      name: '임시 부과 추가',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '임시 부과 1 삭제',
      exact: true
    })).toBeVisible();
    expect(state.writes).toHaveLength(0);
    await page.screenshot({
      path: test.info().outputPath(`singleBaseItem${width}.png`),
      fullPage: true
    });
  });

  test(`고정 계산기는 일반·분담 탭과 키패드·복사를 제공하고 메뉴 이동 시 닫힌다 ${width}px`, async ({ page }) => {
    const state = await mockBilling(page);
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => { document.documentElement.dataset.copiedAmount = value; }
      }
    }));
    await page.setViewportSize({
      width,
      height: 900
    });
    await page.goto(`${BASE}/settings`);
    const trigger = page.getByRole('button', {
      name: '계산기 열기',
      exact: true
    });
    await expect(trigger).toBeVisible();
    const initial = await trigger.boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrolled = await trigger.boundingBox();
    expect(scrolled!.y).toBe(initial!.y);
    const save = await page.getByRole('button', {
      name: '다음 달 예약 저장',
      exact: true
    }).boundingBox();
    expect(save!.y + save!.height).toBeLessThan(scrolled!.y);
    await page.screenshot({
      path: test.info().outputPath(`floatingCalculator${width}.png`),
      fullPage: false
    });
    await trigger.click();
    const dialog = page.getByRole('dialog', {
      name: '금액 계산기',
      exact: true
    });
    await expect(trigger).not.toBeVisible();
    await expect(dialog.getByRole('tab', {
      name: '일반 계산'
    })).toHaveAttribute('aria-selected', 'true');
    const expression = dialog.getByRole('textbox', {
      name: '계산식',
      exact: true
    });
    await expect(expression).toBeFocused();
    await expression.fill('0.1 + 0.2');
    await expression.press('Enter');
    await expect(dialog.getByLabel('계산 결과', {
      exact: true
    })).toHaveText('0.3');
    await dialog.getByRole('button', {
      name: '결과 복사',
      exact: true
    }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.copiedAmount)).toBe('0.3');
    await dialog.getByRole('button', {
      name: '전체 지우기',
      exact: true
    }).click();
    for (const name of ['7', '곱하기', '8', '계산하기']) await dialog.getByRole('button', {
      name,
      exact: true
    }).click();
    await expect(dialog.getByLabel('계산 결과', {
      exact: true
    })).toHaveText('56');
    await expression.fill('1/0');
    await expression.press('Enter');
    await expect(dialog).toContainText('0으로 나눌 수 없습니다.');
    await expect(dialog.getByRole('button', {
      name: '결과 복사',
      exact: true
    })).toBeDisabled();
    await expression.fill('1500000 ÷ 17');
    await expression.press('Enter');
    await expect(dialog.getByLabel('계산 결과', {
      exact: true
    })).toHaveText('88,235.294117647059');
    await expect(dialog).toContainText('소수점 12자리까지 반올림한 값입니다.');
    const tab = dialog.getByRole('tab', {
      name: '일반 계산',
      exact: true
    });
    await tab.focus();
    await tab.press('ArrowRight');
    await expect(dialog.getByRole('tab', {
      name: '분담 계산',
      exact: true
    })).toBeFocused();
    await dialog.getByRole('tab', {
      name: '분담 계산',
      exact: true
    }).press('ArrowLeft');
    await expect(expression).toHaveValue('1500000 ÷ 17');
    const bounds = await dialog.boundingBox();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`generalCalculator${width}.png`),
      fullPage: true
    });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(expression).toHaveValue('1500000 ÷ 17');
    // App Router 내 이동은 새 문서를 만들지 않으며 열린 계산창만 초기화합니다.
    await page.evaluate((url) => window.history.pushState(null, '', url), `${BASE}?tab=items`);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeVisible();
    expect(state.writes).toHaveLength(0);
  });
}
