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
| `server/docker-compose.yml` | PostgreSQL과 Redis 컨테이너 구성 |
| `server/src/main/resources/application.yml` | DataSource / Redis 연결과 Spring 공통 설정. 기본 Profile은 `local`, HTTP 포트는 `8080`입니다. |
| `client/package.json` | Client 개발 서버, lint와 빌드 명령 |
| `server/build.gradle` | Java Toolchain, 서버 의존성과 테스트 / 빌드 구성 |

별도 `application-local.yml` 없이 `application.yml`의 `local` Profile 문서에서 기존 `.env`를 읽습니다.
DataSource, Redis와 카카오 OAuth는 환경변수에 연결되어 있습니다.
JWT 검증, 웹과 앱의 재발급 / 로그아웃 및 Redis 인증 상태 관리는 구현되어 있습니다. API와 전달 방식은 [JWT 인증 설계](securityDesign.md)를 따릅니다. 사용자 / 소셜 계정 저장, 웹 카카오 OAuth 시작 / 콜백과 검증된 프로필의 세션 연결은 구현되어 있습니다. Client 인증 연동과 네이티브 앱의 일회용 코드 교환은 아직 구현되지 않았습니다.

### Client 환경변수

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_HOST` | Client의 공개 호스트 주소 |
| `NEXT_PUBLIC_API_HOST` | Client에서 접근할 Server API 주소 |
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
| `JWT_SECRET_BASE64` | Security 실행에 새로 필요한 서명 키. 32바이트 이상의 무작위 값을 Base64로 인코딩하여 준비합니다. |
| `WEB_ALLOWED_ORIGINS` | CORS 허용 웹 Origin의 쉼표 구분 목록. 기본값은 `http://localhost:3000`이며 경로나 와일드카드를 포함하지 않습니다. |
| `WEB_LOGIN_SUCCESS_URI` | `moahome.kakao.web-login-success-uri`에 연결한 Client 로그인 완료 주소. 로컬은 `http://localhost:3000/login/callback`이며 Client 콜백 화면은 후속 구현입니다. |

`JWT_SECRET_BASE64`는 기존 `server/.env` 또는 실행 환경에 별도로 추가해야 합니다. 키를 생성할 때는 `openssl rand -base64 32`를 사용할 수 있습니다. 생성한 값은 공유 문서, 코드나 로그에 기록하지 않고 환경 설정에만 보관합니다. 서버 인스턴스들은 같은 환경의 서명 키를 사용해야 합니다.

현재 `users`에는 전화번호를 저장하지 않으므로 전화번호 암호화 / HMAC 환경변수를 사용하지 않습니다. 공통 `PhoneSecurity`와 키 설정 자료형은 유지하며, Bean 등록과 외부 키 설정은 주민 명부 / 가입 요청의 연락처 저장을 구현할 때 연결합니다. 현재 로그인 서버 실행에는 전화번호 키가 필요하지 않습니다.

Refresh 쿠키는 기본적으로 `Secure=true`이고 `local` Profile에서만 HTTP 개발을 위해 `false`로 설정됩니다. 운영 실행에는 `local` 이외의 Profile을 명시하고 HTTPS 및 실제 `WEB_ALLOWED_ORIGINS`를 설정합니다.

Compose는 `server/`에서 실행할 때 기존 `.env`를 변수 치환에 사용합니다.
Spring은 별도로 `local` Profile의 `.env` Import를 통해 같은 파일을 읽습니다.
변수 치환 방식은 [Docker Compose 환경변수 문서](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)를 참고합니다.

### 카카오 로그인 설정

카카오 로그인은 Server가 Authorization Code 교환과 사용자 검증을 처리하고 PKCE S256을 함께 적용합니다. 상세 흐름과 검증 책임은 [JWT 인증 설계](securityDesign.md)의 카카오 로그인 절을 따릅니다. `application.yml`의 OAuth 설정과 Server 로그인 시작 / 콜백은 구현되어 있습니다. Client 로그인 버튼 / 콜백 화면은 후속 구현입니다.

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
- 후속 Client 버튼은 `NEXT_PUBLIC_API_HOST`를 기준으로 Server의 로그인 시작 경로 `/oauth2/authorization/kakao`로 브라우저를 이동시킵니다. 카카오 Secret과 토큰을 `NEXT_PUBLIC_` 변수에 추가하지 않습니다.
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
- IDE에서도 Working Directory를 `server/`로 지정합니다. 다른 디렉터리에서는 상대 경로 `.env`를 찾지 못합니다.
- 웹 카카오 로그인 시작은 `GET /oauth2/authorization/kakao`, 콜백은 `GET /login/oauth2/code/kakao`입니다. Server 설정과 카카오디벨로퍼스 등록 주소를 일치시킵니다. Client 콜백 화면과 업무 API는 아직 구현되지 않았습니다.

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

## 6. 테스트 / 빌드

필수 검증 기준은 각 영역의 `AGENTS.md`에서 관리합니다. 아래는 실행 명령입니다.

### Client

`client/`에서 실행합니다.

```bash
npm run lint
npx --no-install tsc --noEmit
npm run build
```

현재 단위 / 컴포넌트 테스트 러너와 `test` 스크립트는 없습니다.
lint, 타입 검사와 빌드 통과를 단위 테스트 통과로 보고하지 않습니다.

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
- 현재 테스트에는 애플리케이션 Context, JWT / 설정 / Entity / Service / 공통 전화번호 보안 단위 테스트, Security / Redis 통합 테스트와 User / 소셜 계정 PostgreSQL 통합 테스트가 있습니다.
- `application-test.yml`은 DB / JPA / Flyway 자동 구성을 제외하여 개발 DB를 사용하지 않습니다. `database-test` Profile의 PostgreSQL 통합 테스트는 별도의 임시 클러스터에 Flyway를 적용하고 JPA 매핑을 검증합니다.
- Security 통합 테스트는 `redis-server` 실행 파일로 저장 기능을 끈 일회성 Redis를 임의 포트에서 시작하고 종료합니다. 실행 파일이 PATH에 없다면 `REDIS_SERVER_EXECUTABLE`에 경로를 지정합니다. 개발 Redis를 재사용하지 않습니다.
- PostgreSQL 통합 테스트는 PATH의 `initdb`와 `postgres` 실행 파일로 임시 디렉터리 / 임의 포트의 로컬 전용 DB를 실행하고 종료합니다. PATH에 없다면 `POSTGRES_INITDB_EXECUTABLE`과 `POSTGRES_SERVER_EXECUTABLE`에 같은 PostgreSQL 설치의 실행 파일 경로를 지정합니다. Compose의 개발 DB를 재사용하지 않습니다. PostgreSQL 17 이상을 사용합니다.
- 테스트 JWT 키와 공통 전화번호 보안 단위 테스트의 암호화 / HMAC 키는 실행 시 무작위로 생성하며 실제 `server/.env`의 키를 읽지 않습니다. Context 테스트는 전화번호 키 없이 서버가 시작되는 것도 확인합니다.
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
