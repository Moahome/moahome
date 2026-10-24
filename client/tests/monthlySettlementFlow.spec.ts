import {
  expect,
  test,
  type Page
} from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import {
  mockSettlement,
  settlementDetailFixture,
  settlementFixture,
  settlementId,
  SETTLEMENT_PROPERTY
} from './support/monthlySettlement';

const BASE = `/manage/${SETTLEMENT_PROPERTY}/closing/monthly`;

/** 다운로드 모달에서 형식을 확정한 뒤 원래 표로 돌아옵니다. */
async function downloadExcel(page: Page) {
  await page.getByRole('button', {
    name: '다운로드',
    exact: true
  }).click();
  await expect(page.getByRole('radio', {
    name: 'Excel',
    exact: true
  })).toBeChecked();
  await page.getByRole('button', {
    name: 'Excel 다운로드',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '다운로드 미리보기 닫기',
    exact: true
  }).click();
}

for (const width of [1440, 430, 390]) {
  test(`월별 정산 ${width}px는 단일 메뉴·실제 집계·Excel·조회 월 이동을 제공`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const requested = await mockSettlement(page);
    await page.goto(`${BASE}?month=2026-10`);
    await expect(page).toHaveTitle('월별 정산 | 모아홈');
    await expect(page.getByRole('heading', {
      name: '월별 정산',
      exact: true
    })).toBeVisible();
    if (width < 768) {
      const titleBox = await page.getByRole('heading', {
        name: '월별 정산',
        exact: true
      }).boundingBox();
      const monthBox = await page.getByRole('button', {
        name: '조회 월: 2026년 10월',
        exact: true
      }).boundingBox();
      expect(Math.abs(titleBox!.x - monthBox!.x)).toBeLessThanOrEqual(1);
    }
    await expect(page.getByRole('article', {
      name: '통장 입금 47,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '통장 출금 27,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('article', {
      name: '외부 미회수액 6,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('table', {
      name: '수납과 미납',
      exact: true
    }).getByText('40,000원').first()).toBeVisible();
    const tabs = page.getByRole('tablist', {
      name: '월별 정산 상세'
    });
    await expect(tabs.getByRole('tab')).toHaveCount(4);
    await expect(page.getByRole('table')).toHaveCount(1);
    for (const name of ['통장별 잔액', '동별 자금', '외부 부담금', '수납과 미납']) {
      await tabs.getByRole('tab', {
        name,
        exact: true
      }).click();
      const table = page.getByRole('table', {
        name,
        exact: true
      });
      await expect(table).toBeVisible();
      const sizeControl = page.getByRole('combobox', {
        name: '정산 상세 표시 개수'
      });
      await expect(sizeControl).toHaveCount(1);
      const tableBox = await table.boundingBox();
      const sizeBox = await sizeControl.boundingBox();
      expect(sizeBox!.y + sizeBox!.height).toBeLessThan(tableBox!.y);
      await expect(page.getByRole('contentinfo').getByRole('combobox')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`monthly-settlement-${width}-${name}.png`),
        fullPage: true
      });
    }
    const statusBox = await page.getByRole('combobox', {
      name: '납부 상태'
    }).boundingBox();
    const resetBox = await page.getByRole('button', {
      name: '초기화',
      exact: true
    }).boundingBox();
    expect(resetBox!.height).toBe(statusBox!.height);
    await expect(page.getByRole('button', {
      name: '이전 월',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '다음 월',
      exact: true
    })).toHaveCount(0);
    const requestCount = requested.length;
    await tabs.getByRole('tab', {
      name: '통장별 잔액',
      exact: true
    }).click();
    await expect(page.getByRole('table', {
      name: '통장별 잔액',
      exact: true
    })).toBeVisible();
    await tabs.getByRole('tab', {
      name: '통장별 잔액',
      exact: true
    }).press('End');
    await expect(tabs.getByRole('tab', {
      name: '외부 부담금',
      exact: true
    })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('table', {
      name: '외부 부담금',
      exact: true
    })).toBeVisible();
    await tabs.getByRole('tab', {
      name: '외부 부담금',
      exact: true
    }).press('ArrowLeft');
    await expect(tabs.getByRole('tab', {
      name: '수납과 미납',
      exact: true
    })).toHaveAttribute('aria-selected', 'true');
    expect(requested).toHaveLength(requestCount);
    if (width < 768) await page.getByRole('button', {
      name: '관리소장님 메뉴 열기',
      exact: true
    }).click();
    await expect(page.getByRole('link', {
      name: '정산 / 마감',
      exact: true
    })).toHaveAttribute('href', BASE);
    await expect(page.getByRole('button', {
      name: '정산 / 마감',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: '회계',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('link', {
      name: '통장 대사',
      exact: true
    })).toHaveCount(0);
    await expect(page.getByRole('link', {
      name: '보고서',
      exact: true
    })).toHaveCount(0);
    if (width < 768) await page.getByRole('button', {
      name: '메뉴 닫기',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '마감 확정',
      exact: true
    })).toHaveCount(0);
    const downloadReady = page.waitForEvent('download');
    await downloadExcel(page);
    const download = await downloadReady;
    expect(download.suggestedFilename()).toBe('모아홈_월별정산_2026-10.xlsx');
    const archive = unzipSync(await readFile((await download.path())!));
    expect(strFromU8(archive['xl/workbook.xml'])).toContain('월별 정산 보고서');
    await expect(page.getByRole('link', {
      name: '월별 수납 현황',
      exact: true
    }).last()).toHaveAttribute('href', `/manage/${SETTLEMENT_PROPERTY}/banking/monthly?month=2026-10`);
    await page.screenshot({
      path: testInfo.outputPath(`monthly-settlement-${width}.png`),
      fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', {
      name: '조회 월: 2026년 10월',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '2026년 9월',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${BASE}?month=2026-09&tab=collections`);
    await expect(page.getByRole('article', {
      name: '통장 입금 0원',
      exact: true
    })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', {
      name: '조회 월: 2026년 9월',
      exact: true
    })).toBeVisible();
    expect(requested).toContain('2026-09');
    await expect(tabs.getByRole('tab', {
      name: '수납과 미납',
      exact: true
    })).toHaveAttribute('aria-selected', 'true');
  });
}

test('수납 상세의 검색·상태·동·페이지 필터와 독립적으로 전체 명세를 Excel로 출력', async ({ page }) => {
  await mockSettlement(page, {
    failure: false,
    wrongProperty: false
  }, 21);
  await page.goto(`${BASE}?month=2026-10`);
  const table = page.getByRole('table', {
    name: '수납과 미납',
    exact: true
  });
  await expect(table.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', {
    name: '다음 페이지',
    exact: true
  }).click();
  await expect(table.getByText('103동 210호', {
    exact: true
  })).toBeVisible();
  await page.getByRole('textbox', {
    name: '수납·미납 검색',
    exact: true
  }).fill('101호');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByText('102동 101호', {
    exact: true
  })).toBeVisible();
  await page.getByRole('textbox', {
    name: '수납·미납 검색',
    exact: true
  }).fill('없는 세대');
  await expect(table.getByText('조회 조건에 맞는 세대가 없습니다.', {
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '조회 동',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '102동',
    exact: true
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  const downloadReady = page.waitForEvent('download');
  await downloadExcel(page);
  const archive = unzipSync(await readFile((await (await downloadReady).path())!));
  const xml = Object.entries(archive).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(xml).toContain('모아홈 | 월별 정산 종합보고서');
  expect(xml).toContain('수납과 미납');
  expect(xml).not.toContain('102동 101호 관리비');
  expect(xml).toContain('동별 보유금 현황');
  expect(xml).not.toContain('전기요금 부담');
  expect(xml).toContain('103동 221호');
  await page.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await page.getByRole('combobox', {
    name: '납부 상태',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '일부납부',
    exact: true
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByText('102동 101호', {
    exact: true
  })).toBeVisible();
});

test('조회 실패와 다른 관리대상 응답을 빈 월·0원으로 표시하거나 다운로드하지 않고 재시도', async ({ page }) => {
  const state = {
    failure: true,
    wrongProperty: false
  };
  await mockSettlement(page, state);
  await page.goto(`${BASE}?month=2026-10`);
  await expect(page.getByRole('heading', {
    name: '서버에 연결하지 못했어요',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '다운로드',
    exact: true
  })).toBeDisabled();
  await expect(page.getByRole('article', {
    name: /통장 입금/
  })).toHaveCount(0);
  state.failure = false;
  state.wrongProperty = true;
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByText('정보를 불러오지 못했어요', {
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '다운로드',
    exact: true
  })).toBeDisabled();
  state.wrongProperty = false;
  await page.getByRole('button', {
    name: '다시 시도',
    exact: true
  }).click();
  await expect(page.getByRole('article', {
    name: '통장 입금 47,000원',
    exact: true
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: '다운로드',
    exact: true
  })).toBeEnabled();
});

test('정산 상세의 통장·동·외부 검색과 상태 필터 및 정렬이 탭별로 독립적으로 동작', async ({ page }) => {
  const requested = await mockSettlement(page, undefined, 0, settlementDetailFixture);
  await page.goto(`${BASE}?month=2026-10&tab=accounts`);
  const table = page.getByRole('table');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  const count = requested.length;
  await page.getByRole('textbox', {
    name: '통장 잔액 검색',
    exact: true
  }).fill('카카오');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('combobox', {
    name: '잔액 비교 상태',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '차액 없음',
    exact: true
  }).click();
  await expect(table.getByText('조회 조건에 맞는 내역이 없습니다.', {
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('combobox', {
    name: '잔액 비교 상태',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '비교 자료 필요',
    exact: true
  }).click();
  await expect(table.getByText('국민은행 ····2004', {
    exact: true
  })).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('tab', {
    name: '동별 자금',
    exact: true
  }).click();
  await expect(table.locator('tbody tr td:first-child')).toHaveText(['2동', '10동', '102동', '103동']);
  await page.getByRole('textbox', {
    name: '동별 자금 검색',
    exact: true
  }).fill('103');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('combobox', {
    name: '보유금 설정 상태',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '설정됨',
    exact: true
  }).click();
  await expect(table.getByText('조회 조건에 맞는 내역이 없습니다.', {
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('tab', {
    name: '외부 부담금',
    exact: true
  }).click();
  await expect(table.locator('tbody tr td:first-child')).toHaveText(['2026-10-20', '2026-10-16', '2026-10-15', '2026-10-14']);
  await expect(table.locator('tbody tr td:last-child')).toHaveText(['회수 완료', '회수 필요', '일부 회수', '정산 제외']);
  await page.getByRole('combobox', {
    name: '회수 상태',
    exact: true
  }).click();
  await page.getByRole('option', {
    name: '미회수 전체',
    exact: true
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('textbox', {
    name: '외부 부담금 검색',
    exact: true
  }).fill('수도');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByText('외부 D · 수도요금', {
    exact: true
  })).toBeVisible();
  await page.getByRole('tab', {
    name: '통장별 잔액',
    exact: true
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('combobox', {
    name: '잔액 비교 상태',
    exact: true
  })).toHaveText('비교 자료 필요');
  await page.getByRole('tab', {
    name: '외부 부담금',
    exact: true
  }).click();
  const downloadReady = page.waitForEvent('download');
  await downloadExcel(page);
  const archive = unzipSync(await readFile((await (await downloadReady).path())!));
  const xml = Object.entries(archive).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('');
  expect(xml).toContain('모아홈 | 월별 정산 종합보고서');
  expect(xml).toContain('수납과 미납');
  expect(xml).not.toContain('102동 101호 관리비');
  expect(xml).toContain('동별 보유금 현황');
  expect(xml).not.toContain('전기요금 부담');
  expect(xml).toContain('회수 완료');
  await page.getByRole('button', {
    name: '초기화',
    exact: true
  }).click();
  await expect(table.locator('tbody tr')).toHaveCount(4);
  expect(requested).toHaveLength(count);
});



for (const width of [1440, 390]) {
  test(`월별 종합보고서 ${width}px는 선택 월 외부 부담금만 집계하고 템플릿의 PDF와 PNG를 저장하며 페이지 버튼을 아래에 배치`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({
      width,
      height: 900
    });
    await mockSettlement(page, undefined, 0, () => {
      const data = settlementFixture();
      data.balances.externals.push({
        ...data.balances.externals[0],
        id: settlementId(900),
        date: '2026-09-30',
        label: '지난달 부담금',
        amount: '999999',
        received: '0',
        remaining: '999999'
      });
      return data;
    });
    await page.goto(`${BASE}?month=2026-10&tab=external`);
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByRole('article', {
      name: '외부 미회수액 6,000원',
      exact: true
    })).toBeVisible();
    await expect(page.getByRole('table').getByText('지난달 부담금')).toHaveCount(0);
    await page.getByRole('button', {
      name: '다운로드',
      exact: true
    }).click();
    const modal = page.getByRole('dialog', {
      name: '2026년 10월 월별 정산 종합보고서',
      exact: true
    });
    await expect(modal.getByRole('combobox', {
      name: '조회 동',
      exact: true
    })).toHaveCount(0);
    await expect(modal.getByRole('combobox', {
      name: '조회 계좌',
      exact: true
    })).toHaveCount(0);
    await expect(modal.getByText('지난달 부담금')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`monthly-preview-${width}.png`)
    });
    await modal.getByRole('radio', {
      name: 'PDF',
      exact: true
    }).check();
    const first = modal.getByRole('img', {
      name: 'PDF 1페이지 미리보기',
      exact: true
    });
    await expect(first).toBeVisible({
      timeout: 30000
    });
    const bounds = await first.boundingBox();
    const next = modal.getByRole('button', {
      name: 'PDF 다음 페이지',
      exact: true
    });
    const buttonBounds = await next.boundingBox();
    expect(buttonBounds!.y).toBeGreaterThanOrEqual(bounds!.y + bounds!.height);
    const ready = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: 'PDF 다운로드',
      exact: true
    }).click();
    const download = await ready;
    expect(download.suggestedFilename()).toBe('모아홈_월별정산_2026-10.pdf');
    await download.saveAs(testInfo.outputPath('monthly-template.pdf'));
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(await readFile((await download.path())!)),
      useSystemFonts: false
    });
    const document = await task.promise;
    expect(document.numPages).toBe(3);
    const text: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const content = await (await document.getPage(index)).getTextContent();
      text.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
    }
    expect(text[0]).toContain('월별 정산 종합보고서');
    expect(text[0]).toContain('동별 보유금 현황');
    expect(text[1]).toContain('통장 확인 및 입출금 명세');
    expect(text[2]).toContain('수납·미납 및 외부 부담금');
    expect(text[2]).toContain('6,000원');
    expect(text.join(' ')).not.toContain('지난달 부담금');
    expect(text.join(' ')).not.toContain('마감 미확정');
    await task.destroy();
    await next.click();
    await expect(modal.getByRole('img', {
      name: 'PDF 2페이지 미리보기',
      exact: true
    })).toBeVisible();
    await modal.getByRole('radio', {
      name: '이미지 (PNG)',
      exact: true
    }).check();
    const image = modal.getByRole('img', {
      name: '이미지 1페이지 미리보기',
      exact: true
    });
    await expect(image).toBeVisible({
      timeout: 30000
    });
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(1000);
    const imageBounds = await image.boundingBox();
    const imageButtonBounds = await modal.getByRole('button', {
      name: '이미지 다음 페이지',
      exact: true
    }).boundingBox();
    expect(imageButtonBounds!.y).toBeGreaterThanOrEqual(imageBounds!.y + imageBounds!.height);
    const zipReady = page.waitForEvent('download');
    await modal.getByRole('button', {
      name: '이미지 다운로드',
      exact: true
    }).click();
    const zip = await zipReady;
    expect(zip.suggestedFilename()).toBe('모아홈_월별정산_2026-10.zip');
    const files = unzipSync(await readFile((await zip.path())!));
    expect(Object.keys(files)).toHaveLength(3);
    for (const bytes of Object.values(files)) expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await page.screenshot({
      path: testInfo.outputPath(`monthly-image-${width}.png`)
    });
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  });
}
