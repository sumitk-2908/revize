"use client";
import { useMemo } from "react";
import type { StudyActivityDay } from "@/app/lib/api/history";

/**
 * Every date in this component is handled in UTC.
 *
 * `study_activity.activity_date` and `study_streaks.last_active_date` are both
 * stamped from `timezone('utc', now())::date`, so UTC is the only day boundary
 * that makes the grid agree with the streak counter.
 *
 * It also fixes a real off-by-one: the grid used to be built from
 * `new Date(year, 0, 1)` (local midnight) and then keyed with
 * `toISOString().split("T")[0]` (UTC), which shifts the label back a day for
 * every user east of Greenwich — so in IST every cell was mislabelled and
 * nothing lined up with the activity keys.
 */
const utcDayKey = (date: Date) => date.toISOString().slice(0, 10);

interface ActivityHeatmapProps {
  /** Legacy fallback: one row per document, so it under-reports days. */
  history: { accessed_at?: string | null; created_at?: string | null }[];
  /** Authoritative per-day counts from `study_activity`. */
  activity?: StudyActivityDay[];
}

export default function ActivityHeatmap({ history, activity = [] }: ActivityHeatmapProps) {
  const { days, startPadding, monthLabels, currentYear, activeDays, totalInteractions } = useMemo(() => {
    const activityMap: Record<string, number> = {};

    // study_history first, as a floor for days recorded before study_activity
    // existed. It cannot show more days than documents opened.
    history.forEach(item => {
      const stamp = item.accessed_at || item.created_at;
      if (!stamp) return;
      const parsed = new Date(stamp);
      if (Number.isNaN(parsed.getTime())) return;
      const dateStr = utcDayKey(parsed);
      activityMap[dateStr] = (activityMap[dateStr] || 0) + 1;
    });

    // study_activity wins. Its backfill already folded in the study_history
    // rows for the days it covers, so take the larger value rather than summing.
    activity.forEach(row => {
      if (!row?.activity_date) return;
      const dateStr = row.activity_date.slice(0, 10);
      activityMap[dateStr] = Math.max(activityMap[dateStr] || 0, row.interaction_count || 1);
    });

    // 1. Lock to the current calendar year
    const currentYear = new Date().getUTCFullYear();
    const totalDays = Math.round(
      (Date.UTC(currentYear + 1, 0, 1) - Date.UTC(currentYear, 0, 1)) / 86400000
    );

    // 2. Generate exactly 365 (or 366 for leap years) days
    const dates = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(Date.UTC(currentYear, 0, 1 + i));
      const dateStr = utcDayKey(d);

      dates.push({
        date: dateStr,
        count: activityMap[dateStr] || 0,
        jsDate: d,
      });
    }

    const padding = dates.length > 0 ? dates[0].jsDate.getUTCDay() : 0;

    // 3. Generate Month Labels (Jan, Feb, Mar...)
    const labels = [];
    let currentMonth = -1;
    const totalCells = padding + dates.length;
    const totalCols = Math.ceil(totalCells / 7);

    for (let col = 0; col < totalCols; col++) {
      let firstValidDay = null;
      for (let row = 0; row < 7; row++) {
        const cellIndex = col * 7 + row;
        const dayIndex = cellIndex - padding;
        if (dayIndex >= 0 && dayIndex < dates.length) {
          firstValidDay = dates[dayIndex].jsDate;
          break;
        }
      }

      if (firstValidDay) {
        const month = firstValidDay.getUTCMonth();
        if (month !== currentMonth) {
          labels.push({
            label: firstValidDay.toLocaleString("default", { month: "short", timeZone: "UTC" }),
            colIndex: col,
          });
          currentMonth = month;
        }
      }
    }

    return {
      days: dates,
      startPadding: padding,
      monthLabels: labels,
      currentYear,
      activeDays: dates.filter(d => d.count > 0).length,
      totalInteractions: dates.reduce((sum, d) => sum + d.count, 0),
    };
  }, [history, activity]);

  const getColor = (count: number) => {
    if (count === 0) return "bg-[#ebedf0] dark:bg-[#161b22]";
    if (count === 1) return "bg-[#9be9a8] dark:bg-[#0e4429]";
    if (count <= 3) return "bg-[#40c463] dark:bg-[#006d32]";
    if (count <= 5) return "bg-[#30a14e] dark:bg-[#26a641]";
    return "bg-[#216e39] dark:bg-[#39d353]";
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#24292f] dark:text-[#e6edf3]">
          {/* Added the dynamic year to the title so users know what year they are looking at */}
          Study Activity ({currentYear})
        </h3>
        {/* Stated plainly so the grid can be checked against the streak counter,
            which is what surfaced the two-days-versus-four-day-streak bug. */}
        <p className="text-xs font-semibold text-[#656d76] tabular-nums dark:text-[#8b949e]">
          {activeDays} active {activeDays === 1 ? "day" : "days"} · {totalInteractions} interactions
        </p>
      </div>

      <div className="hide-scrollbar overflow-x-auto pb-2">
        <div className="flex min-w-max gap-1">
          <div className="mt-[15px] flex flex-col gap-[3px] pr-2 text-xs text-[#656d76] dark:text-[#8b949e]">
            <span className="h-[10px]"></span>
            <span className="h-[10px] leading-[10px]">Mon</span>
            <span className="h-[10px]"></span>
            <span className="h-[10px] leading-[10px]">Wed</span>
            <span className="h-[10px]"></span>
            <span className="h-[10px] leading-[10px]">Fri</span>
            <span className="h-[10px]"></span>
          </div>

          <div className="flex flex-col gap-[2px]">
            <div className="relative h-[13px] w-full">
              {monthLabels.map((m, idx) => (
                <span
                  key={idx}
                  className="absolute text-xs text-[#24292f] dark:text-[#e6edf3]"
                  style={{ left: m.colIndex * 13 }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
              {Array.from({ length: startPadding }).map((_, i) => (
                <div
                  key={`pad-${i}`}
                  className="size-[10px] rounded-[2px] bg-transparent"
                />
              ))}

              {days.map((day, idx) => (
                <div
                  key={idx}
                  title={`${day.count} interactions on ${day.date}`}
                  className={`size-[10px] rounded-[2px] ${getColor(day.count)} cursor-pointer transition-all hover:ring-1 hover:ring-black/50 dark:hover:ring-white/50`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-1 text-xs text-[#656d76] dark:text-[#8b949e]">
        <span className="mr-1">Less</span>
        <div className="size-[10px] rounded-[2px] bg-[#ebedf0] dark:bg-[#161b22]" />
        <div className="size-[10px] rounded-[2px] bg-[#9be9a8] dark:bg-[#0e4429]" />
        <div className="size-[10px] rounded-[2px] bg-[#40c463] dark:bg-[#006d32]" />
        <div className="size-[10px] rounded-[2px] bg-[#30a14e] dark:bg-[#26a641]" />
        <div className="size-[10px] rounded-[2px] bg-[#216e39] dark:bg-[#39d353]" />
        <span className="ml-1">More</span>
      </div>
    </div>
  );
}
