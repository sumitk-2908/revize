"use client";

import { useEffect, useRef } from "react";

const INACTIVITY_PING_THRESHOLD_MS = 14 * 60 * 1000; // 14 minutes

/**
 * Speculatively warms up the Render free-tier backend in the background.
 * Triggers a lightweight /ping request on page mount and on tab refocused
 * if more than 14 minutes have passed since the last ping.
 */
export function BackendWarmup() {
  const lastPingRef = useRef<number>(0);

  useEffect(() => {
    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!rawApiUrl) return;

    // Normalizes to base or /api/v1/ping endpoint
    const pingUrl = rawApiUrl.endsWith("/")
      ? `${rawApiUrl}ping`
      : `${rawApiUrl}/ping`;

    const sendWarmupPing = () => {
      const now = Date.now();
      if (now - lastPingRef.current < INACTIVITY_PING_THRESHOLD_MS && lastPingRef.current !== 0) {
        return;
      }
      lastPingRef.current = now;

      // Silent probe with low priority and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      fetch(pingUrl, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      })
        .catch(() => {
          // Fallback to /health or root if /ping fails
          const rootUrl = rawApiUrl.replace(/\/api\/v1\/?$/, "");
          fetch(`${rootUrl}/health`, {
            method: "GET",
            cache: "no-store",
          }).catch(() => {
            // Silently ignore during warmup
          });
        })
        .finally(() => {
          clearTimeout(timeoutId);
        });
    };

    // 1. Warm up immediately on page load
    sendWarmupPing();

    // 2. Warm up when tab becomes visible after inactivity
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendWarmupPing();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
