This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

랜딩 페이지는 `/`에서 확인할 수 있습니다. 헤더의 데스크톱 / 모바일 메뉴는 세션 확인 중 진입을 기다리고, 비로그인 사용자에게는 `로그인`(`/login`), 로그인 사용자에게는 `시작하기`(`/start`)를 표시합니다. 라우팅 진입점은 `src/app/(landing)/page.tsx`이며, 화면 구현은 `src/screens/landing/ui/landingPage.tsx`에 있습니다. 내부 컴포넌트는 같은 `ui/` 안의 `_components/`, 화면 구성 상수는 `_constants/`에서 관리합니다. 헤더, 로고, 제품 미리보기와 등장 효과의 스타일은 각 컴포넌트 옆의 CSS Modules에서 관리하며, 화면 CSS는 화면 배치와 섹션 스타일을 담당합니다.

로그인 페이지는 `/login`에서 확인할 수 있습니다. 세션 복원과 본인 정보 확인 중에는 로그인 폼을 숨기며, 정상 로그인 사용자는 `/start`로 이동합니다. 일시 장애에는 로그인 폼 대신 재시도 안내를 표시합니다. 라우팅 진입점은 `src/app/(auth)/login/page.tsx`이며, 화면 구현은 `src/screens/login/ui/loginPage.tsx`에 있습니다. 카카오 버튼은 `src/features/kakao-login/`, 공통 로고 심볼은 `src/shared/ui/brand-mark/`에서 관리합니다. 버튼은 `NEXT_PUBLIC_API_HOST`의 `/oauth2/authorization/kakao`로 브라우저를 이동시킵니다. 서버의 로그인 취소 / 실패 코드는 `/login?error=...`에서 안내합니다. 이용약관과 개인정보처리방침은 준비 중 안내를 제공합니다.

`/login/callback`은 CSRF 조회 후 토큰을 재발급하고 로그인 완료 상태를 표시합니다. 화면 구현은 `src/screens/login-callback/ui/loginCallbackPage.tsx`이며, 화면 상태 타입과 오류 안내 함수도 같은 파일에서 관리합니다. 최종 관리대상별 진입 화면은 후속 연결 범위입니다. 설정은 [개발 가이드](../docs/developmentGuide.md)의 카카오 로그인 절을 따릅니다.

관리대상별 진입은 관련 조회 API와 업무 화면을 준비한 뒤 구현합니다. 공통 `/entry`, 역할별 목적지와 폴더 배치의 후속 설계안은 [Client 서비스 진입 설계](docs/serviceEntry.md)를 참조합니다. 현재 로그인 사용자의 목적지는 `/start`입니다.

관리대상 기본 정보 등록은 `/start`의 `관리할 곳 만들기`에서 열립니다. `/start?registration=basic`에서 PC 모달 / 모바일 전체 화면, 필수 입력에 따른 계속 버튼 활성화, 카카오 주소 검색, 기본 정보 검증 API와 같은 사용자 / 탭의 새로고침 입력 복원을 제공합니다. 검증 성공 후 `/start?registration=units`의 동·세대 설정으로 이동하며 PC 표 / 모바일 카드, 동·세대 추가·수정·초안 삭제, 검색과 이전 단계 이동을 제공합니다. 기본 정보와 동·세대는 단계 이동과 같은 사용자 / 탭의 새로고침에서 유지합니다. 관리계좌 이후 설정과 최종 등록은 후속 구현 범위입니다. 화면 / 초안 설계는 [Client 등록 설계](docs/propertyRegistration.md), 요청 / 응답 / 오류 계약은 [공통 등록 API](../docs/propertyRegistrationApi.md)를 참조합니다.

## 코드 배치

FSD의 의존성 경계를 유지하며 화면 전용 UI와 로직은 먼저 해당 화면에 둡니다. 공유 범위나 독립적인 책임이 분명해지면 `features`, `entities`, `widgets`로 분리합니다. 범용 UI는 `shared/ui`, 타입은 해당 화면 / 기능 / 도메인 / API 가까이에 둡니다. 작은 Props와 화면 상태는 컴포넌트 파일에 함께 둘 수 있으며 전역 `components/`, `types/`에 모으지 않습니다.

다른 슬라이스는 `index.ts` 공개 API로 사용하고, 같은 레이어의 다른 슬라이스는 직접 참조하지 않습니다. `npm run lint`에서 경계를 검사합니다. 상세 기준은 [Client 규칙](AGENTS.md)을 따릅니다.

`eslint.config.mjs`는 ESLint 9의 flat config로 Next / React / TypeScript 기본 검사를 유지합니다. 작은따옴표, JSX 속성 중괄호, Import / 객체 줄바꿈, 2칸 들여쓰기와 미사용 코드 규칙은 경고로 적용합니다. `npm run lint:fix`는 자동 수정 가능한 서식을 적용하며 세미콜론은 강제하지 않습니다.

## 공통 입력 컴포넌트

모달과 페이지의 입력 필드는 `src/shared/ui/form-controls/`의 `Input`, `Dropdown`, `Radio`를 사용합니다. Input / Dropdown은 라벨, 필수 표시, 설명, 오류와 비활성 상태를 지원합니다. Input / Radio는 기본 HTML 입력 속성, 이벤트와 `ref`를 전달합니다. Input의 `digitsOnly`는 문자열의 ASCII 숫자만 허용하고 숫자 키보드를 안내합니다. 문자가 섞인 타이핑 / 붙여넣기는 기존 값으로 되돌리며 앞자리 0을 보존합니다. Dropdown의 `ref`는 선택 트리거 버튼에 연결하며 `onChange(value)`로 선택값을 전달합니다. `value` / `onChange`와 `defaultValue` 방식 모두 사용할 수 있습니다.

컴포넌트별 폴더 안에 소스와 CSS Modules를 함께 둡니다. `FormField`는 입력 컴포넌트의 라벨과 안내를 구성하는 모듈 내부 컴포넌트이며, 외부에서는 모듈 루트의 `index.ts` 공개 API를 사용합니다.

```text
src/shared/ui/form-controls/
├── index.ts
├── form-field/
│   ├── formField.tsx
│   └── formField.module.css
├── input/
│   ├── input.tsx
│   └── input.module.css
├── dropdown/
│   ├── dropdown.tsx
│   └── dropdown.module.css
└── radio/
    ├── radio.tsx
    └── radio.module.css
```

```tsx
import {
  Input,
  Dropdown,
  Radio
} from '@/shared/ui/form-controls';
import { PROPERTY_TYPE_OPTIONS } from '@/entities/property';

<Input
  name={'name'}
  label={'이름'}
  placeholder={'이름을 입력해주세요'}
  description={'화면에 표시할 이름입니다.'}
  required
/>

<Dropdown
  name={'type'}
  label={'유형'}
  placeholder={'유형을 선택해주세요'}
  options={PROPERTY_TYPE_OPTIONS}
/>

<Radio
  name={'hasBuildings'}
  value={'false'}
  label={'동 없음'}
  description={'한 동으로만 구성된 건물이에요.'}
  variant={'card'}
  required
/>
```

`Input`의 `leadingIcon`에는 장식용 아이콘, `trailingContent`에는 글자 수나 버튼 등 부가 내용을 전달할 수 있습니다. `readOnly`도 지원합니다.

Dropdown은 공통 목록의 폭·간격·선택 표시를 사용하며 옵션의 `value`는 비어 있지 않은 고유한 문자열로 지정합니다. `placeholder`는 미선택 트리거에만 표시하고 옵션으로 추가하지 않습니다. 방향키 / Home / End로 탐색하고 Enter / Space로 선택하며 Escape는 기존 값으로 목록만 닫습니다. 선택 입력에는 별도 선택 해제 버튼을 제공하며 `clearable={false}`로 숨길 수 있습니다. 필수 입력에는 선택 해제를 제공하지 않습니다. 내부 입력을 통해 `name`, `form`, 필수 검증과 FormData 값도 유지합니다.

목록의 열림 / 닫힘은 0.18초의 이동과 투명도 전환을 사용하며 화살표도 같은 시간 동안 회전합니다. 닫힌 목록은 클릭과 접근성 탐색에서 제외하며 `prefers-reduced-motion`에서는 애니메이션을 생략합니다.

Radio는 기본 HTML radio로 그룹 선택과 키보드 이동을 유지하며 `variant="plain"`과 설명을 포함한 `variant="card"`를 지원합니다. 같은 `name`으로 그룹을 구성하고 `checked` / `onChange` 또는 `defaultChecked`를 전달합니다.

`error`에 메시지를 전달하면 오류 안내와 `aria-invalid`를 연결합니다. `id`를 생략하면 고유 ID를 생성하며 기존 `aria-describedby`도 유지합니다. 라벨을 숨기는 검색 필드 등은 `aria-label`이나 `aria-labelledby`로 이름을 지정합니다. `className`은 입력 요소, `fieldClassName`은 라벨과 안내를 포함한 필드 전체에 적용합니다. 입력값 정규화, 글자 수 계산과 도메인 검증은 사용하는 화면이나 기능에서 관리합니다.

### 검색 가능한 SelectDropdown

`shared/ui/form-controls`의 `SelectDropdown`은 선택 입력칸에서 직접 검색하고 `onChange(value)`로 확정한 옵션 값만 전달합니다. 검색을 취소하면 기존 선택을 유지합니다. `ref`는 검색 입력에 연결되며 `name` / `form`의 FormData에는 검색어 대신 선택값이 들어갑니다. `value` / `onChange`와 비제어 `defaultValue`를 모두 지원합니다.

옵션은 고유한 문자열 `value`, 표시할 `label`, 선택적 `icon`(ReactNode), `iconPosition`(`start` / `end`), `searchKeywords`(검색 별칭 배열), `disabled`를 받습니다. `layout`은 기본 `list`이며 `grid`로 지정할 수 있습니다. `searchLayout`은 기본적으로 `layout`을 따르며 검색 결과만 다른 배치로 보여줄 때 지정합니다. 아이콘 기본 위치는 컴포넌트의 `iconPosition`으로 지정하고 옵션에서 덮어쓸 수 있습니다. 그리드의 `start` 아이콘은 이름 위에, 리스트와 선택 입력의 `start` 아이콘은 이름 앞에 표시합니다. 코드 등 내부 값은 검색하거나 표시하지 않습니다.

관리계좌는 `layout="grid"`, `searchLayout="list"`를 사용합니다. `entities/banking`의 `BankIcon`과 로컬 은행 자산을 옵션에 전달하며 다른 도메인은 각자의 아이콘과 옵션을 전달해 재사용합니다. 기존 검색 없는 `Dropdown`은 유지합니다.

### 공통 버튼과 옵션

일반 클릭 버튼은 `src/shared/ui/button/`의 `Button`을 사용합니다. `variant`는 `primary` / `outline` / `ghost` / `text`, `size`는 `sm` / `md` / `lg`이며, `leadingIcon`, `trailingIcon`, `iconOnly`와 `loading`을 지원합니다. 기본 `type`은 `button`이며 제출 버튼은 `type="submit"`을 명시합니다. 아이콘만 있는 버튼에는 `aria-label`을 지정합니다. `loading`과 `disabled` 상태에서는 클릭을 막습니다. 화면 CSS는 버튼 위치·폭·배치만 담당하며 색상·포커스·비활성 표현은 공통 Button이 담당합니다.

`shared/lib/options`의 `Option<T>`는 선택값 / 표시 이름 / 설명 / 비활성 여부를 위한 공통 자료형입니다. 건물 유형과 동 구분처럼 도메인에 속한 고정 옵션은 `entities/property/constants/propertyOptions.ts`에 모으고 `entities/property`의 공개 API로 가져옵니다. 상수라는 이유만으로 도메인 옵션을 `shared`에 모으지 않습니다.

## 공통 API 호출

`src/shared/api/`의 `customAPI`는 서버 경로, HTTP 메서드와 데이터를 받습니다. 메서드를 생략하면 GET입니다. GET 데이터는 쿼리로, POST / PUT / PATCH / DELETE 데이터는 JSON 본문으로 전달합니다. GET 배열은 같은 쿼리 키를 반복하고 null / undefined 값은 생략합니다. 중첩 쿼리 객체는 허용하지 않습니다.

```ts
import { customAPI } from '@/shared/api';

const result = await customAPI<{ count: number }>({
  url: '/api/example',
  method: 'GET',
  data: {
    page: 1,
  },
});

await customAPI({
  url: '/api/example',
  method: 'POST',
  data: {
    name: '모아홈',
  },
});
```

위 `/api/example`은 호출 형식 설명용이며 실제 서버 API가 아닙니다. `credentials: "include"`, `cache: "no-store"`, JSON 응답 파싱과 15초 요청 제한은 공통 처리합니다. HTTP 오류는 `ApiError`의 `status`와 `code`로 구분합니다. 본문 없는 API는 `customAPI<void>()`로 호출합니다. 경로는 `/`로 시작하는 API 호스트 내부 경로만 허용합니다.

쿠키 인증 API의 CSRF 헤더나 직접 지정할 보안 헤더는 선택적인 `headers`로 전달합니다. 공통 전송 코드는 상위 FSD 레이어의 인증 상태를 직접 참조하지 않습니다.

브라우저의 업무 API는 `src/entities/session/`의 `authenticatedAPI`를 사용합니다. 로그인 콜백이나 호출자가 세션을 복원한 뒤 메모리의 Access Token을 Bearer 헤더에 자동으로 넣습니다. `401 / ACCESS_TOKEN_EXPIRED`에서만 세션을 재발급하고 원래 메서드 / URL / 데이터 / 다른 헤더를 유지해 한 번 재시도합니다. 다른 401, 403, 503과 네트워크 오류는 자동 재발급하지 않으며, 재발급 실패나 재시도 실패도 그대로 전달합니다. 메모리 세션이 없으면 `401 / AUTHENTICATION_REQUIRED`로 거부합니다. 쿠키 인증의 CSRF / 재발급 / 로그아웃 요청은 `customAPI`로 호출하여 업무 API 재시도 대상에 포함하지 않습니다.

```ts
import { authenticatedAPI } from '@/entities/session';

const result = await authenticatedAPI<{ count: number }>({
  url: '/api/example',
  data: {
    page: 1,
  },
});
```

위 경로는 호출 형식 설명용이며 실제 업무 API가 아닙니다. 세션 API를 `entities` 레이어에 두어 다른 업무 Feature도 FSD 경계를 지키며 재사용할 수 있습니다.

## 세션 복원

`src/entities/session/`의 `restoreSession()`을 콜백 화면이나 후속 앱 초기화에서 재사용합니다. 기존 `src/features/restore-session/` 진입점도 같은 함수를 공개합니다. `GET /api/auth/web/csrf` → `POST /api/auth/web/refresh` 순서로 호출하고 브라우저 메모리에 Access Token과 만료시각, CSRF 토큰을 보관합니다. Refresh Token은 HttpOnly 쿠키로만 전달합니다.

같은 탭의 중복 복원은 Promise를 공유하고 유효한 메모리 토큰은 재사용합니다. 업무 API가 만료 응답을 받으면 해당 요청의 Access Token을 전달해 로컬 만료시각과 관계없이 교체합니다. 다른 요청이 이미 갱신한 경우 새 토큰을 재사용하여 늦게 도착한 만료 응답이 추가 Rotation을 일으키지 않게 합니다. 여러 탭은 [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)로 CSRF 조회와 쿠키 교체 전체를 직렬화합니다. Web Locks가 없는 환경은 동시 재발급을 허용하지 않고 브라우저 업데이트를 안내합니다. 운영 HTTPS / 로컬 localhost 기준은 [인증 설계](../docs/securityDesign.md)를 따릅니다.

인증 거부는 재로그인을 안내하며, 503은 기존 메모리 세션을 지우지 않고 사용자가 재시도할 수 있게 합니다. 재발급 응답이 유실되거나 잘못된 토큰 응답을 받으면 추가 재발급을 차단하고 다시 로그인하도록 안내합니다. 모든 페이지의 전역 세션 자동 복원은 후속 연결 범위입니다.

## 검증

```bash
npm run lint
npx --no-install tsc --noEmit
npm run build
npx playwright install chromium
npm test
```

`npm run test:api`는 공통 API / 세션 복원 / 업무 API 인증 테스트, `npm run test:e2e`는 로그인 / 기본 정보 등록 화면 통합 테스트를 실행합니다. 설치된 Chrome을 이용할 때는 `PLAYWRIGHT_CHANNEL=chrome npm test`를 사용합니다. 통합 테스트는 포트 3100과 별도 `.next-test/` 결과를 사용하며 인증 / 등록 응답과 주소 검색 SDK를 모의 처리합니다. 실제 카카오 로그인, 주소 검색 외부 서비스나 서버 DB / Redis 연결은 별도로 확인합니다.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
