import {
  expect,
  test
} from '@playwright/test';
import { ESLint } from 'eslint';

const eslint = new ESLint();

/** 파일 생성 없이 실제 ESLint 설정으로 화면 그룹의 경계와 진입 UI 배치를 검사합니다. */
async function architectureMessages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, {
    filePath
  });

  return result.messages.filter((message) => message.ruleId?.startsWith('architecture/'));
}

test('그룹 안의 화면은 자기 공개 API로 연결하고 내부 참조는 같은 화면에 한정', async () => {
  for (const target of ['@/screens/household/unit-list', '@/screens/household/unit-list/index']) {
    expect(await architectureMessages('src/app/example.ts', `export { UnitListPage } from '${target}';`)).toEqual([]);
  }
  expect(await architectureMessages('src/screens/household/unit-list/ui/unit-list-page/unitListPage.tsx',
    "export { value } from '../../model/unitList';")).toEqual([]);
});

test('같은 업무 그룹의 형제 화면·그룹 통합 진입점·화면 내부 Import는 거부', async () => {
  const sibling = await architectureMessages('src/screens/household/unit-detail/ui/unit-detail-page/unitDetailPage.tsx',
    "export { UnitListPage } from '@/screens/household/unit-list';");
  expect(sibling.map((message) => message.messageId)).toEqual(['sameLayer']);
  for (const target of ['@/screens/household', '@/screens/household/index', '@/screens/household/unit-list/ui/unit-list-page/unitListPage']) {
    const messages = await architectureMessages('src/app/example.ts', `export { value } from '${target}';`);
    expect(messages.map((message) => message.messageId)).toEqual(['publicApi']);
  }
});

test('화면 그룹 도입 이후에도 상위 레이어 참조와 단독 화면 내부 우회를 차단', async () => {
  const upper = await architectureMessages('src/entities/property/model/example.ts',
    "export { UnitListPage } from '@/screens/household/unit-list';");
  expect(upper.map((message) => message.messageId)).toEqual(['upperLayer']);
  const bypass = await architectureMessages('src/app/example.ts', "export { value } from '@/screens/login/ui/login-page/loginPage';");
  expect(bypass.map((message) => message.messageId)).toEqual(['publicApi']);
  expect(await architectureMessages('src/app/example.ts', "export { LoginPage } from '@/screens/login';")).toEqual([]);
});

test('화면·기능의 진입 TSX와 내부 컴포넌트는 각각 자기 폴더에서 관리', async () => {
  const code = 'export const Component = () => null;';
  for (const path of ['src/screens/login/ui/loginPage.tsx', 'src/features/property-registration/ui/propertyRegistrationFlow.tsx', 'src/screens/landing/ui/_components/brandLogo.tsx']) {
    const messages = await architectureMessages(path, code);
    expect(messages.map((message) => message.messageId)).toEqual(['componentFolder']);
  }
  for (const path of ['src/screens/login/ui/login-page/loginPage.tsx', 'src/features/property-registration/ui/property-registration-flow/propertyRegistrationFlow.tsx', 'src/screens/landing/ui/_components/brand-logo/brandLogo.tsx']) {
    expect(await architectureMessages(path, code)).toEqual([]);
  }
});
