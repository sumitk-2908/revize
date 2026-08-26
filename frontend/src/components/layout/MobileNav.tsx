"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Home, User, Bookmark, Menu, X, Upload, FileText, Settings, LogOut, Plus, Inbox, ClipboardList, Moon, Sun, Bell, CheckCheck } from "lucide-react";
import { useSidebar } from "@/app/context/SidebarContext";
import { useAuth } from "@/app/context/AuthContext";
import { useTheme } from "@/app/context/ThemeContext";
import { useNotifications } from "@/app/context/NotificationsContext";
import { requestUploadPrompt } from "@/app/lib/student-prompts";

export const MobileNav = () => {
  const { pathname, showMobileMenu, setShowMobileMenu } = useSidebar();
  const { isAdmin, isStudent, openAuthPrompt, handleLogout } = useAuth();
  const { isDarkMode, toggleTheme, mounted } = useTheme();
  const { unreadCount, showNotifications, setShowNotifications, notifications, handleMarkAsRead } = useNotifications();
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const isSignedIn = isAdmin || isStudent;

  // Lock body scroll when the mobile sheet is open (Radix Dialog does not do
  // this automatically for non-modal dialogs, so we mirror the previous logic).
  useEffect(() => {
    if (showMobileMenu) {
      window.document.body.style.overflow = "hidden";
    } else {
      window.document.body.style.overflow = "unset";
    }
    return () => {
      window.document.body.style.overflow = "unset";
    };
  }, [showMobileMenu]);

  return (
    <>
      {/* ── Bottom tab bar ─────────────────────────────────── */}
      <nav
        aria-label="Mobile navigation"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 flex h-[68px] items-center justify-around border-t border-border bg-surface/90 px-2 backdrop-blur-xl lg:hidden"
      >
        <Link
          href="/"
          onClick={() => setShowMobileMenu(false)}
          aria-current={pathname === "/" ? "page" : undefined}
          className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${pathname === "/" ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-hover"}`}
        >
          <Home size={22} aria-hidden="true" /><span className="text-xs font-bold">Home</span>
        </Link>

        {isSignedIn ? (
          <Link
            href="/profile"
            onClick={() => setShowMobileMenu(false)}
            aria-current={pathname === "/profile" ? "page" : undefined}
            className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${pathname === "/profile" ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-hover"}`}
          >
            <User size={22} aria-hidden="true" /><span className="text-xs font-bold">Profile</span>
          </Link>
        ) : (
          <button type="button" onClick={() => openAuthPrompt("profile")} className="flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 text-muted transition-colors hover:bg-surface-hover">
            <User size={22} aria-hidden="true" /><span className="text-xs font-bold">Profile</span>
          </button>
        )}

        {isSignedIn ? (
          <Link
            href="/bookmarks"
            onClick={() => setShowMobileMenu(false)}
            aria-current={pathname === "/bookmarks" ? "page" : undefined}
            className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${pathname === "/bookmarks" ? "bg-warning/10 text-warning" : "text-muted hover:bg-surface-hover"}`}
          >
            <Bookmark size={22} aria-hidden="true" /><span className="text-xs font-bold">Bookmarks</span>
          </Link>
        ) : (
          <button type="button" onClick={() => openAuthPrompt("sidebarBookmark")} className="flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 text-muted transition-colors hover:bg-surface-hover">
            <Bookmark size={22} aria-hidden="true" /><span className="text-xs font-bold">Bookmarks</span>
          </button>
        )}

        {/* "More" button — opens the bottom sheet */}
        <button
          type="button"
          aria-label="Open more options menu"
          aria-haspopup="dialog"
          aria-expanded={showMobileMenu}
          onClick={() => setShowMobileMenu(true)}
          className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${showMobileMenu ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-hover"}`}
        >
          <Menu size={22} aria-hidden="true" /><span className="text-xs font-bold">More</span>
        </button>
      </nav>

      {/* ── More Options bottom sheet ───────────────────────── */}
      {/*
        Using Radix Dialog so we get:
        - Automatic focus trap (FocusScope)
        - aria-modal="true", role="dialog", aria-labelledby wired automatically
        - Escape key close
        The overlay and content use the same visual classes as before.
      */}
      <Dialog.Root open={showMobileMenu} onOpenChange={setShowMobileMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="motion-modal fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm lg:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="motion-sidebar-sheet fixed inset-x-0 bottom-0 z-[61] max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-6 pb-28 shadow-2xl lg:hidden"
          >
            <div className="mb-6 flex items-center justify-between">
              <Dialog.Title className="text-xl font-extrabold text-foreground">More Options</Dialog.Title>
              <Dialog.Close asChild>
                <button aria-label="Close menu" className="rounded-full bg-surface-hover p-2 text-muted hover:text-foreground">
                  <X size={20} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                {isAdmin && (
                  <Dialog.Close asChild>
                    <Link href="/subject/admin/inbox" className="col-span-2 motion-hover motion-active flex items-center justify-center gap-3 rounded-xl bg-warning/10 p-4 text-sm font-bold text-warning transition-colors hover:bg-warning/20">
                      <Inbox size={20} aria-hidden="true" /> Admin Inbox
                    </Link>
                  </Dialog.Close>
                )}
                <Dialog.Close asChild>
                  <Link href="/recent-uploads" className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                    <Upload size={20} aria-hidden="true" /> Uploads
                  </Link>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Link href="/continue-studying" className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                    <FileText size={20} aria-hidden="true" /> History
                  </Link>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Link href="/requests" className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                    <ClipboardList size={20} aria-hidden="true" /> Requests
                  </Link>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    onClick={() => requestUploadPrompt()}
                    className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <Plus size={20} aria-hidden="true" /> Upload
                  </button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Link href="/profile" className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                    <Settings size={20} aria-hidden="true" /> Settings
                  </Link>
                </Dialog.Close>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Settings</p>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="motion-hover motion-active flex w-full items-center justify-between rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <span className="flex items-center gap-3">
                    {mounted && isDarkMode ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
                    {mounted && isDarkMode ? "Light mode" : "Dark mode"}
                  </span>
                  <span className="text-xs text-muted">Theme</span>
                </button>
                {isSignedIn && (
                  <button
                    type="button"
                    onClick={() => setShowNotifications(!showNotifications)}
                    aria-expanded={showNotifications}
                    className="motion-hover motion-active flex w-full items-center justify-between rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <span className="flex items-center gap-3"><Bell size={20} aria-hidden="true" /> Notifications</span>
                    {unreadCount > 0 && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                  </button>
                )}
                {showNotifications && isSignedIn && (
                  <div role="dialog" aria-label="Notifications" className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border bg-surface p-2">
                    {notifications.length === 0 ? <p className="p-4 text-center text-xs text-muted">All caught up!</p> : notifications.map((notif) => (
                      <button type="button" key={notif.id} onClick={() => handleMarkAsRead(notif.id, notif.is_read ?? false)} className={`flex w-full cursor-pointer flex-col gap-1 rounded-xl p-3 text-left transition-colors hover:bg-surface-hover ${!notif.is_read ? "bg-accent/50" : ""}`}>
                        <span className="flex items-start justify-between gap-2"><span className={`text-xs ${!notif.is_read ? "font-bold text-foreground" : "font-semibold text-muted"}`}>{notif.title}</span>{!notif.is_read ? <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /> : <CheckCheck size={12} className="mt-0.5 shrink-0 text-success" />}</span>
                        <span className="text-xs leading-tight text-muted">{notif.message}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isSignedIn && (
                <div className="border-t border-border pt-6">
                  <button
                    onClick={() => { setIsSignOutModalOpen(true); setShowMobileMenu(false); }}
                    className="motion-hover motion-active flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 py-3.5 text-sm font-bold text-destructive transition-colors hover:bg-destructive/20"
                  >
                    <LogOut size={18} aria-hidden="true" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Sign Out confirmation dialog ────────────────────── */}
      <Dialog.Root open={isSignOutModalOpen} onOpenChange={setIsSignOutModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="motion-modal fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="motion-modal fixed left-[50%] top-[50%] z-[101] w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <Dialog.Title className="mb-2 text-lg font-extrabold text-foreground">Sign Out</Dialog.Title>
            <Dialog.Description className="mb-6 text-sm font-medium text-muted">
              Are you sure you want to sign out? You will need to sign back in to access your bookmarks and history.
            </Dialog.Description>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 rounded-xl border border-border bg-surface-hover py-2.5 text-sm font-bold text-foreground transition-colors hover:opacity-80">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => {
                  handleLogout();
                  window.location.href = "/";
                }}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-destructive-foreground transition-colors hover:opacity-90"
              >
                Confirm
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
