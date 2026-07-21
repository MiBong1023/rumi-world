import { useEffect } from "react";

// 빌드 시점에 next.config.ts 의 env 로 주입된다. 배포마다 값이 달라진다.
const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

const POLL_INTERVAL_MS = 60_000;

/**
 * 새 버전이 배포되면 자동으로 새로고침한다.
 *
 * 갤럭시 등에서 홈화면 PWA/탭을 "종료했다가 다시 켤" 때 크롬이 옛 번들을
 * 그대로 복원(bfcache·탭 리스토어)하면서 구버전 화면이 남는 문제를 해결한다.
 * /version.json 의 buildId 를 현재 번들의 값과 비교해 다르면 하드 리로드한다.
 */
export function useVersionCheck() {
  useEffect(() => {
    // dev 등 값이 주입되지 않은 환경에서는 동작하지 않는다.
    if (!CURRENT_BUILD_ID) return;

    let reloading = false;

    const check = async () => {
      // 백그라운드거나 이미 리로드 중이면 건너뜀.
      if (reloading || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/version.json?ts=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (data.buildId && data.buildId !== CURRENT_BUILD_ID) {
          reloading = true;
          window.location.reload();
        }
      } catch {
        // 네트워크 오류는 무시하고 다음 주기에 재시도.
      }
    };

    // 앱 복귀(백그라운드→포그라운드) 시 즉시 확인 — 갤럭시 PWA 재개 케이스의 핵심.
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const interval = setInterval(check, POLL_INTERVAL_MS);
    check(); // 최초 마운트 시 1회

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, []);
}
