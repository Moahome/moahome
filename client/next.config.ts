import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 카카오·문자 미리보기 수집기가 JavaScript 없이도 최초 HTML의 head에서 메타데이터를 읽게 합니다.
  htmlLimitedBots: /.*/,
  // 통합 테스트용 프로덕션 빌드가 일반 개발·운영 빌드의 결과와 잠금을 공유하지 않게 합니다.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
