/** 복제 화면 없이 기존 추가 등록 화면에서 생성 진입만 숨겨 현재 계정의 실제 화면을 확인합니다. */
export function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(null, {
      status: 404
    });
  }
  return new Response(null, {
    status: 307,
    headers: {
      'Location': new URL('/properties/add?creationPreview=disabled', request.url).href,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}
