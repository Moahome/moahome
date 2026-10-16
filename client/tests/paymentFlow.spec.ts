import { createHash } from 'node:crypto';
import { createPaymentSample } from '../src/widgets/payment-workspace/model/paymentSample';
import {
  addPreviewManual,
  confirmPreviewPayment,
  cancelPreviewPayment,
  holdPreviewPayment,
  resumePreviewPayment,
  linkPreviewPayment,
  importPreviewPayments,
  type PreviewLedger
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
      representativeName:names[u.id]??null
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
        if(action==='confirm') ledger=confirmPreviewPayment(ledger,paymentId,input);
        else if(action==='cancel') ledger=cancelPreviewPayment(ledger,paymentId,input.reason);
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
  await editor.getByRole('button', {
    name: '오래된 미납부터 추천'
  }).click();
  await expect(editor.getByLabel('2026-09 반영액')).toHaveValue('30,000');
  await expect(editor.getByLabel('2026-10 반영액')).toHaveValue('50,000');
  await expect(editor).toContainText('납부기한 2026-09-30');
  await expect(editor).toContainText('납부기한 2026-10-31');
  await editor.getByRole('button', {
    name: '배분 확정'
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
    name: '배분 확정'
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

test('모바일 상세의 세대 선택은 입금월 실제 부과 대상만 표시하고 추천 이유는 숨김', async ({ page }) => {
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
  await expect(detail.getByRole('option')).toHaveText(['101호', '202호', '302호']);
  await expect(detail).not.toContainText('401호');
  await expect(detail).not.toContainText('501호');
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
    name: '청구월 반영하기'
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
  await page.getByRole('button', {
    name: '목록',
    exact: true
  }).click();
  await expect(page).toHaveURL(monthly);
});

for (const width of [390, 1100, 1440]) {
  test(`${width}px 열린 달력은 본문 안에 있고 검색·출처는 남는 공간을 사용`, async ({ page }, testInfo) => {
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
    const sources = page.getByRole('group', {
      name: '입금 출처'
    });
    const searchBox = await search.boundingBox();
    const sourceBox = await sources.boundingBox();
    if (width === 1440) {
      expect(searchBox!.width).toBeGreaterThan(500);
      expect(sourceBox!.x - (searchBox!.x + searchBox!.width)).toBeLessThan(32);
      expect(Math.abs(searchBox!.y + searchBox!.height - sourceBox!.y - sourceBox!.height)).toBeLessThan(3);
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
    name: '입금 거래 가져오기',
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
    name: '입금 거래 가져오기',
    exact: true
  })).toBeDisabled();
  await modal.getByRole('button', {
    name: '통장 내역 가져오기 닫기'
  }).click();
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
  await expect(modal.getByRole('option')).toHaveText(['101호', '202호', '302호']);
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
    name:'청구월 반영하기'
  }).click();
  const detail=page.getByRole('dialog',{
    name:'입금 처리 상세',
    exact:true
  });
  await expect(detail).toContainText('42,000원');
  await detail.getByRole('button',{
    name:'오래된 미납부터 추천'
  }).click();
  await detail.getByRole('button',{
    name:'배분 확정'
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
  await expect(page.getByRole('region',{
    name:'입금 조회 오류'
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
  await expect(modal.getByRole('option')).toHaveText(['101호', '202호', '302호']);
  await modal.getByRole('option',{
    name:'101호',
    exact:true
  }).click();
  await modal.getByRole('textbox',{
    name:'입금액',
    exact:true
  }).fill('42000');
  await modal.getByRole('button',{
    name:'청구월 반영하기'
  }).click();
  await expect(modal.getByRole('alert')).toBeVisible();
  await expect(modal.getByRole('textbox',{
    name:'입금액',
    exact:true
  })).toHaveValue('42,000');
  await modal.getByRole('button',{
    name:'청구월 반영하기'
  }).click();
  await expect(page.getByRole('dialog',{
    name:'입금 처리 상세',
    exact:true
  })).toBeVisible();
  expect(requests).toHaveLength(2);expect(requests[1]).toBe(requests[0]);
});


test('월별 수납 현황은 선택월 실제 부과 세대만 표시하고 세대에 주민 이름을 붙이지 않음', async ({ page }, testInfo) => {
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
  await expect(table).not.toContainText('김모아');
  await expect(table).not.toContainText('박두리');
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
