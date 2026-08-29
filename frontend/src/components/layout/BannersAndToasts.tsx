"use client";

import { useState, useEffect } from "react";
import * as Toast from "@radix-ui/react-toast";
import { Mail, WifiOff, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { useSidebar } from "@/app/context/SidebarContext";
import { useNotifications } from "@/app/context/NotificationsContext";
import AchievementToast from "@/components/ui/AchievementToast";

export const BannersAndToasts = () => {
  const { isStudent, emailConfirmed, sendVerificationEmail } = useAuth();
  const { isOffline } = useSidebar();
  const { activeToast, setActiveToast, globalToast, setGlobalToast } = useNotifications();
  const [isBackendWarming, setIsBackendWarming] = useState(false);

  useEffect(() => {
    const handleWarming = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail?.isWarming === "boolean") {
        setIsBackendWarming(detail.isWarming);
      }
    };

    window.addEventListener("portal_backend_warming", handleWarming);
    return () => window.removeEventListener("portal_backend_warming", handleWarming);
  }, []);

  return (
    <>
      {isBackendWarming && (
        <div className="z-50 flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-center text-xs font-semibold text-primary transition-all">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span>Connecting to server... Waking up free-tier backend (~15-20s)</span>
        </div>
      )}
      {isStudent && !emailConfirmed && (
        <div className="z-50 flex items-center justify-center gap-2 bg-warning/10 px-4 py-2 text-center text-xs font-semibold text-warning">
          <Mail size={14} /><span>Please verify your email address to unlock upload privileges.</span>
          <button onClick={sendVerificationEmail} className="ml-2 font-bold underline hover:opacity-80">Send Link</button>
        </div>
      )}
      {isOffline && (
        <div className="z-40 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-xs font-semibold text-white">
          <WifiOff size={14} /><span>You are currently offline. Viewing cached pages only.</span>
        </div>
      )}
      {activeToast && <AchievementToast title={activeToast.title} description={activeToast.description} onClose={() => setActiveToast(null)} />}
      <Toast.Root role="status" aria-live="polite" open={globalToast.open} onOpenChange={(open) => setGlobalToast((prev: any) => ({...prev, open}))} className={`fixed right-4 bottom-4 z-[150] w-auto max-w-md rounded-xl border p-4 shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${globalToast.type === 'error' ? 'border-destructive/20 bg-destructive/10' : globalToast.type === 'success' ? 'border-success/20 bg-success/10' : 'border-border bg-surface'}`}>
        <Toast.Title className={`text-sm font-bold ${globalToast.type === 'error' ? 'text-destructive' : globalToast.type === 'success' ? 'text-success' : 'text-foreground'}`}>{globalToast.title}</Toast.Title>
        <Toast.Description className={`mt-1 text-xs ${globalToast.type === 'error' ? 'text-destructive/80' : globalToast.type === 'success' ? 'text-success/80' : 'text-muted'}`}>{globalToast.message}</Toast.Description>
      </Toast.Root>
    </>
  );
};
