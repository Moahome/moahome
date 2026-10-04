/** 공개 API 호스트에 서버 경로를 연결하고, 쿠키 요청이 다른 호스트로 전달되지 않게 검증합니다. */
export function getApiUrl(path: string): URL {
  const apiHost = process.env.NEXT_PUBLIC_API_HOST;

  if (!apiHost) {
    throw new Error("NEXT_PUBLIC_API_HOST가 설정되지 않았습니다.");
  }

  const host = new URL(apiHost);
  const url = new URL(path, host);

  if (
    !["http:", "https:"].includes(host.protocol) ||
    host.username ||
    host.password ||
    host.search ||
    host.hash ||
    host.pathname !== "/" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    url.origin !== host.origin ||
    url.hash
  ) {
    throw new Error("API 호스트와 서버 경로를 확인해 주세요.");
  }

  return url;
}
