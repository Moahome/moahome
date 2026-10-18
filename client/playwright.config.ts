import {
  defineConfig,
  devices
} from '@playwright/test';

const isApiOnly = process.argv.includes('--project=api');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
  },
  projects: [
    {
      name: 'api',
      testMatch: ['architecture.spec.ts', 'customApi.spec.ts', 'sessionRestore.spec.ts', 'authenticatedApi.spec.ts', 'feeItems.spec.ts', 'formatter.spec.ts', 'residentExport.spec.ts', 'billingModel.spec.ts', 'paymentPreview.spec.ts', 'bankingAllocation.spec.ts']
    },
    {
      name: 'chromium',
      testMatch: ['authFlow.spec.ts', 'propertyRegistration.spec.ts', 'managementLayout.spec.ts', 'billingFlow.spec.ts', 'paymentFlow.spec.ts', 'onboardingFlow.spec.ts', 'bankingFlow.spec.ts', 'serverConnectionError.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL,
      },
    },
  ],
  webServer: isApiOnly ? undefined : {
    command: 'npm run dev -- --webpack --port 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: '.next-test',
      NEXT_PUBLIC_API_HOST: 'http://localhost:8080',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
