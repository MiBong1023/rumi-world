import type { NextConfig } from "next";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// 배포마다 달라지는 빌드 식별자.
// Cloudflare Pages 빌드에서는 CF_PAGES_COMMIT_SHA 가 자동 주입된다.
const buildId =
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GIT_HASH ||
  Date.now().toString();

// 클라이언트가 폴링할 정적 파일. public/ 아래 파일은 배포 루트(/version.json)로 복사된다.
// next.config 는 next build 시작 시 1회 평가되므로, public 복사 이전에 갱신된다.
writeFileSync(
  join(process.cwd(), "public", "version.json"),
  JSON.stringify({ buildId }),
);

const nextConfig: NextConfig = {
  // 번들에 인라인되어 process.env.NEXT_PUBLIC_BUILD_ID 로 접근 가능 (파괴 할당 불가).
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
};

export default nextConfig;
