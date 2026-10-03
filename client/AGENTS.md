# AGENTS.md

이 파일은 `client/` 영역에서 Codex가 따라야 하는 프론트엔드 규칙을 정의합니다.

루트 `AGENTS.md`의 공통 규칙을 기본으로 적용하며,
Client 작업에서는 이 문서의 규칙을 추가로 적용합니다.

## 1. Architecture

Client는 FSD(Feature-Sliced Design)를 사용합니다.

기본 레이어는 아래 순서를 따릅니다.

```text
app
pages
widgets
features
entities
shared
```

의존성은 상위 레이어에서 하위 레이어 방향으로만 허용합니다.

```text
app → pages → widgets → features → entities → shared
```

하위 레이어가 상위 레이어를 참조하면 안 됩니다.

예:

- `shared` → `features` 금지
- `entities` → `widgets` 금지
- `features` → `pages` 금지

## 2. Layer Responsibilities

### app

앱 전역 설정과 초기 구성을 담당합니다.

- 전역 Provider
- 전역 Style
- Router / Layout 연결
- 앱 초기 설정

### pages

하나의 페이지 화면을 구성합니다.

페이지에서는 하위 레이어의 기능과 UI를 조합합니다.

### widgets

여러 Feature와 Entity를 조합한 독립적인 UI 블록입니다.

예:

- Header
- Sidebar
- Dashboard Summary
- Management Table

### features

사용자의 행동과 비즈니스 기능을 담당합니다.

예:

- 로그인
- 관리비 부과
- 입금 확인
- 주민 승인
- 지출 등록

### entities

비즈니스 도메인 단위의 데이터와 UI를 담당합니다.

예:

- User
- Property
- Unit
- Resident
- Charge
- Payment
- Expense

### shared

도메인에 종속되지 않는 공통 기능을 담당합니다.

예:

- 공통 UI
- API Client
- Utility
- 공통 Hook
- 공통 Type
- 상수

## 3. Naming

루트 `AGENTS.md`의 Naming Convention을 따릅니다.

추가 규칙:

- FSD Slice 이름: `kebab-case`
- FSD Segment 이름: `kebab-case`
- 소스 파일명: `camelCase` (`paymentCard.tsx`, `usePayment.ts`, `paymentApi.ts`)
- 페이지 내부 전용 폴더와 단일 보조 파일에는 Page-Local Code Rules에 따라 `_` 접두사를 허용합니다. 그 외 코드 이름은 기존 명명 규칙을 유지합니다.
- React Component 이름: `PascalCase`
- Hook 이름: `useCamelCase`

예:

```text
features/
└── confirm-payment/
    ├── ui/
    ├── model/
    └── api/
```

Next.js와 도구가 사용하는 `page.tsx`, `layout.tsx`, `not-found.tsx`,
`next.config.ts` 등의 파일명은 해당 도구의 규칙을 유지합니다.

## 4. UI / Design

프로젝트 색상은 루트 `AGENTS.md`에 정의된 색상을 사용합니다.

상태 색상은 의미를 유지합니다.

- Success: 완료 / 정상 / 납부완료
- Warning: 확인 필요 / 일부납부
- Danger: 미납 / 오류 / 실패

임의의 브랜드 색상이나 상태 색상을 추가하지 않습니다.

- `src/app/globals.css`에 정의한 공통 색상 토큰을 사용합니다.
- 배경과 본문은 루트의 Background / Main Text 색상을 사용합니다.
- 카드 배경, 보조 텍스트, 기본 테두리는 루트의 Card / Sub Text / Border 토큰을 사용합니다.
- 버튼, 링크, 포커스와 상태 표현도 루트 색상에 대응하는 토큰을 사용합니다.
- 임의의 HEX 값이나 별도 다크 모드 팔레트를 컴포넌트에 추가하지 않습니다.

기존 공통 UI 컴포넌트가 있으면 우선 재사용합니다.

## 5. Component Rules

- 페이지에 모든 로직을 직접 작성하지 않습니다.
- 사용자 행동 단위 로직은 가능한 `features`로 분리합니다.
- 도메인 표현은 `entities`에 둡니다.
- 범용 UI는 `shared`에 둡니다.
- 여러 기능을 조합한 큰 UI 영역은 `widgets`에 둡니다.
- 동일한 UI를 중복 구현하지 않습니다.

## 6. Import Rules

FSD 레이어 경계를 우회하는 상대 경로 Import를 만들지 않습니다.

가능하면 각 Slice의 공개 API를 통해 Import합니다.

다른 Slice의 내부 구현 파일을 직접 참조하지 않습니다.

예:

```ts
// 권장
import { PaymentCard } from '@/entities/payment';

// 지양
import { PaymentCard } from '@/entities/payment/ui/payment-card';
```

## 7. Page-Local Code Rules

### 기본 원칙

특정 페이지에서만 사용하는 컴포넌트, 유틸리티, 타입과 훅은
해당 페이지 내부에서 관리합니다.

페이지 전용 내부 폴더에는 `_` 접두사를 붙입니다.

| 폴더 | 용도 |
| --- | --- |
| `_components/` | 해당 페이지에서만 사용하는 UI 컴포넌트 |
| `_utils/` | 해당 페이지에서만 사용하는 보조 함수 |
| `_types/` | 해당 페이지의 화면 구성과 상태에 필요한 타입 |
| `_hooks/` | 해당 페이지에서만 사용하는 React Hook |
| `_constants/` | 해당 페이지에서만 사용하는 상수 |

실제로 필요한 폴더만 생성합니다.
페이지를 만들 때 위 폴더를 모두 미리 생성하지 않습니다.

### 이름 적용 범위

`_`는 내부 전용 폴더를 구분하기 위한 접두사입니다.

폴더 내부의 파일명은 기존 파일 명명 규칙을 따릅니다.
컴포넌트, 함수, 변수와 타입 이름에도 기존 명명 규칙을 적용합니다.

예:

```text
폴더:       _components/
컴포넌트:   PaymentSummary

폴더:       _utils/
함수:       formatBillingMonth

폴더:       _types/
타입:       PaymentFilter

폴더:       _hooks/
훅:         usePaymentFilter
```

내부 전용이라는 이유로 코드 이름을 다음과 같이 바꾸지 않습니다.

```text
_PaymentSummary
_formatBillingMonth
_PaymentFilter
_usePaymentFilter
```

유틸리티나 타입을 하나의 파일로 관리하는 편이 간단하면
해당 위치에서 `_utils.ts`, `_types.ts` 형태를 사용할 수 있습니다.

같은 위치에 `_utils.ts`와 `_utils/`처럼
역할이 같은 파일과 폴더를 동시에 만들지 않습니다.

### 사용 범위

- 페이지 전용 코드는 해당 페이지와 그 내부 코드에서만 사용합니다.
- 다른 페이지의 `_components`, `_utils`, `_types` 등을 직접 가져오지 않습니다.
- 다른 페이지에서 필요해졌다면 공통화할 책임과 위치를 먼저 검토합니다.
- 페이지 전용 구현을 다른 페이지에 제공하기 위해 공개 API로 재노출하지 않습니다.
- 하나의 컴포넌트에서만 사용하는 작은 타입은 해당 컴포넌트 파일에 함께 둘 수 있습니다.
- 한 번 사용하는 간단한 표현까지 무조건 유틸리티 파일로 분리하지 않습니다.

### 페이지 타입과 도메인 타입

`_types`에는 해당 페이지의 화면 구성에 필요한 타입을 둡니다.

예:

- 검색 조건
- 필터 상태
- 탭 선택 상태
- 화면 표시용으로 조합한 데이터 형태

기존 도메인 타입이나 API 응답 타입이 있다면 재사용합니다.

`Charge`, `Payment`, `Resident`처럼 여러 기능에서 사용하는 도메인 타입을
페이지마다 별도로 정의하지 않습니다.

### FSD와의 관계

페이지 전용 폴더 규칙은 FSD 레이어와 의존성 규칙을 대체하지 않습니다.

- 페이지 전용 코드도 현재 페이지 슬라이스 안에 배치합니다.
- 기존 `ui`, `model`, `lib`, `api` 등의 역할 구분을 유지합니다.
- `_components`는 `ui` 내부에 둡니다.
- 페이지 상태용 `_types`와 `_hooks`는 `model` 내부에 둘 수 있습니다.
- 페이지 내부 보조 함수인 `_utils`는 `lib` 내부에 둘 수 있습니다.
- 타입과 함수는 이름만 보고 한곳에 모으지 않고 실제 책임에 따라 배치합니다.
- 이 규칙을 이유로 기존 라우터 위치나 FSD 레이어 이름을 임의로 변경하지 않습니다.

### 페이지 슬라이스 내부 구조 예시

아래는 하나의 페이지 슬라이스 내부 예시입니다.
프로젝트 전체의 라우팅 경로를 새로 정의하는 구조가 아닙니다.

```text
payment-history/
├── index.ts
├── ui/
│   ├── view.tsx
│   └── _components/
│       ├── summary.tsx
│       └── filter.tsx
├── model/
│   └── _types/
│       └── filter.ts
└── lib/
    └── _utils/
        └── period.ts
```

`index.ts`에는 외부에서 사용하는 페이지 진입점 등 필요한 항목만 공개합니다.
내부 구현 파일을 전부 재노출하지 않습니다.

### 공통화 기준

다른 페이지에서도 필요해진 코드를 무조건 `shared`로 옮기지 않습니다.

| 코드의 책임 | 검토할 위치 |
| --- | --- |
| 도메인과 무관한 공통 버튼, 입력창 | `shared/ui` |
| 도메인과 무관한 공통 보조 함수 | `shared/lib` |
| 특정 도메인의 공통 타입과 표현 | 해당 `entities` 슬라이스 |
| 여러 페이지에서 사용하는 사용자 행동 | 해당 `features` 슬라이스 |
| 여러 기능을 조합한 독립적인 화면 블록 | 해당 `widgets` 슬라이스 |

재사용 횟수만으로 공통화하지 않습니다.
사용 목적과 변경 이유가 같은지 확인한 후 분리합니다.

### 주의사항

- `_` 접두사는 페이지 내부 코드임을 표시하는 명명 규칙입니다.
- 다른 파일의 import를 자동으로 차단하는 접근 제어 장치가 아닙니다.
- 인증정보나 비밀값을 안전하게 보관하는 수단으로 사용하지 않습니다.
- Next.js의 `page.tsx`, `layout.tsx` 등 라우팅 규약 파일에는 임의로 `_`를 붙이지 않습니다.

## 8. Control Flow

- 루트의 Control Flow 규칙을 따릅니다.
- 로딩, 오류, 빈 데이터 상태는 Early Return으로 분리해 렌더링의 중첩을 줄입니다.
- JSX 안에서 중첩 삼항 연산자로 여러 상태를 처리하지 않습니다.
- 반복되는 업무 조건은 `model`의 함수나 Hook으로 모으되 단순한 조건에 불필요한 Hook을 만들지 않습니다.

## 9. Test / Build

명령은 `client/`에서 실행합니다. 최초 설치는 `npm ci`를 사용합니다.

```bash
npm run lint
npx --no-install tsc --noEmit
npm run build
```

- 구현 변경 후 위 ESLint, TypeScript 타입 검사, 프로덕션 빌드를 수행합니다.
- 현재 테스트 러너와 `test` 스크립트는 설정되어 있지 않습니다. 위 검증을 단위 테스트 통과로 보고하지 않습니다.
- 업무 로직을 구현할 때 필요한 테스트 환경과 실행 스크립트를 함께 추가하고, 실제 명령을 이 문서에 갱신합니다.
- 금액 / 상태 계산은 단위 테스트로, 사용자 상호작용과 로딩 / 오류 / 빈 상태는 컴포넌트 테스트로 검증합니다.
- 로그인, 관리비 부과, 수납 확정 등 핵심 흐름은 해당 기능이 구현되는 시점에 필요한 통합 / E2E 테스트를 추가합니다.
- UI 변경은 개발 서버(`npm run dev`)에서 영향받는 화면과 반응형 표시도 확인합니다.
- 스냅샷이나 구현 내부를 그대로 따라가는 테스트보다 사용자에게 보이는 결과와 업무 규칙을 검증합니다.
- 문서만 변경한 경우 루트 Verification 규칙을 따릅니다.

## 10. General Rules

- 기존 구조를 먼저 확인한 후 새 Slice를 만듭니다.
- 단순한 기능을 불필요하게 여러 레이어로 분리하지 않습니다.
- 공통화가 필요하지 않은 코드를 미리 `shared`로 이동하지 않습니다.
- 현재 작업과 관계없는 화면이나 컴포넌트를 임의로 수정하지 않습니다.
