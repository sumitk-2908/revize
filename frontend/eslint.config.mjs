import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tailwind from "eslint-plugin-tailwindcss";

/** Utilities this project defines itself in src/app/globals.css. */
const PROJECT_UTILITIES = [
  "motion\\-.*",        // motion-hover / -active / -focus / -dropdown / -modal / -sidebar
  "premium-transition",
  "custom-scrollbar",
  "hide-scrollbar",
  "ease-premium",
  "animate-fade-up",
  "pb-safe",
];

/**
 * The tailwindcss-animate vocabulary the Radix primitives are styled with.
 *
 * NOTE: no animate plugin is installed, so these currently resolve to nothing — the Radix
 * enter/exit animations are inert. Whitelisted to keep the lint signal readable; either add
 * `tw-animate-css` to make them real or strip them from the components.
 */
const RADIX_ANIMATE_UTILITIES = [
  "animate-in",
  "animate-out",
  "fade-in(-0)?",
  "fade-out(-0)?",
  "zoom-in-95",
  "zoom-out-95",
  "slide-in-from-.*",
  "slide-out-to-.*",
  "data-\\[state=.*",
];

/** Embla carousel's own class API, not Tailwind. */
const VENDOR_UTILITIES = ["embla(__.*)?"];

/**
 * The study panel's 3D flip, collapse and tab-panel primitives.
 *
 * Written as plain rules in globals.css rather than as Tailwind utilities because
 * they are driven by `data-` attributes Radix sets, and the `@layer utilities`
 * block those would have to live in is not variant-composable in Tailwind v4.
 */
const STUDY_PANEL_UTILITIES = [
  "study-flip",
  "study-flip-inner",
  "study-flip-face",
  "study-flip-back",
  "study-collapse",
  "study-panel",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  tailwind.configs.recommended,
  {
    plugins: { tailwindcss: tailwind },
    settings: {
      tailwindcss: {
        callees: ["classnames", "clsx", "ctl", "cva", "tv", "cn"],
        cssConfigPath: "./src/app/globals.css",
      },
    },
    rules: {
      // `whitelist` is a RULE OPTION in eslint-plugin-tailwindcss v4, not a shared setting.
      // Passing it under `settings.tailwindcss` (as this config used to) is silently ignored.
      "tailwindcss/no-custom-classname": [
        "error",
        { whitelist: [...PROJECT_UTILITIES, ...RADIX_ANIMATE_UTILITIES, ...VENDOR_UTILITIES, ...STUDY_PANEL_UTILITIES] },
      ],
      "tailwindcss/no-contradicting-classname": "error",
      // Arbitrary values are a first-class Tailwind feature and this codebase uses them
      // deliberately (the tracking-[0.06em] type scale, Radix dialog centring). Visible, not blocking.
      "tailwindcss/no-arbitrary-value": "warn",
      // Pre-existing `any` usage is being retired incrementally, not in one sweep.
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler rules new in Next 16. They flag real patterns, but each fix is a
      // behavioural change to existing effects, so they stay advisory until addressed.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
    // Untracked snapshot copies of real components, kept only as a lint baseline.
    "src/__lintbase/**",
  ]),
]);

export default eslintConfig;
