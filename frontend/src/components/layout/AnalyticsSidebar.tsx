"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, Download, Eye, FileUp, PanelRight, TrendingUp } from "lucide-react";
import { supabase } from "@/app/lib/api/core";
import { useSidebar } from "@/app/context/SidebarContext";
import { getTrendingDocuments } from "@/app/lib/api/analytics";
import { documentHref, SearchDocument } from "@/components/layout/utils";

interface AnalyticsStats {
    views: number;
    downloads: number;
    uploads: number;
}

const defaultStats: AnalyticsStats = { views: 0, downloads: 0, uploads: 0 };

export const AnalyticsSidebar = () => {
    const { sidebarCollapsed } = useSidebar();
    const [isOpen, setIsOpen] = useState(true);
    const [stats, setStats] = useState<AnalyticsStats>(defaultStats);
    const [trendingDocs, setTrendingDocs] = useState<SearchDocument[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        try {
            const savedState = window.localStorage.getItem("analytics-sidebar-open");
            if (savedState !== null) setIsOpen(savedState === "true");
        } catch {
            // localStorage can be unavailable in privacy-restricted browsers.
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem("analytics-sidebar-open", String(isOpen));
        } catch {
            // Persistence is an enhancement; the panel remains usable without it.
        }
    }, [isOpen]);

    useEffect(() => {
        let mounted = true;
        const loadAnalytics = async () => {
            setLoading(true);
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

        loadAnalytics();
        return () => { mounted = false; };
    }, []);

    return (
        <section aria-label="Public analytics" className="space-y-3">
            <button
                type="button"
                title={sidebarCollapsed ? "Analytics" : undefined}
                aria-label={isOpen ? "Collapse analytics panel" : "Open analytics panel"}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((open) => !open)}
                className="motion-hover motion-active mb-6 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-primary"
            >
                <BarChart2 size={18} className="shrink-0" />
                {!sidebarCollapsed && isOpen && <span>Analytics</span>}
                {!sidebarCollapsed && isOpen && <PanelRight size={16} className="ml-auto" />}
            </button>

            {!sidebarCollapsed && isOpen && (
                <div className="space-y-6">
                    <section aria-labelledby="analytics-stats-heading">
                        <p id="analytics-stats-heading" className="px-3 pb-2 text-xs font-bold tracking-[0.06em] text-muted uppercase">Public impact</p>
                        <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
                            <AnalyticsStat icon={Eye} label="Views" value={stats.views} loading={loading} />
                            <AnalyticsStat icon={Download} label="Downloads" value={stats.downloads} loading={loading} />
                            <AnalyticsStat icon={FileUp} label="Public uploads" value={stats.uploads} loading={loading} />
                        </div>
                    </section>

                    <section aria-labelledby="analytics-trending-heading">
                        <div className="mb-2 flex items-center gap-2 px-3 text-primary">
                            <TrendingUp size={13} />
                            <p id="analytics-trending-heading" className="text-xs font-bold tracking-[0.06em] uppercase">Trending now</p>
                        </div>
                        <div className="rounded-2xl border border-border bg-surface p-3">
                            {loading ? (
                                <div className="animate-pulse space-y-3">
                                    {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-4 rounded bg-surface-hover" />)}
                                </div>
                            ) : trendingDocs.length > 0 ? (
                                <div className="space-y-2.5">
                                    {trendingDocs.map((doc, index) => (
                                        <Link key={doc.id} href={documentHref(doc)} className="group block text-xs">
                                            <p className="truncate font-bold text-foreground transition-colors group-hover:text-primary">{index + 1}. {doc.title}</p>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs font-medium text-muted">Trending resources will appear here.</p>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
};

function AnalyticsStat({ icon: Icon, label, value, loading }: { icon: typeof Eye; label: string; value: number; loading: boolean }) {
    return (
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Icon size={16} className="shrink-0 text-primary" />
            <span className="text-xs font-semibold text-muted">{label}</span>
            <span className="ml-auto text-sm font-extrabold tabular-nums text-foreground">{loading ? "—" : value.toLocaleString()}</span>
        </div>
    );
}
