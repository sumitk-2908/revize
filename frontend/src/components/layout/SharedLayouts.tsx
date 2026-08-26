import React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { RevizeMascot } from "@/components/brand/RevizeMascot";

/** 
 * 1. Page Header (New)
 * Enforces the 32px (text-4xl) or 24px (text-3xl) Extrabold rule with tight tracking.
 */
export const PageHeader = ({ title, description }: { title: string, description?: string }) => (
  <div className="mb-8">
    <h1 className="mb-1.5 text-4xl font-extrabold tracking-tight text-foreground">
      {title}
    </h1>
    {description && (
      <p className="text-base text-muted">
        {description}
      </p>
    )}
  </div>
);

/** 
 * 2. Page Container 
 */
export const PageContainer = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`animate-fade-up space-y-8 ${className}`}>
    {children}
  </div>
);

/** 
 * 3. Section Heading 
 * Enforces the 11px (text-xs) Bold rule with wide tracking (0.06em) for structural labels.
 */
export const SectionHeading = ({ title, action }: { title: string; action?: React.ReactNode; }) => (
  <div className="mb-4 flex items-center justify-between gap-4">
    <h2 className="text-xs font-bold tracking-[0.06em] text-muted uppercase">
      {title}
    </h2>
    {action && <div>{action}</div>}
  </div>
);

export const CardGrid = ({ children, cols = "auto" }: { children: React.ReactNode; cols?: "auto" | "2" | "3" | "4" | "5"; }) => {
  const colClasses = {
    "auto": "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
    "2": "grid grid-cols-1 sm:grid-cols-2 gap-4",
    "3": "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
    "4": "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4",
    "5": "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4",
  }[cols];
  return <div role="list" className={colClasses}>{children}</div>;
};

/** 
 * 4. Empty State Wrapper 
 * Enforces the 13px (text-base) Medium rule.
 */
export const EmptyState = ({
  title,
  message,
  icon: Icon,
  action,
}: {
  title?: string;
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) => (
  <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-hover/50 p-12 text-center">
    {Icon ? <Icon className="mb-4 size-8 text-muted opacity-50" /> : <RevizeMascot state="default" decorative className="mb-4 size-16" />}
    {title && <h3 className="text-lg font-extrabold tracking-tight text-foreground">{title}</h3>}
    <p className={`${title ? "mt-1" : ""} max-w-md text-base font-medium text-muted`}>{message}</p>
    {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{action}</div>}
  </div>
);

export const SkeletonBlock = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-xl bg-surface-hover ${className}`} />
);

export const InlineSpinner = ({
  label = "Loading",
  size = 16,
  className = "",
}: {
  label?: string;
  size?: number;
  className?: string;
}) => (
  <Loader2
    aria-label={label}
    className={`shrink-0 animate-spin ${className}`}
    size={size}
  />
);

export const DocumentGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <CardGrid cols="auto">
    {Array.from({ length: count }).map((_, i) => (
      <article key={i} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <SkeletonBlock className="mb-4 h-32 w-full" />
        <SkeletonBlock className="h-5 w-4/5" />
        <SkeletonBlock className="mt-2 h-4 w-2/5" />
        <div className="mt-4 flex gap-2 border-t border-border pt-4">
          <SkeletonBlock className="h-9 flex-1" />
          <SkeletonBlock className="h-9 flex-1" />
          <SkeletonBlock className="size-9" />
        </div>
      </article>
    ))}
  </CardGrid>
);

export const SidebarSkeleton = ({ collapsed = false }: { collapsed?: boolean }) => (
  <div className="flex flex-1 flex-col gap-6" aria-label="Loading navigation">
    <div className="space-y-2">
      {!collapsed && <SkeletonBlock className="mx-3 h-3 w-24" />}
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonBlock key={i} className={collapsed ? "size-10" : "h-10 w-full"} />
      ))}
    </div>
    <div className="space-y-2">
      {!collapsed && <SkeletonBlock className="mx-3 h-3 w-32" />}
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className={collapsed ? "size-10" : "h-10 w-full"} />
      ))}
    </div>
    {!collapsed && (
      <div className="mt-auto space-y-3">
        <SkeletonBlock className="h-20 w-full rounded-2xl" />
        <SkeletonBlock className="h-8 w-3/4" />
      </div>
    )}
  </div>
);

export const SubjectPageSkeleton = ({ moduleView = false }: { moduleView?: boolean }) => (
  <div className="animate-fade-up mx-auto w-full max-w-6xl space-y-6">
    {moduleView && <SkeletonBlock className="h-4 w-36" />}
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
      <SkeletonBlock className={moduleView ? "h-7 w-1/2" : "h-8 w-2/5"} />
      <SkeletonBlock className="mt-3 h-4 w-56" />
    </div>
    {!moduleView && <SkeletonBlock className="h-10 w-full rounded-none" />}
    <DocumentGridSkeleton count={6} />
  </div>
);

export const BookmarksSkeleton = () => (
  <div className="animate-fade-up mx-auto w-full max-w-6xl space-y-6">
    <div className="rounded-3xl border border-warning/20 bg-warning/5 p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <SkeletonBlock className="size-12" />
        <div className="flex-1">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="mt-3 h-4 w-64" />
        </div>
      </div>
    </div>
    <DocumentGridSkeleton count={6} />
  </div>
);

export const HomeSkeleton = () => (
  <div className="animate-fade-up mx-auto w-full max-w-6xl space-y-8">
    <div className="flex flex-col items-center gap-4 pt-2 text-center">
      <SkeletonBlock className="h-12 w-3/4 max-w-md" />
      <SkeletonBlock className="h-4 w-1/2 max-w-sm" />
    </div>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  </div>
);

export const ProfileSkeleton = () => (
  <div className="animate-fade-up mx-auto w-full max-w-4xl space-y-4 pb-12">
    <SkeletonBlock className="hidden h-7 w-48 sm:block" />
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <SkeletonBlock className="size-20 rounded-full sm:size-14" />
        <div className="w-full flex-1 space-y-3">
          <SkeletonBlock className="mx-auto h-6 w-48 sm:mx-0" />
          <SkeletonBlock className="mx-auto h-4 w-64 sm:mx-0" />
          <SkeletonBlock className="mx-auto h-4 w-72 sm:mx-0" />
        </div>
        <SkeletonBlock className="h-9 w-full sm:w-28" />
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
    <div className="rounded-2xl border border-border bg-surface p-5">
      <SkeletonBlock className="h-9 w-full" />
      <SkeletonBlock className="mt-4 h-56 w-full rounded-2xl" />
    </div>
  </div>
);

export const CenteredSpinner = () => (
  <div className="col-span-full flex flex-col items-center justify-center gap-2 py-12">
    <RevizeMascot state="thinking" decorative className="size-14 animate-pulse" />
    <InlineSpinner className="text-primary" size={18} />
  </div>
);
