import {
  expect,
  type Page
} from '@playwright/test';

/** 날짜·월 두 모드에서 같은 공통 달력을 사용해 연도와 월을 이동합니다. */
async function selectCalendarValue(page: Page, label: string, value: string, mode: 'date' | 'month') {
  await page.getByRole('button', {
    name: new RegExp(`^${label}:`)
  }).click();
  const calendar = page.getByRole('dialog', {
    name: label,
    exact: true
  });
  if (mode === 'date') await calendar.getByRole('button', {
    name: '연월 선택',
    exact: true
  }).click();
  const currentYear = Number((await calendar.getByRole('button', {
    name: '연월 선택',
    exact: true
  }).innerText()).match(/\d{4}/)![0]);
  const targetYear = Number(value.slice(0, 4));
  for (let index = 0; index < Math.abs(targetYear - currentYear); index++) {
    await calendar.getByRole('button', {
      name: targetYear > currentYear ? '다음 연도' : '이전 연도',
      exact: true
    }).click();
  }
  await calendar.getByRole('button', {
    name: `${targetYear}년 ${Number(value.slice(5, 7))}월`,
    exact: true
  }).click();
  if (mode === 'date') await calendar.getByRole('button', {
    name: `${targetYear}년 ${Number(value.slice(5, 7))}월 ${Number(value.slice(8))}일`,
    exact: true
  }).click();
}

/** 월별 수납은 월 범위로, 날짜 조회 화면은 해당 월 전체 날짜 범위로 선택합니다. */
export async function selectMonthRange(page: Page, startMonth: string, endMonth = startMonth) {
  await page.getByRole('button', {
    name: /^조회 기간:/
  }).click();
  const monthMode = await page.getByRole('button', {
    name: /^시작 월:/
  }).count() > 0;
  const end = new Date(`${endMonth}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  await selectCalendarValue(page, monthMode ? '시작 월' : '시작일', monthMode ? startMonth : `${startMonth}-01`, monthMode ? 'month' : 'date');
  await selectCalendarValue(page, monthMode ? '종료 월' : '종료일', monthMode ? endMonth : end.toISOString().slice(0, 10), monthMode ? 'month' : 'date');
  await apply(page);
}

/** 실제 입출금의 조회는 일 단위 시작·종료 경계를 지정합니다. */
export async function selectDateRange(page: Page, startDate: string, endDate: string) {
  await page.getByRole('button', {
    name: /^조회 기간:/
  }).click();
  await selectCalendarValue(page, '시작일', startDate, 'date');
  await selectCalendarValue(page, '종료일', endDate, 'date');
  await apply(page);
}

async function apply(page: Page) {
  await page.getByRole('dialog', {
    name: '조회 기간 선택',
    exact: true
  }).getByRole('button', {
    name: '조회',
    exact: true
  }).click();
  await expect(page.getByRole('dialog', {
    name: '조회 기간 선택',
    exact: true
  })).toBeHidden();
}
