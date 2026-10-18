import {
  expect,
  test
} from '@playwright/test';
import { ESLint } from 'eslint';
import { readdirSync } from 'node:fs';
import {
  dirname,
  join
} from 'node:path';

const eslint = new ESLint();

/** 파일 생성 없이 실제 ESLint 설정으로 화면 그룹의 경계와 진입 UI 배치를 검사합니다. */
async function architectureMessages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, {
    filePath
  });

  return result.messages.filter((message) => message.ruleId?.startsWith('architecture/'));
}

test('그룹 안의 화면은 자기 공개 API로 연결하고 내부 참조는 같은 화면에 한정', async () => {
  expect(await architectureMessages('src/app/example.ts', "export { PaymentMatchingPage } from '@/screens/payment/matching';")).toEqual([]);
  for (const target of ['@/screens/household/unit-list', '@/screens/household/unit-list/index']) {
    expect(await architectureMessages('src/app/example.ts', `export { UnitListPage } from '${target}';`)).toEqual([]);
  }
  expect(await architectureMessages('src/screens/household/unit-list/ui/unitListPage.tsx',
    "export { value } from '../model/unitList';")).toEqual([]);
});

test('통장 화면 그룹도 공개 API를 사용하고 형제 화면 참조를 차단', async () => {
  expect(await architectureMessages('src/app/example.ts', "export { BankingTransactionsPage } from '@/screens/banking/transactions';")).toEqual([]);
  expect((await architectureMessages('src/screens/banking/expenses/ui/bankingExpensesPage.tsx',
    "export { BankingTransactionsPage } from '@/screens/banking/transactions';")).map((message) => message.messageId)).toEqual(['sameLayer']);
});

test('같은 업무 그룹의 형제 화면·그룹 통합 진입점·화면 내부 Import는 거부', async () => {
  expect((await architectureMessages('src/screens/payment/monthly/ui/paymentMonthlyPage.tsx',
    "export { PaymentMatchingPage } from '@/screens/payment/matching';")).map((message) => message.messageId)).toEqual(['sameLayer']);
  const sibling = await architectureMessages('src/screens/household/unit-detail/ui/unitDetailPage.tsx',
    "export { UnitListPage } from '@/screens/household/unit-list';");
  expect(sibling.map((message) => message.messageId)).toEqual(['sameLayer']);
  for (const target of ['@/screens/household', '@/screens/household/index', '@/screens/household/unit-list/ui/unitListPage']) {
    const messages = await architectureMessages('src/app/example.ts', `export { value } from '${target}';`);
    expect(messages.map((message) => message.messageId)).toEqual(['publicApi']);
  }
});

test('화면 그룹 도입 이후에도 상위 레이어 참조와 단독 화면 내부 우회를 차단', async () => {
  const upper = await architectureMessages('src/entities/property/model/example.ts',
    "export { UnitListPage } from '@/screens/household/unit-list';");
  expect(upper.map((message) => message.messageId)).toEqual(['upperLayer']);
  const bypass = await architectureMessages('src/app/example.ts', "export { value } from '@/screens/login/ui/loginPage';");
  expect(bypass.map((message) => message.messageId)).toEqual(['publicApi']);
  expect(await architectureMessages('src/app/example.ts', "export { LoginPage } from '@/screens/login';")).toEqual([]);
});

test('단일 진입 UI는 ui 직하를 허용하고 내부 보조 컴포넌트는 폴더로 구분', async () => {
  const code = 'export const Component = () => null;';
  for (const path of ['src/screens/landing/ui/_components/brandLogo.tsx', 'src/screens/household/resident-list/ui/_components/residentExportPreview.tsx']) {
    const messages = await architectureMessages(path, code);
    expect(messages.map((message) => message.messageId)).toEqual(['componentFolder']);
  }
  for (const path of ['src/screens/login/ui/loginPage.tsx', 'src/widgets/service-header/ui/serviceHeader.tsx', 'src/features/kakao-login/ui/kakaoLoginButton.tsx', 'src/entities/banking/ui/bank-icon/bankIcon.tsx', 'src/features/property-registration/ui/property-registration-flow/propertyRegistrationFlow.tsx', 'src/screens/household/resident-list/ui/resident-list-page/residentListPage.tsx', 'src/screens/landing/ui/_components/brand-logo/brandLogo.tsx']) {
    expect(await architectureMessages(path, code)).toEqual([]);
  }
});

/** 실제 소스 구조를 탐색해 진입 UI 수에 따른 배치와 스타일의 위치를 확인합니다. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {
    withFileTypes: true
  }).flatMap((entry) => {
    const path = join(directory, entry.name);

    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

test('실제 슬라이스의 단일 진입 UI는 ui 직하에, 복수 진입 UI는 각각의 폴더에 배치', () => {
  for (const layer of ['screens', 'widgets', 'features', 'entities']) {
    const files = sourceFiles(join('src', layer));
    const uiDirectories = new Set(files.map((path) => path.match(/^(.*\/ui)\//)?.[1]).filter((path) => path !== undefined));
    for (const ui of uiDirectories) {
      const entries = readdirSync(ui, {
        withFileTypes: true
      });
      const direct = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'));
      const folders = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'));
      if (direct.length) {
        expect(direct, ui).toHaveLength(1);
        expect(folders, ui).toHaveLength(0);
        continue;
      }
      expect(folders.length, ui).toBeGreaterThan(1);
      for (const folder of folders) {
        expect(readdirSync(join(ui, folder.name)).some((name) => name.endsWith('.tsx')), join(ui, folder.name)).toBe(true);
      }
    }
    // 화면 배치용 보조 CSS도 사용하는 TSX와 같은 위치에 있어야 경로 이동에서 누락되지 않습니다.
    for (const css of files.filter((path) => path.includes('/ui/') && path.endsWith('.module.css'))) {
      expect(readdirSync(dirname(css)).some((name) => name.endsWith('.tsx')), css).toBe(true);
    }
  }
});
