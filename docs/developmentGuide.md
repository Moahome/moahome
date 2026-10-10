# 개발 환경 가이드

이 문서는 현재 저장소의 설정과 이미 준비된 환경변수를 기준으로 로컬 실행 및 검증 방법을 설명합니다.
기존 `client/.env`와 `server/.env`의 연결 변수를 사용하며, Security 실행에는 서명 키를 추가로 준비합니다. 실제 값은 이 문서에 기록하지 않습니다.

## 1. 필요한 도구

| 도구 | 기준 |
| --- | --- |
| Node.js | 현재 Next.js 패키지가 요구하는 `20.9.0` 이상. 팀 공통 고정 버전은 아직 지정되지 않았습니다. |
| npm | `client/package-lock.json`을 사용하며 최초 설치는 `npm ci`로 수행합니다. |
| Java | JDK 21. `server/build.gradle`의 Java Toolchain 기준입니다. |
| Gradle | 저장소의 `server/gradlew`를 사용합니다. 별도 전역 설치는 필요하지 않습니다. |
| Docker / Docker Compose | `docker compose` 명령을 사용할 수 있어야 하며 컨테이너 실행 전에 Docker 엔진이 실행 중이어야 합니다. |

도구 확인 명령:

```bash
node --version
npm --version
java -version
docker --version
docker compose version
```

첫 의존성 설치와 Docker 이미지 다운로드에는 네트워크 연결이 필요합니다.

## 2. 현재 설정 파일

아래 경로는 저장소 루트 기준입니다.

| 파일 | 역할 |
| --- | --- |
| `client/.env` | 이미 준비된 Client 환경변수 |
| `server/.env` | 이미 준비된 PostgreSQL, Redis와 카카오 환경변수 |
| `server/docker-compose.yml` | PostgreSQL, Redis와 별도 Swagger UI 컨테이너 구성 |
| `server/src/main/resources/application.yml` | DataSource / Redis 연결과 Spring 공통 설정. 기본 Profile은 `local`, HTTP 포트는 `8080`입니다. |
| `server/src/main/resources/application.properties` | 로컬 OpenAPI 공통 설정. 문서 기본 비활성화, 내장 Swagger UI 제외 |
| `server/src/main/resources/application-local.properties` | `local` Profile의 OpenAPI 활성화와 Swagger Origin 추가 |
| `client/package.json` | Client 개발 서버, lint, 테스트와 빌드 명령 |
| `server/build.gradle` | Java Toolchain, 서버 의존성과 테스트 / 빌드 구성 |

별도 `application-local.yml` 없이 `application.yml`의 `local` Profile 문서에서 기존 `.env`를 읽습니다.
`application.yml`과 두 `application*.properties`는 로컬 설정으로 Git에서 제외합니다. `jwtSecurity.properties`, `propertyRegistration.properties`, `residentSecurity.properties`는 실제 비밀값 없이 환경변수 연결만 정의하는 공통 파일로 추적합니다.
DataSource, Redis와 카카오 OAuth는 환경변수에 연결되어 있습니다.
JWT 검증, 웹과 앱의 재발급 / 로그아웃 및 Redis 인증 상태 관리는 구현되어 있습니다. API와 전달 방식은 [JWT 인증 설계](securityDesign.md)를 따릅니다. 사용자 / 소셜 계정 저장, 웹 카카오 OAuth 시작 / 콜백과 검증된 프로필의 세션 연결은 구현되어 있습니다. Client 로그인 버튼, 콜백의 세션 복원과 Access Token 메모리 보관도 구현되어 있습니다. 최종 서비스 진입 분기와 네이티브 앱의 일회용 코드 교환은 후속 구현 범위입니다.

### Client 환경변수

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_HOST` | Client의 공개 호스트 주소 |
| `NEXT_PUBLIC_API_HOST` | Client에서 접근할 Server API Origin. 로컬은 `http://localhost:8080`이며 경로 / 쿼리 / fragment를 포함하지 않습니다. |
| `NEXT_PUBLIC_SOCKET_HOST` | 향후 소켓 연결에 사용할 공개 주소. 현재 소켓 기능은 구현되지 않았습니다. |

Next.js는 `client/`에서 실행하면 해당 프로젝트의 `.env`를 읽습니다.
`NEXT_PUBLIC_` 변수는 브라우저 코드에 노출되므로 공개 주소에만 사용합니다.
프로덕션 빌드에서 사용하는 공개 변수는 빌드 시점에 반영되므로 변경 후 다시 빌드합니다.
자세한 로딩 방식은 [Next.js 환경변수 문서](https://nextjs.org/docs/app/guides/environment-variables)를 따릅니다.

현재 초기 화면에는 API / 소켓 요청이 없습니다. 변수 준비만으로 해당 기능이 구현되는 것은 아닙니다.

### Server 환경변수

| 변수 | 용도와 현재 사용 위치 |
| --- | --- |
| `POSTGRES_DB` | 로컬 DB 이름. Compose와 Spring DataSource의 DB 이름에 사용합니다. |
| `POSTGRES_USER` | 로컬 DB 사용자. Compose와 Spring DataSource의 사용자에 사용합니다. |
| `POSTGRES_PASSWORD` | 로컬 DB 비밀번호. Compose와 Spring DataSource의 비밀번호에 사용합니다. |
| `POSTGRES_PORT` | 호스트에서 PostgreSQL에 접근할 포트. Compose에서 내부 포트 `5432`에 연결하고 Spring JDBC URL에 사용합니다. |
| `REDIS_HOST` | 호스트에서 실행하는 Server가 접근할 Redis 주소. Spring Redis의 호스트에 사용합니다. |
| `REDIS_PORT` | 호스트에서 Redis에 접근할 포트. Compose에서 내부 포트 `6379`에 연결하고 Spring Redis의 포트에 사용합니다. |
| `KAKAO_CLIENT_ID` | 카카오 앱의 REST API 키. `moahome.kakao.client-id`에 연결하고 OAuth의 `client_id`로 사용합니다. |
| `KAKAO_CLIENT_SECRET` | REST API 키의 Client Secret. `moahome.kakao.client-secret`에 연결하고 Server의 카카오 토큰 교환에 사용합니다. |
| `KAKAO_REDIRECT_URI` | 카카오 인가 결과를 받는 Server 콜백 주소. `moahome.kakao.redirect-uri`에 연결하며 로컬은 `http://localhost:8080/login/oauth2/code/kakao`를 사용합니다. |
| `JWT_ACCESS_SECRET_BASE64` | Access JWT 전용 HS256 서명 키. 독립적으로 생성한 무작위 64바이트의 Base64 값을 사용합니다. 검증 최소 길이는 32바이트입니다. |
| `JWT_REFRESH_SECRET_BASE64` | Refresh JWT 전용 HS256 서명 키. Access 키와 다른 무작위 64바이트의 Base64 값을 사용합니다. 검증 최소 길이는 32바이트입니다. |
| `ACCOUNT_ENCRYPTION_KEY_BASE64` | 관리계좌 AES-256-GCM 암호화 키. 무작위 32바이트의 Base64 값이며 초기 키 ID는 `v1`입니다. |
| `ACCOUNT_HMAC_KEY_BASE64` | 계좌번호 검색 HMAC 키. 암호화 키와 다른 무작위 32바이트의 Base64 값입니다. |
| `REGISTRATION_FINGERPRINT_KEY_BASE64` | 등록 정규화 본문 비교 HMAC 키. 별도로 생성한 무작위 32바이트의 Base64 값이며 초기 버전은 `v1`입니다. |
| `WEB_ALLOWED_ORIGINS` | CORS 허용 웹 Origin의 쉼표 구분 목록. 기본값은 `http://localhost:3000`이며 경로나 와일드카드를 포함하지 않습니다. |
| `WEB_LOGIN_SUCCESS_URI` | `moahome.kakao.web-login-success-uri`에 연결한 Client 로그인 완료 주소. 로컬은 `http://localhost:3000/login/callback`이며 CSRF 조회 / 재발급 후 로그인 완료를 표시합니다. |

`JWT_ACCESS_SECRET_BASE64`와 `JWT_REFRESH_SECRET_BASE64`는 `server/.env` 또는 실행 환경에 각각 설정합니다. 추적되는 `server/src/main/resources/jwtSecurity.properties`가 두 환경변수를 Spring 설정으로 연결하며 실제 키 값은 포함하지 않습니다. 각 키는 `openssl rand -base64 64 | tr -d '\n'`을 별도로 실행해 생성할 수 있으며, Base64 문자열 64글자가 아니라 디코딩한 원본 64바이트를 의미합니다. 출력한 값은 해당 환경 설정에만 보관하고 공유 문서, 코드나 로그에 기록하지 않습니다. 서버 인스턴스들은 같은 환경의 Access 키와 같은 환경의 Refresh 키를 각각 공유합니다.

기존 단일 `JWT_SECRET_BASE64`는 더 이상 읽지 않으며 새 두 변수를 모두 준비한 뒤 서버를 재시작합니다. Access / Refresh 키가 같으면 서버 시작을 거부합니다. 이번 교체에는 이전 키를 허용하는 호환 처리가 없으므로 기존 토큰은 사용할 수 없고 사용자는 다시 로그인해야 합니다. 키 길이 변경만으로 HS256을 HS512로 변경하지 않습니다.

등록 기능의 세 보안 키도 각각 새로 생성해 `server/.env` 또는 실행 환경에 설정합니다. 추적되는 `server/src/main/resources/propertyRegistration.properties`가 환경변수를 Spring 설정으로 연결하며 실제 값은 포함하지 않습니다. 모든 서버 인스턴스에서 같은 키를 사용합니다. 키 교체 시 외부 설정의 `moahome.account-security.active-key-id / encryption-keys`와 `moahome.registration-security.active-key-version / fingerprint-keys`에 신규 키와 기존 키를 함께 유지합니다. 기존 키를 제거하면 이전 계좌 복호화 또는 이전 requestId의 본문 비교를 수행할 수 없습니다.

주민 등록에서 연락처를 입력하려면 아래 키를 외부 설정으로 준비합니다. 로그인·목록·연락처 없는 등록에는 필요하지 않습니다. 키가 없거나 잘못되면 연락처 포함 등록은 `503 PHONE_SECURITY_UNAVAILABLE`로 전체 실패합니다.

| 변수 | 용도 |
| --- | --- |
| `PHONE_ACTIVE_KEY_ID` | 활성 전화번호 암호화 키 ID. 기본 `v1` |
| `PHONE_ENCRYPTION_KEY_BASE64` | 전화번호 AES-256-GCM 암호화용 무작위 32바이트 Base64 키 |
| `PHONE_HMAC_KEY_BASE64` | 전화번호 검색용 별도 무작위 32바이트 Base64 키 |

각 키는 독립적으로 생성하며 계좌·JWT·등록 요청 키를 재사용하지 않습니다. 모든 서버 인스턴스에서 같은 키를 사용합니다. 실제 값은 Git에 저장하지 않습니다. `residentSecurity.properties`는 환경변수 참조만 포함합니다. 키 교체 시 외부 `moahome.phone-security.encryption-keys`에 기존·신규 ID의 키를 함께 유지하고 `active-key-id`를 변경합니다. 기본 환경변수 연결은 `v1`에만 제공하므로 다른 활성 ID에는 해당 ID의 외부 설정도 필요합니다. 기존 암호화 키를 제거하면 이전 번호를 복호화할 수 없습니다. HMAC 키 변경은 중복 조회값의 별도 재생성 절차 없이는 수행하지 않습니다.

전화번호 키는 각각 `openssl rand -base64 32 | tr -d '\n'`으로 생성합니다. 두 값 모두 현재 구현에서 디코딩 후 정확히 32바이트로 검증하며 JWT의 64바이트 키 생성 명령을 사용하지 않습니다. AES-256 암호화 키를 64바이트로 늘리면 사용할 수 없습니다. `.env`를 수정한 뒤에는 서버를 재시작합니다. 기존 연락처가 저장된 환경에서는 키 값을 단순 교체하지 않고 위의 교체 절차를 따릅니다.

Refresh 쿠키는 기본적으로 `Secure=true`이고 `local` Profile에서만 HTTP 개발을 위해 `false`로 설정됩니다. `local` Profile은 기존 `WEB_ALLOWED_ORIGINS`를 유지하며 Swagger UI의 `http://localhost:4000`을 추가합니다. 운영 실행에는 `local` 이외의 Profile을 명시하고 HTTPS 및 실제 `WEB_ALLOWED_ORIGINS`를 설정합니다.

Compose는 `server/`에서 실행할 때 기존 `.env`를 변수 치환에 사용합니다.
Spring은 별도로 `local` Profile의 `.env` Import를 통해 같은 파일을 읽습니다.
변수 치환 방식은 [Docker Compose 환경변수 문서](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)를 참고합니다.

### 카카오 로그인 설정

카카오 로그인은 Server가 Authorization Code 교환과 사용자 검증을 처리하고 PKCE S256을 함께 적용합니다. 상세 흐름과 검증 책임은 [JWT 인증 설계](securityDesign.md)의 카카오 로그인 절을 따릅니다. `application.yml`의 OAuth 설정, Server 로그인 시작 / 콜백과 Client 로그인 버튼 / 콜백 화면은 구현되어 있습니다. Client 콜백은 현재 로그인 완료까지 표시하며 관리대상별 진입 분기는 후속 연결 범위입니다.

공개 주소의 로컬 예시는 다음과 같습니다. 실제 키 / Secret은 기존 환경 설정으로 주입하고 문서에 기록하지 않습니다.

```dotenv
KAKAO_REDIRECT_URI=http://localhost:8080/login/oauth2/code/kakao
WEB_ALLOWED_ORIGINS=http://localhost:3000
WEB_LOGIN_SUCCESS_URI=http://localhost:3000/login/callback
```

- `KAKAO_CLIENT_ID`에는 REST API 키를 사용합니다. 중복된 `KAKAO_REST_API_KEY`는 사용하지 않으며 로컬 `.env`도 `KAKAO_CLIENT_ID`로 통일합니다. 다른 환경에 기존 중복 변수가 남아 있으면 배포 설정도 같은 기준으로 정리합니다.
- 카카오디벨로퍼스에서 카카오 로그인 사용을 활성화하고, 사용하는 REST API 키의 리다이렉트 URI에 `KAKAO_REDIRECT_URI`와 정확히 같은 주소를 등록합니다. 토큰 교환에서도 인가 요청에 사용한 동일한 URI를 전달합니다. [카카오 로그인 설정 문서](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)를 참고합니다.
- 해당 REST API 키의 Client Secret을 활성화하고 `KAKAO_CLIENT_SECRET`에 설정합니다. 토큰 요청의 `client_secret`으로 Server에서만 전달합니다. 키와 Secret이 같은 카카오 앱 / REST API 키의 설정인지 확인합니다.
- 동의항목은 기존 User 생성에 필요한 닉네임을 받을 수 있게 설정합니다. 이메일 / 프로필 이미지는 선택 정보이며, 로그인 식별자는 카카오 사용자 ID입니다. 전화번호 동의를 로그인 필수 항목으로 추가하지 않습니다.
- `KAKAO_REDIRECT_URI`는 카카오 → Server 주소, `WEB_LOGIN_SUCCESS_URI`는 Server → Client 주소입니다. 카카오 리다이렉트 URI에 Client 로그인 완료 주소를 대신 등록하지 않습니다.
- Client 버튼은 `NEXT_PUBLIC_API_HOST`를 기준으로 Server의 로그인 시작 경로 `/oauth2/authorization/kakao`로 브라우저를 이동시킵니다. 카카오 Secret과 토큰을 `NEXT_PUBLIC_` 변수에 추가하지 않습니다.
- 성공 주소의 Origin은 `WEB_ALLOWED_ORIGINS`에 포함되어야 합니다. 실패 이동은 같은 Origin의 `/login`을 사용하며 별도 실패 주소 환경변수는 추가하지 않습니다. 운영 URI / Origin은 실제 배포 주소로 주입하고 웹과 API에 HTTPS 및 동일 사이트 구성을 사용합니다.
- state와 PKCE verifier는 Server가 로그인마다 생성하고 Redis에 5분 TTL로 저장합니다. 브라우저 연결용 `moahome-oauth-{state}` 쿠키도 5분 동안 사용합니다. 환경변수로 고정하지 않으며 카카오 토큰과 모아홈 토큰을 이동 URL에 넣지 않습니다.

Server 시작 시 카카오 Client ID / Secret과 두 이동 주소가 필요합니다. 주소의 자격정보 / 쿼리 / fragment, 잘못된 Server 콜백 경로와 허용되지 않은 Client Origin을 거부합니다. 운영은 HTTPS만 허용하고 로컬 HTTP는 `localhost`만 사용합니다. Client 연동 후에는 카카오디벨로퍼스 설정, Refresh 쿠키 설정, Client의 CSRF 조회 / 재발급과 실제 카카오 PKCE 검증까지 확인합니다. 현재 모의 카카오 응답 기반 서버 테스트가 실제 카카오 로그인 성공을 의미하지는 않습니다.

## 3. PostgreSQL / Redis 실행

저장소 루트에서 실행합니다.

```bash
cd server
docker compose up -d postgres redis
docker compose ps
```

- 현재 Compose 이미지는 `postgres:17`, `redis:8`입니다.
- 두 서비스의 Healthcheck가 정상 상태인지 확인합니다.
- Server는 Docker 밖의 호스트에서 실행하는 것을 기준으로 합니다.
- PostgreSQL 접속은 `localhost`와 `POSTGRES_PORT`를 사용합니다.
- Redis는 `REDIS_HOST`와 `REDIS_PORT`가 호스트에서 접근 가능한 주소 / 포트여야 합니다.
- PostgreSQL과 Redis 데이터는 Compose의 Named Volume에 저장됩니다.

서비스를 중지할 때는 `server/`에서 실행합니다.

```bash
docker compose stop postgres redis
```

## 4. Server 실행

기본 Profile인 `local`에서는 `application.yml`의 `spring.config.import`가 기존 `server/.env`를 읽습니다.
확장자가 없는 설정 파일의 Import 방식은 [Spring Boot 외부 설정 문서](https://docs.spring.io/spring-boot/reference/features/external-config.html#importing-extensionless-files)를 참고합니다.

저장소 루트에서 다음 명령으로 실행합니다.

```bash
cd server
./gradlew bootRun
```

- `source`나 `SPRING_*` 변수로 다시 매핑할 필요 없이 YAML의 `${POSTGRES_*}`, `${REDIS_*}`가 준비된 값을 읽습니다.
- `.env`는 Java Properties의 `KEY=VALUE` 형식으로 읽습니다. 현재 파일처럼 값을 따옴표로 감싸지 않고 작성합니다. 따옴표는 값의 일부가 되고 백슬래시는 Properties 이스케이프 규칙을 따릅니다.
- `.env`가 없더라도 Import 자체는 오류를 내지 않지만, 필요한 연결 변수는 실행 환경에서 제공해야 합니다.
- 다른 Profile을 명시하면 로컬 `.env`를 읽지 않습니다. 해당 환경에서 DB / Redis 변수를 주입하거나 `SPRING_DATASOURCE_*`, `SPRING_DATA_REDIS_*`로 연결 정보를 덮어씁니다.
- JPA의 `ddl-auto`는 `validate`이고 스키마 변경은 Flyway가 담당합니다. Redis 연결 / 읽기 Timeout은 각각 `3s`입니다.
- 기본 HTTP 주소는 `http://localhost:8080`입니다.
- `local` Profile의 API 문서 주소와 인증 호출 방법은 [README의 로컬 API 문서](../README.md#로컬-api-문서)를 따릅니다. Swagger UI는 `docker compose up -d swagger-ui`로 별도 실행하며 `http://localhost:4000`에서 `8080`의 OpenAPI를 읽습니다. `tools` Profile의 서비스이므로 전체 기본 Compose 실행에는 포함하지 않고 명시적으로 실행합니다. 다른 Spring Profile에서는 OpenAPI를 기본 비활성화합니다.
- IDE에서도 Working Directory를 `server/`로 지정합니다. 다른 디렉터리에서는 상대 경로 `.env`를 찾지 못합니다.
- 웹 카카오 로그인 시작은 `GET /oauth2/authorization/kakao`, 콜백은 `GET /login/oauth2/code/kakao`입니다. Server 설정과 카카오디벨로퍼스 등록 주소를 일치시킵니다. Client는 `/login/callback`에서 세션을 복원합니다. [관리대상 등록 API](propertyRegistrationApi.md)의 기본 정보 검증 / 최종 저장 / 결과 조회를 구현했으며 등록 화면 연결은 후속 범위입니다.

서버 프로세스는 `Ctrl+C`로 종료합니다.

## 5. Client 실행

별도 터미널에서 저장소 루트 기준으로 실행합니다.

```bash
cd client
npm ci
npm run dev
```

- 기본 개발 서버 주소는 `http://localhost:3000`입니다.
- API 연동 기능을 구현할 때 `NEXT_PUBLIC_API_HOST`가 실행 중인 Server 주소를 가리키는지 확인합니다.
- Client 환경변수를 변경하면 개발 서버를 다시 실행합니다.
- 서버 프로세스는 `Ctrl+C`로 종료합니다.

### 화면 구조와 내부 / 공유 코드

화면 레이어의 이름은 `screens/`로 정합니다. Next.js 라우팅은 `src/app/`, 실제 화면 구성은 `src/screens/`에서 담당합니다.

코드는 역할과 사용 범위로 구분합니다. 화면 전용 UI와 로직은 먼저 해당 화면 슬라이스에 둡니다. 컴포넌트와 표시 상태 / 스타일은 `ui/`, 업무 모델은 `model/`, API 요청과 요청 / 응답 타입은 `api/`에서 관리합니다. 작은 Props, 화면 상태 타입과 보조 함수는 컴포넌트 파일에 함께 둘 수 있습니다. 복잡도나 실제 공유 범위로 분리가 필요해지면 UI 내부의 `_components/`, `_types/`, `_utils/`, `_hooks/`, `_constants/` 중 필요한 폴더만 만듭니다. `_`는 UI 내부 보조 폴더에만 붙이며 역할별 폴더와 파일명, 함수 / 타입 이름에는 붙이지 않습니다.

공유하거나 독립적으로 관리할 책임이 분명해진 코드는 `features/`, `entities/`, `shared/`, `widgets/` 중 적절한 레이어로 분리하고 공개 API를 통해 사용합니다. 모든 컴포넌트와 타입을 전역 폴더에 모으거나 아직 구현하지 않은 도메인의 폴더를 미리 만들지 않습니다. 같은 레이어의 다른 슬라이스 참조와 상위 레이어 참조, 슬라이스 공개 API 우회는 ESLint로 검사합니다. 구체적인 기준은 [Client 규칙](../client/AGENTS.md)을 따릅니다.

현재 랜딩, 로그인, 로그인 콜백 화면은 각각 `src/screens/<화면>/ui/`에 배치합니다. 랜딩의 헤더, 로고, 제품 미리보기와 등장 효과는 컴포넌트 옆의 CSS Modules를 사용하며 화면 CSS는 화면 배치와 섹션 스타일을 담당합니다. 로그인 콜백의 표시 상태 타입과 오류 안내 함수는 `loginCallbackPage.tsx`에서 함께 관리합니다.

### Server / Client Component 선택

컴포넌트 작성 시 처리 책임을 보고 실행 환경을 판단합니다. 화면 조합 / 서버 데이터 조회는 Server Component를 기본으로 하고, 상태 / Effect / 이벤트 핸들러 / 브라우저 API가 필요한 부분에는 `"use client"`를 선언합니다. `page.tsx`의 라우팅 연결과 `metadata` 처리는 가능한 Server Component로 유지합니다. 자세한 작성 기준은 [Client Component 규칙](../client/AGENTS.md#5-component-rules)을 따릅니다.

현재 로그인 화면의 역할은 다음과 같습니다.

| 컴포넌트 | 구분 | 처리 책임 |
| --- | --- | --- |
| `login/page.tsx` | Server | URL의 오류 코드 조회, metadata와 화면 연결 |
| `LoginPage` | Server | 로그인 화면 구성 |
| `KakaoLoginButton` | Client | 클릭 이벤트와 브라우저 이동 |
| `LoginCallbackPage` | Client | 세션 복원과 로딩 / 오류 / 완료 상태 |

화면에 상태나 이벤트 처리가 추가되면 해당 컴포넌트의 Client 전환 또는 하위 컴포넌트 분리를 판단합니다. 하위 컴포넌트가 Client라는 이유로 상위 페이지 전체를 Client로 전환하지 않습니다.

## 6. 테스트 / 빌드

필수 검증 기준은 각 영역의 `AGENTS.md`에서 관리합니다. 아래는 실행 명령입니다.

### Client

`client/`에서 실행합니다.

```bash
npm run lint
npx --no-install tsc --noEmit
npm run build
npx playwright install chromium
npm test
```

Playwright로 공통 API / 세션 복원 / 업무 API 인증 테스트와 로그인 화면 통합 테스트를 실행합니다. `npm run test:api`는 브라우저 없이 API / 세션 복원 / 업무 API 인증을 검증하고, `npm run test:e2e`는 화면 통합 테스트만 실행합니다. 설치된 Chrome을 사용하면 `PLAYWRIGHT_CHANNEL=chrome npm test`로 실행할 수 있습니다.

통합 테스트 서버는 포트 3100과 `.next-test/` 결과를 사용합니다. 테스트는 인증 서버 응답을 모의 처리하며 실제 카카오 / 개발 DB / Redis를 호출하지 않습니다. lint, 타입 검사와 빌드 통과를 단위 테스트 통과로 보고하지 않습니다. 기본 빌드가 실행 환경 제한으로 실패했을 때 대체 검증 명령은 `npm run build -- --webpack`이며 검증 보고에 webpack 방식을 명시합니다.

빌드한 Client를 실행할 때는 같은 디렉터리에서 실행합니다.

```bash
npm run start
```

### Server

`server/`에서 실행합니다.

```bash
./gradlew test
./gradlew build
```

- `build`에는 `test`가 포함됩니다.
- 현재 테스트에는 애플리케이션 Context, JWT / 설정 / Entity / Service / 전화번호·계좌번호 보안 단위 테스트, 등록 Controller 검증, Security / Redis 통합 테스트와 User / 소셜 계정 / 관리대상 등록 PostgreSQL 통합 테스트가 있습니다.
- OpenAPI 통합 테스트는 JSON / YAML 접근, 구현된 API의 인증과 응답 계약, 문서 쓰기 차단과 Swagger Origin의 CORS를 확인합니다. local 설정의 기존 Origin 유지와 4000 포트 추가도 검증합니다. Security 통합 테스트는 다른 Profile의 Swagger Origin 차단과 문서 비활성화 시 인증된 사용자에게도 문서가 제공되지 않는지 확인합니다.
- `application-test.yml`은 DB / JPA / Flyway 자동 구성을 제외하여 개발 DB를 사용하지 않습니다. `database-test` Profile의 PostgreSQL 통합 테스트는 별도의 임시 클러스터에 Flyway를 적용하고 JPA 매핑을 검증합니다.
- Security 통합 테스트는 `redis-server` 실행 파일로 저장 기능을 끈 일회성 Redis를 임의 포트에서 시작하고 종료합니다. 실행 파일이 PATH에 없다면 `REDIS_SERVER_EXECUTABLE`에 경로를 지정합니다. 개발 Redis를 재사용하지 않습니다.
- PostgreSQL 통합 테스트는 PATH의 `initdb`와 `postgres` 실행 파일로 임시 디렉터리 / 임의 포트의 로컬 전용 DB를 실행하고 종료합니다. PATH에 없다면 `POSTGRES_INITDB_EXECUTABLE`과 `POSTGRES_SERVER_EXECUTABLE`에 같은 PostgreSQL 설치의 실행 파일 경로를 지정합니다. Compose의 개발 DB를 재사용하지 않습니다. PostgreSQL 17 이상을 사용합니다.
- 테스트 JWT / 전화번호·계좌번호 암호화 / HMAC / 등록 지문 키는 실행 시 무작위로 생성하며 실제 `server/.env`의 키를 읽지 않습니다. Context 테스트는 전화번호 키 없이 서버가 시작되는 것도 확인합니다.
- Spring Context 테스트에는 `test` Profile을 명시해 로컬 `.env` Import를 제외합니다. DB 통합 테스트는 `database-test` Profile에서 격리된 테스트 DB를 명시하고, Security 테스트의 일회성 Redis와 개발 Redis를 구분합니다.
- User / 소셜 계정 통합 테스트는 빈 DB의 전체 Migration 적용, 기존 스키마에서 후속 Migration 적용과 계정 / 소셜 연결 보존, 유일성 / 상태 무결성 제약, 탈퇴 후 재가입, 동시 가입과 실패 시 롤백을 확인합니다.
- 카카오 OAuth 통합 테스트는 모의 카카오 HTTP 응답과 일회성 Redis로 PKCE 전달, 브라우저 연결 / state 검증, 만료 / 중복 소비, 취소 / 제공자 오류 / 저장소 장애, Refresh 쿠키와 기존 CSRF / 재발급 연결을 확인합니다. `test` Profile의 카카오 설정은 개발 `.env`를 사용하지 않으며 Client Secret은 무작위로 생성합니다. 실제 카카오 / Client 화면 연동은 별도 확인합니다.
- `-x test`로 제외한 빌드를 전체 검증 완료로 기록하지 않습니다.

## 7. 실행 중 확인할 문제

| 증상 | 확인할 내용 |
| --- | --- |
| Docker 엔진 연결 오류 | Docker 엔진 실행 여부와 `docker compose version` 지원 여부 |
| 컨테이너 포트 충돌 | `.env`의 `POSTGRES_PORT`, `REDIS_PORT`와 기존 프로세스의 사용 포트 |
| DataSource 설정 오류 | Working Directory가 `server/`인지, `local` Profile에서 `.env`를 읽었는지, 다른 Profile에 필요한 변수를 주입했는지 |
| DB 연결 / 인증 실패 | 컨테이너 Healthcheck, 포트와 기존 PostgreSQL Volume의 사용자 / DB 설정 |
| Redis 연결 실패 | 호스트에서 접근 가능한 `REDIS_HOST`, `REDIS_PORT`인지 |
| 주민 등록·엑셀 업로드의 `PHONE_SECURITY_UNAVAILABLE` | 연락처 키 두 개가 각각 Base64 디코딩 후 32바이트인지, 서로 다른지와 설정 변경 후 서버를 재시작했는지 |
| Client가 이전 API 주소 사용 | 환경변수 변경 후 개발 서버를 재시작하거나 프로덕션 빌드를 다시 했는지 |
| Google Fonts 다운로드 실패 | 현재 `next/font/google`의 Geist 폰트를 다운로드할 네트워크 연결이 가능한지 |
| Turbopack의 포트 생성 권한 오류 | 실행 환경 권한을 확인하고 필요하면 `npm run build -- --webpack`으로 별도 빌드 검증 |

webpack으로 검증한 경우 기본 Turbopack 빌드 결과와 구분해 기록합니다.
로그나 공유 문서에 실제 비밀번호, 카카오 Secret 또는 `.env` 전체 내용을 붙이지 않습니다.

## 8. 관련 문서

- [프로젝트 개요](projectOverview.md): 목적, 서비스 구성과 MVP 범위
- [도메인 규칙](domainRules.md): 용어, 업무 기준과 미정 정책
- [루트 AGENTS.md](../AGENTS.md): 공통 작업 및 Git 규칙
- [Client AGENTS.md](../client/AGENTS.md): FSD, UI와 검증 기준
- [Server AGENTS.md](../server/AGENTS.md): Java / Spring / JPA, Redis와 Migration 규칙
