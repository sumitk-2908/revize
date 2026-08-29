"use client";

import { Providers } from "@/app/context/Providers";
import { AppShell, ContentArea, ShellContent } from "@/components/layout/AppShell";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { BannersAndToasts } from "@/components/layout/BannersAndToasts";
import { AuthModal } from "@/components/layout/modals/AuthModal";
import { UploadModal } from "@/components/layout/modals/UploadModal";
import { OnboardingModal } from "@/components/layout/modals/OnboardingModal";
import { ProfileGateModal } from "@/components/layout/modals/ProfileGateModal";
import { BackendWarmup } from "@/components/common/BackendWarmup";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <BackendWarmup />
      <ErrorBoundary title="Fatal App Error" message="The application shell encountered a critical error. Please reload the page.">
        <AppShell>
          <TopBar />
          <ShellContent>
            <Sidebar />
            <ContentArea>{children}</ContentArea>
          </ShellContent>
          <MobileNav />
          <AuthModal />
          <UploadModal />
          <BannersAndToasts />
          <OnboardingModal />
          <ProfileGateModal />
        </AppShell>
      </ErrorBoundary>
    </Providers>
  );
}