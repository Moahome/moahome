import { createHash } from 'node:crypto';
import { createPaymentSample } from '../src/widgets/payment-workspace/model/paymentSample';
import {
  addPreviewManual,
  confirmCumulativePreviewPayment,
  getPreviewDuplicateCandidates,
  cancelPreviewPayment,
  holdPreviewPayment,
  resumePreviewPayment,
  linkPreviewPayment,
  importPreviewPayments,
  type PreviewLedger,
  type PreviewPayment
} from '../src/widgets/payment-workspace/model/paymentPreview';
import {
  expect,
  test
} from '@playwright/test';

const PROPERTY_ID = 'f5405dd1-42ea-4279-9302-812ffcc2d21b';
const MATCHING = `/manage/${PROPERTY_ID}/payments/matching`;

/** 테스트 서버 응답은 실제 UUID·대표 주민·청구 참조를 사용하며 운영 화면에는 예시 원장을 주입하지 않습니다. */
function id(value: string): string {
  const raw=createHash('sha256').update(value).digest('hex').slice(0,32);
  return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
}
function storedLedger(): PreviewLedger {
  const fixture=createPaymentSample();
  const names: Record<string,string> = {
    '101': '김모아',
    '202': '박두리',
    '302': '박하나',
    '501': '이대표'
  };
  return {
    ...fixture,
    accounts: fixture.accounts.map((a)=>({
      ...a,
      id:id(a.id)
    })),
    units: fixture.units.map((u)=>({
      ...u,
      id:id(u.id),
      eligible:u.status==='ACTIVE',
      representativeId:names[u.id]?id(`resident-${u.id}`):null,
      representativeName:names[u.id]??null,
      residentNames: u.id === '101' ? ['김모아', '김가족'] : names[u.id] ? [names[u.id]] : []
    })),
    charges: fixture.charges.map((c)=>({
      ...c,
      id:id(c.id),
      unitId:id(c.unitId)
    })),
    payments: fixture.payments.map((p)=>({
      ...p,
      id:id(p.id),
      accountId:id(p.accountId),
      unitId:p.unitId?id(p.unitId):'',
      bankTransactionId:p.bankTransactionId?id(p.bankTransactionId):undefined,
      allocations:p.allocations.map((a)=>({
        ...a,
        chargeId:id(a.chargeId)
      }))
    }))
  };
}

/** 여러 페이지의 실제 표시 범위와 전체 합계를 검증할 수 있도록 세대별 청구·입금 참조를 맞춥니다. */
function paginationLedger(): PreviewLedger {
  const ledger = storedLedger();
  const units = Array.from({
    length: 25
  }, (_, index) => ({
    id: id(`pagination-unit-${index}`),
    label: `${101 + index}호`,
    status: 'ACTIVE' as const
  }));
  const charges = units.map((unit) => ({
    id: id(`pagination-charge-${unit.id}`),
    unitId: unit.id,
    month: '2026-10',
    amount: '10000',
    status: 'ISSUED' as const
  }));
  const payments: PreviewPayment[] = units.map((unit, index) => ({
    id: id(`pagination-payment-${index}`),
    unitId: unit.id,
    accountId: ledger.accounts[0].id,
    date: '2026-10-15',
    payer: `검증입금${String(index + 1).padStart(2, '0')}`,
    amount: '10000',
    source: index % 2 === 0 ? 'BANK_IMPORT' : 'MANUAL',
    status: 'PENDING',
    reason: '',
    allocations: []
  }));
  payments.push({
    ...payments[0],
    id: id('pagination-confirmed'),
    source: 'MANUAL',
    status: 'CONFIRMED',
    amount: '5000',
    allocations: [{
      chargeId: charges[0].id,
      amount: '5000'
    }]
  });

  return {
    ...ledger,
    units,
    charges,
    payments
  };
}

test.beforeEach(async ({ page }) => {
  let ledger=storedLedger();
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
      id: '00000000-0000-0000-0000-000000000001',
      displayName: '관리자',
      profileImageUrl: null,
      systemRole: 'USER',
      status: 'ACTIVE'
    };
    else if (path.endsWith('/management-context')) body = {
      propertyId: PROPERTY_ID,
      name: '모아빌라',
      role: 'ADMIN'
    };
    else if (path.endsWith('/managed-properties')) body = {
      properties: [{
        propertyId: PROPERTY_ID,
        name: '모아빌라',
        role: 'ADMIN'
      }]
    };
    else if (path.startsWith(`/api/properties/${PROPERTY_ID}/payments/`)) {
      const endpoint=path.split('/payments/')[1];
      const input=route.request().headers()['content-type']?.includes('application/json') ? route.request().postDataJSON() : undefined;
      if (endpoint==='workspace') body={
        ...ledger,
        propertyId:PROPERTY_ID
      };
      else if (endpoint==='confirm-matches') {
        for (const payment of ledger.payments.filter((payment) => payment.source === 'BANK_IMPORT' && payment.status === 'PENDING' && payment.unitId && !getPreviewDuplicateCandidates(ledger, payment).length)) {
          ledger = confirmCumulativePreviewPayment(ledger, payment.id, {
            unitId: payment.unitId
          });
        }
        body = {
          ...ledger,
          propertyId: PROPERTY_ID
        };
      }
      else if (endpoint === 'delete') {
        ledger = {
          ...ledger,
          payments: ledger.payments.filter((payment) => !input.paymentIds.includes(payment.id))
        };
        body = {
          ...ledger,
          propertyId: PROPERTY_ID
        };
      }
      else if (endpoint==='manual') {
        const unit=ledger.units.find((u)=>u.id===input.unitId)!;
        ledger=addPreviewManual(ledger,{
          ...input,
          payer:unit.representativeName!,
          accountId:ledger.accounts[0].id
        });
        body={
          ...ledger,
          propertyId:PROPERTY_ID
        };
      } else if (endpoint==='import/preview'||endpoint==='import') {
        expect(route.request().headers()['content-type']).toContain('multipart/form-data');
        const imported={
          id:id('uploaded'),
          source:'BANK_IMPORT' as const,
          status:'PENDING' as const,
          accountId:ledger.accounts[0].id,
          date:'2026-10-15',
          payer:'드래그입금',
          amount:'30000',
          unitId:'',
          reason:'대표 주민 확인 필요',
          allocations:[]
        };
        const duplicate=ledger.payments.some((p)=>p.id===imported.id);
        if(endpoint==='import/preview') body={
          propertyId:PROPERTY_ID,
          rows:duplicate?[]:[imported],
          duplicateCount:duplicate?1:0
        };
        else {ledger=importPreviewPayments(ledger,[imported]);body={
          ...ledger,
          propertyId:PROPERTY_ID
        };}
      } else {
        const [paymentId,action]=endpoint.split('/');
        if (route.request().method() === 'DELETE') ledger = {
          ...ledger,
          payments: ledger.payments.filter((payment) => payment.id !== paymentId)
        };
        else if(action==='confirm') ledger=confirmCumulativePreviewPayment(ledger,paymentId,input);
        else if(action==='other-income') ledger={
          ...ledger,
          payments: ledger.payments.map((payment)=>payment.id===paymentId ? {
            ...payment,
            status:'CONFIRMED',
            receiptType:'OTHER',
            unitId:'',
            allocations:[],
            incomeCategory:input.category,
            incomeNote:input.note
          } : payment)
        };
        else if(action==='cancel') {
          const original=ledger.payments.find((payment)=>payment.id===paymentId)!;
          ledger=cancelPreviewPayment(ledger,paymentId,input.reason);
          if(original.receiptType==='OTHER') ledger={
            ...ledger,
            payments:[...ledger.payments,{
              ...original,
              id:id(`${original.id}-review`),
              status:'PENDING',
              receiptType:'HOUSEHOLD',
              incomeCategory:null,
              incomeNote:null,
              allocations:[]
            }]
          };
        }
        else if(action==='hold') ledger=holdPreviewPayment(ledger,paymentId,input.reason);
        else if(action==='resume') ledger=resumePreviewPayment(ledger,paymentId);
        else if(action==='link') ledger=linkPreviewPayment(ledger,paymentId,input.paymentId);
        else throw new Error(`Unexpected payment API: ${endpoint}`);
        body={
          ...ledger,
          propertyId:PROPERTY_ID
        };
      }
    }
    else if (route.request().method() !== 'OPTIONS') throw new Error(`Unexpected API: ${path}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'X-CSRF-TOKEN, Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify(body)
    });
  });
});

test('제목 헤더가 조회 도구 위에 있고 기존 월 선택기를 사용하며 선택 해제 X와 계좌 필터가 없음', async ({ page }) => {
  await page.goto(MATCHING);
  const heading = page.getByRole('heading', {
    name: '입금 확인·매칭',
    exact: true
  });
  const month = page.getByRole('button', {
    name: '조회 월: 2026년 10월'
  });
  await expect(heading).toBeVisible();
  const headingBox = await heading.boundingBox();
  const monthBox = await month.boundingBox();
  expect(headingBox!.y).toBeLessThan(monthBox!.y);
  await expect(page.getByRole('button', {
    name: /선택 해제/
  })).toHaveCount(0);
  await expect(page.getByRole('combobox', {
    name: '입금 계좌'
  })).toHaveCount(0);
  await month.click();
  await expect(page.getByRole('dialog', {
    name: '조회 월'
  })).toBeVisible();
  await page.getByRole('button', {
    name: '2026년 11월',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '조회 월: 2026년 11월'
  })).toBeVisible();
});

test('수납 확정 결과가 월별 수납표에 반영되고 아직 부과하지 않은 월은 빈 목록', async ({ page }) => {
  await page.setViewportSize({
    width: 1500,
    height: 1000
  });
  await page.goto(MATCHING);
  await page.getByRole('row').filter({
    hasText: '김모아'
  }).click();
  const editor = page.getByRole('region', {
    name: '입금 처리 상세'
  });
  await expect(editor).toContainText('세대 누적 수납');
  await expect(editor.getByRole('button', {
    name: '오래된 미납부터 추천'
  })).toHaveCount(0);
  await editor.getByRole('button', {
    name: '수납 확정'
  }).click();
  await page.getByRole('dialog', {
    name: '이 내용으로 반영할까요?'
  }).getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '입금 상세 닫기'
  }).click();
  await page.getByRole('complementary').getByRole('link', {
    name: '월별 수납 현황',
    exact: true
  }).click();
  const row = page.getByRole('row').filter({
    hasText: '101호'
  });
  await expect(row).toContainText('납부완료');
  await expect(row).toContainText('80,000원');
  await page.getByRole('button', {
    name: '조회 월: 2026년 10월'
  }).click();
  await page.getByRole('button', {
    name: '2026년 11월',
    exact: true
  }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText('조건에 맞는 세대가 없습니다.', {
    exact: true
  })).toBeVisible();
});

test('기존 수납 연결은 금액을 늘리지 않고 일반 모달은 뷰포트 중앙에 표시', async ({ page }) => {
  await page.setViewportSize({
    width: 1500,
    height: 1000
  });
  await page.goto(MATCHING);
  await page.getByRole('row').filter({
    hasText: '박하나'
  }).click();
  const editor = page.getByRole('region', {
    name: '입금 처리 상세'
  });
  await expect(editor.getByRole('button', {
    name: '수납 확정'
  })).toBeDisabled();
  await editor.getByRole('button', {
    name: '이 수납에 연결'
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '기존 수납에 연결할까요?'
  });
  const bounds = await dialog.boundingBox();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 750)).toBeLessThan(3);
  expect(Math.abs(bounds!.y + bounds!.height / 2 - 500)).toBeLessThan(3);
  await dialog.getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(page.getByRole('article', {
    name: '기간 내 수납 확정액 60,000원'
  })).toBeVisible();
});

test('모바일 상세의 세대 선택은 청구월과 관계없이 현재 명단을 표시하고 추천 이유는 숨김', async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto(MATCHING);
  await page.getByRole('row').filter({
    hasText: '김모아'
  }).click();
  await expect(page).toHaveURL(`${MATCHING}/${id('b1')}`);
  await expect(page.getByRole('heading', {
    name: '입금 처리 상세',
    exact: true
  })).toBeVisible();
  const detail = page.getByRole('region', {
    name: '입금 처리 상세'
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await detail.getByRole('combobox', {
    name: '반영할 세대'
  }).click();
  await expect(detail.getByRole('option')).toHaveText(['101호', '202호', '302호', '501호']);
  await expect(detail).not.toContainText('401호');
  await expect(detail.getByRole('option', {
    name: '501호',
    exact: true
  })).toBeVisible();
  await expect(detail).not.toContainText('추천·확인 근거');
  await detail.getByRole('option', {
    name: '202호',
    exact: true
  }).click();
  await expect(detail.getByRole('button', {
    name: /선택 해제/
  })).toHaveCount(0);
});


test('입금일도 공통 달력에서 날짜를 선택하고 모달은 X로 닫으며 푸터는 오른쪽 정렬', async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(MATCHING);
  await page.getByRole('button', {
    name: '＋ 수동 입금 등록'
  }).click();
  const modal = page.getByRole('dialog', {
    name: '수동 입금 등록',
    exact: true
  });
  const bounds = await modal.boundingBox();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 720)).toBeLessThan(3);
  expect(Math.abs(bounds!.y + bounds!.height / 2 - 500)).toBeLessThan(3);
  await expect(modal.locator('input[type="date"], input[type="month"]')).toHaveCount(0);
  await modal.getByRole('button', {
    name: '입금일: 2026년 10월 15일'
  }).click();
  const calendar = modal.getByRole('dialog', {
    name: '입금일'
  });
  await expect(calendar).toBeVisible();
  const calendarBox = await calendar.boundingBox();
  expect(calendarBox!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(calendarBox!.x + calendarBox!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(calendarBox!.y + calendarBox!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  await page.screenshot({
    path: testInfo.outputPath('manual-calendar.png'),
    animations: 'disabled'
  });
  await calendar.getByRole('button', {
    name: '2026년 10월 20일',
    exact: true
  }).click();
  await expect(modal.getByRole('button', {
    name: '입금일: 2026년 10월 20일'
  })).toBeFocused();
  const submit = await modal.getByRole('button', {
    name: '수납 확인하기'
  }).boundingBox();
  expect(bounds!.x + bounds!.width - (submit!.x + submit!.width)).toBeLessThan(30);
  await modal.getByRole('button', {
    name: '수동 입금 등록 닫기'
  }).click();
  await expect(modal).toHaveCount(0);
});

for (const width of [320, 390, 768, 1100, 1440]) {
  test(`${width}px 입금 목록의 카드·주요 버튼이 잘리거나 겹치지 않음`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    await page.goto(MATCHING);
    await expect(page.getByRole('heading', {
      name: '입금 확인·매칭',
      exact: true
    })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    const first = await page.getByRole('button', {
      name: '＋ 수동 입금 등록'
    }).boundingBox();
    const second = await page.getByRole('button', {
      name: '통장 내역 가져오기',
      exact: true
    }).boundingBox();
    const horizontalGap = second!.x - (first!.x + first!.width);
    const verticalGap = second!.y - (first!.y + first!.height);
    expect(horizontalGap >= 11 || verticalGap >= 11).toBe(true);
    for (const card of await page.locator('article[data-density="compact"]').all()) {
      const fits = await card.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll('p, strong, svg')].every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
        });
      });
      expect(fits).toBe(true);
    }
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`matching-${width}.png`),
      fullPage: true
    });
  });
}

test('월별 수납 상세는 PC 중앙 모달이고 모바일 독립 페이지', async ({ page }, testInfo) => {
  const monthly = `/manage/${PROPERTY_ID}/payments/monthly`;
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(monthly);
  await page.getByRole('row').filter({
    hasText: '101호'
  }).click();
  const modal = page.getByRole('dialog', {
    name: '101호 수납 상세'
  });
  await expect(modal).toContainText('2026-10-31');
  const bounds = await modal.boundingBox();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 720)).toBeLessThan(3);
  expect(Math.abs(bounds!.y + bounds!.height / 2 - 500)).toBeLessThan(3);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('monthly-modal.png')
  });
  await modal.getByRole('button', {
    name: '수납 상세 닫기'
  }).click();
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.getByRole('row').filter({
    hasText: '101호'
  }).click();
  await expect(page).toHaveURL(`${monthly}/2026-10/${id('101')}`);
  await expect(page.getByRole('heading', {
    name: '101호 수납 상세'
  })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button', {
    name: /^(목록|목록으로|주민 목록|세대 목록으로)$/
  })).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', {
    name: '월별 수납 현황으로 돌아가기'
  }).click();
  await expect(page).toHaveURL(monthly);
});

for (const width of [320, 390, 1100, 1440]) {
  test(`${width}px 열린 달력은 본문 안에 있고 검색 오른쪽 동 필터와 표시 개수·별도 상태 탭 배치`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    await page.goto(MATCHING);
    const month = page.getByRole('button', {
      name: '조회 월: 2026년 10월'
    });
    const search = page.getByRole('textbox', {
      name: '입금 검색'
    });
    await expect(page.getByRole('group', {
      name: '입금 출처'
    })).toHaveCount(0);
    const tabs = page.getByRole('group', {
      name: '입금 처리 상태'
    });
    const size = page.getByRole('combobox', {
      name: '입금 표시 개수'
    });
    await expect(size).toHaveText('10개씩 보기');
    const searchBox = await search.boundingBox();
    const tabsBox = await tabs.boundingBox();
    const sizeBox = await size.boundingBox();
    expect(tabsBox!.y + tabsBox!.height).toBeLessThan(searchBox!.y);
    if (width === 1440) {
      expect(searchBox!.width).toBeGreaterThan(500);
      const searchField = await search.locator('..').boundingBox();
      const buildingField = await page.getByRole('combobox', {
        name: '입금 세대 동 필터'
      }).locator('..').boundingBox();
      const sizeField = await size.locator('..').boundingBox();
      expect(buildingField!.x - (searchField!.x + searchField!.width)).toBeLessThan(16);
      expect(sizeField!.x - (buildingField!.x + buildingField!.width)).toBeLessThan(16);
      expect(Math.abs(searchBox!.y + searchBox!.height - sizeBox!.y - sizeBox!.height)).toBeLessThan(3);
    }
    await expect(page.getByRole('table', {
      name: '입금 거래'
    }).getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('columnheader', {
      name: '상태',
      exact: true
    })).toBeVisible();
    await month.click();
    const calendar = page.getByRole('dialog', {
      name: '조회 월'
    });
    await expect(calendar).toBeVisible();
    const bounds = await calendar.boundingBox();
    const main = await page.getByRole('main').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(main!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`calendar-${width}.png`)
    });
    await page.keyboard.press('Escape');
    await expect(month).toBeFocused();
  });
}

test('드래그한 은행 엑셀은 미리보기 후 가져오고 같은 파일을 다시 올려도 중복 수납을 만들지 않음', async ({ page }, testInfo) => {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const values = [['입금일', '입금자명', '입금액'], ['2026-10-15', '드래그입금', '30000']];
  const blob = await writeExcelFile(values.map((row) => row.map((value) => ({
    type: String,
    value
  })))).toBlob();
  const bytes = [...new Uint8Array(await blob.arrayBuffer())];
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(MATCHING);
  await page.getByRole('button', {
    name: '통장 내역 가져오기',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '통장 내역 가져오기',
    exact: true
  });
  const zone = modal.getByRole('region', {
    name: '통장 거래내역 업로드 영역'
  });
  const transfer = await page.evaluateHandle((content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(content)], '은행입금.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));
    return transfer;
  }, bytes);
  await zone.dispatchEvent('dragenter', {
    dataTransfer: transfer
  });
  await expect(zone).toHaveAttribute('data-dragging', 'true');
  await expect(zone).toContainText('여기에 놓으면 파일 검증을 시작해요.');
  await zone.dispatchEvent('drop', {
    dataTransfer: transfer
  });
  await expect(zone).toHaveAttribute('data-dragging', 'false');
  await expect(modal.getByRole('table', {
    name: '은행 거래 미리보기'
  })).toContainText('드래그입금');
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('bank-upload.png')
  });
  await modal.getByRole('button', {
    name: /^(선택한 \d+건 가져오기|입금 거래 가져오기)$/,
    exact: true
  }).click();
  await expect(page.getByRole('row').filter({
    hasText: '드래그입금'
  })).toHaveCount(1);
  await page.getByRole('button', {
    name: '통장 내역 가져오기',
    exact: true
  }).click();
  await modal.locator('input[type="file"]').setInputFiles({
    name: '은행입금.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(bytes)
  });
  await expect(modal).toContainText('가져오기 후보 0건');
  await expect(modal).toContainText('1건 중복 제외');
  await expect(modal.getByRole('button', {
    name: /^(선택한 \d+건 가져오기|입금 거래 가져오기)$/,
    exact: true
  })).toBeDisabled();
  await modal.getByRole('button', {
    name: '통장 내역 가져오기 닫기'
  }).click();
  await expect(page.getByRole('row').filter({
    hasText: '드래그입금'
  })).toHaveCount(1);
});


test('은행 XLS 원본을 변환 없이 서버 미리보기와 가져오기에 전달', async ({ page }) => {
  await page.goto(MATCHING);
  await page.getByRole('button', {
    name: '통장 내역 가져오기',
    exact: true
  }).click();
  const modal = page.getByRole('dialog', {
    name: '통장 내역 가져오기',
    exact: true
  });
  const input = modal.getByLabel('거래내역 파일', {
    exact: true
  });
  await expect(input).toHaveAttribute('accept', '.xls,.xlsx,.csv');
  await expect(modal).toContainText('은행에서 내려받은 거래내역 파일을 그대로');
  // 파싱은 서버 테스트에서 실제 XLS로 검증하고 브라우저는 원본 바이트 전달을 확인합니다.
  const bytes = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const previewRequest = page.waitForRequest((request) => request.url().endsWith('/payments/import/preview') && request.method() === 'POST');
  await input.setInputFiles({
    name: '은행거래.xls',
    mimeType: 'application/vnd.ms-excel',
    buffer: bytes
  });
  expect((await previewRequest).postDataBuffer()?.includes(bytes)).toBe(true);
  await expect(modal.getByRole('table', {
    name: '은행 거래 미리보기'
  })).toContainText('드래그입금');
  const importRequest = page.waitForRequest((request) => request.url().endsWith('/payments/import') && request.method() === 'POST');
  await modal.getByRole('button', {
    name: /^(선택한 \d+건 가져오기|입금 거래 가져오기)$/,
    exact: true
  }).click();
  expect((await importRequest).postDataBuffer()?.includes(bytes)).toBe(true);
  await expect(page.getByRole('row').filter({
    hasText: '드래그입금'
  })).toHaveCount(1);
});

test('좁고 낮은 화면에서도 입금일 달력이 모달 경계를 지키고 Escape는 달력만 닫음', async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: 390,
    height: 680
  });
  await page.goto(MATCHING);
  await page.getByRole('button', {
    name: '＋ 수동 입금 등록'
  }).click();
  const modal = page.getByRole('dialog', {
    name: '수동 입금 등록',
    exact: true
  });
  const trigger = modal.getByRole('button', {
    name: '입금일: 2026년 10월 15일'
  });
  await trigger.click();
  const calendar = modal.getByRole('dialog', {
    name: '입금일'
  });
  await expect(calendar).toBeVisible();
  const bounds = await modal.boundingBox();
  const popup = await calendar.boundingBox();
  expect(popup!.x).toBeGreaterThanOrEqual(bounds!.x);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(popup!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(popup!.y + popup!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  await page.screenshot({
    path: testInfo.outputPath('manual-calendar-mobile.png'),
    animations: 'disabled'
  });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(modal).toBeVisible();
});


test('수동 입금자는 실제 대표 이름으로 채우고 API 저장 후 새로고침에도 수납 내역이 남음', async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(MATCHING);
  await page.getByRole('button', {
    name: '＋ 수동 입금 등록'
  }).click();
  const modal=page.getByRole('dialog',{
    name:'수동 입금 등록',
    exact:true
  });
  await modal.getByRole('combobox',{
    name:'세대',
    exact:true
  }).click();
  await expect(modal.getByRole('option')).toHaveText(['101호', '202호', '302호', '501호']);
  await modal.getByRole('option',{
    name:'101호',
    exact:true
  }).click();
  await expect(modal.getByRole('textbox',{
    name:'입금자명',
    exact:true
  })).toHaveValue('김모아');
  await expect(modal.getByRole('textbox',{
    name:'입금자명',
    exact:true
  })).toHaveAttribute('readonly','');
  await modal.getByRole('textbox',{
    name:'입금액',
    exact:true
  }).fill('42000');
  await modal.getByRole('button',{
    name:'수납 확인하기'
  }).click();
  const detail=page.getByRole('dialog',{
    name:'입금 처리 상세',
    exact:true
  });
  await expect(detail).toContainText('42,000원');
  await detail.getByRole('button',{
    name:'수납 확정'
  }).click();
  await page.getByRole('dialog',{
    name:'이 내용으로 반영할까요?'
  }).getByRole('button',{
    name:'확인',
    exact:true
  }).click();
  await detail.getByRole('button',{
    name:'입금 상세 닫기'
  }).click();
  await page.reload();
  await page.getByRole('group',{
    name:'입금 처리 상태'
  }).getByRole('button',{
    name:/처리 완료/
  }).click();
  await expect(page.getByRole('row').filter({
    hasText:'김모아'
  })).toContainText('42,000원');
});

test('처리 상태 탭은 선택 글씨와 밑줄만 강조하고 호버에도 배경을 채우지 않음', async ({page})=>{
  await page.goto(MATCHING);
  const tabs=page.getByRole('group',{
    name:'입금 처리 상태'
  });
  const selected=tabs.getByRole('button',{
    name:/확인 필요/
  });
  await selected.hover();
  await expect(selected).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(selected).toHaveCSS('color','rgb(37, 99, 235)');
  await expect(selected).toHaveCSS('border-bottom-width','2px');
  await expect(selected).toHaveCSS('border-bottom-color','rgb(37, 99, 235)');
  const hold=tabs.getByRole('button',{
    name:/보류/
  });
  await hold.click();
  await expect(hold).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(hold).toHaveCSS('border-bottom-color','rgb(37, 99, 235)');
});


test('입금 API 조회 장애를 예시 데이터로 대체하지 않고 재시도로 실제 원장을 조회', async ({page})=>{
  let fail=true;
  await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`,async (route)=>{
    if(route.request().method()!=='GET'||!fail) {await route.fallback();return;}
    fail=false;
    await route.fulfill({
      status:503,
      contentType:'application/json',
      headers:{
        'Access-Control-Allow-Origin':'http://localhost:3100',
        'Access-Control-Allow-Credentials':'true'
      },
      body:JSON.stringify({
        code:'PAYMENT_SERVICE_UNAVAILABLE'
      })
    });
  });
  await page.goto(MATCHING);
  await expect(page.getByRole('alert',{
    name:'서버에 연결하지 못했어요'
  })).toBeVisible();
  await expect(page.getByRole('table',{
    name:'입금 거래'
  })).toHaveCount(0);
  await expect(page.getByText('김모아',{
    exact:true
  })).toHaveCount(0);
  await page.getByRole('button',{
    name:'다시 시도'
  }).click();
  await expect(page.getByRole('table',{
    name:'입금 거래'
  })).toBeVisible();
});

test('수동 저장 실패는 입력을 보존하고 같은 요청 ID로 다시 저장', async ({page})=>{
  const requests:string[]=[];
  await page.route(`**/api/properties/${PROPERTY_ID}/payments/manual`,async (route)=>{
    if(route.request().method()!=='POST') {await route.fallback();return;}
    requests.push(route.request().postDataJSON().id);
    if(requests.length>1) {await route.fallback();return;}
    await route.fulfill({
      status:503,
      contentType:'application/json',
      headers:{
        'Access-Control-Allow-Origin':'http://localhost:3100',
        'Access-Control-Allow-Credentials':'true'
      },
      body:JSON.stringify({
        code:'PAYMENT_SERVICE_UNAVAILABLE'
      })
    });
  });
  await page.goto(MATCHING);
  await page.getByRole('button',{
    name:'＋ 수동 입금 등록'
  }).click();
  const modal=page.getByRole('dialog',{
    name:'수동 입금 등록',
    exact:true
  });
  await modal.getByRole('combobox',{
    name:'세대',
    exact:true
  }).click();
  await expect(modal.getByRole('option')).toHaveText(['101호', '202호', '302호', '501호']);
  await modal.getByRole('option',{
    name:'101호',
    exact:true
  }).click();
  await modal.getByRole('textbox',{
    name:'입금액',
    exact:true
  }).fill('42000');
  await modal.getByRole('button',{
    name:'수납 확인하기'
  }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByRole('textbox',{
    name:'입금액',
    exact:true
  })).toHaveValue('42,000');
  await modal.getByRole('button',{
    name:'수납 확인하기'
  }).click();
  await expect(page.getByRole('dialog',{
    name:'입금 처리 상세',
    exact:true
  })).toBeVisible();
  expect(requests).toHaveLength(2);expect(requests[1]).toBe(requests[0]);
});


test('월별 수납 현황은 실제 부과 세대의 대표 이름과 실제 입금자를 별도로 표시', async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(`/manage/${PROPERTY_ID}/payments/monthly`);
  const table = page.getByRole('table', {
    name: '세대별 월별 수납 현황'
  });
  await expect(table.getByRole('row')).toHaveCount(4);
  for (const label of ['101호', '202호', '302호']) await expect(table.getByRole('rowheader', {
    name: label,
    exact: true
  })).toBeVisible();
  await expect(table).not.toContainText('401호');
  await expect(table).not.toContainText('501호');
  await expect(table).toContainText('김모아');
  await expect(table).toContainText('박두리');
  await expect(page.getByText('부과 제외', {
    exact: true
  })).toHaveCount(0);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('billed-units-monthly.png'),
    fullPage: true
  });
  await page.goto(MATCHING);
  await expect(page.getByRole('columnheader', {
    name: '추천 이유'
  })).toHaveCount(0);
});

for (const view of ['matching', 'monthly'] as const) {
  for (const width of [320, 1440]) {
    test(`${width}px ${view} 목록의 페이지 이동·표시 개수·필터 초기화·빈 결과와 전체 합계`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 1000
      });
      await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin': 'http://localhost:3100',
            'Access-Control-Allow-Credentials': 'true'
          },
          body: JSON.stringify({
            ...paginationLedger(),
            propertyId: PROPERTY_ID
          })
        });
      });
      await page.goto(`/manage/${PROPERTY_ID}/payments/${view}`);
      const matching = view === 'matching';
      const table = page.getByRole('table', {
        name: matching ? '입금 거래' : '세대별 월별 수납 현황'
      });
      const pagination = page.getByRole('navigation', {
        name: matching ? '입금 목록 페이지' : '월별 수납 현황 페이지'
      });
      const size = page.getByRole('combobox', {
        name: matching ? '입금 표시 개수' : '수납 현황 표시 개수'
      });
      const search = page.getByRole('textbox', {
        name: matching ? '입금 검색' : '수납 현황 세대 검색'
      });
      const summary = page.getByRole('article', {
        name: matching ? '기간 내 수납 확정액 5,000원' : '당월 관리비 발생액 250,000원'
      });
      await expect(table.getByRole('row')).toHaveCount(11);
      await expect(summary).toBeVisible();
      await expect(page.getByRole('group', {
        name: matching ? '입금 처리 상태' : '수납 상태'
      })).toBeVisible();
      if (!matching) {
        const tabs = await page.getByRole('group', {
          name: '수납 상태'
        }).boundingBox();
        const searchBox = await search.boundingBox();
        expect(tabs!.y + tabs!.height).toBeLessThan(searchBox!.y);
        const download = page.getByRole('button', {
          name: '엑셀 다운로드',
          exact: true
        });
        await expect(download).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(download).toHaveCSS('color', 'rgb(22, 101, 52)');
        await expect(download.locator('svg')).toHaveCount(1);
        if (width < 768) {
          const downloadBox = await download.boundingBox();
          const mainBox = await page.getByRole('main').boundingBox();
          expect(downloadBox!.width).toBeGreaterThan(mainBox!.width - 48);
        }
      }
      await expect(page.getByRole('checkbox', {
        name: '미수 있는 세대만'
      })).toHaveCount(0);
      await pagination.getByRole('button', {
        name: '다음 페이지'
      }).click();
      await expect(pagination.getByRole('button', {
        name: '2페이지',
        exact: true
      })).toHaveAttribute('aria-current', 'page');
      await expect(table.getByRole('rowheader').first()).toContainText(matching ? '검증입금11' : '111호');
      await pagination.getByRole('button', {
        name: '3페이지',
        exact: true
      }).click();
      await expect(table.getByRole('row')).toHaveCount(6);
      await expect(pagination.getByRole('button', {
        name: '다음 페이지'
      })).toBeDisabled();
      await expect(summary).toBeVisible();

      await size.click();
      await page.getByRole('option', {
        name: '20개씩 보기',
        exact: true
      }).click();
      await expect(table.getByRole('row')).toHaveCount(21);
      await expect(pagination.getByRole('button', {
        name: '1페이지',
        exact: true
      })).toHaveAttribute('aria-current', 'page');
      await pagination.getByRole('button', {
        name: '2페이지',
        exact: true
      }).click();
      await expect(table.getByRole('row')).toHaveCount(6);
      await size.click();
      await page.getByRole('option', {
        name: '50개씩 보기',
        exact: true
      }).click();
      await expect(table.getByRole('row')).toHaveCount(26);
      await expect(pagination.getByRole('button', {
        name: '다음 페이지'
      })).toBeDisabled();
      await size.click();
      await page.getByRole('option', {
        name: '10개씩 보기',
        exact: true
      }).click();
      await pagination.getByRole('button', {
        name: '3페이지',
        exact: true
      }).click();
      await search.fill(matching ? '검증입금25' : '125호');
      await expect(table.getByRole('row')).toHaveCount(2);
      await expect(pagination.getByRole('button', {
        name: '1페이지',
        exact: true
      })).toHaveAttribute('aria-current', 'page');
      await search.fill('없는 검색 결과');
      await expect(table).toContainText(matching ? '조건에 맞는 입금 거래가 없습니다.' : '조건에 맞는 세대가 없습니다.');
      await expect(pagination.getByRole('button', {
        name: '이전 페이지'
      })).toBeDisabled();
      await expect(pagination.getByRole('button', {
        name: '다음 페이지'
      })).toBeDisabled();
      await search.clear();
      await pagination.getByRole('button', {
        name: '3페이지',
        exact: true
      }).click();
      if (matching) {
        await expect(page.getByRole('group', {
          name: '입금 출처'
        })).toHaveCount(0);
        await page.getByRole('group', {
          name: '입금 처리 상태'
        }).getByRole('button', {
          name: /처리 완료/
        }).click();
        await expect(table.getByRole('row')).toHaveCount(2);
      } else {
        await page.getByRole('button', {
          name: /^일부납부 \(\d+\)$/
        }).click();
        await expect(table.getByRole('row')).toHaveCount(2);
        await expect(pagination.getByRole('button', {
          name: '1페이지',
          exact: true
        })).toHaveAttribute('aria-current', 'page');
        await page.getByRole('button', {
          name: /^전체 \(\d+\)$/
        }).click();
      }
      await expect(summary).toBeVisible();
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${view}-pagination-${width}.png`),
        fullPage: true
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.getByRole('button', {
        name: '조회 월: 2026년 10월'
      }).click();
      await page.getByRole('button', {
        name: '2026년 11월',
        exact: true
      }).click();
      await expect(table).toContainText(matching ? '조건에 맞는 입금 거래가 없습니다.' : '조건에 맞는 세대가 없습니다.');
      await expect(pagination.getByRole('button', {
        name: '다음 페이지'
      })).toBeDisabled();
    });
  }
}

test('수납 상세의 최근 입금일은 날짜·빈 값 모두 금액과 같은 오른쪽 끝에 표시', async ({ page }, testInfo) => {
  const ledger = storedLedger();
  ledger.payments = ledger.payments.filter((payment) => payment.unitId !== id('202'));
  await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    });
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(`/manage/${PROPERTY_ID}/payments/monthly`);
  for (const [unit, date] of [['101호', '2026-09-20'], ['202호', '—']]) {
    await page.getByRole('row').filter({
      hasText: unit
    }).click();
    const modal = page.getByRole('dialog', {
      name: `${unit} 수납 상세`
    });
    const latest = modal.locator('dl > div').filter({
      hasText: '최근 입금일'
    }).locator('dd');
    const amount = modal.locator('dl > div').filter({
      hasText: '선입금 잔액'
    }).locator('dd');
    await expect(latest).toHaveText(date);
    const latestBox = await latest.boundingBox();
    const amountBox = await amount.boundingBox();
    expect(Math.abs(latestBox!.x + latestBox!.width - amountBox!.x - amountBox!.width)).toBeLessThan(2);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`latest-payment-${unit}.png`)
    });
    await modal.getByRole('button', {
      name: '수납 상세 닫기'
    }).click();
  }
});

for (const width of [390, 767]) {
  for (const view of ['matching', 'monthly'] as const) {
    test(`${width}px ${view} 모바일 상세는 직접 접근·새로고침·대상 없음에도 헤더 뒤로가기만 제공`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width,
        height: 900
      });
      const monthly = view === 'monthly';
      const list = `/manage/${PROPERTY_ID}/payments/${view}`;
      const detail = monthly ? `${list}/2026-10/${id('101')}` : `${list}/${id('b1')}`;
      const back = page.getByRole('banner').getByRole('link', {
        name: monthly ? '월별 수납 현황으로 돌아가기' : '입금 확인·매칭으로 돌아가기'
      });
      await page.goto(detail);
      await expect(back).toBeVisible();
      await page.reload();
      await expect(back).toBeVisible();
      await expect(page.getByRole('main').getByRole('heading', {
        name: monthly ? '101호 수납 상세' : '입금 처리 상세',
        exact: true
      })).toBeVisible();
      await expect(page.getByRole('main').getByRole('button', {
        name: /^(목록|목록으로|주민 목록|세대 목록으로)$/
      })).toHaveCount(0);
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${view}-mobile-detail-${width}.png`)
      });
      await back.click();
      await expect(page).toHaveURL(list);
      if (monthly) {
        const download = await page.getByRole('button', {
          name: '엑셀 다운로드',
          exact: true
        }).boundingBox();
        const main = await page.getByRole('main').boundingBox();
        expect(download!.width).toBeGreaterThan(main!.width - 48);
      }
      await page.goto(monthly ? `${list}/2026-10/${id('missing')}` : `${list}/${id('missing')}`);
      await expect(back).toBeVisible();
      await expect(page.getByRole('main').getByRole('button', {
        name: /^(목록|목록으로|주민 목록|세대 목록으로)$/
      })).toHaveCount(0);
      await back.click();
      await expect(page).toHaveURL(list);
    });
  }
}

for (const width of [1440, 390, 320]) {
  test(`${width}px 수납 상세는 미납·일부납부·납부완료·정산 상태별 금액과 색상을 구분`, async ({ page }, testInfo) => {
    const ledger = storedLedger();
    ledger.payments.push({
      id: id('detail-partial'),
      source: 'MANUAL',
      status: 'CONFIRMED',
      accountId: ledger.accounts[0].id,
      date: '2026-10-15',
      payer: '김모아',
      amount: '10000',
      unitId: id('101'),
      reason: '',
      allocations: [{
        chargeId: id('c10110'),
        amount: '10000'
      }]
    });
    const zeroCharge = ledger.charges.find((charge) => charge.id === id('c50110'))!;
    zeroCharge.status = 'ISSUED';
    zeroCharge.amount = '0';
    ledger.units.push({
      id: id('601'),
      label: '601호',
      status: 'ACTIVE'
    });
    ledger.charges.push({
      id: id('c60110'),
      unitId: id('601'),
      month: '2026-10',
      status: 'ISSUED',
      amount: '-5000'
    });
    await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({
          ...ledger,
          propertyId: PROPERTY_ID
        })
      });
    });
    await page.setViewportSize({
      width,
      height: 900
    });
    const list = `/manage/${PROPERTY_ID}/payments/monthly`;
    await page.goto(list);
    const cases = [
      {
        unit: '202호',
        status: '미납',
        label: '남은 미납금액',
        amount: '100,000원',
        color: 'rgb(239, 68, 68)'
      },
      {
        unit: '101호',
        status: '일부납부',
        label: '남은 미납금액',
        amount: '70,000원',
        color: null
      },
      {
        unit: '302호',
        status: '납부완료',
        label: '당월 수납 반영액',
        amount: '60,000원',
        color: 'rgb(22, 101, 52)'
      },
      {
        unit: '501호',
        status: '정산 확인 필요',
        label: '당월 부과금액',
        amount: '0원',
        color: 'rgb(100, 116, 139)'
      },
      {
        unit: '601호',
        status: '정산 확인 필요',
        label: '당월 부과금액',
        amount: '-5,000원',
        color: 'rgb(100, 116, 139)'
      }
    ];
    for (const item of cases) {
      await page.getByRole('row').filter({
        hasText: item.unit
      }).click();
      const detail = width >= 768 ? page.getByRole('dialog', {
        name: `${item.unit} 수납 상세`
      }) : page.getByRole('main');
      const summary = detail.getByRole('region', {
        name: '수납 요약'
      });
      await expect(summary.getByText(item.status, {
        exact: true
      })).toBeVisible();
      await expect(summary.getByText(item.label, {
        exact: true
      })).toBeVisible();
      await expect(summary.locator('strong')).toHaveText(item.amount);
      if (item.color) await expect(summary.locator('strong')).toHaveCSS('color', item.color);
      await expect(detail.getByRole('region', {
        name: '미납금액 계산 내역'
      })).toBeVisible();
      const info = detail.getByRole('region', {
        name: '수납 정보'
      });
      await expect(info).toBeVisible();
      await expect(detail.getByRole('button', {
        name: /목록|^닫기$/
      })).toHaveCount(0);
      if (item.unit === '601호') {
        await expect(info).toContainText('확정 수납 없음');
        await expect(detail.getByRole('region', {
          name: '미납금액 계산 내역'
        })).toContainText('-5,000원');
      }
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`monthly-detail-${item.unit}-${width}.png`),
        fullPage: width < 768
      });
      if (width >= 768) {
        await detail.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        const close = detail.getByRole('button', {
          name: '수납 상세 닫기'
        });
        const bounds = await detail.boundingBox();
        const closeBounds = await close.boundingBox();
        expect(closeBounds!.y).toBeGreaterThanOrEqual(bounds!.y);
        expect(closeBounds!.y + closeBounds!.height).toBeLessThan(bounds!.y + 120);
        await close.click();
      } else {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.getByRole('banner').getByRole('link', {
          name: '월별 수납 현황으로 돌아가기'
        }).click();
        await expect(page).toHaveURL(list);
      }
    }
  });
}


test('같은 달 두 입금은 세대만 지정해 모두 확정하고 완납 이후 금액은 선입금으로 표시', async ({ page }, testInfo) => {
  let ledger = storedLedger();
  const unit = {
    ...ledger.units[0],
    label: '102동 401호'
  };
  const base = ledger.payments[0];
  ledger = {
    ...ledger,
    units: [unit],
    charges: [{
      ...ledger.charges[0],
      month: '2026-10',
      amount: '50000',
      unitId: unit.id
    }],
    payments: [
      {
        ...base,
        id: id('cumulative-first'),
        payer: '102동401호',
        unitId: unit.id,
        date: '2026-10-06',
        amount: '50000',
        allocations: []
      },
      {
        ...base,
        id: id('cumulative-second'),
        payer: '별도입금자',
        unitId: '',
        date: '2026-10-13',
        amount: '50000',
        allocations: []
      }
    ]
  };
  await page.route(`http://localhost:8080/api/properties/${PROPERTY_ID}/payments/**`, async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/payments/')[1];
    if (endpoint !== 'workspace') {
      const [paymentId, action] = endpoint.split('/');
      expect(action).toBe('confirm');
      const input = route.request().postDataJSON();
      expect(input.unitId).toBe(unit.id);
      expect(input).not.toHaveProperty('allocations');
      ledger = confirmCumulativePreviewPayment(ledger, paymentId, input);
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    });
  });
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(MATCHING);
  const editor = page.getByRole('region', {
    name: '입금 처리 상세'
  });
  for (const payer of ['102동401호', '별도입금자']) {
    await page.getByRole('row').filter({
      hasText: payer
    }).click();
    const select = editor.getByRole('combobox', {
      name: '반영할 세대'
    });
    if (payer === '102동401호') await expect(select).toHaveValue('102동 401호');
    else {
      await select.click();
      await editor.getByRole('option', {
        name: '102동 401호',
        exact: true
      }).click();
      await expect(editor.getByRole('region', {
        name: '누적 수납 미리보기'
      })).toContainText(/선입금 잔액\s*50,000원/);
      await page.screenshot({
        path: testInfo.outputPath('cumulative-prepayment-desktop.png'),
        fullPage: true
      });
    }
    await expect(editor.getByText('몇 월 관리비로 반영할까요?')).toHaveCount(0);
    await editor.getByRole('button', {
      name: '수납 확정',
      exact: true
    }).click();
    await page.getByRole('dialog', {
      name: '이 내용으로 반영할까요?'
    }).getByRole('button', {
      name: '확인',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: '입금 상세 닫기'
    }).click();
    await page.getByRole('group', {
      name: '입금 처리 상태'
    }).getByRole('button', {
      name: /확인 필요/
    }).click();
  }
  expect(ledger.payments.every((payment) => payment.status === 'CONFIRMED')).toBe(true);
  await page.goto(`/manage/${PROPERTY_ID}/payments/monthly`);
  const row = page.getByRole('row').filter({
    hasText: '102동 401호'
  });
  await expect(row).toContainText('납부완료');
  await row.click();
  await expect(page.getByRole('dialog')).toContainText(/선입금 잔액\s*50,000원/);
});


test('이미 가져온 명단 일치 입금은 개별 모달 없이 한 번에 누적 확정', async ({ page }) => {
  await page.goto(MATCHING);
  await page.getByRole('button', {
    name: '일치 입금 자동 확정'
  }).click();
  await expect(page.getByRole('row').filter({
    hasText: '김모아'
  })).toContainText('확정');
  await expect(page.getByRole('row').filter({
    hasText: '202호관리비'
  })).toContainText('확정');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`${width}px 목록 편집에서 한 건씩 선택하고 선택 삭제 후 새로고침에도 제거`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    await page.goto(MATCHING);
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await page.getByRole('row').filter({
      hasText: '김모아'
    }).getByRole('checkbox').check();
    const other = page.getByRole('row').filter({
      hasText: '202호관리비'
    }).getByRole('checkbox');
    await other.scrollIntoViewIfNeeded();
    await expect(other).not.toBeChecked();
    await page.getByRole('button', {
      name: '선택 삭제',
      exact: true
    }).click();
    const dialog = page.getByRole('dialog', {
      name: '선택한 입금을 삭제할까요?'
    });
    await dialog.getByRole('button', {
      name: '취소',
      exact: true
    }).click();
    await expect(page.getByRole('row').filter({
      hasText: '김모아'
    }).getByRole('checkbox')).toBeChecked();
    await page.getByRole('button', {
      name: '선택 삭제',
      exact: true
    }).click();
    await page.screenshot({
      path: testInfo.outputPath(`selected-payment-delete-${width}.png`),
      animations: 'disabled',
      fullPage: true
    });
    await dialog.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(page.getByRole('row').filter({
      hasText: '김모아'
    })).toHaveCount(0);
    await expect(page.getByRole('row').filter({
      hasText: '202호관리비'
    })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('row').filter({
      hasText: '김모아'
    })).toHaveCount(0);
  });
}

test('선택 삭제 실패는 오류 토스트로 표시하고 선택·확인창을 유지하며 재시도 시 표시 시간을 초기화', async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(MATCHING);await page.clock.install();
  await page.getByRole('button', {
    name: '편집',
    exact: true
  }).click();
  await page.getByRole('row').filter({
    hasText: '김모아'
  }).getByRole('checkbox').check();
  await page.getByRole('button', {
    name: '선택 삭제',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '선택한 입금을 삭제할까요?'
  });
  await page.route(`http://localhost:8080/api/properties/${PROPERTY_ID}/payments/delete`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      paymentIds: [id('b1')]
    });
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        code: 'PAYMENT_SERVICE_UNAVAILABLE',
        message: '저장 실패'
      })
    });
  });
  await dialog.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  const toast = dialog.locator('[data-tone="error"]');
  await expect(toast.getByRole('alert')).toBeVisible();
  expect(await toast.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  await expect(dialog.locator(':scope > p[role="alert"]')).toHaveCount(0);
  await page.clock.runFor(3500);
  await dialog.getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await page.clock.runFor(1000);await expect(toast).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('payment-delete-error-toast.png'),
    animations: 'disabled',
    fullPage: true
  });
  await page.clock.runFor(4000);await expect(toast).toHaveCount(0);await expect(dialog).toBeVisible();
});

test('입금월 청구가 없는 과거 거래도 현재 명단의 세대를 직접 선택해 누적 확정', async ({ page }) => {
  const ledger = storedLedger();
  const payment = {
    ...ledger.payments[0],
    date: '2026-08-20',
    payer: '103-302(8)',
    unitId: ''
  };
  await page.route(`http://localhost:8080/api/properties/${PROPERTY_ID}/payments/workspace`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true'
    },
    body: JSON.stringify({
      ...ledger,
      payments: [payment],
      propertyId: PROPERTY_ID
    })
  }));
  await page.goto(`${MATCHING}/${payment.id}`);
  const editor = page.getByRole('region', {
    name: '입금 처리 상세'
  });
  await editor.getByRole('combobox', {
    name: '반영할 세대'
  }).click();
  await expect(editor.getByRole('option')).toHaveText(['101호', '202호', '302호', '501호']);
  await editor.getByRole('option', {
    name: '101호',
    exact: true
  }).click();
  await expect(editor.getByRole('button', {
    name: '수납 확정',
    exact: true
  })).toBeEnabled();
});

test('확정한 입금에는 삭제 대신 납부 취소를 제공하고 취소 후 미납 합계를 복구', async ({ page }) => {
  await page.goto(MATCHING);
  await page.getByRole('row').filter({
    hasText: '김모아'
  }).click();
  const editor = page.getByRole('region', {
    name: '입금 처리 상세'
  });
  await editor.getByRole('button', {
    name: '수납 확정',
    exact: true
  }).click();
  await page.getByRole('dialog', {
    name: '이 내용으로 반영할까요?'
  }).getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  await expect(editor.getByRole('button', {
    name: '삭제',
    exact: true
  })).toHaveCount(0);
  await editor.getByRole('button', {
    name: '납부 취소',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: '납부를 취소할까요?'
  });
  await dialog.getByLabel('취소 사유').fill('잘못된 납부 연결');
  await dialog.getByRole('button', {
    name: '납부 취소',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: '입금 상세 닫기'
  }).click();
  await page.goto(`/manage/${PROPERTY_ID}/payments/monthly`);
  await expect(page.getByRole('row').filter({
    hasText: '101호'
  })).toContainText('80,000원');
});


test('편집 선택은 필터 변경 때 초기화하고 여러 입금은 한 요청으로 삭제', async ({ page }) => {
  await page.goto(MATCHING);
  await page.getByRole('button', {
    name: '편집',
    exact: true
  }).click();
  await page.getByRole('row').filter({
    hasText: '김모아'
  }).getByRole('checkbox').check();
  await page.getByRole('textbox', {
    name: '입금 검색'
  }).fill('202호');
  await expect(page.getByRole('button', {
    name: '편집',
    exact: true
  })).toBeVisible();
  await page.getByRole('textbox', {
    name: '입금 검색'
  }).fill('');
  await page.getByRole('button', {
    name: '편집',
    exact: true
  }).click();
  for (const name of ['김모아', '202호관리비']) await page.getByRole('row').filter({
    hasText: name
  }).getByRole('checkbox').check();
  await page.getByRole('button', {
    name: '선택 삭제',
    exact: true
  }).click();
  await page.getByRole('dialog', {
    name: '선택한 입금을 삭제할까요?'
  }).getByRole('button', {
    name: '삭제',
    exact: true
  }).click();
  await expect(page.getByRole('row').filter({
    hasText: '김모아'
  })).toHaveCount(0);
  await expect(page.getByRole('row').filter({
    hasText: '202호관리비'
  })).toHaveCount(0);
  await expect(page.getByRole('row').filter({
    hasText: '이홈'
  })).toBeVisible();
});

test('모두 자동 확정한 과거월 파일은 가져온 월의 처리 완료 목록으로 이동', async ({ page }) => {
  const ledger = storedLedger();
  const payment = {
    ...ledger.payments[0],
    id: id('august-uploaded'),
    date: '2026-08-20',
    payer: '101호',
    amount: '50000'
  };
  let saved = ledger;
  await page.route(`http://localhost:8080/api/properties/${PROPERTY_ID}/payments/**`, async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/payments/')[1];
    let body: unknown;
    if (endpoint === 'workspace') body = {
      ...saved,
      propertyId: PROPERTY_ID
    };
    else if (endpoint === 'import/preview') body = {
      propertyId: PROPERTY_ID,
      rows: [payment],
      duplicateCount: 0
    };
    else if (endpoint === 'import') { saved = {
      ...saved,
      payments: [{
        ...payment,
        status: 'CONFIRMED'
      }, ...saved.payments]
    };body = {
      ...saved,
      propertyId: PROPERTY_ID
    }; }
    else throw new Error(`Unexpected API: ${endpoint}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify(body)
    });
  });
  await page.goto(MATCHING);await page.getByRole('button', {
    name: '통장 내역 가져오기',
    exact: true
  }).click();
  await page.getByLabel('거래내역 파일', {
    exact: true
  }).setInputFiles({
    name: 'august.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('입금일,입금자명,입금액\n2026-08-20,101호,50000')
  });
  await page.getByRole('button', {
    name: /^(선택한 \d+건 가져오기|입금 거래 가져오기)$/,
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: '조회 월: 2026년 8월'
  })).toBeVisible();
  await expect(page.getByRole('row').filter({
    hasText: '101호'
  })).toContainText('확정');
});


for (const width of [1440, 390]) {
  test(`${width}px 반영할 세대는 대표·가족 이름과 동호수로 검색하고 결과가 없으면 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const ledger = storedLedger();ledger.units[0].label = '102동 401호';
    await page.route(`http://localhost:8080/api/properties/${PROPERTY_ID}/payments/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    }));
    await page.goto(MATCHING);await page.getByRole('row').filter({
      hasText: '김모아'
    }).click();
    const editor = page.getByRole('region', {
      name: '입금 처리 상세'
    });
    const search = editor.getByRole('combobox', {
      name: '반영할 세대'
    });
    for (const query of ['김모아', '김가족', '102동401호', '102 401', '102-401']) {
      await search.fill(query);
      await expect(editor.getByRole('option')).toHaveText(['102동 401호']);
    }
    await search.fill('없는이름');await expect(editor.getByRole('option')).toHaveCount(0);
    await search.fill('김가족');await editor.getByRole('option', {
      name: '102동 401호',
      exact: true
    }).click();
    await expect(search).toHaveValue('102동 401호');
    await expect(editor.getByRole('button', {
      name: '수납 확정',
      exact: true
    })).toBeEnabled();
  });
}


for (const width of [1440, 390]) {
  test(`${width}px 입금 동 필터는 검색 오른쪽에 있고 세대 후보는 기본 동호수 순서로 표시`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const ledger = storedLedger();
    const labels: Record<string,string> = {
      '101': '103동 101호',
      '202': '102동 402호',
      '302': '102동 201호'
    };
    ledger.units = ledger.units.map((unit) => ({
      ...unit,
      label: Object.entries(labels).find(([key]) => unit.id === id(key))?.[1] ?? unit.label
    }));
    await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    }));
    await page.goto(MATCHING);
    const table = page.getByRole('table', {
      name: '입금 거래'
    });
    await expect(table.getByRole('rowheader').locator('strong')).toHaveText(['박하나', '202호관리비', '김모아', '이홈']);
    await expect(table.getByRole('columnheader', {
      name: '세대 후보'
    }).getByRole('button')).toHaveCount(0);
    const search = page.getByRole('textbox', {
      name: '입금 검색'
    });
    const filter = page.getByRole('combobox', {
      name: '입금 세대 동 필터'
    });
    const searchBox = await search.boundingBox(), filterBox = await filter.boundingBox();
    if (width > 767) expect(filterBox!.x).toBeGreaterThan(searchBox!.x + searchBox!.width);
    else expect(filterBox!.y).toBeGreaterThan(searchBox!.y);
    await filter.click();
    await expect(page.getByRole('option')).toHaveText(['전체 동', '102동', '103동']);
    await page.getByRole('option', {
      name: '102동',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader').locator('strong')).toHaveText(['박하나', '202호관리비']);
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await table.getByRole('row').filter({
      hasText: '박하나'
    }).getByRole('checkbox').check();
    await filter.click();await page.getByRole('option', {
      name: '103동',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader').locator('strong')).toHaveText(['김모아']);
    await expect(page.getByRole('button', {
      name: '편집',
      exact: true
    })).toBeVisible();
    await filter.click();await page.getByRole('option', {
      name: '전체 동',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader')).toHaveCount(4);
  });

  test(`${width}px 월별 수납 상세는 현재 대표와 통장의 동호수 입금자명을 구분`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const ledger = storedLedger();
    ledger.payments = ledger.payments.map((payment) => payment.id === id('p1') ? {
      ...payment,
      payer: '102동401호'
    } : payment);
    await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    }));
    await page.goto(`/manage/${PROPERTY_ID}/payments/monthly`);
    const row = page.getByRole('table', {
      name: '세대별 월별 수납 현황'
    }).getByRole('row').filter({
      hasText: '101호'
    });
    await expect(row).toContainText('김모아');await expect(row).toContainText('102동401호');await row.click();
    const detail = width > 767 ? page.getByRole('dialog', {
      name: '101호 수납 상세'
    }) : page.getByRole('main');
    await expect(detail.getByText('세대 대표', {
      exact: true
    })).toBeVisible();
    await expect(detail.getByText('김모아', {
      exact: true
    })).toBeVisible();
    await expect(detail.getByText('102동401호', {
      exact: true
    })).toBeVisible();
    await expect(detail.getByRole('region', {
      name: '누적 입금 내역'
    })).toContainText('2026-09-20 · 102동401호');
  });
}

for (const width of [1440, 390]) {
  test(`${width}px 월별 수납은 검색 오른쪽 동 필터와 상태별 세대 수를 함께 적용`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const ledger = storedLedger();
    ledger.units = ledger.units.map((unit) => ({
      ...unit,
      buildingName: unit.id === id('302') ? '103동' : '102동',
      label: `${unit.id === id('302') ? '103동' : '102동'} ${unit.label}`
    }));
    await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    }));
    await page.goto(`/manage/${PROPERTY_ID}/payments/monthly`);
    const tabs = page.getByRole('group', {
      name: '수납 상태'
    });
    const filter = page.getByRole('combobox', {
      name: '수납 현황 동 필터'
    });
    const search = page.getByRole('textbox', {
      name: '수납 현황 세대 검색'
    });
    const table = page.getByRole('table', {
      name: '세대별 월별 수납 현황'
    });
    await expect(tabs.getByRole('button')).toHaveText(['전체 (3)', '미납 (2)', '일부납부 (0)', '납부완료 (1)']);
    const searchBox = await search.boundingBox(), filterBox = await filter.boundingBox();
    if (width > 767) expect(filterBox!.x).toBeGreaterThan(searchBox!.x + searchBox!.width);
    else expect(filterBox!.y).toBeGreaterThan(searchBox!.y);
    await filter.click();await expect(page.getByRole('option')).toHaveText(['전체 동', '102동', '103동']);
    await page.getByRole('option', {
      name: '102동',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader')).toHaveText(['102동 101호', '102동 202호']);
    const unitCell = table.getByRole('rowheader').first();
    const unitBounds = await unitCell.boundingBox();
    expect(unitBounds!.width).toBeGreaterThanOrEqual(130);
    await expect(unitCell.locator('span')).toHaveCSS('white-space', 'nowrap');
    await expect(tabs.getByRole('button')).toHaveText(['전체 (2)', '미납 (2)', '일부납부 (0)', '납부완료 (0)']);
    await search.fill('김모아');await expect(table.getByRole('rowheader')).toHaveText(['102동 101호']);
    await expect(tabs.getByRole('button')).toHaveText(['전체 (1)', '미납 (1)', '일부납부 (0)', '납부완료 (0)']);
    await search.fill('없는 이름');await expect(tabs.getByRole('button')).toHaveText(['전체 (0)', '미납 (0)', '일부납부 (0)', '납부완료 (0)']);
    await search.clear();await tabs.getByRole('button', {
      name: '미납 (2)',
      exact: true
    }).click();
    await filter.click();await page.getByRole('option', {
      name: '103동',
      exact: true
    }).click();
    await expect(table).toContainText('조건에 맞는 세대가 없습니다.');
    await expect(tabs.getByRole('button')).toHaveText(['전체 (1)', '미납 (0)', '일부납부 (0)', '납부완료 (1)']);
    await tabs.getByRole('button', {
      name: '납부완료 (1)',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader')).toHaveText(['103동 302호']);
    await filter.click();await page.getByRole('option', {
      name: '전체 동',
      exact: true
    }).click();
    await expect(tabs.getByRole('button')).toHaveText(['전체 (3)', '미납 (2)', '일부납부 (0)', '납부완료 (1)']);
    await tabs.getByRole('button', {
      name: '전체 (3)',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`monthly-building-counts-${width}.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

for (const width of [1440, 390, 320]) {
  test(`${width}px 기타 입금은 항목·메모로 확정하고 별도 합계·검색·취소 이력을 제공`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    await page.goto(MATCHING);
    const initialTotal = await page.getByRole('article', {
      name: /기간 내 수납 확정액/
    }).getAttribute('aria-label');
    await page.getByRole('row').filter({
      hasText: '이홈'
    }).click();
    const editor = page.getByRole('region', {
      name: '입금 처리 상세'
    });
    await editor.getByRole('combobox', {
      name: '입금 분류'
    }).click();
    await editor.getByRole('option', {
      name: '기타 입금',
      exact: true
    }).click();
    await expect(editor.getByRole('combobox', {
      name: '반영할 세대'
    })).toHaveCount(0);
    await expect(editor.getByRole('region', {
      name: '누적 수납 미리보기'
    })).toHaveCount(0);
    await expect(editor.getByRole('button', {
      name: '기타 입금 확정',
      exact: true
    })).toBeDisabled();
    await editor.getByRole('textbox', {
      name: '입금 항목'
    }).fill('전기료');
    await editor.getByRole('textbox', {
      name: '메모',
      exact: true
    }).fill('외부 사용분');
    await editor.getByRole('button', {
      name: '기타 입금 확정',
      exact: true
    }).click();
    await page.getByRole('dialog', {
      name: '기타 입금으로 확정할까요?'
    }).getByRole('button', {
      name: '확인',
      exact: true
    }).click();
    await expect(editor).toContainText('외부 사용분');
    await expect(editor.getByRole('button', {
      name: '납부 취소',
      exact: true
    })).toHaveCount(0);
    if (width >= 768) await page.getByRole('button', {
      name: '입금 상세 닫기'
    }).click();
    else {
      await expect(editor.getByRole('button', {
        name: /목록/
      })).toHaveCount(0);
      await page.getByRole('banner').getByRole('link', {
        name: '입금 확인·매칭으로 돌아가기'
      }).click();
    }
    await page.getByRole('button', {
      name: '기타 입금 (1)',
      exact: true
    }).click();
    await expect(page.getByRole('article', {
      name: '기간 내 기타 입금 확정액 70,000원'
    })).toBeVisible();
    await expect(page.getByRole('table', {
      name: '입금 거래'
    }).getByRole('rowheader')).toHaveText(['이홈엑셀']);
    await expect(page.getByRole('table', {
      name: '입금 거래'
    })).toContainText('전기료');
    await page.getByRole('textbox', {
      name: '입금 검색'
    }).fill('외부 사용분');
    await expect(page.getByRole('table', {
      name: '입금 거래'
    })).toContainText('이홈');
    await page.screenshot({
      path: testInfo.outputPath(`otherIncome${width}.png`),
      fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('row').filter({
      hasText: '이홈'
    }).click();
    await editor.getByRole('button', {
      name: '확정 취소',
      exact: true
    }).click();
    const cancel = page.getByRole('dialog', {
      name: '기타 입금 확정을 취소할까요?'
    });
    await cancel.getByRole('textbox', {
      name: '취소 사유'
    }).fill('분류 정정');
    await cancel.getByRole('button', {
      name: '확정 취소',
      exact: true
    }).click();
    await expect(editor).toContainText('분류 정정');
    if (width >= 768) await page.getByRole('button', {
      name: '입금 상세 닫기'
    }).click();
    else await page.getByRole('banner').getByRole('link', {
      name: '입금 확인·매칭으로 돌아가기'
    }).click();
    await page.getByRole('textbox', {
      name: '입금 검색'
    }).fill('');
    await page.getByRole('button', {
      name: '기타 입금 (0)',
      exact: true
    }).click();
    await expect(page.getByRole('article', {
      name: '기간 내 기타 입금 확정액 0원'
    })).toBeVisible();
    await page.getByRole('button', {
      name: /^확인 필요/
    }).click();
    await expect(page.getByRole('row').filter({
      hasText: '이홈'
    })).toHaveCount(1);
    await expect(page.getByRole('article', {
      name: /기간 내 수납 확정액/
    })).toHaveAttribute('aria-label', initialTotal!);
  });
}

for (const width of [1440, 390, 320]) {
  test(`${width}px 은행 미리보기는 10건씩 표시하고 페이지별 제외·전체 해제·실패 재시도 선택을 유지`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    let saved = storedLedger();
    let attempts = 0;
    const rows: PreviewPayment[] = Array.from({
      length: 25
    }, (_, index) => ({
      ...saved.payments[0],
      id: id(`import-selection-${index}`),
      payer: `선택입금${String(index + 1).padStart(2, '0')}`,
      unitId: '',
      status: 'PENDING',
      allocations: []
    }));
    const fulfill = (route: import('@playwright/test').Route, body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify(body)
    });
    await page.route(`http://localhost:8080/api/properties/${PROPERTY_ID}/payments/**`, async (route) => {
      const path = new URL(route.request().url()).pathname.split('/payments/')[1];
      if (path === 'workspace') return fulfill(route, {
        ...saved,
        propertyId: PROPERTY_ID
      });
      if (path === 'import/preview') return fulfill(route, {
        propertyId: PROPERTY_ID,
        rows: rows.filter((row) => !saved.payments.some((payment) => payment.id === row.id)),
        duplicateCount: saved.payments.filter((payment) => rows.some((row) => row.id === payment.id)).length
      });
      if (path === 'import') {
        const selection = route.request().postDataBuffer()?.toString().match(/\{"transactionIds":\[[^\]]*\]\}/);
        expect(selection).not.toBeNull();
        const ids: string[] = JSON.parse(selection![0]).transactionIds;
        expect(ids).toEqual(rows.filter((_, index) => index !== 0 && !(index >= 10 && index <= 20)).map((row) => row.id));
        if (++attempts === 1) return fulfill(route, {
          code: 'PAYMENT_SERVICE_UNAVAILABLE'
        }, 503);
        saved = {
          ...saved,
          payments: [...saved.payments, ...rows.filter((row) => ids.includes(row.id))]
        };
        return fulfill(route, {
          ...saved,
          propertyId: PROPERTY_ID
        });
      }
      throw new Error(`Unexpected endpoint: ${path}`);
    });
    await page.goto(MATCHING);
    await page.getByRole('button', {
      name: '통장 내역 가져오기',
      exact: true
    }).click();
    const modal = page.getByRole('dialog', {
      name: '통장 내역 가져오기',
      exact: true
    });
    await modal.getByLabel('거래내역 파일', {
      exact: true
    }).setInputFiles({
      name: 'many.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('입금일,입금자명,입금액')
    });
    const table = modal.getByRole('table', {
      name: '은행 거래 미리보기'
    });
    const pages = modal.getByRole('navigation', {
      name: '은행 미리보기 페이지'
    });
    await expect(table.getByRole('rowheader')).toHaveCount(10);
    await modal.getByRole('button', {
      name: '전체 해제',
      exact: true
    }).click();
    await expect(modal.getByRole('button', {
      name: '입금 거래 가져오기',
      exact: true
    })).toBeDisabled();
    await modal.getByRole('button', {
      name: '전체 선택',
      exact: true
    }).click();
    await table.getByRole('checkbox', {
      name: /선택입금01/
    }).uncheck();
    await pages.getByRole('button', {
      name: '2페이지',
      exact: true
    }).click();
    await table.getByRole('checkbox', {
      name: '미리보기 현재 페이지 전체 선택'
    }).uncheck();
    await pages.getByRole('button', {
      name: '3페이지',
      exact: true
    }).click();
    await expect(table.getByRole('rowheader')).toHaveCount(5);
    await table.getByRole('checkbox', {
      name: /선택입금21/
    }).uncheck();
    await pages.getByRole('button', {
      name: '1페이지',
      exact: true
    }).click();
    await expect(table.getByRole('checkbox', {
      name: /선택입금01/
    })).not.toBeChecked();
    await expect(modal).toContainText('선택 13건 · 제외 12건');
    await modal.getByRole('button', {
      name: '선택한 13건 가져오기',
      exact: true
    }).click();
    await expect(page.getByRole('alert').filter({
      hasText: '입금 정보를 처리하지 못했어요.'
    })).toBeVisible();
    await expect(table.getByRole('checkbox', {
      name: /선택입금01/
    })).not.toBeChecked();
    await expect(modal.getByRole('button', {
      name: '선택한 13건 가져오기',
      exact: true
    })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath(`bankSelection${width}.png`),
      fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await modal.getByRole('button', {
      name: '선택한 13건 가져오기',
      exact: true
    }).click();
    await expect(modal).toHaveCount(0);
    expect(saved.payments.filter((payment) => rows.some((row) => row.id === payment.id))).toHaveLength(13);
    await page.getByRole('button', {
      name: '통장 내역 가져오기',
      exact: true
    }).click();
    await modal.getByLabel('거래내역 파일', {
      exact: true
    }).setInputFiles({
      name: 'many.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('입금일,입금자명,입금액')
    });
    await expect(modal).toContainText('가져오기 후보 12건 · 13건 중복 제외');
    await expect(modal.getByRole('button', {
      name: '선택한 12건 가져오기',
      exact: true
    })).toBeEnabled();
  });
}

test('기타 입금 확정은 선택 메모를 비워도 서버에 빈 문자열을 보내지 않음', async ({ page }) => {
  await page.goto(MATCHING);
  await page.getByRole('row').filter({
    hasText: '이홈'
  }).click();
  const editor = page.getByRole('region', {
    name: '입금 처리 상세'
  });
  await editor.getByRole('combobox', {
    name: '입금 분류'
  }).click();
  await editor.getByRole('option', {
    name: '기타 입금',
    exact: true
  }).click();
  await editor.getByRole('textbox', {
    name: '입금 항목'
  }).fill('전기료');
  await editor.getByRole('button', {
    name: '기타 입금 확정',
    exact: true
  }).click();
  const request = page.waitForRequest((request) => request.url().endsWith('/other-income') && request.method() === 'POST');
  await page.getByRole('dialog', {
    name: '기타 입금으로 확정할까요?'
  }).getByRole('button', {
    name: '확인',
    exact: true
  }).click();
  expect((await request).postDataJSON()).toEqual({
    category: '전기료'
  });
  await expect(editor.getByRole('button', {
    name: '확정 취소',
    exact: true
  })).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`${width}px 월별 실제 입금 합계는 세대·기타·전체를 구분하고 세대 필터와 독립`, async ({ page }, testInfo) => {
    await page.setViewportSize({
      width,
      height: 1000
    });
    const ledger = storedLedger();
    const base = ledger.payments[0];
    ledger.payments = [
      {
        ...base,
        id: id('monthly-household-partial'),
        status: 'CONFIRMED',
        date: '2026-10-15',
        amount: '10000',
        allocations: []
      },
      {
        ...base,
        id: id('monthly-household-prepaid'),
        status: 'CONFIRMED',
        date: '2026-10-14',
        amount: '80000',
        unitId: ledger.units[1].id,
        allocations: []
      },
      {
        ...base,
        id: id('monthly-other-electricity'),
        status: 'CONFIRMED',
        receiptType: 'OTHER',
        unitId: '',
        incomeCategory: '전기료',
        date: '2026-10-13',
        amount: '93960',
        allocations: []
      },
      {
        ...base,
        id: id('monthly-other-interest'),
        status: 'CONFIRMED',
        receiptType: 'OTHER',
        unitId: '',
        incomeCategory: '예금이자',
        date: '2026-10-12',
        amount: '218',
        allocations: []
      },
      {
        ...base,
        id: id('monthly-other-canceled'),
        status: 'CANCELED',
        receiptType: 'OTHER',
        unitId: '',
        incomeCategory: '기타',
        amount: '999999',
        allocations: []
      },
      {
        ...base,
        id: id('monthly-pending'),
        status: 'PENDING',
        amount: '999999',
        allocations: []
      },
      {
        ...base,
        id: id('monthly-other-previous'),
        status: 'CONFIRMED',
        receiptType: 'OTHER',
        unitId: '',
        incomeCategory: '이자',
        date: '2026-09-15',
        amount: '500',
        allocations: []
      }
    ];
    await page.route(`http://localhost:8080/api/properties/${PROPERTY_ID}/payments/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    }));
    await page.goto(`/manage/${PROPERTY_ID}/payments/monthly`);
    const summary = page.getByRole('region', {
      name: '월별 실제 입금 합계'
    });
    await expect(summary.getByRole('article', {
      name: '당월 세대 입금액 90,000원'
    })).toBeVisible();
    await expect(summary.getByRole('article', {
      name: '당월 기타 입금액 94,178원'
    })).toBeVisible();
    await expect(summary.getByRole('article', {
      name: '당월 전체 입금액 184,178원'
    })).toBeVisible();
    await expect(summary).toContainText('기타 입금 2건');
    if (width < 768) {
      const cards = summary.getByRole('article');
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      const last = await cards.nth(2).boundingBox();
      const region = await summary.boundingBox();
      expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(1);
      expect(last!.y).toBeGreaterThan(first!.y);
      expect(Math.abs(last!.width - region!.width)).toBeLessThanOrEqual(1);
    }
    await page.getByRole('textbox', {
      name: '수납 현황 세대 검색'
    }).fill('없는세대');
    await expect(summary.getByRole('article', {
      name: '당월 전체 입금액 184,178원'
    })).toBeVisible();
    await page.getByRole('button', {
      name: /^납부완료/
    }).click();
    await expect(summary.getByRole('article', {
      name: '당월 전체 입금액 184,178원'
    })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`monthlyIncome${width}.png`),
      fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', {
      name: '조회 월: 2026년 10월'
    }).click();
    await page.getByRole('button', {
      name: '2026년 9월',
      exact: true
    }).click();
    await expect(summary.getByRole('article', {
      name: '당월 세대 입금액 0원'
    })).toBeVisible();
    await expect(summary.getByRole('article', {
      name: '당월 기타 입금액 500원'
    })).toBeVisible();
    await expect(summary.getByRole('article', {
      name: '당월 전체 입금액 500원'
    })).toBeVisible();
  });
}


test('통장 입금과 월별 수납은 PC에서 목록을 유지한 모달로 열고 모바일은 상세 주소로 이동', async ({ page }, testInfo) => {
  const ledger = storedLedger();
  const payment = ledger.payments.find((item) => item.payer === '김모아')!;
  const transactions = `/manage/${PROPERTY_ID}/banking/transactions`;
  const monthly = `/manage/${PROPERTY_ID}/banking/monthly`;
  await page.route(`**/api/properties/${PROPERTY_ID}/banking/workspace`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      propertyId: PROPERTY_ID,
      asOf: ledger.asOf,
      buildings: [],
      units: ledger.units.map((unit) => ({
        id: unit.id,
        label: unit.label
      })),
      rules: [],
      rows: [{
        id: id('banking-receipt-original'),
        accountId: payment.accountId,
        date: payment.date,
        time: '09:00:00',
        payer: payment.payer,
        memo: null,
        amount: payment.amount,
        balance: '1000000',
        direction: 'INCOME',
        ruleKey: id('banking-receipt-rule'),
        paymentId: payment.id,
        status: payment.status,
        unitId: payment.unitId,
        unitLabel: '101호',
        expense: null
      }]
    })
  }));
  await page.setViewportSize({
    width: 1440,
    height: 1000
  });
  await page.goto(transactions);
  await page.getByRole('table', {
    name: '통장 거래',
    exact: true
  }).getByRole('row').filter({
    hasText: '김모아'
  }).click();
  await expect(page.getByRole('dialog', {
    name: '입금 처리 상세',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL(transactions);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('bankingReceiptDesktop.png')
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto(monthly);
  await page.getByRole('row').filter({
    hasText: '101호'
  }).click();
  await expect(page.getByRole('dialog', {
    name: '101호 수납 상세',
    exact: true
  })).toBeVisible();
  await expect(page).toHaveURL(monthly);
  await page.getByRole('button', {
    name: '수납 상세 닫기',
    exact: true
  }).click();
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.getByRole('row').filter({
    hasText: '101호'
  }).click();
  await expect(page).toHaveURL(`${monthly}/2026-10/${id('101')}`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('link', {
    name: '월별 수납 현황으로 돌아가기',
    exact: true
  })).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`통장 수동 입금 복구 ${width}px는 등록·확정·새로고침과 수동 출처를 유지`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    const transactions = `/manage/${PROPERTY_ID}/banking/transactions`;
    await page.route(`**/api/properties/${PROPERTY_ID}/banking/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3100',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        propertyId: PROPERTY_ID,
        asOf: '2026-10-15',
        buildings: [],
        units: [],
        rows: [],
        rules: []
      })
    }));
    const requests: { id: string; unitId: string; date: string; amount: string }[] = [];
    await page.route(`**/api/properties/${PROPERTY_ID}/payments/manual`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      requests.push(route.request().postDataJSON());
      if (width === 1440 && requests.length === 1) return route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3100',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({
          code: 'SERVICE_UNAVAILABLE'
        })
      });
      await route.fallback();
    });
    await page.goto(`${transactions}?month=2026-09`);
    await page.getByRole('button', {
      name: '수동 입금 등록',
      exact: true
    }).click();
    if (width < 768) {
      await expect(page).toHaveURL(`/manage/${PROPERTY_ID}/banking/manual`);
      await page.reload();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('link', {
        name: '통장 거래로 돌아가기',
        exact: true
      })).toBeVisible();
      await expect(page.getByRole('button', {
        name: /^(취소|닫기|목록|목록으로)$/
      })).toHaveCount(0);
    }
    const form = width < 768 ? page.getByRole('region', {
      name: '수동 입금 등록',
      exact: true
    }) : page.getByRole('dialog', {
      name: '수동 입금 등록',
      exact: true
    });
    await form.getByRole('combobox', {
      name: '세대',
      exact: true
    }).click();
    await page.getByRole('option', {
      name: '101호',
      exact: true
    }).click();
    await expect(form.getByRole('textbox', {
      name: '입금자명',
      exact: true
    })).toHaveValue('김모아');
    await form.getByRole('textbox', {
      name: '입금액',
      exact: true
    }).fill('42001');
    await form.getByRole('button', {
      name: '수납 확인하기',
      exact: true
    }).click();
    if (width === 1440) {
      await expect(form.getByRole('button', {
        name: '수납 확인하기',
        exact: true
      })).toBeEnabled();
      await expect(form.getByRole('textbox', {
        name: '입금액',
        exact: true
      })).toHaveValue('42,001');
      await form.getByRole('button', {
        name: '수납 확인하기',
        exact: true
      }).click();
      expect(requests[1]).toEqual(requests[0]);
    }
    await expect(page.getByRole('heading', {
      name: '입금 처리 상세',
      exact: true
    })).toBeVisible();
    if (width < 768) await page.getByRole('link', {
      name: '통장 거래로 돌아가기',
      exact: true
    }).click();
    else await page.getByRole('button', {
      name: '입금 상세 닫기',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${transactions}?month=2026-10`);
    await page.reload();
    const table = page.getByRole('table', {
      name: '통장 거래',
      exact: true
    });
    const manual = table.getByRole('row').filter({
      hasText: '42,001원'
    });
    await expect(manual).toHaveCount(1);
    await expect(manual).toContainText('수동 입금');
    await manual.click();
    await page.getByRole('button', {
      name: '수납 확정',
      exact: true
    }).click();
    await page.getByRole('dialog', {
      name: '이 내용으로 반영할까요?',
      exact: true
    }).getByRole('button', {
      name: '확인',
      exact: true
    }).click();
    await expect(page.getByRole('button', {
      name: '납부 취소',
      exact: true
    })).toBeVisible();
    if (width < 768) await page.getByRole('link', {
      name: '통장 거래로 돌아가기',
      exact: true
    }).click();
    else await page.getByRole('button', {
      name: '입금 상세 닫기',
      exact: true
    }).click();
    await expect(page).toHaveURL(`${transactions}?month=2026-10`);
    await page.reload();
    await expect(manual).toContainText('처리 완료');
    await expect(manual).toContainText('수동 입금');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`bankingManual${width}.png`),
      fullPage: true
    });
  });
}

for (const width of [1440, 390]) {
  test(`통장 취소 내역 ${width}px는 취소 상태와 수동 초안·확정·취소 삭제를 지원`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: 900
    });
    let ledger = {
      ...storedLedger(),
      payments: [] as PreviewPayment[],
      history: [] as PreviewLedger['history']
    };
    const input = (key: string, amount: string) => ({
      id: id(key),
      accountId: ledger.accounts[0].id,
      unitId: id('101'),
      date: '2026-10-15',
      payer: '김모아',
      amount
    });
    ledger = addPreviewManual(ledger, input('cancel-delete', '5001'));
    ledger = confirmCumulativePreviewPayment(ledger, id('cancel-delete'), {
      unitId: id('101')
    });
    ledger = cancelPreviewPayment(ledger, id('cancel-delete'), '오입력 정정');
    ledger = addPreviewManual(ledger, input('pending-delete', '5002'));
    ledger = addPreviewManual(ledger, input('confirmed-delete', '5003'));
    ledger = confirmCumulativePreviewPayment(ledger, id('confirmed-delete'), {
      unitId: id('101')
    });
    const selections: unknown[] = [];
    let fail = true;
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:3100',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    const banking = () => ({
      propertyId: PROPERTY_ID,
      asOf: '2026-10-15',
      buildings: [],
      units: [],
      rows: [],
      rules: []
    });
    await page.route(`**/api/properties/${PROPERTY_ID}/payments/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        ...ledger,
        propertyId: PROPERTY_ID
      })
    }));
    await page.route(`**/api/properties/${PROPERTY_ID}/banking/workspace`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(banking())
    }));
    await page.route(`**/api/properties/${PROPERTY_ID}/banking/transactions/delete`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({
        status: 200,
        headers,
        body: '{}'
      });
      const selected = route.request().postDataJSON(); selections.push(selected);
      if (fail) { fail = false; return route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          code: 'SERVICE_UNAVAILABLE'
        })
      }); }
      ledger = {
        ...ledger,
        payments: ledger.payments.filter((payment) => !selected.paymentIds.includes(payment.id))
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(banking())
      });
    });
    await page.goto(`/manage/${PROPERTY_ID}/banking/transactions`);
    const manualButton = page.getByRole('button', {
      name: '수동 입금 등록',
      exact: true
    });
    const excelButton = page.getByRole('button', {
      name: '엑셀 업로드',
      exact: true
    });
    const first = (await manualButton.boundingBox())!;
    const second = (await excelButton.boundingBox())!;
    expect(width > 767 ? second.x - first.x - first.width : second.y - first.y - first.height).toBeGreaterThanOrEqual(11);
    const table = page.getByRole('table', {
      name: '통장 거래',
      exact: true
    });
    await expect(table).not.toContainText('5,001원');
    await expect(table).toContainText('5,002원');
    const tabs = page.getByRole('group', {
      name: '입출금 필터',
      exact: true
    });
    await tabs.getByRole('button', {
      name: /^취소 내역/
    }).click();
    const canceled = table.getByRole('row').filter({
      hasText: '5,001원'
    });
    await expect(canceled).toContainText('취소된 수납');
    await expect(canceled).not.toContainText('확인 필요');
    await canceled.click();
    await expect(page.getByText(/취소 사유:.*오입력 정정/)).toBeVisible();
    if (width < 768) await page.getByRole('link', {
      name: '통장 거래로 돌아가기',
      exact: true
    }).click();
    else await page.getByRole('button', {
      name: '입금 상세 닫기',
      exact: true
    }).click();
    if (width < 768) await tabs.getByRole('button', {
      name: /^취소 내역/
    }).click();
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await page.getByRole('checkbox', {
      name: '김모아 거래 선택',
      exact: true
    }).check();
    await page.getByRole('button', {
      name: '선택 삭제',
      exact: true
    }).click();
    const confirmation = page.getByRole('dialog', {
      name: '거래를 삭제할까요?',
      exact: true
    });
    await expect(confirmation.getByRole('list', {
      name: '삭제할 거래'
    })).toContainText('김모아 · 입금 5,001원');
    await page.screenshot({
      path: test.info().outputPath(`bankingDelete${width}.png`),
      fullPage: true
    });
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(confirmation.getByRole('alert')).toBeVisible();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(confirmation).toHaveCount(0);
    expect(selections).toEqual([{
      transactionIds: [],
      paymentIds: [id('cancel-delete')]
    }, {
      transactionIds: [],
      paymentIds: [id('cancel-delete')]
    }]);
    await expect(table).not.toContainText('5,001원');
    await tabs.getByRole('button', {
      name: /^전체/
    }).click();
    await expect(table).toContainText('5,002원');
    const confirmed = table.getByRole('row').filter({
      hasText: '5,003원'
    });
    await expect(confirmed).toContainText('처리 완료');
    await page.getByRole('button', {
      name: '편집',
      exact: true
    }).click();
    await expect(confirmed.getByRole('checkbox')).toBeEnabled();
    await page.getByRole('checkbox', {
      name: '현재 페이지 거래 전체 선택',
      exact: true
    }).check();
    await page.getByRole('button', {
      name: '선택 삭제',
      exact: true
    }).click();
    await confirmation.getByRole('button', {
      name: '삭제',
      exact: true
    }).click();
    await expect(confirmation).toHaveCount(0);
    await page.reload();
    await expect(table).not.toContainText('5,001원');
    await expect(table).not.toContainText('5,002원');
    await expect(table).not.toContainText('5,003원');
    expect((selections.at(-1) as { paymentIds: string[] }).paymentIds).toEqual(expect.arrayContaining([id('pending-delete'), id('confirmed-delete')]));
  });
}
