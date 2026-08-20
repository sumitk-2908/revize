import {
  Atom,
  Beaker,
  Binary,
  BookOpen,
  Brain,
  Calculator,
  CircuitBoard,
  Code,
  Cog,
  Cpu,
  Database,
  Dna,
  DraftingCompass,
  FlaskConical,
  Globe,
  Hammer,
  HardHat,
  Landmark,
  Languages,
  Leaf,
  Library,
  Lightbulb,
  MessageSquare,
  Microscope,
  Network,
  Palette,
  PenTool,
  Ruler,
  Scale,
  Sigma,
  Sparkles,
  Stethoscope,
  Terminal,
  TrendingUp,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { SUBJECT_UI_MAP } from "./subject-config";

/**
 * Per-subject appearance for the subject grid.
 *
 * Admins design a subject's card from the admin inbox; the chosen keys are stored on
 * `subjects.card_*` and resolved back to classes here. Two rules keep this working:
 *
 *  1. Every Tailwind class is written out in full below. Tailwind generates CSS by scanning
 *     source text, so a class assembled at runtime (`text-${colour}-500`) is never generated.
 *     Do not build class names from parts.
 *  2. An unknown key always falls back instead of throwing, so the database may hold a key
 *     from a newer or older deploy without breaking the grid.
 */

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export interface SubjectTheme {
  key: string;
  label: string;
  /** Icon glyph on a tinted surface. */
  icon: string;
  /** Tinted surface behind the icon. */
  iconBg: string;
  /** Saturated fill: accent bar, solid cards, badges. */
  fill: string;
  /** Readable foreground on top of `fill` — not every hue takes white. */
  onFill: string;
  /** Border for the outline layout. */
  border: string;
  /** Gradient stops, used with `bg-linear-to-br`. */
  gradient: string;
  /** Resource-count pill. */
  pill: string;
}

export const SUBJECT_THEMES: SubjectTheme[] = [
  {
    key: "indigo",
    label: "Indigo",
    icon: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-500/10",
    fill: "bg-indigo-500",
    onFill: "text-white",
    border: "border-indigo-500",
    gradient: "from-indigo-500 to-violet-600",
    pill: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  },
  {
    key: "violet",
    label: "Violet",
    icon: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-500/10",
    fill: "bg-violet-500",
    onFill: "text-white",
    border: "border-violet-500",
    gradient: "from-violet-500 to-fuchsia-600",
    pill: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  {
    key: "fuchsia",
    label: "Fuchsia",
    icon: "text-fuchsia-600 dark:text-fuchsia-400",
    iconBg: "bg-fuchsia-500/10",
    fill: "bg-fuchsia-500",
    onFill: "text-white",
    border: "border-fuchsia-500",
    gradient: "from-fuchsia-500 to-pink-600",
    pill: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  },
  {
    key: "rose",
    label: "Rose",
    icon: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-500/10",
    fill: "bg-rose-500",
    onFill: "text-white",
    border: "border-rose-500",
    gradient: "from-rose-500 to-red-600",
    pill: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  {
    key: "red",
    label: "Red",
    icon: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-500/10",
    fill: "bg-red-500",
    onFill: "text-white",
    border: "border-red-500",
    gradient: "from-red-500 to-orange-600",
    pill: "bg-red-500/10 text-red-700 dark:text-red-300",
  },
  {
    key: "orange",
    label: "Orange",
    icon: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-500/10",
    fill: "bg-orange-500",
    onFill: "text-white",
    border: "border-orange-500",
    gradient: "from-orange-500 to-amber-600",
    pill: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  {
    key: "amber",
    label: "Amber",
    icon: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10",
    fill: "bg-amber-500",
    onFill: "text-zinc-900",
    border: "border-amber-500",
    gradient: "from-amber-400 to-orange-500",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    key: "lime",
    label: "Lime",
    icon: "text-lime-600 dark:text-lime-400",
    iconBg: "bg-lime-500/10",
    fill: "bg-lime-500",
    onFill: "text-zinc-900",
    border: "border-lime-500",
    gradient: "from-lime-500 to-emerald-600",
    pill: "bg-lime-500/10 text-lime-700 dark:text-lime-300",
  },
  {
    key: "emerald",
    label: "Emerald",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10",
    fill: "bg-emerald-500",
    onFill: "text-white",
    border: "border-emerald-500",
    gradient: "from-emerald-500 to-teal-600",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "teal",
    label: "Teal",
    icon: "text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-500/10",
    fill: "bg-teal-500",
    onFill: "text-white",
    border: "border-teal-500",
    gradient: "from-teal-500 to-cyan-600",
    pill: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  },
  {
    key: "cyan",
    label: "Cyan",
    icon: "text-cyan-600 dark:text-cyan-400",
    iconBg: "bg-cyan-500/10",
    fill: "bg-cyan-500",
    onFill: "text-zinc-900",
    border: "border-cyan-500",
    gradient: "from-cyan-500 to-sky-600",
    pill: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  },
  {
    key: "sky",
    label: "Sky",
    icon: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-500/10",
    fill: "bg-sky-500",
    onFill: "text-white",
    border: "border-sky-500",
    gradient: "from-sky-500 to-indigo-600",
    pill: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  {
    key: "slate",
    label: "Slate",
    icon: "text-slate-600 dark:text-slate-300",
    iconBg: "bg-slate-500/10",
    fill: "bg-slate-600",
    onFill: "text-white",
    border: "border-slate-500",
    gradient: "from-slate-500 to-zinc-700",
    pill: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
];

const THEMES_BY_KEY = new Map(SUBJECT_THEMES.map(theme => [theme.key, theme]));
export const DEFAULT_THEME = SUBJECT_THEMES[0];

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

export interface SubjectIconOption {
  key: string;
  label: string;
  icon: LucideIcon;
}

/** Curated for engineering/science curricula — keys match the lucide component name. */
export const SUBJECT_ICONS: SubjectIconOption[] = [
  { key: "calculator", label: "Calculator", icon: Calculator },
  { key: "sigma", label: "Sigma", icon: Sigma },
  { key: "binary", label: "Binary", icon: Binary },
  { key: "atom", label: "Atom", icon: Atom },
  { key: "beaker", label: "Beaker", icon: Beaker },
  { key: "flask-conical", label: "Flask", icon: FlaskConical },
  { key: "microscope", label: "Microscope", icon: Microscope },
  { key: "dna", label: "DNA", icon: Dna },
  { key: "leaf", label: "Leaf", icon: Leaf },
  { key: "globe", label: "Globe", icon: Globe },
  { key: "stethoscope", label: "Stethoscope", icon: Stethoscope },
  { key: "terminal", label: "Terminal", icon: Terminal },
  { key: "code", label: "Code", icon: Code },
  { key: "database", label: "Database", icon: Database },
  { key: "cpu", label: "CPU", icon: Cpu },
  { key: "circuit-board", label: "Circuit", icon: CircuitBoard },
  { key: "network", label: "Network", icon: Network },
  { key: "zap", label: "Bolt", icon: Zap },
  { key: "wrench", label: "Wrench", icon: Wrench },
  { key: "cog", label: "Cog", icon: Cog },
  { key: "hammer", label: "Hammer", icon: Hammer },
  { key: "hard-hat", label: "Hard hat", icon: HardHat },
  { key: "pen-tool", label: "Pen tool", icon: PenTool },
  { key: "ruler", label: "Ruler", icon: Ruler },
  { key: "drafting-compass", label: "Compass", icon: DraftingCompass },
  { key: "palette", label: "Palette", icon: Palette },
  { key: "book-open", label: "Book", icon: BookOpen },
  { key: "library", label: "Library", icon: Library },
  { key: "message-square", label: "Speech", icon: MessageSquare },
  { key: "languages", label: "Languages", icon: Languages },
  { key: "users", label: "People", icon: Users },
  { key: "brain", label: "Brain", icon: Brain },
  { key: "lightbulb", label: "Lightbulb", icon: Lightbulb },
  { key: "scale", label: "Scale", icon: Scale },
  { key: "landmark", label: "Landmark", icon: Landmark },
  { key: "trending-up", label: "Trending", icon: TrendingUp },
  { key: "sparkles", label: "Sparkles", icon: Sparkles },
];

const ICONS_BY_KEY = new Map(SUBJECT_ICONS.map(option => [option.key, option]));
const ICON_KEYS_BY_COMPONENT = new Map(SUBJECT_ICONS.map(option => [option.icon, option.key]));
export const DEFAULT_ICON_KEY = "book-open";

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export type CardLayoutKey = "classic" | "gradient" | "spotlight" | "minimal" | "solid" | "outline";
export type CardPatternKey = "none" | "dots" | "grid" | "rays";
export type CardSpanKey = "normal" | "wide";

export const CARD_LAYOUTS: { key: CardLayoutKey; label: string; hint: string }[] = [
  { key: "classic", label: "Classic", hint: "Accent bar with a tinted icon tile" },
  { key: "gradient", label: "Gradient", hint: "Colour-washed header band" },
  { key: "spotlight", label: "Spotlight", hint: "Oversized watermark icon" },
  { key: "minimal", label: "Minimal", hint: "Quiet, icon beside the title" },
  { key: "solid", label: "Solid", hint: "Whole card in the theme colour" },
  { key: "outline", label: "Outline", hint: "Transparent with a bold border" },
];

export const CARD_PATTERNS: { key: CardPatternKey; label: string }[] = [
  { key: "none", label: "None" },
  { key: "dots", label: "Dots" },
  { key: "grid", label: "Grid" },
  { key: "rays", label: "Rays" },
];

export const CARD_SPANS: { key: CardSpanKey; label: string; hint: string }[] = [
  { key: "normal", label: "Normal", hint: "One column" },
  { key: "wide", label: "Wide", hint: "Spans two columns" },
];

const LAYOUT_KEYS = new Set<string>(CARD_LAYOUTS.map(layout => layout.key));
const PATTERN_KEYS = new Set<string>(CARD_PATTERNS.map(pattern => pattern.key));
const SPAN_KEYS = new Set<string>(CARD_SPANS.map(span => span.key));

/**
 * Decorative overlay for a card. Built with `currentColor` in inline CSS rather than
 * Tailwind arbitrary values, so it picks up whatever theme colour the wrapper sets and
 * never depends on the class scanner.
 */
export const patternStyle = (pattern: CardPatternKey): CSSProperties | undefined => {
  switch (pattern) {
    case "dots":
      return {
        backgroundImage: "radial-gradient(currentColor 1px, transparent 1.5px)",
        backgroundSize: "12px 12px",
        opacity: 0.18,
      };
    case "grid":
      return {
        backgroundImage:
          "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
        backgroundSize: "16px 16px",
        opacity: 0.14,
      };
    case "rays":
      return {
        backgroundImage:
          "repeating-linear-gradient(45deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 9px)",
        opacity: 0.12,
      };
    default:
      return undefined;
  }
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** The `subjects` columns this module reads. `Subject` satisfies it structurally. */
export interface SubjectDesignSource {
  slug: string;
  card_theme?: string | null;
  card_icon?: string | null;
  card_layout?: string | null;
  card_pattern?: string | null;
  card_badge?: string | null;
  card_span?: string | null;
}

/** Editable shape: `null` on a field means "fall back to the derived default". */
export interface SubjectDesignInput {
  card_theme: string | null;
  card_icon: string | null;
  card_layout: string | null;
  card_pattern: string | null;
  card_badge: string | null;
  card_span: string | null;
}

export interface ResolvedSubjectDesign {
  theme: SubjectTheme;
  iconKey: string;
  Icon: LucideIcon;
  layout: CardLayoutKey;
  pattern: CardPatternKey;
  badge: string | null;
  span: CardSpanKey;
}

export const AUTO_DESIGN: SubjectDesignInput = {
  card_theme: null,
  card_icon: null,
  card_layout: null,
  card_pattern: null,
  card_badge: null,
  card_span: null,
};

/** Slug keywords → icon, so a brand-new subject still gets a meaningful glyph. */
const ICON_KEYWORDS: [string, string][] = [
  ["lab", "flask-conical"],
  ["workshop", "hammer"],
  ["math", "calculator"],
  ["calculus", "sigma"],
  ["algebra", "sigma"],
  ["statistic", "trending-up"],
  ["physic", "atom"],
  ["chem", "beaker"],
  ["bio", "leaf"],
  ["micro", "microscope"],
  ["genet", "dna"],
  ["med", "stethoscope"],
  ["environment", "globe"],
  ["geo", "globe"],
  ["program", "terminal"],
  ["pps", "terminal"],
  ["code", "code"],
  ["software", "code"],
  ["algorithm", "binary"],
  ["data", "database"],
  ["comput", "cpu"],
  ["processor", "cpu"],
  ["digital", "circuit-board"],
  ["electron", "circuit-board"],
  ["network", "network"],
  ["communication-skill", "message-square"],
  ["commun", "network"],
  ["electric", "zap"],
  ["bee", "zap"],
  ["power", "zap"],
  ["mech", "wrench"],
  ["machine", "cog"],
  ["thermo", "cog"],
  ["manufactur", "hammer"],
  ["civil", "hard-hat"],
  ["structur", "hard-hat"],
  ["survey", "ruler"],
  ["graphic", "pen-tool"],
  ["draw", "drafting-compass"],
  ["design", "palette"],
  ["english", "languages"],
  ["language", "languages"],
  ["literature", "library"],
  ["nss", "users"],
  ["social", "users"],
  ["psych", "brain"],
  ["philosoph", "brain"],
  ["ethic", "scale"],
  ["law", "scale"],
  ["constitution", "landmark"],
  ["histor", "landmark"],
  ["econom", "trending-up"],
  ["manage", "trending-up"],
  ["account", "trending-up"],
  ["business", "trending-up"],
  ["entrepreneur", "lightbulb"],
  ["innovation", "lightbulb"],
];

const LEGACY_COLOR_TO_THEME: Record<string, string> = {
  "text-primary": "indigo",
  "text-success": "emerald",
  "text-warning": "amber",
  "text-destructive": "rose",
  "text-sky-500": "sky",
};

/** Stable, order-independent hash so a subject's derived look never shifts between renders. */
const hashSlug = (slug: string) => {
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

/**
 * The look a subject gets before anyone designs it.
 *
 * Prefers the legacy `SUBJECT_UI_MAP` entry so subjects that already had a colour keep it,
 * then falls back to a keyword-matched icon and a hash-picked palette — which is what stops
 * every undesigned subject from being an identical indigo book.
 */
const deriveDesign = (slug: string): { theme: SubjectTheme; iconKey: string } => {
  const normalized = slug.toLowerCase();
  const legacy = SUBJECT_UI_MAP[normalized] as { icon?: LucideIcon; color?: string } | undefined;
  const isLegacyDefault = normalized === "default" || legacy === SUBJECT_UI_MAP["default"];

  let theme: SubjectTheme | undefined;
  let iconKey: string | undefined;

  if (legacy && !isLegacyDefault) {
    theme = THEMES_BY_KEY.get(LEGACY_COLOR_TO_THEME[legacy.color ?? ""] ?? "");
    iconKey = legacy.icon ? ICON_KEYS_BY_COMPONENT.get(legacy.icon) : undefined;
  }

  if (!iconKey) {
    iconKey = ICON_KEYWORDS.find(([keyword]) => normalized.includes(keyword))?.[1];
  }

  if (!theme) {
    theme = SUBJECT_THEMES[hashSlug(normalized) % SUBJECT_THEMES.length];
  }

  return { theme, iconKey: iconKey ?? DEFAULT_ICON_KEY };
};

const asLayout = (value: string | null | undefined): CardLayoutKey | undefined =>
  value && LAYOUT_KEYS.has(value) ? (value as CardLayoutKey) : undefined;

const asPattern = (value: string | null | undefined): CardPatternKey | undefined =>
  value && PATTERN_KEYS.has(value) ? (value as CardPatternKey) : undefined;

const asSpan = (value: string | null | undefined): CardSpanKey | undefined =>
  value && SPAN_KEYS.has(value) ? (value as CardSpanKey) : undefined;

/** Resolves a design from a slug plus (possibly partial) saved values. Never throws. */
export const resolveDesign = (slug: string, saved: SubjectDesignSource | SubjectDesignInput): ResolvedSubjectDesign => {
  const derived = deriveDesign(slug);
  const theme = (saved.card_theme ? THEMES_BY_KEY.get(saved.card_theme) : undefined) ?? derived.theme;
  const iconKey = (saved.card_icon && ICONS_BY_KEY.has(saved.card_icon) ? saved.card_icon : undefined) ?? derived.iconKey;
  const badge = saved.card_badge?.trim();

  return {
    theme,
    iconKey,
    Icon: ICONS_BY_KEY.get(iconKey)?.icon ?? BookOpen,
    layout: asLayout(saved.card_layout) ?? "classic",
    pattern: asPattern(saved.card_pattern) ?? "none",
    badge: badge ? badge : null,
    span: asSpan(saved.card_span) ?? "normal",
  };
};

export const resolveSubjectDesign = (subject: SubjectDesignSource): ResolvedSubjectDesign =>
  resolveDesign(subject.slug, subject);

/** Pulls the editable values out of a subject row, for the admin designer's form state. */
export const designInputFromSubject = (subject: SubjectDesignSource): SubjectDesignInput => ({
  card_theme: subject.card_theme ?? null,
  card_icon: subject.card_icon ?? null,
  card_layout: subject.card_layout ?? null,
  card_pattern: subject.card_pattern ?? null,
  card_badge: subject.card_badge ?? null,
  card_span: subject.card_span ?? null,
});

/** True once an admin has saved at least one choice — drives the "Custom" vs "Auto" tag. */
export const hasCustomDesign = (subject: SubjectDesignSource) =>
  Boolean(
    subject.card_theme ||
      subject.card_icon ||
      subject.card_layout ||
      subject.card_pattern ||
      subject.card_badge ||
      subject.card_span,
  );

/** Grid class for a card's width. Kept here so the grid and the preview cannot disagree. */
export const spanClass = (span: CardSpanKey) => (span === "wide" ? "sm:col-span-2" : "");
