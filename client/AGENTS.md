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

### 화면 그룹과 화면 슬라이스

- 상위 업무 메뉴 아래에 하위 화면이 있으면 `screens/<업무 그룹>/<화면 슬라이스>/`로 배치합니다. 메뉴의 상위·하위 관계가 있는 화면을 `screens/` 바로 아래에 평탄하게 나열하지 않습니다.
- 세대 관리의 그룹명은 `household`, 세대 목록의 화면 슬라이스명은 `unit-list`입니다. 세대 목록의 기준 경로는 `screens/household/unit-list/`이며 `screens/unit-list/`로 두지 않습니다.
- 업무 그룹은 화면을 묶는 디렉터리입니다. 그룹에 `ui/`, `model/`, `api/`나 통합 `index.ts`를 두지 않습니다. 각 화면 슬라이스가 필요한 세그먼트와 자기 `index.ts`를 소유합니다.
- 같은 업무 그룹의 서로 다른 화면도 별도 슬라이스입니다. 형제 화면의 내부 코드나 공개 API를 직접 참조하지 않으며, 실제 공유 코드는 하위 레이어에 둡니다.
- 단독 화면에는 불필요한 업무 그룹을 만들지 않습니다. 아직 없는 하위 메뉴·화면의 빈 폴더도 미리 만들지 않습니다.
- URL 경로와 화면 그룹명은 서로 다른 책임입니다. 화면 폴더 정리만을 이유로 기존 `/manage/[propertyId]/households` URL을 변경하지 않습니다.

```text
src/screens/
├── household/                       # 세대 관리: 업무 그룹
│   └── unit-list/                   # 세대 목록: 화면 슬라이스
│       ├── index.ts                 # 이 화면의 공개 API
│       ├── api/
│       ├── model/
│       └── ui/
│           ├── unitListPage.tsx
│           └── unitListPage.module.css
└── login-callback/                  # 단독 화면 슬라이스
    ├── index.ts
    └── ui/
        ├── loginCallbackPage.tsx
        └── loginCallbackPage.module.css
```

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

기본 채움 버튼은 2026-10-18 사용자 지정에 따라 연한 파랑 배경 `#EFF6FF`, Primary 글자 `#2563EB`, 테두리 `#BFDBFE`를 사용합니다. 지정한 배경·테두리는 `globals.css`의 `--button-primary-background`, `--button-primary-border`로 관리하고, 설명은 Sub Text `#64748B`를 사용합니다. 삭제·완료 같은 의미 색상의 채움 버튼도 해당 색을 연한 배경과 섞고 글자는 의미 색상을 유지합니다. 엑셀 버튼의 흰 배경·초록색 규칙과 카카오 공식 버튼 색상은 유지합니다. 버튼 이외의 상태·그래프·아이콘 색상을 이 규칙으로 일괄 변경하지 않습니다. 해당 화면의 입력·드롭다운·날짜 선택 배경은 후속 사용자 정정대로 Card를 유지합니다.

기존 공통 UI 컴포넌트가 있으면 우선 재사용합니다.

- 요약 카드의 설명용 도움말 아이콘(ⓘ)은 제목 글씨 바로 왼쪽에 둡니다(`ⓘ 입금 합계`). 제목 뒤에 배치하지 않습니다. 도움말 아이콘의 위치 변경을 큰 장식 아이콘 이동으로 해석하지 않으며, 큰 장식 아이콘은 기존 왼쪽 배치를 유지합니다. `shared/ui/summary-card`의 공통 표현을 사용합니다.

- 일반 클릭 버튼은 `shared/ui/button`의 Button, 입력과 선택은 `shared/ui/form-controls`의 Input / Dropdown / Radio를 우선 사용합니다. 화면에는 업무 처리와 배치만 두고 색상·포커스·비활성 표현을 중복 구현하지 않습니다.
- Dropdown의 placeholder는 미선택 표시이며 실제 옵션에 추가하지 않습니다. 옵션은 고유한 값으로 관리합니다.
- Dropdown / SelectDropdown에 선택 해제용 X 버튼을 표시하지 않습니다. 공통 컴포넌트의 `clearable` 기본값은 `false`로 유지하고 화면에서 `true`로 켜지 않습니다. 필터 해제는 `전체` 옵션 또는 사용자가 요청한 별도 초기화 버튼으로 처리합니다.
- 날짜·월 선택은 `shared/ui/calendar-picker`의 CalendarPicker로 통일합니다. 월 선택은 MonthPicker(공통 달력의 month 모드)를 재사용하고, 입금일 등 날짜 선택은 date 모드를 사용합니다. 브라우저 기본 `input type="month"` / `input type="date"`로 대체하지 않습니다.
- 엑셀 파일 업로드는 기존 주민 업로드에서 공유한 `shared/ui/file-dropzone`의 드래그 앤 드롭·파일 선택 UI를 사용합니다. 파일 형식·업무 검증은 각 화면에서 처리합니다.
- 엑셀 관련 행동(다운로드·업로드·파일 선택·양식 다운로드)은 흰 배경·초록색 글자·테두리와 Excel 아이콘으로 고정합니다. 버튼은 공통 `Button`의 `variant="outline"`, `tone="excel"`과 `ServiceIcon(name="excel")`을 사용하며 녹색 배경을 채우거나 기본 파란색 버튼을 사용하지 않습니다. 다운로드 링크도 같은 표현을 따릅니다. 배경은 `--card`, 글자·테두리·아이콘은 기존 `--excel-background` 토큰을 사용하고 호버는 공통 outline 표현을 따릅니다.
- 공통 달력은 입력 버튼을 기준으로 열고 본문·모달 경계를 침범하지 않게 위치를 제한합니다. 열린 상태의 반응형 표시도 확인합니다.
- 드롭다운(선택 목록·메뉴)과 아코디언은 반드시 열림·닫힘 애니메이션을 적용합니다. 펼침 화살표도 열 때 180도 회전하고 닫을 때 원래 방향으로 돌아오는 애니메이션을 적용하며 기본 전환 시간은 180ms로 맞춥니다. 닫기 애니메이션이 끝나기 전에 내용을 제거하거나 `display: none` / `hidden`으로 즉시 숨기지 않습니다. 닫힌 내용은 키보드 탐색·보조기술에서 제외하고, `prefers-reduced-motion: reduce`에서는 애니메이션을 생략해 상태를 즉시 전환합니다.

### 화면 동작의 기준

- 입금 관리 목록은 기존 DataTable의 행 클릭으로 상세를 열고 중복 확인·보기·상세 버튼 열을 추가하지 않습니다. 세대 후보·처리·납부 상태는 의미 색상의 뱃지를 사용합니다. 검색창은 필터 줄의 남는 폭을 채우며 임의의 최대 폭으로 빈 공간을 만들지 않습니다.
- 거래·수납·지출·월별 수납 상세는 PC 중앙 ClientModal, 모바일 독립 상세 경로를 사용합니다. 저장 전 거래 설정도 공통 ClientModal로 처리합니다. 통장 업로드 파일 선택·미리보기는 목록과 분리한 `/banking/upload` 페이지에서 처리하며 해당 페이지에 목록의 업로드 버튼을 반복하지 않습니다. [통장 관리 화면](docs/bankingManagement.md)을 따릅니다.
- 월별 수납 상세는 요약·계산 내역·수납 정보·안내로 구분하며 상태 색상과 핵심 금액은 [수납 상세 표시 규칙](docs/paymentManagement.md#월별-수납-상세-표시-규칙)을 따릅니다. 미납은 Danger, 일부납부는 Warning, 납부완료는 Success, 정산 확인 필요는 Sub Text로 표시합니다. 수납 반영액이 있다는 이유로 미납 상태의 강조색을 초록으로 바꾸지 않습니다.
- 모달 닫기는 우측 상단의 X 아이콘 버튼과 접근 가능한 닫기 이름으로 제공합니다. Dropdown의 선택 해제 X 금지와 구분합니다. 푸터의 확인·취소 등 행동 버튼은 오른쪽 정렬하고 버튼 사이 간격을 둡니다.

- 목록·업무 페이지는 기존 `shared/ui/list-header`의 ListHeader를 본문 맨 위에 배치합니다. 왼쪽에는 메뉴명·페이지 제목·설명, 오른쪽에는 사용자가 요청한 주요 작업 버튼을 둡니다. 조회 월·검색·필터는 제목 아래에 배치하며 제목 위에 별도 도구 헤더를 만들지 않습니다.
- 입금 확인·월별 수납 현황의 목록 상태 필터는 `shared/ui/filter-tabs`의 FilterTabs를 재사용합니다. 목록 상단에서 선택 글자·밑줄만 강조하고 검색·월·표시 개수 줄과 분리합니다. 화면 전환용 탭과 달리 같은 목록을 필터링하므로 접근성은 버튼 그룹·선택 상태로 제공합니다.
- 편집·수정·삭제 등 사용자 행동은 사용자가 정한 흐름과 해당 화면 설계를 따릅니다. 명칭이 비슷하다는 이유로 역할을 재정의하거나, API·공유 컴포넌트에 기능이 있다는 이유로 버튼을 추가하지 않습니다.
- 기존 화면을 재사용할 때는 입력·검증·모달과 현재 화면의 동작 구성을 구분합니다. 다른 화면의 모든 버튼을 함께 복사하지 않습니다.
- 같은 삭제 동작을 행 버튼·관리 열·편집 도구에 중복 노출하지 않습니다. 화면별 진입점과 적용 범위는 해당 Client 설계 문서에 기록합니다. 세대 목록은 [세대 목록 설계](docs/unitList.md#3-상세수정삭제의-역할)를 따릅니다.

### 모바일 상세페이지 절대 규칙

- 설정 첫 화면 같은 최상위 메뉴에는 상세 페이지용 뒤로가기를 임의로 추가하지 않습니다. `/settings/accounts` 같은 하위 관리 페이지의 뒤로가기는 해당 상위 설정으로 연결합니다.
- 모든 모바일 상세페이지는 공통 헤더 왼쪽에 `<` 뒤로가기를 반드시 표시합니다. 뒤로가기는 같은 관리대상의 해당 목록으로 연결하며 직접 접근·새로고침에서도 동작해야 합니다.
- 모바일 상세 본문·푸터에는 `목록`, `목록으로`, `주민 목록`, `세대 목록으로` 등 목록 복귀 버튼을 두지 않습니다. 로딩·오류·대상 없음 상태에도 동일하게 적용하며 헤더 뒤로가기로 복귀합니다.
- 수정·삭제·확정 등 업무 행동은 유지합니다. PC 모달의 닫기·X·Escape 동작과 모바일 헤더 뒤로가기는 서로 다른 책임입니다. 개별 화면 문서에 남은 이전 목록 버튼 기준보다 이 규칙을 우선 적용합니다.

### TypeScript / JSX / CSS 작성 형식

- 들여쓰기는 공백 2칸을 사용합니다.
- JavaScript / TypeScript 문자열은 작은따옴표를 사용하고 문자열 안의 따옴표 이스케이프를 줄일 때만 큰따옴표를 허용합니다. 세미콜론은 강제하지 않습니다.
- JSX 문자열 속성도 `label={'이름'}`처럼 중괄호를 사용하고, 일반 텍스트 자식에는 불필요한 중괄호를 사용하지 않습니다.
- 이름이 두 개 이상인 Import는 여러 줄로 작성하고, 객체와 Export의 속성은 각각 줄을 나눕니다. 미사용 Import와 변수는 경고로 확인하고 의도적으로 사용하지 않는 변수 / 매개변수는 `_`로 시작합니다.
- 구조 분해 매개변수와 인라인 객체 타입을 함께 선언할 때는 매개변수와 타입을 각각 여러 줄로 작성합니다. 중첩 객체 타입도 속성별로 줄을 나눕니다.
- JSX 속성이 하나라도 있으면 태그명, 각 속성, 여는 태그의 닫는 괄호를 각각 별도 줄로 작성합니다. 속성 수나 전체 길이에 관계없이 한 줄에 하나의 속성만 작성합니다. 자식과 닫는 태그도 별도 줄로 작성하며 속성이 없는 단일 셀프 클로징 요소만 한 줄로 허용합니다.
- 선언문과 반환문 사이에는 빈 줄을 둡니다. `npm run lint`의 JSX 줄바꿈 / 속성 개수 / 들여쓰기 규칙으로 위 형식을 검사합니다.
- 사용자 지정 서식 / 미사용 코드 규칙은 경고로, FSD 경계와 기존 정확성 검사는 오류로 유지합니다. `npm run lint:fix`로 자동 수정할 수 있는 서식을 적용합니다.
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
- 건물 유형·동 구분처럼 도메인에 속한 고정 옵션은 해당 `entities/<도메인>/constants/`에 옵션 상수 파일로 모으고 공개 API로 사용합니다. 도메인과 무관한 옵션 자료형은 `shared/lib/options`에서 공유합니다. 모든 도메인의 옵션을 하나의 전역 constants 파일에 모으지 않습니다.
- 여러 화면에서 공유하거나 독립적으로 관리할 필요가 있는 큰 UI 블록은 `widgets`로 분리합니다. Header나 Table이라는 이름만으로 Widget으로 분류하지 않습니다.
- 프로젝트 전체의 `components/`에 모든 컴포넌트를 모으지 않습니다. 화면 / 기능 / 도메인별 책임 가까이에 둡니다.
- 동일한 UI를 중복 구현하지 않습니다.

### 아이콘과 이미지 관리

- 일반 UI 아이콘의 SVG 모양은 `shared/ui/service-icon`에서 한 번만 정의하고, 모든 화면·기능·공통 입력에서 공개 API의 `ServiceIcon`과 `ServiceIconName`을 사용합니다. 화면별 아이콘 컴포넌트나 동일한 SVG path를 다시 만들지 않습니다.
- 새 아이콘은 공통 정의에 같은 의미의 아이콘이 있는지 먼저 확인합니다. `people`·`units`처럼 같은 사람 아이콘을 화면별 별칭으로 중복 정의하지 않습니다. chevron은 하나의 모양과 `direction`으로 방향을 지정하고, 색상·크기·호버·펼침 애니메이션은 사용하는 UI에서 관리합니다.
- 로고·은행 로고·고정 이미지 자산은 `public/`에서 파일로 관리합니다. 화면 전용 일러스트와 장식 그림은 해당 화면·기능 가까이에 두며 일반 UI 아이콘에 섞지 않습니다.

### 공통 모달과 처리 알림

- 공통 `Toast`는 웹·모바일 모두 화면 하단의 가로 중앙에 표시합니다. 웹은 아래에서 32px, 모바일은 16px와 안전 영역 중 큰 여백을 적용하며 페이지 본문·사이드바의 너비나 스크롤 위치에 따라 가로 중심이 달라지지 않도록 합니다. 위쪽 위치는 auto로 초기화하고 높이는 내용에 맞춰 짧은 가로형으로 유지합니다. 짧은 성공 문구는 한 줄로 표시하며 위·아래 좌표 때문에 세로로 늘어나는 표시를 허용하지 않습니다.
- 일반 모달은 `shared/ui/client-modal`의 `ClientModal`로 열기·닫기·초기 포커스·포커스 복귀·스크롤 잠금을 재사용합니다. 모달 내용, 저장 요청과 업무별 오류는 호출자가 관리합니다. 저장 중에는 `busy`로 Escape 닫기를 막고 닫기 버튼도 비활성화합니다.
- 일반 모달은 뷰포트의 가로·세로 중앙에 배치합니다. 네이티브 dialog에는 `margin: auto`를 명시하고 최대 높이와 내부 스크롤을 적용합니다. 모바일 독립 상세 페이지는 일반 모달과 구분하며 해당 화면의 경로와 목록 복귀 규칙을 따릅니다.
- 삭제·삭제 확인의 텍스트 버튼은 공통 `Button`의 `variant="outline"`, `tone="danger"`로 흰색 Card 배경·빨간 Danger 글씨와 테두리를 사용합니다. 빨간 배경을 채우지 않습니다. 쓰레기통 등 삭제 아이콘 버튼은 기존 투명 배경·빨간 아이콘 표현을 유지합니다.
- 짧은 업무 처리 성공은 `shared/ui/toast`의 `Toast`를 사용하고 전역 토큰의 진한 초록색 배경·흰 글씨를 적용합니다. 본문에 성공 문구를 계속 남기지 않습니다. 필드별 입력 오류와 수정·재시도가 필요한 폼·모달의 저장 실패는 해당 입력·폼에 유지하며, 파일 업로드·엑셀 일괄 등록의 요청 실패는 다음 규칙을 따릅니다.
- 파일 업로드의 형식·헤더·크기 검증 실패와 엑셀 일괄 등록 요청 실패는 공통 `Toast`의 오류 알림(`tone="error"`)으로 표시하고 본문에 오류 문구를 계속 남기지 않습니다. 재시도에 필요한 검증 결과·선택 상태는 유지하며 같은 오류가 반복되면 토스트 표시 시간을 다시 시작합니다. 필드별 입력 오류와 검증 표의 행별 오류 사유는 해당 입력·행에서 확인하도록 유지합니다.

### 컴포넌트 폴더 구조

- 슬라이스의 진입 UI가 하나면 TSX와 해당 CSS Modules를 `ui/` 바로 아래에 둡니다. `ui/unitListPage.tsx`와 `ui/unitListPage.module.css`처럼 작성하며 같은 이름의 중간 폴더를 만들지 않습니다. 이 기준은 `screens`, `widgets`, `features`, `entities`에 동일하게 적용합니다.
- 같은 슬라이스에 진입 UI가 둘 이상 생기면 각각 `kebab-case` 폴더로 묶고 TSX와 CSS Modules를 함께 옮깁니다. 단일 진입 파일과 여러 진입 폴더를 혼합하지 않습니다. `resident-list`는 목록과 엑셀 다운로드 페이지가 있으므로 `ui/resident-list-page/`, `ui/resident-export-page/`로 구분합니다.
- 진입 UI의 수는 외부에서 조합하는 페이지·컴포넌트 기준입니다. CSS, Hook이나 내부 보조 컴포넌트가 늘었다는 이유로 단일 진입 UI에 중간 폴더를 추가하지 않습니다. `residentExportPreview`처럼 여러 진입 UI가 공유하는 보조 컴포넌트는 `ui/_components/`에 둡니다.
- 내부 보조 컴포넌트는 `_components/<컴포넌트>/`에 TSX와 CSS Modules를 함께 둡니다. `shared/ui`의 공통 UI는 모듈별 폴더와 공개 API를 유지하며, 여러 컴포넌트를 묶는 `form-controls`는 `form-field/`, `input/`, `dropdown/`처럼 구분합니다. 스타일이 없는 컴포넌트에는 빈 CSS 파일을 만들지 않습니다.
- 슬라이스와 공통 모듈의 `index.ts`는 기존 루트에 두고 외부에서 사용하는 공개 API만 내보냅니다. 파일을 이동할 때 같은 슬라이스 내부의 상대 경로와 공개 API의 재노출 경로도 함께 맞춥니다.
- `features/property-registration`은 Dialog, Flow, 초안 수명 관리의 세 진입 UI가 있으므로 각각의 폴더를 유지합니다. `features/kakao-login`, `features/logout`처럼 진입 UI가 하나인 기능은 `ui/`에 바로 둡니다.
- `app`의 `page.tsx`, `layout.tsx`, `not-found.tsx` 등 프레임워크 파일은 라우팅이 요구하는 위치와 이름을 유지합니다.

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
- 업무 그룹 아래 화면은 최종 화면 슬라이스의 공개 API를 사용합니다. 세대 목록의 외부 Import는 `@/screens/household/unit-list`이며, `@/screens/household`나 `@/screens/household/unit-list/ui/...`로 우회하지 않습니다.
- `shared/api`, `shared/ui/brand-mark`처럼 공통 모듈별 공개 API를 사용합니다. `shared` 전체를 하나의 `index.ts`로 모으지 않습니다.
- `npm run lint`의 `architecture/import-boundaries` 규칙으로 상위 레이어 참조, 같은 레이어의 다른 슬라이스 참조와 슬라이스 공개 API 우회를 검사합니다. 별칭과 상대 경로, 문자열 리터럴을 사용하는 동적 Import와 재노출에도 적용합니다. 검사기는 업무 그룹과 최종 화면 슬라이스를 구분해야 하며 같은 그룹의 형제 화면도 다른 슬라이스로 검사해야 합니다.

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
- `ui/`는 컴포넌트와 표시 상태 / 스타일, `model/`은 업무 모델과 검증·정규화·상태 처리, `api/`는 서버 요청과 응답 검증, `lib/`는 표시 문자열 생성 등 보조 함수를 담당합니다. 타입 선언은 책임에 맞는 각 폴더의 `*Types.ts`에 분리하며 실제 필요한 역할별 폴더만 만듭니다.
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

- 단일 진입 UI의 TSX와 CSS Modules는 `ui/`에 함께 두고 내부 보조 폴더도 `ui/_components/`, `ui/_hooks/`처럼 둡니다. 여러 진입 UI가 있으면 특정 UI만 사용하는 보조 폴더는 `ui/<진입 UI>/` 안에 둘 수 있습니다. 같은 슬라이스의 여러 UI가 공유하는 보조 폴더는 `ui/` 아래에 두며 화면 슬라이스 루트로 분리하지 않습니다.
- `ui/_components/`의 내부 컴포넌트는 컴포넌트별 `kebab-case` 폴더로 묶습니다. 예를 들어 `start-card/startCard.tsx`와 `start-card/startCard.module.css`를 함께 둡니다.
- 해당 컴포넌트에서만 쓰는 보조 UI는 같은 컴포넌트 폴더에 두고, 여러 내부 컴포넌트가 공유하는 UI는 별도의 컴포넌트 폴더로 관리합니다.
- UI에 한정된 예외로 한 컴포넌트의 Props, 작은 표시 상태 타입과 보조 함수는 해당 컴포넌트 파일에 함께 둘 수 있습니다. `app/`의 라우트 Props도 해당 TSX에 둘 수 있습니다. 업무 모델이나 API 계약 타입에는 이 예외를 적용하지 않습니다.
- 여러 내부 파일에서 공유하거나 복잡해져 읽기 어려워진 보조 코드는 필요한 `_types/`, `_utils/` 등으로 분리합니다. 내부 폴더는 선택 사항이며 파일 하나를 위해 반드시 만들지 않습니다.
- 업무 타입은 `model/*Types.ts`, 검증·정규화·상태 처리는 `model/`의 실행 코드 파일에 분리합니다. API 계약은 `api/*ApiTypes.ts`, 호출과 응답 검증은 `api/*Api.ts`에 둡니다. 보조 함수의 자료형은 해당 `lib/`의 `*Types.ts`에 둡니다. `model/_types/`, `model/_utils/`, `lib/_utils/` 같은 추가 폴더를 만들지 않습니다.
- 파일명은 `camelCase`, 타입 / 컴포넌트 이름은 `PascalCase` 등 기존 명명 규칙을 따릅니다. `_`는 폴더 이름에만 붙입니다.
- 다른 화면이나 슬라이스에서 내부 폴더의 코드를 직접 가져오거나 공개 API로 재노출하지 않습니다.
- 기존 공용 타입과 함수를 먼저 확인하고, 같은 내용을 내부 폴더에 중복 정의하지 않습니다.

```text
src/screens/login-callback/
├── index.ts
└── ui/
    ├── loginCallbackPage.tsx
    └── loginCallbackPage.module.css
```

`index.ts`에는 외부에서 사용하는 화면 진입점만 공개합니다.
위 화면의 표시 상태 타입과 오류 안내 함수는 `loginCallbackPage.tsx`에서 함께 관리합니다.

### 타입 배치

| 타입의 책임 | 위치 |
| --- | --- |
| 한 컴포넌트의 Props / 표시 상태 | 해당 컴포넌트 파일 |
| 여러 UI 내부 파일이 공유하는 표시 타입 | 해당 `ui/_types/` |
| 공유할 도메인 데이터 / 업무 상태 | 해당 `entities/<도메인>/model/*Types.ts` |
| 화면이나 Feature 전용 업무 모델 타입 | 해당 슬라이스의 `model/*Types.ts` |
| API 요청 / 응답 자료형 | 해당 요청 코드 옆의 `api/*ApiTypes.ts` |
| 공통 HTTP 옵션 / 오류 자료형 | `shared/api/*Types.ts` |
| 라이브러리 / 보조 함수의 자료형 | 해당 `lib/` 모듈의 `*Types.ts` |
| 고정 옵션의 메타데이터 / 파생 타입 | 해당 `constants/*Types.ts` |

- 프로젝트 전체의 `types/`나 하나의 `types.ts`에 업무 타입을 모으지 않습니다.
- `type`과 `interface`는 같은 업무의 타입 전용 파일에 함께 둘 수 있습니다. 키워드별 폴더나 별도 전역 `types/` 폴더를 만들지 않습니다.
- `*Types.ts`에는 타입 선언, `import type`, `export type`만 둡니다. 함수·상수·클래스 등 실행 코드는 두지 않습니다. 상수에서 파생하는 타입은 `import type`과 `typeof`로 원래 상수를 참조해 값 목록을 복사하지 않습니다.
- 타입 전용 파일로 옮긴 선언은 실행 코드에서 `import type`으로 가져옵니다. 슬라이스 외부에는 기존 `index.ts`에서 `export type`으로 공개하고 내부 경로를 직접 참조하지 않습니다.
- API 함수의 객체 형태 요청 매개변수와 응답 자료형도 타입 전용 파일에서 이름을 정의해 사용합니다. 타입을 나누기 위해 실제 JSON 본문이나 선택 입력 정책을 바꾸지 않습니다.
- 함수라는 이유로 모두 `lib/`에 옮기지 않습니다. 동 이름의 길이·중복 검사처럼 업무 규칙을 검사하는 함수는 `model/`, 호수·층수 표시 문자열 생성처럼 표현을 보조하는 함수는 해당 슬라이스의 `lib/`에 둡니다.
- ESLint의 `architecture/type-files`가 UI 외부의 타입 선언 위치, 타입 전용 파일의 실행 코드와 일반 import, API 실행 파일의 인라인 객체 타입을 검사합니다. 작은 UI Props / 표시 상태 타입과 공개 `index.ts`의 타입 재노출은 허용합니다.
- 관리자와 주민 화면이 같은 도메인 데이터를 사용하면 같은 도메인 타입을 재사용합니다. 화면 표시용 타입과 API 응답, DB 구조가 항상 같다고 가정하지 않습니다.

```text
entities/property/
├── model/
│   ├── unitFormTypes.ts  # BuildingDraft, UnitForm 등 타입 선언
│   └── unitForm.ts       # 입력 검증과 정규화
├── lib/
│   └── unitLabel.ts      # 호수·층수 표시 문자열
└── index.ts              # 실행 코드 export와 export type 구분

features/resident-management/api/
├── residentRegistrationApiTypes.ts  # 요청·응답 타입
└── residentRegistrationApi.ts       # 호출과 응답 검증
```

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
npm test
```

- 구현 변경 후 위 ESLint, TypeScript 타입 검사, 프로덕션 빌드를 수행합니다.
- Playwright로 구조 경계 / 공통 API / 세션 복원 / 업무 API 인증 테스트와 로그인 / 기본 정보 등록 화면 통합 테스트를 실행합니다. 최초 브라우저 준비는 `npx playwright install chromium`을 사용합니다.
- `npm run test:api`는 브라우저 없이 구조 경계 / API / 세션 복원 / 업무 API 인증과 관리비 금액·월말 계산 단위 테스트를 실행하고, `npm run test:e2e`는 로그인 / 초기 설정 / 관리 화면과 관리비 탭·조회 / 저장 API 연결 통합 테스트를 실행합니다. 설치된 Chrome을 사용하려면 `PLAYWRIGHT_CHANNEL=chrome npm test`로 실행합니다.
- 통합 테스트 서버는 포트 `3100`과 `.next-test/`를 사용합니다. 테스트는 인증 / 등록 응답과 주소 검색 SDK를 모의 처리하며 실제 카카오, 개발 서버 DB나 Redis를 호출하지 않습니다.
- ESLint, 타입 검사와 빌드 결과를 단위 테스트 통과로 보고하지 않습니다. 기본 빌드가 실행 환경 제한으로 실패해 대체 빌드를 검증한 경우 명령과 빌드 방식을 함께 기록합니다.
- 업무 로직을 구현할 때 필요한 테스트 환경과 실행 스크립트를 함께 추가하고, 실제 명령을 이 문서에 갱신합니다.
- 금액 / 상태 계산은 단위 테스트로, 사용자 상호작용과 로딩 / 오류 / 빈 상태는 컴포넌트 테스트로 검증합니다.
- 로그인, 관리비 부과, 수납 확정 등 핵심 흐름은 해당 기능이 구현되는 시점에 필요한 통합 / E2E 테스트를 추가합니다.
- UI 변경은 개발 서버(`npm run dev`)에서 영향받는 화면과 반응형 표시도 확인합니다.
- 구조 변경 전에는 메뉴 계층 → 업무 그룹 → 최종 화면 슬라이스 → 공개 API → 진입 UI 수에 따른 배치를 대조합니다. 단일 진입 UI의 `ui/` 직접 배치, 복수 진입 UI의 폴더 구분, TSX/CSS의 같은 위치, 형제 화면 참조 금지와 기존 모달 재사용도 함께 확인합니다.
- 화면 동작은 해당 Client 설계의 일반 / 편집 상태와 대조합니다. 선택 삭제가 있는 화면에 행 삭제를 임의로 더하지 않았는지 확인합니다.
- ESLint의 `architecture/import-boundaries`는 `SCREEN_GROUPS`에 등록한 업무 그룹 아래 최종 화면을 별도 슬라이스로 검사합니다. `architecture/ui-folders`는 단일 진입 UI의 `ui/` 직접 배치를 허용하고 `_components/` 바로 아래의 TSX는 차단합니다. `tests/architecture.spec.ts`는 실제 슬라이스의 단일·복수 진입 UI 배치와 TSX/CSS의 같은 위치도 확인합니다. 그룹을 추가할 때 그룹 설정과 경계 테스트도 함께 맞춥니다.
- 스냅샷이나 구현 내부를 그대로 따라가는 테스트보다 사용자에게 보이는 결과와 업무 규칙을 검증합니다.
- 문서만 변경한 경우 루트 Verification 규칙을 따릅니다.

## 10. General Rules

- 문서 배치는 [공통 Project Structure 규칙](../AGENTS.md#1-project-structure)을 따릅니다. Client 전용 등록 화면 / 초안 설계는 [docs/propertyRegistration.md](docs/propertyRegistration.md)에서 관리하고 공통 API 계약을 참조합니다.
- 기존 구조를 먼저 확인한 후 새 Slice를 만듭니다.
- 단순한 기능을 불필요하게 여러 레이어로 분리하지 않습니다.
- 공통화가 필요하지 않은 코드를 미리 `shared`로 이동하지 않습니다.
- 현재 작업과 관계없는 화면이나 컴포넌트를 임의로 수정하지 않습니다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
