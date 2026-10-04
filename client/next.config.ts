import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 통합 테스트 개발 서버가 기존 개발 서버의 빌드 결과와 잠금을 공유하지 않게 합니다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
