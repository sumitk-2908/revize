"use client";
import { Medal, UploadCloud, Flame, Download, Star, Compass, Bookmark, Trophy, type LucideIcon } from "lucide-react";

/**
 * Master list of all possible badges.
 *
 * Every id here is awarded by a trigger in
 * supabase/migrations/20260822000002_achievements_rework.sql. That matters:
 * before that migration `downloads_100` and `scholar` were advertised on this
 * page but had no awarding logic anywhere in the codebase, so they could never
 * be unlocked. Do not add a tile without adding the trigger that grants it.
 *
 * `aliases` covers badge ids that were renamed, so a row already in
 * user_achievements still lights up its tile.
 */
const ALL_BADGES: {
  id: string;
  aliases?: string[];
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}[] = [
  { id: "explorer", title: "Explorer", description: "Opened 3 documents", icon: Compass, color: "text-sky-500", bg: "bg-sky-500/10" },
  { id: "curator", title: "Curator", description: "Bookmarked 3 resources", icon: Bookmark, color: "text-rose-500", bg: "bg-rose-500/10" },
  { id: "streak_3", title: "3 Day Streak", description: "Studied 3 days in a row", icon: Flame, color: "text-orange-500", bg: "bg-orange-500/10" },
  { id: "pioneer", title: "Pioneer", description: "Uploaded your first resource", icon: UploadCloud, color: "text-blue-500", bg: "bg-blue-500/10" },
  { id: "scholar", title: "Scholar", description: "Opened 15 different documents", icon: Medal, color: "text-purple-500", bg: "bg-purple-500/10" },
  { id: "contributor", title: "Top Contributor", description: "Got 3 uploads approved", icon: Star, color: "text-amber-500", bg: "bg-amber-500/10" },
  { id: "downloads_10", aliases: ["downloads_100"], title: "Impact Maker", description: "Reached 10 downloads on your uploads", icon: Download, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { id: "streak_7", title: "7 Day Streak", description: "Studied 7 days in a row", icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-500/10" },
];

export default function AchievementsList({ achievements }: { achievements: { badge_type: string; earned_at?: string | null }[] }) {
  // badge_type, not badge_id — the column is badge_type and reading badge_id
  // yields undefined for every row.
  const earnedAt = new Map<string, string | null>(
    achievements.map((a) => [a.badge_type, a.earned_at ?? null])
  );

  const unlockedCount = ALL_BADGES.filter(
    (badge) => earnedAt.has(badge.id) || badge.aliases?.some((alias) => earnedAt.has(alias))
  ).length;

  return (
    <div>
      <p className="mb-4 text-xs font-bold tracking-[0.06em] text-muted uppercase tabular-nums">
        {unlockedCount} of {ALL_BADGES.length} unlocked
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        {ALL_BADGES.map((badge) => {
          const matchedId = earnedAt.has(badge.id)
            ? badge.id
            : badge.aliases?.find((alias) => earnedAt.has(alias));
          const isEarned = Boolean(matchedId);
          const earnedOn = matchedId ? earnedAt.get(matchedId) : null;
          const Icon = badge.icon;

          return (
            <div
              key={badge.id}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all sm:flex-row sm:items-start sm:gap-4 sm:p-4 sm:text-left ${
                isEarned
                  ? "border-border bg-surface shadow-sm"
                  : "border-dashed border-border bg-surface-hover opacity-75 grayscale"
              }`}
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12 ${
                  isEarned ? badge.bg : "bg-background"
                }`}
              >
                <Icon
                  className={`size-5 sm:size-6 ${
                    isEarned ? badge.color : "text-gray-400"
                  }`}
                />
              </div>

              <div className="w-full min-w-0 flex-1">
                <h4 className="mb-0.5 truncate text-xs font-bold text-foreground sm:text-sm">
                  {badge.title}
                </h4>

                <p className="line-clamp-2 text-xs leading-tight text-muted">
                  {badge.description}
                </p>

                {isEarned && (
                  <div className="mt-2 inline-block rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-bold tracking-wider text-emerald-600 uppercase sm:px-2">
                    {earnedOn
                      ? new Date(earnedOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "Unlocked"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
