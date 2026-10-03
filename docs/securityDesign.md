# JWT 인증 설계

이 문서는 Server Security의 토큰 수명, 웹과 앱의 전달 방식, Redis 인증 상태와 로그아웃 정책을 정의합니다. JWT 검증, Redis 로그인 세션, 웹·앱 재발급 / 로그아웃 API와 CSRF / CORS 설정은 구현되어 있습니다. 사용자 / 소셜 계정 저장과 서버가 검증한 소셜 프로필을 기존 세션으로 연결하는 내부 Service도 구현되어 있습니다. 카카오 OAuth 검증 / 콜백과 Client 인증 연동은 아직 구현되지 않았습니다.

## 1. 인증 기준

| 항목 | 기준 |
| --- | --- |
| 로그인 | 카카오 OAuth |
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

카카오 로그인 검증을 연결할 때 서버가 검증한 프로필로 `SocialLoginService.loginVerified()`를 호출합니다. 내부 `SocialAccountService`가 제공자와 제공자 사용자 ID로 사용자를 조회 / 생성하고 DB 트랜잭션을 커밋한 뒤, 검증된 사용자 ID로 `AuthService.startSession()`을 호출합니다. 사용자 ID를 직접 받아 토큰을 발급하는 공개 API는 제공하지 않습니다. OAuth 시작 / 콜백, 앱 교환 코드와 화면 이동은 후속 로그인 구현에 포함되며, 구현 전에는 해당 경로를 공개하지 않습니다. 관리대상별 권한은 토큰에 전역 역할을 넣는 방식으로 대신하지 않고 해당 업무 Service에서 검사합니다.

서명은 HS256을 사용하며 32바이트 이상의 무작위 키를 Base64로 인코딩해 `JWT_SECRET_BASE64`로 주입해야 합니다. 누락·잘못된 인코딩·짧은 키는 서버 시작 시 거부합니다. 운영 Origin과 로컬 실행 설정은 [개발 환경 가이드](developmentGuide.md)를 따릅니다.

## 8. 후속 구현과 검증

로그인 성공 이후의 실제 Client 경로, 앱의 등록 도메인, 운영 Origin과 `ADMIN` / `MANAGER`의 상세 업무 권한은 해당 화면·배포·업무 API 구현 시 확정합니다. 로그인 이후 관리대상 수와 역할에 따른 진입 기준은 기존 [도메인 규칙](domainRules.md)을 따릅니다.

Security 테스트는 토큰 만료와 종류 혼용, 서명·발급자·대상 검증, Rotation과 재사용 탐지, 동시 재발급, 로그아웃 후 세션 재생성 방지, 동시 로그인 유지, 웹 CSRF·CORS와 Redis 장애를 검증합니다. 테스트용 Redis는 일회성 프로세스로 시작하며 개발 Redis를 사용하지 않습니다. 카카오 로그인과 실제 Client 연동은 구현 시 별도로 검증합니다.

## 9. 참고 문서

수명과 전달 방식은 이 프로젝트의 정책입니다. Rotation과 재사용 탐지, 쿠키 인증의 CSRF 보호, 네이티브 로그인 및 저장소 설계는 다음 공식 문서를 참고합니다.

- [OAuth 보안 권고 RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)
- [Spring Security CSRF](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html)
- [쿠키 속성 MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [네이티브 앱 OAuth RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html)
- [Apple Keychain](https://developer.apple.com/documentation/security/keychain-services)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)


## 8. 사용자 / 소셜 계정과 전화번호 저장

- `users`는 모아홈 사용자, `social_accounts`는 외부 로그인 계정 연결을 저장합니다. 소셜 계정에서 사용자로 단방향 LAZY 관계를 사용합니다.
- `SocialAccountService.resolveVerifiedUser()`는 동일한 소셜 식별자의 가입 / 로그인을 PostgreSQL 트랜잭션 advisory lock으로 직렬화합니다. DB의 부분 유일 인덱스도 삭제되지 않은 소셜 식별자의 중복을 차단합니다.
- `VerifiedSocialProfile`은 서버의 제공자 검증 결과를 전달하는 내부 자료형입니다. 자료형 생성만으로 OAuth 검증이 수행되는 것은 아닙니다. Client가 보낸 사용자 ID나 이메일로 직접 생성하여 로그인시키지 않습니다.
- `SocialLoginService.loginVerified()`는 외부 DB 트랜잭션 안에서 실행할 수 없습니다. 사용자 / 소셜 계정 저장 커밋 후 Redis 세션을 생성합니다. Redis 세션 생성이 실패하면 DB 계정은 유지하고 로그인 재시도 시 기존 계정을 사용합니다.
- ACTIVE 계정만 세션 생성, Access Token 인증과 토큰 재발급을 허용합니다. 매 요청에서 DB의 계정 상태를 확인하여 정지 / 탈퇴 계정의 기존 토큰도 차단합니다. 로그아웃은 해당 계정의 현재 Redis 세션으로 처리할 수 있습니다.
- `SocialAccountService.withdrawUser()`는 사용자와 연결된 소셜 계정을 함께 소프트 삭제합니다. 권한 확인을 마친 서버 호출자가 실제 처리자 ID를 전달해야 합니다. 탈퇴와 정지 / 해제의 공개 API는 아직 제공하지 않습니다.
- 전화번호는 국가번호가 포함된 `+821012345678` 형태로 정규화합니다. 공백, 괄호와 하이픈을 제거하며 국가번호 없는 로컬 번호의 국가를 추정하지 않습니다. 형식 검사가 실제 번호 소유 인증을 대신하지 않습니다.
- `UserService.verifyPhone()`은 서버가 소유 인증을 완료한 번호와 인증 시각만 받는 내부 진입점입니다. 암호문, HMAC, 마지막 4자리와 인증 시각을 하나의 Entity 메서드로 갱신합니다. 실제 전화번호 인증 API는 아직 구현되지 않았습니다.
- `phone_encrypted`와 Java의 `phoneEncrypted`에는 모두 암호문을 보관합니다. 자동 복호화 Converter를 사용하지 않고 `PhoneSecurity.decrypt()`를 필요한 작업에서 명시적으로 호출합니다.
- 전화번호 암호화는 AES-256-GCM, 암호화마다 새로운 12바이트 nonce와 128비트 인증 태그를 사용합니다. 저장 형식은 `v1:<key-id>:<base64url-nonce>:<base64url-ciphertext-and-tag>`입니다. 형식 버전, 용도와 키 ID도 AAD로 인증합니다.
- 검색은 별도 키의 HMAC-SHA-256을 64자리 소문자 hex로 저장하여 수행합니다. 마스킹용 마지막 4자리는 별도 보관합니다. 평문 / 암호문 / HMAC을 일반 로그나 응답에 노출하지 않습니다.
- 기본 암호화 키 ID는 `v1`입니다. 키 교체 시 외부 설정의 `moahome.phone-security.encryption-keys`에 새 키와 기존 키를 함께 등록하고 `active-key-id`를 새 키 ID로 바꿉니다. 기존 암호문을 재암호화하기 전까지 복호화용 이전 키를 유지합니다. HMAC 키 교체에는 기존 검색값 재계산이 필요하며 자동 교체 기능은 제공하지 않습니다.
- 재가입, 상태와 전화번호 필수 여부는 [도메인 규칙](domainRules.md)을 따릅니다. 탈퇴 개인정보 보존 / 파기 정책은 미정이며, 현재 소프트 삭제가 개인정보 파기를 수행하지는 않습니다.
