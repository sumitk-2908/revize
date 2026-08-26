"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { RevizeMascot } from "@/components/brand/RevizeMascot";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorBoundary
      title="An error occurred"
      message="The page ran into a problem. Please try reloading."
      onReset={reset}
    >
      <div className="hidden">{error.message}</div>
      <RevizeMascot state="confused" decorative className="mx-auto mt-4 size-16" />
    </ErrorBoundary>
  );
}
