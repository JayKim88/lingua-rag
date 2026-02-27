"use client";

import { useState, useEffect } from "react";

export type HealthStatus = "checking" | "warming" | "ready" | "error";

export function useBackendHealth() {
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // ~60s total at 3s intervals

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/health", {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          if (!cancelled) setStatus("ready");
          return;
        }
      } catch {
        // timeout or network error — backend is cold
      }

      if (cancelled) return;
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        setStatus("error");
        return;
      }
      setStatus("warming");
      setTimeout(check, 3000);
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
