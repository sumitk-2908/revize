"use client";

import DocumentCard from "@/components/ui/DocumentCard";
import { DocumentWithAnalytics } from "@/app/lib/document-types";
import { Flame, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState, useRef } from "react";
import { trackDocumentStat } from "@/app/lib/api/analytics";
import { buildDownloadHref } from "@/app/lib/file-types";

interface TrendingCarouselProps {
  documents: DocumentWithAnalytics[];
}

export function TrendingCarousel({ documents }: TrendingCarouselProps) {
  const [downloadingIds, setDownloadingIds] = useState<number[]>([]);
  const downloadingRef = useRef<Set<number>>(new Set());

  if (!documents || documents.length === 0) return null;

  const handleDownload = async (e: React.MouseEvent, doc: any) => {
    e.preventDefault();

    if (downloadingRef.current.has(doc.id)) return;
    downloadingRef.current.add(doc.id);
    setDownloadingIds((prev) => [...prev, doc.id]);

    try {
      await trackDocumentStat(doc.id, "download");
      const link = document.createElement("a");
      link.href = buildDownloadHref(doc.file_url, doc.title);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {
        downloadingRef.current.delete(doc.id);
        setDownloadingIds((prev) => prev.filter((id) => id !== doc.id));
      }, 2000);
    }
  };

  const toggleBookmark = async (doc: any) => {
    const event = new CustomEvent('request_auth', { detail: { action: 'bookmark' } });
    window.dispatchEvent(event);
  };

  return (
    <div className="mb-16 w-full pt-8">
      <div className="mb-6 flex items-center justify-between px-4 sm:px-0">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
            <Flame size={20} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Recently Uploaded</h2>
            <p className="text-sm text-muted">The newest resources added by the community</p>
          </div>
        </div>
        <Link href="/recent-uploads" className="hidden items-center gap-1 text-sm font-semibold text-primary hover:underline sm:flex">
          View all <ArrowRight size={16} />
        </Link>
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-8 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {documents.map((doc, index) => (
            <div key={doc.id} className="w-[85vw] shrink-0 snap-start sm:w-[350px]">
              <DocumentCard
                doc={doc}
                isBookmarked={false} // Unauthenticated user doesn't have bookmarks
                onDownload={handleDownload}
                onToggleBookmark={() => toggleBookmark(doc)}
                isDownloading={downloadingIds.includes(doc.id)}
                showBookmarkTooltip={index === 0}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
