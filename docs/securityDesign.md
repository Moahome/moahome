# JWT 인증 설계

이 문서는 Server Security의 카카오 로그인, 토큰 수명, 웹과 앱의 전달 방식, Redis 인증 상태와 로그아웃 정책을 정의합니다. JWT 검증, Redis 로그인 세션, 웹·앱 재발급 / 로그아웃 API와 CSRF / CORS 설정은 구현되어 있습니다. 사용자 / 소셜 계정 저장과 서버가 검증한 소셜 프로필을 기존 세션으로 연결하는 내부 Service도 구현되어 있습니다. 웹 카카오 로그인은 백엔드 중심 Authorization Code + PKCE S256 방식으로 OAuth 시작 / 콜백과 기존 JWT 세션 발급까지 구현되어 있습니다. Client 로그인 버튼, 콜백 화면, 공통 세션 복원과 Access Token 메모리 보관도 구현되어 있습니다. 최종 서비스 진입 분기, 전역 세션 초기화 / 업무 API의 만료 재시도와 네이티브 앱의 일회용 코드 교환은 후속 구현 범위입니다.

## 1. 인증 기준

| 항목 | 기준 |
| --- | --- |
| 로그인 | Server가 처리하는 카카오 OAuth Authorization Code + PKCE S256 |
| 서비스 인증 | Server가 발급하는 Access / Refresh JWT |
| Access Token 수명 | 발급 시점부터 1시간 |
| Refresh Token 수명 | 최초 로그인 시점부터 14일 |
| 재발급 | Access / Refresh Token을 함께 교체하는 Rotation |
| 동시 로그인 | 허용. 로그인 세션별로 독립 관리 |
| 로그아웃 | 현재 로그인 세션만 무효화하고 Access Token도 즉시 차단 |
| 인증 상태 | Redis에서 로그인 세션별로 관리 |
| API 접근 | 기본적으로 인증 필요. 로그인·재발급 등 명시한 인증 경로는 별도 검증 적용 |

카카오 토큰과 모아홈 서비스 토큰은 구분합니다. 카카오 로그인 성공을 관리대상 가입 승인으로 간주하지 않으며, 관리대상별 소속과 업무 권한은 [도메인 규칙](domainRules.md)에 따라 Server에서 검증합니다.

## 2. 토큰 검증과 재발급

- Access Token과 Refresh Token에 사용자 식별자 `sub`, 로그인 세션 식별자 `sid`, 토큰 식별자 `jti`, 발급·만료 시각, 발급자와 대상 정보를 포함합니다.
- 토큰 종류를 명시적으로 구분합니다. Refresh Token으로 업무 API를 호출하거나 Access Token으로 재발급할 수 없습니다.
- 허용한 서명 알고리즘, 서명, 발급자, 대상, 종류와 만료를 검증합니다. 서명 키는 환경 설정으로 주입하며 Client에 제공하지 않습니다.
- 개인정보와 관리대상별 권한 목록을 JWT에 넣지 않습니다. 권한은 업무 처리 시 현재 소속과 권한을 기준으로 검사합니다.
- Access Token 만료 시 유효한 Refresh Token으로 두 토큰을 재발급합니다. 기존 Refresh Token은 즉시 사용할 수 없게 합니다.
- 교체된 Refresh Token도 최초 로그인 시점의 14일 만료를 유지합니다. 사용이나 재발급만으로 로그인 유지기간을 연장하지 않습니다.
- Access Token은 1시간을 기본으로 하되 해당 로그인 세션의 절대 만료시각을 넘지 않도록 합니다. 14일이 지나면 카카오 로그인이 다시 필요합니다.
- Redis에서 현재 Refresh Token 해시 비교와 교체를 원자적으로 처리합니다. 로그아웃과 재발급이 동시에 발생해도 삭제된 세션을 재생성하지 않습니다.
- 서명과 만료가 유효하지만 이미 교체된 Refresh Token이 재사용되면 해당 세션 전체를 무효화합니다. 다른 로그인 세션은 유지합니다.
- Client는 동일 세션의 재발급 요청을 직렬화합니다. 웹은 여러 탭도 조율해 이전 Refresh Token의 동시 사용을 방지합니다. 재발급 응답 유실로 새 토큰을 확보하지 못하면 다시 로그인합니다.
- Access Token 만료를 나타내는 `401`에서만 재발급하고 원래 요청을 한 번 재시도합니다. 다른 `401`, 재발급 실패나 `403`에는 자동 재발급을 반복하지 않습니다.

## 3. 웹 토큰 전달

| 토큰 | 전달 | 보관 |
| --- | --- | --- |
| Access Token | HTTPS JSON 응답 → API 요청의 `Authorization: Bearer <token>` | 브라우저 메모리 |
| Refresh Token | Server의 `Set-Cookie` → 인증 경로에 브라우저가 자동 전송 | HttpOnly 쿠키 |

- Access Token은 `localStorage`, `sessionStorage`나 영속 상태 저장소에 저장하지 않습니다. 새로고침 후에는 Refresh 쿠키로 Access Token을 다시 발급받습니다.
- Refresh Token은 웹 JSON 응답이나 JavaScript에 노출하지 않습니다.
- Refresh 쿠키 이름은 `moahome-refresh`, Path는 `/api/auth/web`, 속성은 `HttpOnly`, `Secure`, `SameSite=Lax`로 정합니다. Domain을 지정하지 않아 API 호스트에만 적용합니다.
- 쿠키 Max-Age는 최초 로그인 후 14일까지 남은 시간이며, Rotation으로 연장하지 않습니다. 삭제할 때도 같은 이름과 Path를 사용합니다.
- 운영 웹과 API는 HTTPS와 동일 사이트의 도메인 구성을 기준으로 합니다. 로컬 HTTP 개발에서만 `Secure=false`를 허용하며 `localhost`와 `127.0.0.1`을 혼용하지 않습니다.
- 쿠키를 사용하는 요청에는 `credentials: include`를 사용합니다. 토큰 응답은 `Cache-Control: no-store`로 캐시하지 않습니다.
- 로그인 성공 시 Refresh 쿠키를 설정하고 Client로 이동합니다. Client가 재발급 API에서 Access Token을 받아 서비스를 시작합니다. 리다이렉트 URL에 서비스 토큰을 넣지 않습니다.

## 4. 앱 토큰 전달

- 네이티브 앱은 로그인 교환과 재발급의 HTTPS JSON 응답으로 두 토큰을 받습니다. 업무 API에는 Access Token을 Bearer 헤더로 전달합니다.
- Access Token은 메모리에, Refresh Token은 iOS Keychain 또는 Android Keystore로 보호하는 암호화 저장소에 보관합니다. Android Keystore에는 암호화 키를 보관하며 토큰을 키 저장소에 직접 저장하는 것으로 간주하지 않습니다.
- 앱 재발급 요청은 JSON 본문으로 Refresh Token을 전달합니다. 웹 쿠키 인증과 앱 JSON 인증 경로를 분리하고, 요청 값만으로 서로의 검증을 우회할 수 없게 합니다.
- 앱을 다시 실행하면 저장된 Refresh Token으로 Access Token을 받습니다. Rotation 응답을 받으면 보안 저장소의 Refresh Token도 교체합니다.
- 카카오 로그인은 외부 브라우저를 사용합니다. 앱으로 복귀하는 URL에 Access / Refresh Token을 넣지 않고, 60초 동안 유효한 일회용 교환 코드를 전달합니다.
- 앱 복귀 주소는 등록된 App Link / Universal Link를 사용합니다. 교환 코드는 로그인 시도의 앱 복귀 주소와 PKCE S256 challenge에 연결하고, 앱이 제출한 verifier를 검증한 뒤 원자적으로 한 번만 소비합니다.

## 5. Redis와 현재 기기 로그아웃

로그인할 때마다 무작위 `sid`를 생성하고 `auth:session:{sid}`로 관리합니다. 사용자 ID 하나를 Key로 사용해 다른 기기의 토큰을 덮어쓰지 않습니다. 현재 기기는 하드웨어 식별자가 아니라 해당 브라우저 프로필 또는 앱 설치의 로그인 세션을 의미합니다. 같은 브라우저 프로필의 탭은 하나의 Refresh 쿠키를 공유합니다.

- 세션에는 사용자 ID, Client 종류, 현재 Refresh Token의 해시, 최초 로그인 시각, 절대 만료시각과 웹 CSRF 검증 정보를 저장합니다. Refresh Token 원문을 저장하지 않습니다.
- Redis TTL은 최초 로그인 후 14일까지 남은 시간입니다. 재발급 시에도 절대 만료시각을 유지합니다.
- 모든 인증된 API 요청에서 JWT 검증 후 Redis의 `sid`와 사용자 일치를 확인합니다. 삭제되거나 만료된 세션은 Access Token의 JWT 만료 전에도 거부합니다.
- 로그아웃은 검증된 토큰의 `sid`만 삭제합니다. Client가 임의로 제출한 사용자 ID나 다른 `sid`로 삭제 대상을 결정하지 않습니다.
- Access Token이 만료되어도 웹은 유효한 Refresh 쿠키와 CSRF 검증, 앱은 유효한 Refresh Token 검증으로 현재 세션을 로그아웃할 수 있습니다.
- 세션 삭제가 성공하면 이후 인증 요청부터 Access / Refresh Token 모두 사용할 수 없습니다. 이미 인증을 통과해 처리 중인 요청을 소급 취소하지는 않습니다.
- 웹은 Refresh 쿠키와 메모리 토큰을 지우고, 앱은 보안 저장소와 메모리 토큰을 지웁니다. 서버 로그아웃 요청이 실패하면 무효화 성공으로 표시하지 않습니다.
- 다른 세션과 카카오 자체 로그인 상태는 유지합니다. 서비스 로그아웃으로 카카오 연결 해제나 사용자 탈퇴를 처리하지 않습니다.
- Redis 장애 시 JWT 서명만으로 접근을 허용하지 않습니다. 인증 상태 확인 실패는 `503`으로 처리하고 Client가 이를 로그인 만료로 오인해 토큰을 지우지 않게 합니다.

## 6. 웹 CORS와 CSRF

- CORS는 환경별 웹 Origin을 정확한 허용 목록으로 관리합니다. 로컬 기본값은 `http://localhost:3000`이며 운영 주소는 배포 시 설정합니다.
- 쿠키 요청을 위해 credentials를 허용하고 Origin 와일드카드는 사용하지 않습니다. 허용한 Origin의 사전 요청은 인증 없이 처리하되 업무 요청 자체의 인증을 생략하지 않습니다.
- 쿠키로 인증하는 웹 재발급·로그아웃 요청은 POST와 CSRF 토큰 헤더 `X-CSRF-TOKEN` 검증을 사용합니다. Origin도 허용 목록과 비교합니다. CORS나 SameSite만으로 CSRF 검증을 대신하지 않습니다.
- 웹은 유효한 Refresh 쿠키로 `/api/auth/web/csrf`에서 CSRF 토큰을 JSON으로 받아 메모리에 보관합니다. 응답은 캐시하지 않고, 허용한 웹 Origin에서만 읽을 수 있게 합니다. CSRF 토큰은 해당 Redis 세션에 연결합니다.
- 업무 API는 쿠키를 인증 수단으로 사용하지 않고 Bearer 헤더만 허용합니다. 앱의 Refresh JSON 경로도 쿠키 인증을 받지 않습니다. CSRF 예외는 이렇게 자동 쿠키 인증이 없는 경로에 한정합니다.
- OAuth 로그인 시도는 만료가 있는 일회용 `state`를 Redis에서 관리하고 시작한 브라우저 또는 앱 시도와 연결하여 콜백에서 검증합니다. JWT 사용을 이유로 CSRF 보호를 전역 비활성화하지 않습니다.

## 7. 현재 API와 연동 범위

| API | 인증과 요청 | 응답 |
| --- | --- | --- |
| `GET /api/auth/web/csrf` | 웹 Refresh 쿠키 | `csrfToken` JSON |
| `POST /api/auth/web/refresh` | 웹 Refresh 쿠키, 허용 Origin, `X-CSRF-TOKEN` 헤더 | Access Token JSON과 교체된 Refresh 쿠키 |
| `POST /api/auth/web/logout` | 웹 Refresh 쿠키, 허용 Origin, `X-CSRF-TOKEN` 헤더 | `204`, Refresh 쿠키 삭제 |
| `POST /api/auth/app/refresh` | JSON의 `refreshToken`, 앱 세션 검증 | 두 토큰과 만료시각 JSON |
| `POST /api/auth/app/logout` | JSON의 `refreshToken`, 앱 세션 검증 | `204` |

웹 Access 응답에는 `accessToken`, `tokenType`, `accessExpiresAt`이 있습니다. 앱 재발급 응답에는 추가로 `refreshToken`, `refreshExpiresAt`이 있습니다. 인증 오류 응답은 `code`, `message` 구조이며, Access 만료는 `401 / ACCESS_TOKEN_EXPIRED`, 세션 만료는 `401 / SESSION_EXPIRED`, 토큰 재사용은 `401 / REFRESH_TOKEN_REUSED`, 권한 부족은 `403 / ACCESS_DENIED`, CSRF 실패는 `403 / CSRF_INVALID`, Redis 장애는 `503 / AUTH_SERVICE_UNAVAILABLE`로 구분합니다.

카카오 로그인 콜백은 서버가 검증한 프로필로 `SocialLoginService.loginVerified()`를 호출합니다. 내부 `SocialAccountService`가 제공자와 제공자 사용자 ID로 사용자를 조회 / 생성하고 DB 트랜잭션을 커밋한 뒤, 검증된 사용자 ID로 `AuthService.startSession()`을 호출합니다. 사용자 ID를 직접 받아 토큰을 발급하는 공개 API는 제공하지 않습니다. 웹 OAuth 시작 / 콜백, Refresh 쿠키 설정 후 Client 이동과 Client의 CSRF 조회 / 재발급은 구현되어 있으며 경로는 8절을 따릅니다. 앱 교환 코드와 최종 서비스 진입 분기는 후속 구현 범위입니다. 관리대상별 권한은 토큰에 전역 역할을 넣는 방식으로 대신하지 않고 해당 업무 Service에서 검사합니다.

서명은 HS256을 사용하며 32바이트 이상의 무작위 키를 Base64로 인코딩해 `JWT_SECRET_BASE64`로 주입해야 합니다. 누락·잘못된 인코딩·짧은 키는 서버 시작 시 거부합니다. 운영 Origin과 로컬 실행 설정은 [개발 환경 가이드](developmentGuide.md)를 따릅니다.

## 8. 카카오 로그인 설계와 구현 범위

아래 Server 로그인 시작 / 콜백과 로그인 결과 처리, Client 버튼 / 콜백의 세션 복원은 구현되어 있습니다. 최종 서비스 진입 분기와 네이티브 앱의 일회용 코드 교환은 후속 구현 범위입니다. 실제 카카오 로그인에는 카카오디벨로퍼스 설정과 Server / Client 실행 환경의 연결 확인이 필요합니다.

### 처리 책임과 웹 로그인 흐름

Client는 로그인 버튼에서 Server의 로그인 시작 주소로 브라우저를 이동시킵니다. Server는 로그인 시도 생성, 카카오 인가 요청, 콜백 검증, 토큰 교환, 사용자 조회와 모아홈 세션 발급을 담당합니다. 카카오 Client Secret과 카카오 토큰은 Client에 전달하지 않습니다.

| 구분 | 경로 / 설정 | 역할 |
| --- | --- | --- |
| Server 로그인 시작 | `GET /oauth2/authorization/kakao` | 로그인 시도를 생성하고 카카오 인증 화면으로 브라우저를 이동 |
| Server 카카오 콜백 | `GET /login/oauth2/code/kakao` | 카카오의 인가 결과 수신. `KAKAO_REDIRECT_URI`에 설정하고 카카오디벨로퍼스에도 동일하게 등록 |
| Client 로그인 완료 | `WEB_LOGIN_SUCCESS_URI` | Refresh 쿠키 설정 후 이동할 주소. 로컬 경로는 `http://localhost:3000/login/callback` |
| Client 로그인 실패 | 완료 주소와 같은 Origin의 `/login` | 로그인 취소 / 실패 안내와 재시도 |

1. Server가 로그인 시도마다 무작위 `state`와 PKCE `code_verifier`를 생성합니다. 시작한 브라우저와 연결할 임시 HttpOnly 쿠키를 설정하고, 로그인 시도 정보를 Redis에 저장합니다.
2. Server가 `client_id`, `redirect_uri`, `response_type=code`, `state`, `code_challenge`, `code_challenge_method=S256`을 포함한 카카오 인가 주소로 브라우저를 이동시킵니다. challenge는 verifier의 SHA-256 결과를 패딩 없는 Base64url로 인코딩합니다.
3. 카카오가 Server 콜백으로 `code` 또는 오류와 `state`를 전달합니다. Server는 state의 존재 / 만료, 제공자와 Client 종류, 브라우저 연결을 확인하고 유효한 로그인 시도를 원자적으로 한 번만 소비합니다.
4. Server가 인가 코드와 저장한 verifier로 카카오 토큰을 요청합니다. `client_id`는 REST API 키이며, Client Secret은 `client_secret_post` 방식으로 전달합니다. `redirect_uri`는 인가 요청에 사용한 주소와 동일해야 합니다.
5. Server가 카카오 Access Token으로 사용자 정보를 조회하고 검증한 결과를 `VerifiedSocialProfile`로 전달합니다. 로그인 식별자는 `KAKAO`와 카카오 사용자 ID이며, 이메일 일치로 다른 계정을 연결하지 않습니다. 닉네임은 기존 User 생성 규칙에 따라 필요하고 이메일 / 프로필 이미지는 선택 정보입니다. 전화번호를 로그인 정보로 수집 / 저장하지 않습니다.
6. `SocialLoginService.loginVerified(profile, ClientType.WEB)`로 사용자 / 소셜 계정 저장을 커밋한 뒤 Redis 로그인 세션과 모아홈 JWT를 생성합니다.
7. Server가 기존 규칙의 Refresh 쿠키를 설정하고 `WEB_LOGIN_SUCCESS_URI`로 이동시킵니다. 카카오 토큰과 모아홈 Access / Refresh Token을 이동 URL에 넣지 않습니다.
8. Client 콜백 화면이 `credentials: include`로 `GET /api/auth/web/csrf`를 호출한 뒤, 받은 CSRF 토큰으로 `POST /api/auth/web/refresh`를 호출합니다. 응답의 Access Token을 메모리에 보관하고 로그인 완료 상태를 표시합니다. 기존 도메인 규칙에 따른 최종 진입 분기는 해당 조회 API와 화면 구현 시 연결합니다.

1~7단계는 Server에, 8단계의 세션 복원과 완료 표시는 Client에 구현되어 있습니다. 카카오 인가 요청의 scope는 `profile_nickname`만 명시합니다. 사용자 조회의 `property_keys`는 `kakao_account.profile`과 `kakao_account.email`로 제한하고 `secure_resource=true`로 HTTPS 이미지 주소를 요청합니다. 응답에 이메일 / 프로필 이미지가 제공되면 선택 정보로 전달하며, 닉네임 누락이나 기존 자료형의 길이 제한에 맞지 않는 응답은 `OAUTH_PROFILE_INVALID`로 거부합니다.

실패 이동 주소의 `error`에는 Server가 정한 코드만 전달합니다. 사용자 취소는 `LOGIN_CANCELLED`, 로그인 시도 검증 실패는 `OAUTH_STATE_INVALID`, 잘못된 사용자 정보는 `OAUTH_PROFILE_INVALID`, 카카오 연동 오류는 `OAUTH_PROVIDER_UNAVAILABLE`, 이용 불가 계정은 `ACCOUNT_UNAVAILABLE`, Redis / 내부 저장 실패는 `AUTH_SERVICE_UNAVAILABLE`로 구분합니다. 기타 로그인 처리 실패는 `OAUTH_LOGIN_FAILED`로 안내합니다. 제공자 오류 설명과 서비스 토큰을 전달하지 않습니다.

### PKCE와 OAuth 임시 상태

- 백엔드 처리와 PKCE를 함께 사용합니다. PKCE는 인가 코드가 해당 로그인 시도의 verifier와 연결되었는지 카카오가 검증하게 합니다. Client Secret, state와 시작 브라우저 연결 검증도 유지합니다.
- 카카오 REST API는 PKCE를 지원하며 공식 OpenID Connect 메타데이터에는 `code_challenge_methods_supported: ["S256"]`이 명시되어 있습니다. 일반 REST API 파라미터 표에 상세 안내가 없지만 카카오 담당자의 지원 답변도 확인되어 있습니다. 근거는 아래 참고 문서에 연결합니다.
- Redis OAuth Key는 `auth:oauth:{state}`를 사용합니다. 제공자 `KAKAO`, Client 종류 `WEB`, 브라우저 토큰의 SHA-256 해시, verifier, 만료시각과 인가 요청 주소 / scope를 저장하고 TTL은 5분입니다. Redis Lua에서 브라우저 연결 / 만료를 검증하고 로그인 시도를 원자적으로 소비합니다. 로그인 세션의 14일 수명과 분리합니다.
- 웹 임시 쿠키는 `moahome-oauth-{state}`, Path `/`, 수명 5분이며 API 호스트에만 적용합니다. `HttpOnly`, `SameSite=Lax`, 운영 `Secure=true`를 사용하고 로컬에서만 `Secure=false`를 허용합니다. 로그인 시도별 쿠키로 여러 탭의 시도를 분리합니다. 검증값은 state만으로 대체하지 않으며, 검증된 성공 / 취소 / 실패 처리 후 해당 시도의 임시 정보를 정리합니다. 브라우저 연결이 확인되지 않은 Redis 상태는 소비하지 않고 TTL로 만료시킵니다.
- state와 verifier는 매 로그인마다 생성하며 환경변수나 Client 영속 저장소에 넣지 않습니다. 콜백 재사용, 만료되거나 다른 브라우저에서 가져온 로그인 시도는 거부합니다. 실패 시 이미 소비한 시도를 복구하지 않고 새 로그인을 시작합니다.
- OAuth Redis 저장 / 검증 장애 시 카카오 코드만으로 모아홈 세션을 발급하지 않습니다. 사용자 취소와 내부 장애를 구분해 안내하며 인가 코드, verifier, 토큰, Secret과 제공자 오류 원문을 Client 이동 URL / 일반 로그에 노출하지 않습니다.
- 네이티브 앱의 일회용 교환 코드에 적용하는 PKCE는 별도 구간입니다. 카카오 인가 코드 교환용 verifier는 Server가 보관하고, 앱 → 모아홈 코드 교환용 verifier는 앱이 보관합니다. 앱 복귀 주소 / challenge 연결과 60초 수명은 4절을 따릅니다.

### Spring Security와 기존 인증 연결

- 기존 `spring-boot-starter-security-oauth2-client`의 `oauth2Login()`을 연결하고 `requireProofKey=true`로 PKCE S256을 적용합니다. `OAuthAuthorizationRequestRepository`가 브라우저 쿠키를 처리하고 `RedisOAuthStateRepository`가 임시 상태를 저장합니다. 기본 HttpSession에 의존하지 않습니다.
- OAuth 인증 성공 처리를 기존 `SocialLoginService`와 `WebAuthSupport`에 연결합니다. 업무 API의 JWT 인증과 Redis 세션 검증은 유지하고, OAuth 로그인 결과를 별도 장기 HttpSession 인증으로 사용하지 않습니다.
- 카카오 토큰은 사용자 검증에 필요한 동안만 Server에서 사용하며 DB에 저장하거나 별도 장기 보관하지 않습니다. Spring의 OAuth Authorized Client 저장도 이 범위에 맞춥니다.
- 로그인 시작과 콜백의 정확한 GET 경로만 인증 없이 진입할 수 있으며 각 경로의 OAuth 검증을 적용합니다. 이 경로에는 기존 Bearer Token을 요구하지 않습니다. 업무 API나 쿠키 인증 API를 함께 공개하지 않습니다.
- 성공 / 실패 이동 주소는 Server 설정으로 결정합니다. `WEB_LOGIN_SUCCESS_URI`의 Origin은 `WEB_ALLOWED_ORIGINS`에 포함되어야 하고 운영에서는 HTTPS를 사용합니다. 사용자 요청의 임의 URL로 이동하지 않습니다.
- 환경변수의 의미, 중복 키 정리 방향과 카카오디벨로퍼스 설정은 [개발 환경 가이드](developmentGuide.md)의 카카오 로그인 설정 절을 따릅니다.

## 9. 후속 구현과 검증

Client 로그인 콜백은 `/login/callback`에서 세션 복원 후 로그인 완료 상태를 표시합니다. 공통 `customAPI`는 쿠키 / 캐시 설정과 JSON 처리를 담당하며, 인증 기능의 `restoreSession()`은 같은 탭의 중복 호출을 공유하고 Web Locks로 여러 탭의 CSRF 조회 / Rotation을 직렬화합니다. Web Locks가 없는 환경에서는 재발급을 중단하고 브라우저 업데이트를 안내합니다. 현재 앱 전역의 자동 세션 초기화와 업무 API의 Bearer 주입 / Access 만료 재시도는 후속 구현 범위입니다.

최종 서비스 진입 화면, 앱의 등록 도메인과 운영 Origin은 해당 화면 / 배포 구현 시 확정합니다. 관리소장(`ADMIN`)과 부담당자(`MANAGER`)의 주민 가입 승인, 관리소장만 가능한 관리대상 역할 변경과 그 밖의 권한 구분은 [도메인 규칙](domainRules.md)을 따릅니다. 로그인 이후 관리대상 수와 역할에 따른 진입 기준도 같은 문서를 따릅니다.

Client Playwright 테스트는 공통 API 설정 / 데이터 직렬화 / 오류 처리, CSRF → 재발급 순서, 메모리 보관 / 새로고침 복원, 같은 탭의 중복 복원과 여러 탭의 쿠키 교체 직렬화, 실패 / 장애 / 응답 유실 안내와 모바일 표시를 검증합니다. 서버 응답은 모의 처리하며 실제 카카오 로그인 성공과 개발 DB / Redis 연결은 별도로 확인합니다. 실행 명령은 [Client 규칙](../client/AGENTS.md)의 검증 절을 따릅니다.

Security 테스트는 토큰 만료와 종류 혼용, 서명·발급자·대상 검증, Rotation과 재사용 탐지, 동시 재발급, 로그아웃 후 세션 재생성 방지, 동시 로그인 유지, 웹 CSRF·CORS와 Redis 장애를 검증합니다. 테스트용 Redis는 일회성 프로세스로 시작하며 개발 Redis를 사용하지 않습니다.

`KakaoOAuthIntegrationTest`는 모의 카카오 HTTP 응답과 일회성 Redis로 다음 서버 흐름을 검증합니다. 실제 제공자의 PKCE 강제 검증과 Client 화면 연동은 후속 확인이며 Mock 결과로 대체하지 않습니다.

- 검증한 카카오 프로필의 기존 로그인 Service 연결, Refresh 쿠키 발급과 기존 CSRF / 재발급 연결. 최초 가입 / 기존 계정 로그인 / 탈퇴 후 재가입과 DB 무결성은 기존 사용자 / 소셜 계정 테스트에서 검증
- state 누락 / 불일치 / 만료, 브라우저 연결 불일치와 콜백 중복 소비
- S256 challenge 생성과 verifier 전달, 카카오 토큰 교환 실패, 사용자 취소 / 사용자 조회 실패
- Redis 장애와 DB 저장 이후 세션 생성 실패, 실패 시 임시 정보 정리
- 고정된 성공 / 실패 주소, 서비스 토큰의 URL 노출 방지, Refresh 쿠키와 Client CSRF / 재발급 연결
- 여러 탭의 로그인 시도 분리, OAuth 임시 상태 5분 수명과 Redis 원자적 소비, HttpSession 미사용

`KakaoOAuthPropertiesTest`는 고정된 콜백 경로, 허용 웹 Origin, 운영 HTTPS와 로컬 localhost HTTP 주소, 설정 문자열의 비밀값 숨김을 검증합니다. 실제 카카오 연동에서는 정상 verifier와 누락 / 불일치 verifier의 결과를 별도로 확인합니다.

## 10. 참고 문서

수명과 전달 방식은 이 프로젝트의 정책입니다. Rotation과 재사용 탐지, 쿠키 인증의 CSRF 보호, 네이티브 로그인 및 저장소 설계는 다음 공식 문서를 참고합니다.

- [OAuth 보안 권고 RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)
- [Spring Security CSRF](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html)
- [쿠키 속성 MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [네이티브 앱 OAuth RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html)
- [PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html)
- [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api)
- [카카오 로그인 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)
- [카카오 OpenID Connect 메타데이터](https://kauth.kakao.com/.well-known/openid-configuration)
- [카카오 담당자의 REST API PKCE 지원 답변](https://devtalk.kakao.com/t/oauth2-pkce/144590)
- [Spring Security Authorization Grant 지원](https://docs.spring.io/spring-security/reference/servlet/oauth2/client/authorization-grants.html)
- [Apple Keychain](https://developer.apple.com/documentation/security/keychain-services)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)


## 11. 사용자 / 소셜 계정과 전화번호 저장

- `users`는 모아홈 사용자, `social_accounts`는 외부 로그인 계정 연결을 저장합니다. 소셜 계정에서 사용자로 단방향 LAZY 관계를 사용합니다.
- `SocialAccountService.resolveVerifiedUser()`는 동일한 소셜 식별자의 가입 / 로그인을 PostgreSQL 트랜잭션 advisory lock으로 직렬화합니다. DB의 부분 유일 인덱스도 삭제되지 않은 소셜 식별자의 중복을 차단합니다.
- `VerifiedSocialProfile`은 서버의 제공자 검증 결과를 전달하는 내부 자료형입니다. 자료형 생성만으로 OAuth 검증이 수행되는 것은 아닙니다. Client가 보낸 사용자 ID나 이메일로 직접 생성하여 로그인시키지 않습니다.
- `SocialLoginService.loginVerified()`는 외부 DB 트랜잭션 안에서 실행할 수 없습니다. 사용자 / 소셜 계정 저장 커밋 후 Redis 세션을 생성합니다. Redis 세션 생성이 실패하면 DB 계정은 유지하고 로그인 재시도 시 기존 계정을 사용합니다.
- ACTIVE 계정만 세션 생성, Access Token 인증과 토큰 재발급을 허용합니다. 매 요청에서 DB의 계정 상태를 확인하여 정지 / 탈퇴 계정의 기존 토큰도 차단합니다. 로그아웃은 해당 계정의 현재 Redis 세션으로 처리할 수 있습니다.
- `SocialAccountService.withdrawUser()`는 사용자와 연결된 소셜 계정을 함께 소프트 삭제합니다. 권한 확인을 마친 서버 호출자가 실제 처리자 ID를 전달해야 합니다. 탈퇴와 정지 / 해제의 공개 API는 아직 제공하지 않습니다.
- `users`에는 전화번호와 휴대폰 인증 정보를 저장하지 않습니다. 로그인은 소셜 식별자로 처리하고 연락처는 주민 명부와 가입 요청 정보에서 관리합니다.
- 플랫폼 운영 권한(`users.system_role`)과 관리대상별 역할(`property_members.role`)을 구분합니다. `system_role`은 Entity / 후속 Migration으로 저장하며 신규 가입과 기존 계정의 기본값은 `USER`입니다. DB는 `USER` / `ADMIN`만 허용합니다. 플랫폼 관리자 지정 / 회수 API와 플랫폼 운영 기능은 아직 제공하지 않으며, 플랫폼 역할을 JWT 전역 역할이나 관리대상 권한 우회에 사용하지 않습니다.
- 주민은 동이 있는 경우 동과 호수, 동이 없는 경우 호수로 세대를 지정해 가입을 요청합니다. 관리자가 기존 주민 명부를 확인하거나 필요한 주민을 신규 등록하고 승인한 뒤 계정과 주민 정보를 연결합니다. 주민 연결, 세대 관계, 권한과 가입 요청 상태는 하나의 DB 트랜잭션에서 반영합니다. 전화번호 일치만으로 자동 연결하거나 권한을 부여하지 않습니다.
- 별도의 휴대폰 소유 인증을 가입 / 주민 참여의 필수 단계로 두지 않습니다. 주민 연락처 저장과 변경, 카카오톡 발송 기능은 아직 구현되지 않았습니다.
- `common/security/PhoneSecurity`는 전화번호 정규화, AES-256-GCM 암호화 / 복호화, 별도 키의 HMAC-SHA-256 검색값과 마지막 4자리 생성을 제공하는 공통 코드입니다. 휴대폰 소유 인증을 수행하지 않습니다. `residents.phone_encrypted` / `phone_hmac` / `phone_last4`와 가입 요청의 `request_phone_*`에 사용할 수 있으며, 현재 주민 / 가입 요청 저장 기능에는 아직 연결되지 않았습니다.
- 암호문은 `v1:<key-id>:<base64url-nonce>:<base64url-ciphertext-and-tag>` 형태로 저장합니다. 기존 암호문 호환성을 위해 v1의 AAD와 HMAC 용도 문자열은 유지합니다. 새 암호화 키를 활성화해도 기존 암호문을 재암호화하기 전까지 이전 복호화 키를 유지합니다. HMAC 키 교체 시에는 기존 검색값의 재계산이 필요합니다.
- 현재 `PhoneSecurity`와 `PhoneSecurityProperties`는 자동으로 Bean 등록하지 않으므로 로그인만 사용하는 서버 실행에 전화번호 키가 필요하지 않습니다. 연락처 저장 기능 구현 시 Bean과 외부 키 설정을 연결하고 국내 번호 입력 변환, 조회 / 마스킹 권한과 키 교체 절차를 함께 결정합니다. 전화번호 원문을 일반 로그나 오류 응답에 노출하지 않습니다.
- 기존 사용자 전화번호 컬럼은 후속 Migration으로 제거합니다. 이 Migration은 기존 계정 연락처를 삭제하며 주민 명부로 이전하지 않습니다. 적용 전 기존 연락처의 보존 필요 여부를 확인하고, 보존이 필요하면 DB 백업 또는 승인된 대상에 대한 별도 이관을 먼저 수행합니다. 기존 계정과 소셜 로그인 연결은 유지합니다. Migration 실패 시 PostgreSQL 트랜잭션으로 롤백되며, 적용 후 삭제된 연락처 복구에는 적용 전 백업이 필요합니다. `ALTER TABLE`의 잠금과 실행 시간은 적용 대상 DB에서 확인합니다.
- 재가입, 상태와 연락처 업무 기준은 [도메인 규칙](domainRules.md)을 따릅니다. 탈퇴 개인정보 보존 / 파기 정책은 미정이며, 현재 소프트 삭제가 개인정보 파기를 수행하지는 않습니다.
