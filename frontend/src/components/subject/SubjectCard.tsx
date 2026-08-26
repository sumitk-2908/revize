"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import {
  patternStyle,
  type CardLayoutKey,
  type ResolvedSubjectDesign,
} from "@/app/lib/subject-design";
import { normalizeSubjectTitle } from "@/app/lib/subject-config";

export interface SubjectCardProps {
  /** Subject display name. */
  name: string;
  /** Approved resource count, shown in the footer pill. */
  count: number;
  design: ResolvedSubjectDesign;
  /** Where the card links to. Omit to render a non-navigating card, as the admin preview does. */
  href?: string;
  tabIndex?: number;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  /** Callback ref to the card root, so the grid can move focus between cards. */
  ref?: (element: HTMLElement | null) => void;
}

/**
 * One subject tile in the subject grid, rendered from an admin-chosen design.
 *
 * Deliberately shared with the admin designer's preview: if the preview used its own markup
 * it would drift from what students actually see. Pass `href` for the real grid, omit it for
 * a preview.
 */
export default function SubjectCard({
  name,
  count,
  design,
  href,
  tabIndex,
  onKeyDown,
  ref,
}: SubjectCardProps) {
  const { theme, Icon, layout, pattern, badge, span } = design;
  const isWide = span === "wide";
  const isInverted = layout === "solid";

  const shell: Record<CardLayoutKey, string> = {
    classic: "border border-border bg-surface",
    gradient: "border border-border bg-surface",
    spotlight: "border border-border bg-surface",
    minimal: "border border-border/50 bg-surface/70",
    solid: `border border-transparent ${theme.fill} ${theme.onFill}`,
    outline: `border-2 ${theme.border} bg-transparent`,
  };

  const titleClass = [
    "font-bold tracking-tight",
    layout === "spotlight" || isWide ? "text-xl" : "text-base",
    isInverted ? "" : "text-foreground",
  ].join(" ");

  const iconTile = (
    <div
      className={`flex items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${isWide ? "size-14 shrink-0" : "size-12"
        } ${isInverted ? "bg-white/20 text-current" : `${theme.iconBg} ${theme.icon}`}`}
    >
      <Icon size={isWide ? 28 : 24} />
    </div>
  );

  const badgePill = badge ? (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${isInverted ? "bg-white/20 text-current" : `${theme.fill} ${theme.onFill}`
        }`}
    >
      {badge}
    </span>
  ) : null;

  const countPill =
    count > 0 ? (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${isInverted ? "bg-white/20 text-current" : theme.pill
          }`}
      >
        <FileText size={14} />
        <span>
          {count} resource{count !== 1 ? "s" : ""}
        </span>
      </div>
    ) : (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${isInverted
          ? "bg-white/10 text-current opacity-80"
          : "border border-border/40 bg-background/50 text-muted"
          }`}
      >
        <div className={`size-1.5 rounded-full ${isInverted ? "bg-current" : "bg-muted/50"}`} />
        <span>No resources yet</span>
      </div>
    );

  // `currentColor` drives the pattern, so the wrapper's text colour tints it.
  const patternTone = isInverted ? theme.onFill : theme.icon;

  const header =
    layout === "gradient" ? (
      // The icon sits on the band; the title always clears it, so it stays readable.
      <>
        <div
          className={`flex items-center justify-center rounded-xl bg-white/25 text-white backdrop-blur-sm transition-transform group-hover:scale-110 ${isWide ? "size-14" : "size-12"
            }`}
        >
          <Icon size={isWide ? 28 : 24} />
        </div>
        <h2 className={`${isWide ? "mt-6" : "mt-9"} ${titleClass}`}>{normalizeSubjectTitle(name)}</h2>
      </>
    ) : layout === "minimal" ? (
      <div className="flex items-center gap-3">
        <span className={`shrink-0 ${theme.icon}`}>
          <Icon size={isWide ? 24 : 20} />
        </span>
        <h2 className={titleClass}>{normalizeSubjectTitle(name)}</h2>
      </div>
    ) : isWide ? (
      <div className="flex items-center gap-4">
        {iconTile}
        <h2 className={titleClass}>{normalizeSubjectTitle(name)}</h2>
      </div>
    ) : (
      <>
        {iconTile}
        <h2 className={`mt-4 ${titleClass}`}>{normalizeSubjectTitle(name)}</h2>
      </>
    );

  const body = (
    <>
      {layout === "classic" && <div className={`absolute top-0 left-0 h-1 w-full ${theme.fill}`} />}

      {layout === "gradient" && (
        <div
          aria-hidden
          className={`absolute top-0 left-0 h-24 w-full bg-linear-to-br ${theme.gradient}`}
        />
      )}

      {layout === "spotlight" && (
        <div
          aria-hidden
          className={`pointer-events-none absolute -right-6 -bottom-8 opacity-10 transition-transform duration-500 group-hover:scale-110 ${theme.icon}`}
        >
          <Icon size={132} strokeWidth={1.25} />
        </div>
      )}

      {/* Last of the decorations, so the texture reads evenly across the whole card. */}
      {pattern !== "none" && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${patternTone}`}
          style={patternStyle(pattern)}
        />
      )}

      <div className="relative flex w-full flex-1 flex-col justify-between p-5">
        <div className="w-full">{header}</div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {countPill}
          {badgePill}
        </div>
      </div>
    </>
  );

  const className = `group motion-hover motion-active relative flex w-full flex-col overflow-hidden rounded-2xl text-left shadow-sm transition-all duration-150 hover:-translate-y-1 hover:shadow-md ${shell[layout]}`;

  if (!href) {
    return (
      <div ref={ref} className={className}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      role="listitem"
      ref={ref}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      className={className}
    >
      {body}
    </Link>
  );
}
