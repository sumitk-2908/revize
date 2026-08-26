"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { PageEnter } from "@/components/ui/Motion";

export const AppShell = ({ children }: { children: React.ReactNode }) => (
  <div className="ease-premium flex min-h-[100dvh] flex-col bg-background text-foreground transition-colors duration-300">
    <a
      href="#main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[200] focus-visible:rounded-xl focus-visible:bg-primary focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-bold focus-visible:text-primary-foreground focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      Skip to main content
    </a>
    {children}
  </div>
);

export const ShellContent = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto flex w-full max-w-[1600px] flex-1">
    {children}
  </div>
);

export const ContentArea = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();

  return (
    <main id="main-content" className="w-full min-w-0 flex-1 overflow-x-clip p-4 pb-24 md:p-6 lg:p-8 lg:pb-8">
      <PageEnter key={pathname} className="min-h-full">
        {children}
      </PageEnter>
    </main>
  );
};
