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

const R2_ORIGIN = "https://pub-11c1374f05774b54a2ab6c8bc83d6f7f.r2.dev";

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

if (!supabaseOrigin) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is missing or invalid; the CSP would block all Supabase requests."
  );
}

const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseSocketOrigin,
  apiOrigin,
  process.env.NODE_ENV === "production" ? "" : "http://localhost:8000",
  "https://*.ingest.us.sentry.io",
  R2_ORIGIN,
].filter(Boolean).join(" ");

const imgSrc = ["'self'", "blob:", "data:", R2_ORIGIN, supabaseOrigin].join(" ");

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
        hostname: 'pub-11c1374f05774b54a2ab6c8bc83d6f7f.r2.dev', // Replace with your exact R2 public domain
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