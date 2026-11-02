import {
  expect,
  type Page
} from '@playwright/test';

/** PC 모달과 모바일 독립 페이지에서 같은 보고서의 사용자 표시 영역을 찾습니다. */
export function reportPreview(page: Page) {
  return page.getByRole('dialog').or(page.getByRole('region', {
    name: /^\d{4}년 .*(?:월별 수납 현황|동별 입출금 내역|월별 정산 종합보고서)$/
  }));
}

/** PC 닫기와 모바일 공통 헤더 복귀를 실제 입력으로 확인합니다. */
export async function closeReportPreview(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) >= 768) {
    await expect(page.getByRole('button', {
      name: '다운로드 미리보기 닫기',
      exact: true
    })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    return;
  }
  await page.getByRole('link', {
    name: '뒤로가기',
    exact: true
  }).click();
}
