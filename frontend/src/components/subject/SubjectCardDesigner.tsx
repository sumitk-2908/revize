"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/api/core";
import { getSubjects, updateSubjectDesign, type Subject } from "@/app/lib/api/subjects";
import { revalidateContentCache } from "@/app/actions/cache";
import {
  AUTO_DESIGN,
  CARD_LAYOUTS,
  CARD_PATTERNS,
  CARD_SPANS,
  SUBJECT_ICONS,
  SUBJECT_THEMES,
  designInputFromSubject,
  hasCustomDesign,
  patternStyle,
  resolveDesign,
  resolveSubjectDesign,
  spanClass,
  type CardLayoutKey,
  type SubjectDesignInput,
  type SubjectTheme,
} from "@/app/lib/subject-design";
import SubjectCard from "./SubjectCard";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import { useNotifications } from "@/app/context/NotificationsContext";
import { RotateCcw, Save, Search, Shuffle, X } from "lucide-react";

/** Shown in the preview only when the real counts could not be read. */
const SAMPLE_COUNT = 4;

const BADGE_SUGGESTIONS = ["Core", "Lab", "Elective", "New", "PYQ only"];

const sameDesign = (a: SubjectDesignInput, b: SubjectDesignInput) =>
  a.card_theme === b.card_theme &&
  a.card_icon === b.card_icon &&
  a.card_layout === b.card_layout &&
  a.card_pattern === b.card_pattern &&
  (a.card_badge || null) === (b.card_badge || null) &&
  a.card_span === b.card_span;

/** Tiny abstract of each card layout, so the picker reads at a glance. */
function LayoutSchematic({ layout, theme }: { layout: CardLayoutKey; theme: SubjectTheme }) {
  const fill = theme.fill;
  return (
    <span className="relative block h-8 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-background">
      {layout === "classic" && (
        <>
          <span className={`absolute inset-x-0 top-0 h-1 ${fill}`} />
          <span className={`absolute top-2.5 left-1.5 size-3 rounded-sm ${fill} opacity-40`} />
        </>
      )}
      {layout === "gradient" && <span className={`absolute inset-x-0 top-0 h-3.5 ${fill}`} />}
      {layout === "spotlight" && (
        <span className={`absolute -right-1 -bottom-1 size-5 rounded-full ${fill} opacity-40`} />
      )}
      {layout === "minimal" && (
        <span className={`absolute top-3 left-1.5 h-1.5 w-7 rounded-full ${fill} opacity-40`} />
      )}
      {layout === "solid" && <span className={`absolute inset-0 ${fill}`} />}
      {layout === "outline" && <span className={`absolute inset-0.5 rounded border-2 ${theme.border}`} />}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-xs font-bold tracking-[0.06em] text-muted uppercase">{label}</h3>
        {hint && <span className="text-xs font-medium text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Admin-only designer for the subject grid cards.
 *
 * Lives inside the admin inbox, which `src/proxy.ts` gates on an admin row plus AAL2, and
 * writes through admin-only RLS on `subjects`. The preview reuses the real `SubjectCard`, so
 * what an admin approves here is literally what students get.
 */
export default function SubjectCardDesigner() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SubjectDesignInput>(AUTO_DESIGN);
  const [saving, setSaving] = useState(false);

  const { setGlobalToast } = useNotifications();
  const toast = (message: string, type: "success" | "error") =>
    setGlobalToast({ open: true, title: type === "error" ? "Error" : "Success", message, type });

  useEffect(() => {
    let active = true;

    const loadSubjects = async () => {
      try {
        const data = await getSubjects();
        if (!active) return;
        setSubjects(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
          setDraft(designInputFromSubject(data[0]));
        }
      } catch {
        // The error panel below covers this; no toast, so the effect stays dependency-free.
        if (active) setLoadFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    // Real resource counts make the preview pill truthful. Non-fatal: the designer still
    // works with a sample count if this read fails.
    const loadCounts = async () => {
      const { data, error } = await supabase.rpc("get_subject_counts");
      if (!active || error || !data) return;
      const next: Record<string, number> = {};
      data.forEach((row) => {
        if (row.subject) next[row.subject.toUpperCase()] = Number(row.count);
      });
      setCounts(next);
      setCountsLoaded(true);
    };

    loadSubjects();
    loadCounts();

    return () => { active = false; };
  }, []);

  const selected = subjects.find(s => s.id === selectedId) ?? null;
  const isDirty = selected ? !sameDesign(draft, designInputFromSubject(selected)) : false;

  const selectSubject = (subject: Subject) => {
    if (subject.id === selectedId) return;
    if (isDirty && !confirm("Discard unsaved card design changes?")) return;
    setSelectedId(subject.id);
    setDraft(designInputFromSubject(subject));
  };

  const update = (patch: Partial<SubjectDesignInput>) => setDraft(prev => ({ ...prev, ...patch }));

  const shuffle = () => {
    const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
    update({
      card_theme: pick(SUBJECT_THEMES).key,
      card_icon: pick(SUBJECT_ICONS).key,
      card_layout: pick(CARD_LAYOUTS).key,
      card_pattern: pick(CARD_PATTERNS).key,
    });
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateSubjectDesign(selected.id, draft);
      setSubjects(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      setDraft(designInputFromSubject(updated));
      await revalidateContentCache();
      toast(`Saved the card design for ${updated.name}.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the card design.", "error");
    } finally {
      setSaving(false);
    }
  };

  const countFor = (subject: Subject) =>
    countsLoaded ? counts[subject.name.toUpperCase()] || 0 : SAMPLE_COUNT;

  const search = query.trim().toLowerCase();
  const visibleSubjects = subjects.filter(
    s => !search || s.name.toLowerCase().includes(search) || s.slug.includes(search),
  );

  // Neighbours give the preview its point: is this card actually distinguishable in a row?
  const selectedIndex = subjects.findIndex(s => s.id === selectedId);
  const before = subjects[selectedIndex - 1] ?? subjects[selectedIndex + 2] ?? null;
  const after = subjects[selectedIndex + 1] ?? subjects[selectedIndex - 2] ?? null;

  const preview = selected ? resolveDesign(selected.slug, draft) : null;

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-border bg-surface p-12">
        <InlineSpinner label="Loading subjects" size={20} />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">Subjects could not be loaded</h2>
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">
          The card designer needs the subject list. Reload the page to try again.
        </p>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-hover/50 p-8 text-center">
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">No subjects to design yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">
          Add a subject under Manage Content first, then come back to design its card.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* SUBJECT PICKER */}
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="relative mb-3">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            inputMode="search"
            aria-label="Search subjects to design"
            placeholder="Search subjects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="motion-focus w-full rounded-xl border border-border bg-background px-10 py-2 text-sm font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-muted focus:border-primary"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear subject search"
              className="motion-hover absolute inset-y-0 right-3 flex items-center text-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="custom-scrollbar max-h-128 flex-1 space-y-2 overflow-y-auto pr-1">
          {visibleSubjects.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No subjects match that search.</p>
          ) : (
            visibleSubjects.map(subject => {
              const isSelected = subject.id === selectedId;
              const rowDesign = resolveSubjectDesign(subject);
              const custom = hasCustomDesign(subject);
              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => selectSubject(subject)}
                  aria-current={isSelected}
                  className={`motion-hover flex w-full items-center gap-3 rounded-xl border p-2.5 text-left ${
                    isSelected ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-surface-hover"
                  }`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${rowDesign.theme.iconBg} ${rowDesign.theme.icon}`}
                  >
                    <rowDesign.Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{subject.name}</span>
                    <span className="block truncate text-xs text-muted">/{subject.slug}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                      custom ? "bg-primary/15 text-primary" : "bg-surface-hover text-muted"
                    }`}
                  >
                    {custom ? "Custom" : "Auto"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* PREVIEW + CONTROLS */}
      {selected && preview && (
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">{selected.name}</h2>
                <p className="text-xs font-medium text-muted">
                  Live preview beside its neighbours{countsLoaded ? "" : " · sample resource counts"}
                </p>
              </div>
              {isDirty && (
                <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="rounded-xl bg-background p-4">
              <div
                className={`grid grid-cols-1 gap-4 ${preview.span === "wide" ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
              >
                {before && (
                  <div className="hidden opacity-60 sm:flex">
                    <SubjectCard
                      name={before.name}
                      count={countFor(before)}
                      design={resolveSubjectDesign(before)}
                    />
                  </div>
                )}
                <div className={`flex ${spanClass(preview.span)}`}>
                  <SubjectCard name={selected.name} count={countFor(selected)} design={preview} />
                </div>
                {after && (
                  <div className="hidden opacity-60 sm:flex">
                    <SubjectCard
                      name={after.name}
                      count={countFor(after)}
                      design={resolveSubjectDesign(after)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <Field label="Colour" hint={preview.theme.label}>
              <div className="flex flex-wrap gap-2">
                {SUBJECT_THEMES.map(theme => {
                  const active = preview.theme.key === theme.key;
                  return (
                    <button
                      key={theme.key}
                      type="button"
                      title={theme.label}
                      aria-label={theme.label}
                      aria-pressed={active}
                      onClick={() => update({ card_theme: theme.key })}
                      className={`motion-hover size-8 rounded-full ${theme.fill} ${
                        active
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface"
                          : "opacity-60 hover:opacity-100"
                      }`}
                    />
                  );
                })}
              </div>
            </Field>

            <Field label="Icon">
              <div className="custom-scrollbar grid max-h-40 grid-cols-8 gap-2 overflow-y-auto pr-1 sm:grid-cols-10">
                {SUBJECT_ICONS.map(({ key, label, icon: Icon }) => {
                  const active = preview.iconKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={active}
                      onClick={() => update({ card_icon: key })}
                      className={`motion-hover flex aspect-square items-center justify-center rounded-lg border ${
                        active
                          ? `border-primary bg-primary/10 ${preview.theme.icon}`
                          : "border-border bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      <Icon size={18} />
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Card style">
              <div className="grid gap-2 sm:grid-cols-3">
                {CARD_LAYOUTS.map(({ key, label, hint }) => {
                  const active = preview.layout === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ card_layout: key })}
                      className={`motion-hover flex items-center gap-3 rounded-xl border p-2.5 text-left ${
                        active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-surface-hover"
                      }`}
                    >
                      <LayoutSchematic layout={key} theme={preview.theme} />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-foreground">{label}</span>
                        <span className="block truncate text-xs text-muted">{hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Texture">
                <div className="flex flex-wrap gap-2">
                  {CARD_PATTERNS.map(({ key, label }) => {
                    const active = preview.pattern === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => update({ card_pattern: key })}
                        className={`motion-hover flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm font-bold ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted hover:text-foreground"
                        }`}
                      >
                        <span className="relative block size-6 overflow-hidden rounded border border-border bg-background">
                          <span
                            className={`absolute inset-0 ${preview.theme.icon}`}
                            style={patternStyle(key)}
                          />
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Width">
                <div className="flex flex-wrap gap-2">
                  {CARD_SPANS.map(({ key, label, hint }) => {
                    const active = preview.span === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={hint}
                        aria-pressed={active}
                        onClick={() => update({ card_span: key })}
                        className={`motion-hover rounded-xl border px-3 py-2 text-sm font-bold ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <Field label="Badge" hint="optional">
              <input
                type="text"
                maxLength={24}
                aria-label="Card badge text"
                placeholder="e.g. Core"
                value={draft.card_badge ?? ""}
                onChange={(e) => update({ card_badge: e.target.value || null })}
                className="motion-focus w-full rounded-xl border border-border bg-background p-2.5 text-sm font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-muted focus:border-primary"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {BADGE_SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => update({ card_badge: suggestion })}
                    className="motion-hover rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
                {draft.card_badge && (
                  <button
                    type="button"
                    onClick={() => update({ card_badge: null })}
                    className="motion-hover inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted hover:text-destructive"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
            </Field>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={save}
                disabled={saving || !isDirty}
                className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <InlineSpinner label="Saving design" size={16} /> : <Save size={15} />}
                Save design
              </button>
              <button
                type="button"
                onClick={shuffle}
                className="motion-hover motion-active flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-surface-hover"
              >
                <Shuffle size={15} /> Shuffle
              </button>
              <button
                type="button"
                onClick={() => update(AUTO_DESIGN)}
                className="motion-hover motion-active flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted hover:text-foreground"
              >
                <RotateCcw size={15} /> Reset to auto
              </button>
              <p className="text-xs font-medium text-muted">
                Reset clears every choice — save to apply the automatic look.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
