"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, Download, Eye, FileUp, TrendingUp } from "lucide-react";
import { supabase } from "@/app/lib/api/core";
import { getTrendingDocuments } from "@/app/lib/api/analytics";
import { documentHref, type SearchDocument } from "@/components/layout/utils";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

interface AnalyticsStats {
    views: number;
    downloads: number;
    uploads: number;
}

const defaultStats: AnalyticsStats = { views: 0, downloads: 0, uploads: 0 };

function PublicAnalyticsContent() {
    const [stats, setStats] = useState<AnalyticsStats>(defaultStats);
    const [trendingDocs, setTrendingDocs] = useState<SearchDocument[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const loadAnalytics = async () => {
            const [{ data: analytics }, { count: uploads }, trending] = await Promise.all([
                supabase.from("document_analytics").select("view_count, download_count"),
                supabase.from("documents").select("id", { count: "exact", head: true }).eq("status", "approved"),
                getTrendingDocuments(),
            ]);

            if (!mounted) return;
            setStats({
                views: analytics?.reduce((total, item) => total + (item.view_count || 0), 0) || 0,
                downloads: analytics?.reduce((total, item) => total + (item.download_count || 0), 0) || 0,
                uploads: uploads || 0,
            });
            setTrendingDocs((trending || []).slice(0, 5) as SearchDocument[]);
            setLoading(false);
        };

        void loadAnalytics();
        return () => { mounted = false; };
    }, []);

    if (loading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <InlineSpinner label="Loading analytics..." size={24} />
            </div>
        );
    }

    const statItems = [
        { label: "Views", value: stats.views, icon: Eye, color: "text-primary", background: "bg-primary/10" },
        { label: "Downloads", value: stats.downloads, icon: Download, color: "text-success", background: "bg-success/10" },
        { label: "Public uploads", value: stats.uploads, icon: FileUp, color: "text-warning", background: "bg-warning/10" },
    ];

    return (
        <main className="animate-fade-up mx-auto w-full max-w-6xl space-y-8 pb-12">
            <header className="border-b border-border pb-6">
                <div className="flex items-center gap-3 text-primary">
                    <BarChart2 size={24} aria-hidden="true" />
                    <h1 className="text-2xl font-extrabold text-foreground">Analytics</h1>
                </div>
                <p className="mt-2 text-sm font-medium text-muted">Platform-wide public resource usage and current study trends.</p>
            </header>

            <section aria-labelledby="impact-heading">
                <h2 id="impact-heading" className="mb-4 text-lg font-extrabold text-foreground">Public impact</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                    {statItems.map(({ label, value, icon: Icon, color, background }) => (
                        <article key={label} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                            <div className={`flex size-9 items-center justify-center rounded-lg ${background} ${color}`}>
                                <Icon size={18} aria-hidden="true" />
                            </div>
                            <p className="mt-5 text-3xl font-extrabold tabular-nums text-foreground">{value.toLocaleString()}</p>
                            <p className="mt-1 text-sm font-semibold text-muted">{label}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section aria-labelledby="trending-heading" className="border-t border-border pt-6">
                <div className="mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-primary" aria-hidden="true" />
                    <h2 id="trending-heading" className="text-lg font-extrabold text-foreground">Trending now</h2>
                </div>
                {trendingDocs.length > 0 ? (
                    <div className="divide-y divide-border border-y border-border">
                        {trendingDocs.map((doc, index) => (
                            <Link key={doc.id} href={documentHref(doc)} className="group flex items-center gap-4 px-2 py-4 hover:bg-surface-hover">
                                <span className="w-6 text-right text-sm font-extrabold tabular-nums text-muted">{index + 1}</span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-foreground group-hover:text-primary">{doc.title}</p>
                                    <p className="mt-1 truncate text-xs font-medium text-muted">{doc.subject || "Academic resource"}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p className="border-y border-border py-8 text-center text-sm font-medium text-muted">Trending resources will appear here.</p>
                )}
            </section>
        </main>
    );
}

export default function AnalyticsPage() {
    return (
        <ErrorBoundary title="Analytics could not load" message="The public analytics page ran into a problem.">
            <PublicAnalyticsContent />
        </ErrorBoundary>
    );
}
