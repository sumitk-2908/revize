import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import ClientLayout from "./ClientLayout";
import "./globals.css";
import QueryProvider from "./context/QueryProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF9" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};


export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://academic-portal-blush.vercel.app"),
  title: {
    template: "%s | Revize",
    default: "Revize",
  },
  description: "Revize — Your Study Companion for Notes, PYQs & More",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Revize",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Revize",
    locale: "en_IN",
    images: [
      {
        url: "/mascot/revize-icon-512.svg",
        width: 512,
        height: 512,
        alt: "Revize",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Revize",
    description: "Revize — Your Study Companion for Notes, PYQs & More",
    images: ["/mascot/revize-icon-512.svg"],
  },
  icons: {
    icon: "/mascot/revize-logo.svg",
    apple: "/mascot/revize-icon-192.svg",
  },
};


export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jakarta.variable} ${geistSans.variable} ${geistMono.variable} bg-background`}>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (_) {}
          `}
        </Script>
      </head>
      <body suppressHydrationWarning className="flex min-h-screen flex-col font-sans antialiased">

        <QueryProvider>
          <ClientLayout>
            {children}
          </ClientLayout>
        </QueryProvider>
      </body>
    </html>
  );
}