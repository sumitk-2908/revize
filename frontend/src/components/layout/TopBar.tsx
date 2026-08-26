"use client";

import { useState, useEffect } from "react";
import {
  Search, Moon, Sun, PanelLeft, PanelLeftClose,
  Bell, CheckCheck, Plus, Sparkles
} from "lucide-react";
import { useSidebar } from "@/app/context/SidebarContext";
import { useTheme } from "@/app/context/ThemeContext";
import { useAuth } from "@/app/context/AuthContext";
import { useUpload } from "@/app/context/UploadContext";
import { useNotifications } from "@/app/context/NotificationsContext";
import ProfileDropdown from "@/components/profile/ProfileDropdown";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { DiscoveryTooltip } from "@/components/ui/DiscoveryTooltip";
import { supabase } from "@/app/lib/api/core";
import { forwardRef } from "react";

const SearchTrigger = forwardRef<HTMLButtonElement, { onOpen: () => void; isMac: boolean }>(
  ({ onOpen, isMac, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="motion-hover motion-active flex h-9 w-full items-center justify-between gap-2 rounded-full border border-border bg-surface-hover px-3 text-left text-muted shadow-sm hover:bg-surface hover:text-foreground md:h-10 md:max-w-md md:rounded-xl lg:max-w-xl"
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Search size={17} aria-hidden="true" />
        <span className="truncate text-sm font-semibold">Search...</span>
      </span>
      <kbd className="hidden shrink-0 rounded-lg border border-border bg-surface px-2 py-1 font-mono text-xs font-bold text-muted shadow-sm md:inline-flex">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  )
);
SearchTrigger.displayName = "SearchTrigger";

export const TopBar = () => {
  const { sidebarCollapsed, setSidebarCollapsed } = useSidebar();
  const { isDarkMode, toggleTheme, mounted } = useTheme();
  const { isAdmin, isStudent, userProfile, uploadedBy, currentUserEmail, handleLogout, setShowProfileGate, openAuthPrompt } = useAuth();
  const { setShowUploadForm } = useUpload();
  const { unreadCount, setShowNotifications, showNotifications, notifications, setNotifications, handleMarkAsRead } = useNotifications();

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isMac] = useState(() => typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac"));

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const targetNodeName = (event.target as HTMLElement)?.nodeName;
      const isSlash = event.key === "/" && targetNodeName !== "INPUT" && targetNodeName !== "TEXTAREA";

      if (isCmdK || isSlash) {
        event.preventDefault();
        setIsCommandOpen(true);
      }

      // Close notifications panel on Escape
      if (event.key === "Escape" && showNotifications) {
        setShowNotifications(false);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [showNotifications, setShowNotifications]);

  useEffect(() => {
    const openPalette = () => setIsCommandOpen(true);
    window.addEventListener("open-command-palette", openPalette);
    return () => window.removeEventListener("open-command-palette", openPalette);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 w-full max-w-[1600px] items-center gap-2 px-2 py-2 md:min-h-16 md:gap-4 md:px-6 md:py-0">

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            title={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="group flex items-center gap-2.5 rounded-xl p-0.5 text-left sm:gap-3"
          >
            <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-[0_5px_14px_color-mix(in_srgb,var(--brand-teal)_20%,transparent),0_0_0_1px_color-mix(in_srgb,var(--brand-teal)_28%,transparent)] transition-transform duration-200 group-hover:scale-105 md:size-11">
              <img
                src="/mascot/revize-header-mark.svg"
                alt=""
                aria-hidden="true"
                className="size-full object-contain transition-opacity duration-200 group-hover:opacity-15"
              />
              <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
              </span>
            </span>
            <span className="relative hidden h-10 w-[118px] leading-none sm:block md:w-[130px]">
              <span className="absolute top-1/2 inline-flex -translate-y-1/2 items-start bg-none text-[23px] font-extrabold tracking-[-0.055em] text-[var(--brand-wordmark)] transition-opacity duration-200 group-hover:opacity-0 md:text-[26px] dark:bg-linear-to-br dark:from-[var(--brand-gold-start)] dark:via-[var(--brand-gold-mid)] dark:to-[var(--brand-gold-end)] dark:bg-clip-text dark:text-transparent">
                Revize
                <Sparkles aria-hidden="true" className="-mt-1 ml-0.5 size-3.5 text-[var(--brand-gold-mid)] drop-shadow-sm md:-mt-1.5 md:size-4" strokeWidth={2.5} />
              </span>
              <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-sm font-extrabold tracking-tight text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
              </span>
            </span>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <DiscoveryTooltip featureKey="command_palette" text="Quickly find subjects, modules, or documents" side="bottom">
            <SearchTrigger onOpen={() => setIsCommandOpen(true)} isMac={isMac} />
          </DiscoveryTooltip>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button aria-label="Toggle theme" onClick={toggleTheme} className="motion-hover motion-active hidden size-9 items-center justify-center rounded-xl border border-border text-foreground hover:bg-surface-hover md:flex">
            {mounted ? (isDarkMode ? <Sun size={18} /> : <Moon size={18} />) : <Moon size={18} className="text-muted opacity-50" />}
          </button>

          {(isAdmin || isStudent) && (
            <div className="relative hidden md:block">
              <button
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                aria-haspopup="dialog"
                aria-expanded={showNotifications}
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative flex size-9 items-center justify-center rounded-xl border border-border transition-colors hover:bg-surface-hover"
              >
                <Bell size={18} className="text-muted" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span aria-hidden="true" className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white shadow-sm ring-2 ring-surface">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <ErrorBoundary title="Notifications could not load" className="m-2" message="Notifications panel hit an unexpected problem.">
                    <div
                      role="dialog"
                      aria-label="Notifications"
                      aria-modal="false"
                      className="animate-in slide-in-from-top-2 motion-dropdown absolute top-12 -right-2 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface shadow-2xl sm:right-0 sm:w-80"
                    >
                      <div className="flex items-center justify-between border-b border-border p-3">
                        <p className="text-xs font-bold tracking-wider text-muted uppercase">Notifications</p>
                        <div className="flex items-center gap-2">
                          {notifications.some((n) => n.is_read) && (
                            <button
                              aria-label="Clear read notifications"
                              onClick={async () => {
                                if (window.confirm("Are you sure you want to clear all read notifications?")) {
                                  const { data: sess } = await supabase.auth.getSession();
                                  if (sess?.session?.user) {
                                    const { error } = await supabase.from('notifications').delete().eq('user_id', sess.session.user.id).eq('is_read', true);
                                    if (!error) setNotifications(prev => prev.filter(n => !n.is_read));
                                  }
                                }
                              }}
                              className="text-xs font-bold tracking-[0.06em] text-destructive transition-opacity hover:opacity-80"
                            >Clear Read</button>
                          )}
                          {unreadCount > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold tracking-[0.06em] text-primary">{unreadCount} New</span>}
                        </div>
                      </div>
                      <div className="max-h-80 space-y-1 overflow-y-auto p-2">
                        {notifications.length === 0 ? (
                          <p className="p-4 text-center text-xs text-muted">You&apos;re all caught up!</p>
                        ) : (
                          notifications.map((notif) => (
                            <div key={notif.id} onClick={() => handleMarkAsRead(notif.id, notif.is_read ?? false)} className={`flex cursor-pointer flex-col gap-1 rounded-xl p-3 transition-colors hover:bg-surface-hover ${!notif.is_read ? "bg-accent/50" : ""}`}>
                              <div className="flex items-start justify-between">
                                <p className={`text-xs ${!notif.is_read ? "font-bold text-foreground" : "font-semibold text-muted"}`}>{notif.title}</p>
                                {!notif.is_read ? <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /> : <CheckCheck size={12} className="mt-0.5 shrink-0 text-success" />}
                              </div>
                              <p className="text-xs leading-tight text-muted">{notif.message}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </ErrorBoundary>
                </>
              )}
            </div>
          )}

          {(isAdmin || isStudent) ? (
            <div className="flex items-center gap-3">
              <DiscoveryTooltip featureKey="upload_button" text="Share your notes and help others" side="bottom" align="end">
                <button
                  aria-label="Upload a document"
                  onClick={() => {
                    if (isAdmin || userProfile.full_name) {
                      setShowUploadForm(true);
                    } else {
                      setShowProfileGate(true);
                    }
                  }}
                  className="motion-hover motion-active flex h-9 items-center gap-2 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90 sm:rounded-xl sm:px-4"
                >
                  <Plus size={14} aria-hidden="true" /> <span>Upload</span>
                </button>
              </DiscoveryTooltip>
              <div className="hidden sm:block">
                <ProfileDropdown userName={uploadedBy || (isAdmin ? "Admin" : "Student")} userEmail={currentUserEmail} onLogout={handleLogout} />
              </div>
            </div>
          ) : (
            <DiscoveryTooltip featureKey="upload_button" text="Share your notes and help others" side="bottom" align="end">
              <button
                aria-label="Upload a document"
                onClick={() => openAuthPrompt("upload")}
                className="motion-hover motion-active flex h-9 items-center gap-2 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 sm:rounded-xl sm:px-4"
              >
                <Plus size={14} aria-hidden="true" /> <span>Upload</span>
              </button>
            </DiscoveryTooltip>
          )}
        </div>
        <CommandPalette open={isCommandOpen} onOpenChange={setIsCommandOpen} isMac={isMac} />
      </div>
    </header>
  );
};

