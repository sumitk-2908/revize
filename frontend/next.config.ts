import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withPWAInit from "@ducanh2912/next-pwa";
import withBundleAnalyzerInit from "@next/bundle-analyzer";

const withBundleAnalyzer = withBundleAnalyzerInit({
  enabled: process.env.ANALYZE === 'true',
});

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // register and skipWaiting are handled automatically by this package!
  cacheOnFrontEndNav: true, 
  // Add explicit fallback routing for offline support
  fallbacks: {
    document: "/~offline",
  },
});

// Derive CSP origins from the same env vars the client uses, so the allow-list
// can never drift from the project/backend the app actually talks to.
const toOrigin = (value: string | undefined) => {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

const supabaseOrigin = toOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseSocketOrigin = supabaseOrigin.replace(/^http/, "ws");
const apiOrigin = toOrigin(process.env.NEXT_PUBLIC_API_URL);

// Documents live in Cloudflare R2. This origin was previously hardcoded and had
// drifted to a bucket that no longer holds the files, so connect-src silently
// blocked every PDF fetch and blob download. Derive it from env like the rest.
const r2Origin = toOrigin(process.env.NEXT_PUBLIC_R2_PUBLIC_URL);

if (!supabaseOrigin) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is missing or invalid; the CSP would block all Supabase requests."
  );
}

if (!r2Origin) {
  throw new Error(
    "NEXT_PUBLIC_R2_PUBLIC_URL is missing or invalid; the CSP would block all PDF views and downloads. " +
      "Set it to the same value as the backend's R2_PUBLIC_URL (e.g. https://pub-xxxx.r2.dev)."
  );
}

const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseSocketOrigin,
  apiOrigin,
  process.env.NODE_ENV === "production" ? "" : "http://localhost:8000",
  "https://*.ingest.us.sentry.io",
  r2Origin,
].filter(Boolean).join(" ");

const imgSrc = ["'self'", "blob:", "data:", r2Origin, supabaseOrigin].join(" ");

const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live;
    style-src 'self' 'unsafe-inline';
    img-src ${imgSrc};
    connect-src ${connectSrc};
    worker-src 'self' blob:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    frame-src 'self' https://vercel.live;
    upgrade-insecure-requests;
`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: new URL(r2Origin).hostname,
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: new URL(supabaseOrigin).hostname,
        port: '',
        pathname: '/**',
      }
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader.replace(/\s{2,}/g, ' ').trim(),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withBundleAnalyzer(withPWA(nextConfig)), {
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
});