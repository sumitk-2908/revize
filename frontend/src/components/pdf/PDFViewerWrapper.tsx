"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

// The dynamic import with ssr: false is perfectly valid inside a Client Component
const PDFViewerClient = dynamic(() => import("./PDFViewerClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] w-full items-center justify-center rounded-3xl border border-border bg-surface shadow-sm">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-xs font-bold text-muted">
          Initializing Document Viewer...
        </p>
      </div>
    </div>
  ),
});

export default function PDFViewerWrapper({ documentMeta }: { documentMeta: any }) {
  return (
    <ErrorBoundary
      title="Document viewer could not load"
      message="The document viewer ran into a problem. Try refreshing, or open the file in a new tab."
    >
      <PDFViewerClient documentMeta={documentMeta} />
    </ErrorBoundary>
  );
}