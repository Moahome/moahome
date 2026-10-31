import {
  defineConfig,
  devices
} from '@playwright/test';

const isApiOnly = process.argv.includes('--project=api');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', {
    open: 'never'
  }]],
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: ['architecture.spec.ts', 'customApi.spec.ts', 'sessionRestore.spec.ts', 'authenticatedApi.spec.ts', 'feeItems.spec.ts', 'formatter.spec.ts', 'equalSplit.spec.ts', 'calculator.spec.ts', 'residentExport.spec.ts', 'billingModel.spec.ts', 'paymentPreview.spec.ts', 'bankingAllocation.spec.ts', 'monthlySettlement.spec.ts', 'balanceReport.spec.ts']
    },
    {
      name: 'chromium',
      testMatch: ['authFlow.spec.ts', 'propertyRegistration.spec.ts', 'managementLayout.spec.ts', 'billingFlow.spec.ts', 'paymentFlow.spec.ts', 'onboardingFlow.spec.ts', 'bankingFlow.spec.ts', 'serverConnectionError.spec.ts', 'stateMessages.spec.ts', 'monthlySettlementFlow.spec.ts', 'balanceReportFlow.spec.ts', 'sharePreview.spec.ts', 'pwaFlow.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL,
      },
    },
  ],
  webServer: isApiOnly ? undefined : {
    // 개발 서버의 재컴파일·manifest 읽기 경합 대신 실제 배포 번들로 화면 동작을 검증합니다.
    command: 'npm run build && npm run start -- --port 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: '.next-test',
      NEXT_PUBLIC_HOST: 'http://localhost:3100',
      NEXT_PUBLIC_API_HOST: 'http://localhost:8080',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
