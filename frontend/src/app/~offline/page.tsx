"use client";

import { WifiOff, Bookmark, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function OfflineFallbackPage() {
  // Automatically reload the page once network returns
  useEffect(() => {
    const handleOnline = () => window.location.reload();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <div className="animate-fade-up flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex size-24 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <WifiOff size={48} />
      </div>

      <h1 className="mb-1.5 text-4xl font-extrabold tracking-tight text-foreground">
        You&rsquo;re Offline
      </h1>

      <p className="mb-8 max-w-md text-base text-muted">
        It seems you&rsquo;ve lost your internet connection. Don&rsquo;t worry, your cached portal and offline materials are still available.
      </p>

      <div className="flex w-full max-w-md flex-col justify-center gap-4 sm:flex-row">
        <button
          onClick={() => window.location.reload()}
          className="motion-hover motion-active flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          <RefreshCcw size={18} />
          Retry Connection
        </button>

        {/* Directs user to the PDF bookmarks cached via your offline-manager */}
        <Link
          href="/bookmarks"
          className="motion-hover motion-active flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-3 text-sm font-bold text-foreground hover:bg-surface-hover"
        >
          <Bookmark size={18} className="text-warning" />
          View Bookmarks
        </Link>
      </div>
    </div>
  );
}