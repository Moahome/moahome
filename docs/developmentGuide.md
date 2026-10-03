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
DataSource와 Redis는 기존 변수에 연결되어 있고, 카카오 OAuth 연결 설정은 아직 없습니다.
JWT 검증, 웹과 앱의 재발급 / 로그아웃 및 Redis 인증 상태 관리는 구현되어 있습니다. API와 전달 방식은 [JWT 인증 설계](securityDesign.md)를 따릅니다. 실제 카카오 로그인과 Client 인증 연동은 아직 연결되지 않았습니다.

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
| `KAKAO_CLIENT_ID` | 카카오 로그인 연동용 Client ID. 현재 OAuth 설정에는 연결되어 있지 않습니다. |
| `KAKAO_CLIENT_SECRET` | 카카오 로그인 연동용 Secret. 현재 OAuth 설정에는 연결되어 있지 않습니다. |
| `KAKAO_REDIRECT_URI` | 카카오 로그인 연동용 Redirect URI. 현재 OAuth 설정에는 연결되어 있지 않습니다. |
| `JWT_SECRET_BASE64` | Security 실행에 새로 필요한 서명 키. 32바이트 이상의 무작위 값을 Base64로 인코딩하여 준비합니다. |
| `WEB_ALLOWED_ORIGINS` | CORS 허용 웹 Origin의 쉼표 구분 목록. 기본값은 `http://localhost:3000`이며 경로나 와일드카드를 포함하지 않습니다. |

`JWT_SECRET_BASE64`는 기존 `server/.env` 또는 실행 환경에 별도로 추가해야 합니다. 키를 생성할 때는 `openssl rand -base64 32`를 사용할 수 있습니다. 생성한 값은 공유 문서, 코드나 로그에 기록하지 않고 환경 설정에만 보관합니다. 서버 인스턴스들은 같은 환경의 서명 키를 사용해야 합니다.

Refresh 쿠키는 기본적으로 `Secure=true`이고 `local` Profile에서만 HTTP 개발을 위해 `false`로 설정됩니다. 운영 실행에는 `local` 이외의 Profile을 명시하고 HTTPS 및 실제 `WEB_ALLOWED_ORIGINS`를 설정합니다.

Compose는 `server/`에서 실행할 때 기존 `.env`를 변수 치환에 사용합니다.
Spring은 별도로 `local` Profile의 `.env` Import를 통해 같은 파일을 읽습니다.
변수 치환 방식은 [Docker Compose 환경변수 문서](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)를 참고합니다.

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
- 업무 API와 카카오 로그인은 아직 구현되지 않았습니다. 카카오 변수의 로드만으로 OAuth 연동이 활성화되지는 않습니다.

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
- 현재 테스트에는 애플리케이션 Context, JWT / 설정 / Service 단위 테스트와 Security / Redis 통합 테스트가 있습니다.
- `application-test.yml`은 DB / JPA / Flyway 자동 구성을 제외하여 개발 DB를 사용하지 않습니다. 실제 DB / Migration 테스트가 추가되면 별도 테스트 DB 구성이 필요합니다.
- Security 통합 테스트는 `redis-server` 실행 파일로 저장 기능을 끈 일회성 Redis를 임의 포트에서 시작하고 종료합니다. 실행 파일이 PATH에 없다면 `REDIS_SERVER_EXECUTABLE`에 경로를 지정합니다. 개발 Redis를 재사용하지 않습니다.
- 테스트 JWT 키는 실행 시 무작위로 생성하여 주입하며 실제 `server/.env`의 키를 읽지 않습니다.
- Spring Context 테스트에는 `test` Profile을 명시해 로컬 `.env` Import를 제외합니다. 향후 DB 통합 테스트를 추가할 때도 별도 테스트 DB를 명시하고, Security 테스트의 일회성 Redis와 개발 Redis를 구분합니다.
- 업무용 Migration이 추가되면 테스트 DB에 적용되는 스키마 변경도 확인합니다.
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
