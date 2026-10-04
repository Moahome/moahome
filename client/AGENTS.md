# AGENTS.md

이 파일은 `client/` 영역에서 Codex가 따라야 하는 프론트엔드 규칙을 정의합니다.

루트 `AGENTS.md`의 공통 규칙을 기본으로 적용하며,
Client 작업에서는 이 문서의 규칙을 추가로 적용합니다.

## 1. Architecture

Client는 FSD(Feature-Sliced Design)를 사용합니다.

기본 레이어는 아래 순서를 따릅니다.

```text
app
screens
widgets
features
entities
shared
```

의존성은 상위 레이어에서 하위 레이어 방향으로만 허용합니다.

```text
app → screens → widgets → features → entities → shared
```

- 이 순서는 의존성 방향이며 모든 중간 레이어를 거칠 필요는 없습니다. `screens`에서 `features`나 `shared`를 직접 사용할 수 있습니다.
- 실제 필요한 레이어와 슬라이스만 만듭니다. 아직 구현하지 않은 도메인이나 빈 역할별 폴더를 미리 만들지 않습니다.
- `screens`, `widgets`, `features`, `entities`의 같은 레이어에 있는 서로 다른 슬라이스는 직접 참조하지 않습니다. 공통 책임은 하위 레이어로 옮기고 기능 조합은 상위 레이어에서 처리합니다.
- 슬라이스가 없는 `app`, `shared` 내부는 같은 레이어 참조를 허용합니다. `shared`도 공통 모듈의 공개 진입점을 사용하고 내부 구현을 외부에 노출하지 않습니다.

### Next.js 라우터와 화면 레이어

- `src/app/`은 Next.js App Router와 전역 설정에 사용합니다.
- FSD의 `pages` 역할은 `src/screens/`에서 담당합니다. 화면 레이어 이름에 `_`를 붙이지 않습니다.
- `src/app/`의 `page.tsx`는 화면 슬라이스의 공개 API를 통해 화면을 연결합니다.

하위 레이어가 상위 레이어를 참조하면 안 됩니다.

예:

- `shared` → `features` 금지
- `entities` → `widgets` 금지
- `features` → `screens` 금지

## 2. Layer Responsibilities

### app

앱 전역 설정과 초기 구성을 담당합니다.

- 전역 Provider
- 전역 Style
- Router / Layout 연결
- 앱 초기 설정

### screens

하나의 페이지 화면을 구성합니다.

하위 레이어의 기능과 UI를 조합하고, 해당 화면에만 필요한 UI, 상태와 조회 / 변경 로직을 관리합니다.
한 화면에만 필요한 코드를 형식적으로 하위 레이어에 나누지 않습니다.

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

여러 화면이나 기능이 공유하는 비즈니스 도메인의 데이터, 타입과 UI를 담당합니다.
DB 테이블이나 ERD 엔티티마다 프론트엔드 슬라이스를 미리 만들지 않습니다.

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
- UI 내부 보조 코드의 폴더에는 Internal Code Rules에 따라 `_` 접두사를 붙입니다. `ui/`, `model/`, `lib/` 등 역할별 폴더와 파일명, 함수 / 타입 이름에는 `_`를 붙이지 않습니다.
- React Component 이름: `PascalCase`
- Hook 이름: `useCamelCase`
- CSS 클래스명, 사용자 정의 속성과 `@keyframes` 이름: `kebab-case` (`hero-copy`, `--primary-soft`, `device-float`)
- CSS Modules의 kebab-case 클래스는 `styles["hero-copy"]`처럼 대괄호 표기로 참조합니다. 스타일 이름을 camelCase 별칭으로 바꾸지 않습니다.

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

### TypeScript / JSX / CSS 작성 형식

- 들여쓰기는 공백 2칸을 사용합니다.
- 구조 분해 매개변수와 인라인 객체 타입을 함께 선언할 때는 매개변수와 타입을 각각 여러 줄로 작성합니다. 중첩 객체 타입도 속성별로 줄을 나눕니다.
- JSX 속성에 조건식이나 여러 줄 표현식이 있으면 요소와 속성을 여러 줄로 작성합니다. 선언문과 반환문 사이에는 빈 줄을 둡니다.
- 중첩 JSX, 여러 요소를 반환하는 `map` 콜백과 긴 속성 목록은 줄을 나누어 계층이 드러나도록 작성합니다.
- 여러 JSX 요소나 여러 문장을 한 줄로 압축하지 않습니다.
- CSS 선언은 속성마다 한 줄로 작성하고, 스타일 블록 사이에는 빈 줄을 둡니다.
- CSS Modules는 기본 클래스 아래에 자식 요소, 상태와 의사 요소를 중첩하는 계층형 CSS로 작성합니다.
- 컴포넌트 전용 CSS Modules는 해당 컴포넌트 옆에 둡니다. 화면 CSS는 화면 배치와 섹션 스타일을 담당하고, 분리된 컴포넌트의 스타일과 반응형 규칙을 한곳에 모으지 않습니다.
- 다른 컴포넌트의 CSS Module 클래스에 의존하는 중첩 선택자를 만들지 않습니다. 표현 차이는 명시적인 Props나 CSS 사용자 정의 속성으로 전달합니다.
- 상태와 의사 요소는 `&:hover`, `&[open]`, `&::after`처럼 부모 선택자를 명시합니다.
- 관련 없는 클래스는 함께 중첩하지 않으며, 선택자 우선순위와 미디어 쿼리의 적용 순서를 유지합니다.

```css
.navigation {
  display: flex;
  gap: 24px;

  a {
    color: var(--foreground);

    &:hover {
      color: var(--primary);
    }
  }
}
```

## 5. Component Rules

- 해당 화면에만 필요한 UI와 로직은 먼저 화면 슬라이스에 둡니다. 파일 분리는 읽기 어려운 복잡도, 독립적인 책임과 실제 공유 범위로 판단합니다.
- 사용자 행동이 여러 화면에서 공유되거나 독립적인 업무 기능으로 관리할 이유가 분명하면 `features`로 분리합니다. 클릭 이벤트마다 Feature를 만들지 않습니다.
- 공유할 도메인 데이터와 표현은 `entities`, 도메인과 무관한 범용 UI는 `shared/ui`에 둡니다.
- 여러 화면에서 공유하거나 독립적으로 관리할 필요가 있는 큰 UI 블록은 `widgets`로 분리합니다. Header나 Table이라는 이름만으로 Widget으로 분류하지 않습니다.
- 프로젝트 전체의 `components/`에 모든 컴포넌트를 모으지 않습니다. 화면 / 기능 / 도메인별 책임 가까이에 둡니다.
- 동일한 UI를 중복 구현하지 않습니다.

### Server / Client Component 선택

- 컴포넌트를 작성하거나 변경할 때 실제 처리 책임을 기준으로 Server / Client 여부를 판단합니다.
- 화면 조합, 서버 데이터 조회와 `metadata` 처리는 Server Component를 기본으로 합니다.
- `useState`, `useEffect`, 이벤트 핸들러나 `window`, `document`, `navigator` 등 브라우저 기능이 필요한 컴포넌트에는 `"use client"`를 선언합니다.
- API를 호출한다는 이유만으로 Client Component로 만들지 않습니다. 요청이 실행되어야 할 환경과 인증정보 전달 방식을 함께 판단합니다.
- `page.tsx`는 라우팅, URL 값 조회와 화면 연결을 담당하며 가능한 Server Component로 유지합니다. `metadata` / `generateMetadata` export는 Server Component에서 처리합니다.
- 상호작용이 필요한 부분은 해당 컴포넌트를 Client Component로 구성합니다. 하위 컴포넌트가 Client라는 이유로 상위 페이지 전체를 Client로 전환하지 않습니다.
- 페이지 화면 자체에 상태나 브라우저 처리가 필요해지면 해당 화면의 Client 전환과 하위 컴포넌트 분리 중 책임에 맞는 방법을 선택합니다. 이때 FSD 의존성과 공개 API 규칙도 유지합니다.

## 6. Import Rules

FSD 레이어 경계를 우회하는 상대 경로 Import를 만들지 않습니다.

다른 Slice는 공개 API인 `index.ts`를 통해 Import합니다.

다른 Slice의 내부 구현 파일을 직접 참조하지 않습니다.

- 같은 Slice 내부에서는 상대 경로로 참조하며 자기 Slice의 `index.ts`를 거치지 않습니다.
- `shared/api`, `shared/ui/brand-mark`처럼 공통 모듈별 공개 API를 사용합니다. `shared` 전체를 하나의 `index.ts`로 모으지 않습니다.
- `npm run lint`의 `architecture/import-boundaries` 규칙으로 상위 레이어 참조, 같은 레이어의 다른 슬라이스 참조와 슬라이스 공개 API 우회를 검사합니다. 별칭과 상대 경로, 문자열 리터럴을 사용하는 동적 Import와 재노출에도 적용합니다.

예:

```ts
// 권장
import { PaymentCard } from '@/entities/payment';

// 지양
import { PaymentCard } from '@/entities/payment/ui/paymentCard';
```

## 7. Internal Code Rules

### 판단 기준

- 코드의 역할을 먼저 판단해 `ui/`, `model/`, `api/`, `lib/` 등에 배치하고, 해당 영역 내부의 보조 코드인지 여러 화면 / 기능에서 공유할 코드인지 구분합니다.
- `ui/`는 컴포넌트와 표시 상태 / 스타일, `model/`은 업무 데이터와 관련 로직, `api/`는 서버 요청과 요청 / 응답 타입, `lib/`는 슬라이스의 보조 함수를 담당합니다. 실제 필요한 역할별 폴더만 만듭니다.
- UI 내부에서만 사용하는 보조 폴더에는 `_`를 붙이고 `ui/` 안에 둡니다. 역할별 폴더 이름과 내부 보조 폴더의 `_`는 서로 다른 기준입니다.
- 여러 화면이나 기능에서 공유할 코드는 책임에 맞는 레이어에 두고 공개 API를 통해 사용합니다.
- 사용 횟수만으로 배치를 결정하지 않습니다. 기존 공용 코드와 독립적인 업무 책임을 확인하되, 미래의 재사용을 추측해 미리 분리하지 않습니다.

### UI 내부 보조 코드 배치

| 폴더 | 내용 |
| --- | --- |
| `ui/_components/` | 내부 UI 컴포넌트 |
| `ui/_types/` | UI 내부 타입 / 인터페이스 |
| `ui/_utils/` | UI 내부 보조 함수 |
| `ui/_hooks/` | UI 내부 Hook |
| `ui/_constants/` | 내부 화면 구성 상수 |

- 화면 컴포넌트와 CSS Modules는 `ui/`에 둡니다. UI 내부 보조 폴더도 같은 `ui/` 안에 두며, 화면 슬라이스 루트로 분리하지 않습니다.
- 한 컴포넌트의 Props, 작은 표시 상태 타입과 보조 함수는 해당 컴포넌트 파일에 함께 둘 수 있습니다. 타입이나 함수라는 이유만으로 파일을 분리하지 않습니다.
- 여러 내부 파일에서 공유하거나 복잡해져 읽기 어려워진 보조 코드는 필요한 `_types/`, `_utils/` 등으로 분리합니다. 내부 폴더는 선택 사항이며 파일 하나를 위해 반드시 만들지 않습니다.
- 업무 상태 / 데이터 타입과 관련 로직은 `model/`, API 요청 / 응답 타입은 `api/`에 직접 둡니다. 타입이나 보조 함수라는 이유로 `model/_types/`, `model/_utils/`, `lib/_utils/` 같은 추가 폴더를 만들지 않습니다.
- 파일명은 `camelCase`, 타입 / 컴포넌트 이름은 `PascalCase` 등 기존 명명 규칙을 따릅니다. `_`는 폴더 이름에만 붙입니다.
- 다른 화면이나 슬라이스에서 내부 폴더의 코드를 직접 가져오거나 공개 API로 재노출하지 않습니다.
- 기존 공용 타입과 함수를 먼저 확인하고, 같은 내용을 내부 폴더에 중복 정의하지 않습니다.

```text
src/screens/login/
├── index.ts
└── ui/
    ├── loginPage.tsx
    └── loginPage.module.css
```

`index.ts`에는 외부에서 사용하는 화면 진입점만 공개합니다.

### 타입 배치

| 타입의 책임 | 위치 |
| --- | --- |
| 한 컴포넌트의 Props / 표시 상태 | 해당 컴포넌트 파일 |
| 여러 UI 내부 파일이 공유하는 표시 타입 | 해당 `ui/_types/` |
| 공유할 도메인 데이터 / 업무 상태 | 해당 `entities/<도메인>/model/` |
| 화면이나 Feature 전용 업무 모델 | 해당 슬라이스의 `model/` |
| API 요청 / 응답 자료형 | 해당 요청 코드가 있는 `api/` |
| 공통 HTTP 옵션 / 오류 / 라이브러리 타입 | 해당 `shared/api/` 또는 목적별 `shared/lib/` |

- 프로젝트 전체의 `types/`나 하나의 `types.ts`에 업무 타입을 모으지 않습니다.
- 타입이 작거나 구현에서 직접 파생되면 해당 구현 파일에 둡니다. 여러 파일에서 사용하거나 독립적인 계약으로 관리할 필요가 생기면 책임 가까이에 분리합니다.
- 관리자와 주민 화면이 같은 도메인 데이터를 사용하면 같은 도메인 타입을 재사용합니다. 화면 표시용 타입과 API 응답, DB 구조가 항상 같다고 가정하지 않습니다.

### 공유 코드 배치

| 공유 코드의 책임 | 위치 |
| --- | --- |
| 사용자 행동 / 업무 기능 | `features/` |
| 도메인 타입 / 데이터 / 표현 | `entities/` |
| 도메인과 무관한 공통 UI / API Client / 보조 함수 | `shared/` |
| 여러 기능을 조합하는 공통 UI 블록 | `widgets/` |

공유가 필요해지면 실제 책임에 맞는 위치로 옮기고 공개 API를 제공합니다. FSD 레이어의 의존성 방향은 유지합니다.

### 적용 범위

- `_`는 명명 규칙이며 import를 자동 차단하거나 인증정보를 보호하지 않습니다.
- Next.js의 `page.tsx`, `layout.tsx` 등 라우팅 규약 파일은 프레임워크 이름을 유지합니다.

## 8. Control Flow

- 루트의 Control Flow 규칙을 따릅니다.
- 로딩, 오류, 빈 데이터 상태는 Early Return으로 분리해 렌더링의 중첩을 줄입니다.
- JSX 안에서 중첩 삼항 연산자로 여러 상태를 처리하지 않습니다.
- 반복되는 업무 조건은 책임에 맞는 함수나 Hook으로 모읍니다. 작은 UI 보조 함수는 컴포넌트 파일에 둘 수 있고, 분리가 필요하면 `ui/_utils/` 또는 `ui/_hooks/`에 둡니다. 업무 상태 로직은 `model/`에 두며 단순한 조건에 불필요한 Hook을 만들지 않습니다.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
