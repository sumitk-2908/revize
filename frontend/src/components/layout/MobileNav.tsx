"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Home, User, Bookmark, Menu, X, Upload, FileText, Settings, LogOut, Plus, Inbox, ClipboardList } from "lucide-react";
import { useSidebar } from "@/app/context/SidebarContext";
import { useAuth } from "@/app/context/AuthContext";
import { requestUploadPrompt } from "@/app/lib/student-prompts";

export const MobileNav = () => {
  const { pathname, showMobileMenu, setShowMobileMenu } = useSidebar();
  const { isAdmin, isStudent, openAuthPrompt, handleLogout } = useAuth();
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const isSignedIn = isAdmin || isStudent;

  // Lock body scroll when Sign Out Modal is open
  useEffect(() => {
    if (isSignOutModalOpen) {
      window.document.body.style.overflow = "hidden";
    } else {
      window.document.body.style.overflow = "unset";
    }
    return () => {
      window.document.body.style.overflow = "unset";
    };
  }, [isSignOutModalOpen]);

  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex h-[68px] items-center justify-around border-t border-border bg-surface/90 px-2 backdrop-blur-xl lg:hidden">
        <Link href="/" onClick={() => setShowMobileMenu(false)} className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${pathname === '/' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-hover'}`}>
          <Home size={22} /><span className="text-xs font-bold">Home</span>
        </Link>
        {isSignedIn ? (
          <Link href="/profile" onClick={() => setShowMobileMenu(false)} className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${pathname === '/profile' ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-hover'}`}>
            <User size={22} /><span className="text-xs font-bold">Profile</span>
          </Link>
        ) : (
          <button type="button" onClick={() => openAuthPrompt("profile")} className="flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 text-muted transition-colors hover:bg-surface-hover">
            <User size={22} /><span className="text-xs font-bold">Profile</span>
          </button>
        )}
        {isSignedIn ? (
          <Link href="/bookmarks" onClick={() => setShowMobileMenu(false)} className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${pathname === '/bookmarks' ? 'bg-warning/10 text-warning' : 'text-muted hover:bg-surface-hover'}`}>
            <Bookmark size={22} /><span className="text-xs font-bold">Bookmarks</span>
          </Link>
        ) : (
          <button type="button" onClick={() => openAuthPrompt("sidebarBookmark")} className="flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 text-muted transition-colors hover:bg-surface-hover">
            <Bookmark size={22} /><span className="text-xs font-bold">Bookmarks</span>
          </button>
        )}
        <button onClick={() => setShowMobileMenu(true)} className={`flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl p-2 transition-colors ${showMobileMenu ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-hover'}`}>
          <Menu size={22} /><span className="text-xs font-bold">More</span>
        </button>
      </nav>
      
      {showMobileMenu && (
        <div className="motion-modal fixed inset-0 z-[60] flex flex-col justify-end bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setShowMobileMenu(false)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-6 pb-28 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-extrabold text-foreground">More Options</h2><button onClick={() => setShowMobileMenu(false)} className="rounded-full bg-surface-hover p-2 text-muted"><X size={20} /></button></div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                {isAdmin && (
                  <Link href="/subject/admin/inbox" onClick={() => setShowMobileMenu(false)} className="col-span-2 motion-hover motion-active flex items-center justify-center gap-3 rounded-xl bg-warning/10 p-4 text-sm font-bold text-warning transition-colors hover:bg-warning/20">
                    <Inbox size={20} /> Admin Inbox
                  </Link>
                )}
                <Link href="/recent-uploads" onClick={() => setShowMobileMenu(false)} className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"><Upload size={20} /> Uploads</Link>
                <Link href="/continue-studying" onClick={() => setShowMobileMenu(false)} className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"><FileText size={20} /> History</Link>
                <Link href="/requests" onClick={() => setShowMobileMenu(false)} className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"><ClipboardList size={20} /> Requests</Link>
                <button type="button" onClick={() => { setShowMobileMenu(false); requestUploadPrompt(); }} className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"><Plus size={20} /> Contribute</button>
                <Link href="/profile" onClick={() => setShowMobileMenu(false)} className="motion-hover motion-active flex items-center gap-3 rounded-xl bg-surface-hover p-4 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"><Settings size={20} /> Settings</Link>
              </div>
              {isSignedIn && (
                <div className="border-t border-border pt-6">
                  <button onClick={() => { setIsSignOutModalOpen(true); setShowMobileMenu(false); }} className="motion-hover motion-active flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 py-3.5 text-sm font-bold text-destructive transition-colors hover:bg-destructive/20"><LogOut size={18} /> Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSignOutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-extrabold text-foreground">Sign Out</h3>
            <p className="mb-6 text-sm font-medium text-muted">Are you sure you want to sign out? You will need to sign back in to access your bookmarks and history.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setIsSignOutModalOpen(false)}
                className="flex-1 rounded-xl border border-border bg-surface-hover py-2.5 text-sm font-bold text-foreground transition-colors hover:opacity-80"
              >
                Cancel
              </button>
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
          </div>
        </div>
      )}
    </>
  );
};
