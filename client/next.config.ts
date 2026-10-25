import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 카카오·문자 미리보기 수집기가 JavaScript 없이도 최초 HTML의 head에서 메타데이터를 읽게 합니다.
  htmlLimitedBots: /.*/,
  // 통합 테스트 개발 서버가 기존 개발 서버의 빌드 결과와 잠금을 공유하지 않게 합니다.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
