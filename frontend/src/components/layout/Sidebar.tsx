"use client";

import Link from "next/link";
import { Home, Inbox, Clock, Bookmark, Upload, TrendingUp, ClipboardList } from "lucide-react";
import { useSidebar } from "@/app/context/SidebarContext";
import { useAuth } from "@/app/context/AuthContext";
import ProfileSidebarCard from "@/components/profile/ProfileSidebarCard";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { SidebarSkeleton } from "@/components/layout/SharedLayouts";
import { documentHref, SearchDocument } from "@/components/layout/utils";

export const SidebarNavigation = () => {
  const { sidebarLoading, sidebarCollapsed, pathname, pendingCount, trendingDocs } = useSidebar();
  const { isAdmin, isStudent, openAuthPrompt } = useAuth();

  return (
    <div className="flex-1 space-y-6">
      <>

      <div>
        {!sidebarCollapsed && <p className="px-3 pb-2 text-xs font-bold tracking-[0.06em] text-muted uppercase">Navigation</p>}
        <Link 
          href="/" 
          title={sidebarCollapsed ? "Back to Homepage" : undefined} 
          className={`motion-hover motion-active flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
            pathname === '/' 
              ? 'bg-primary/10 text-primary' 
              : 'text-muted hover:bg-surface-hover hover:text-primary'
          }`}
        >
          <Home size={18} /> {!sidebarCollapsed && "Back to Homepage"}
        </Link>
        
        {isAdmin && (
          <Link 
            href="/subject/admin/inbox" 
            title={sidebarCollapsed ? "Approval Inbox" : undefined} 
            className={`motion-hover motion-active mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              pathname === '/subject/admin/inbox'
                ? 'bg-warning/10 text-warning'
                : 'text-warning hover:bg-warning/10'
            }`}
          >
            <Inbox size={18} /> {!sidebarCollapsed && <span className="flex-1">Approval Inbox</span>}
            {!sidebarCollapsed && pendingCount > 0 && <span className="rounded-full bg-warning/20 px-2 text-xs tracking-[0.06em]">{pendingCount}</span>}
          </Link>
        )}
      </div>

      <div>
        {!sidebarCollapsed && <p className="px-3 pb-2 text-xs font-bold tracking-[0.06em] text-muted uppercase">Student Workspace</p>}
        {(isAdmin || isStudent) ? (
          <Link
            href="/continue-studying"
            title={sidebarCollapsed ? "Continue Studying" : undefined}
            className={`motion-hover motion-active flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              pathname === '/continue-studying'
                ? 'bg-primary/10 text-primary'
                : 'text-muted hover:bg-surface-hover hover:text-primary'
            }`}
          >
            <Clock size={18} /> {!sidebarCollapsed && "Continue Studying"}
          </Link>
        ) : (
          <button
            type="button"
            title={sidebarCollapsed ? "Continue Studying" : undefined}
            onClick={() => openAuthPrompt("continueStudying")}
            className="motion-hover motion-active flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          >
            <Clock size={18} /> {!sidebarCollapsed && "Continue Studying"}
          </button>
        )}
        {(isAdmin || isStudent) ? (
          <Link
            href="/bookmarks"
            title={sidebarCollapsed ? "Bookmarks" : undefined}
            className={`motion-hover motion-active mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              pathname === '/bookmarks'
                ? 'bg-warning/10 text-warning'
                : 'text-muted hover:bg-surface-hover hover:text-warning'
            }`}
          >
            <Bookmark size={18} /> {!sidebarCollapsed && "Bookmarks"}
          </Link>
        ) : (
          <button
            type="button"
            title={sidebarCollapsed ? "Bookmarks" : undefined}
            onClick={() => openAuthPrompt("sidebarBookmark")}
            className="motion-hover motion-active mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-warning"
          >
            <Bookmark size={18} /> {!sidebarCollapsed && "Bookmarks"}
          </button>
        )}
        <Link 
          href="/recent-uploads" 
          title={sidebarCollapsed ? "Recent Uploads" : undefined} 
          className={`motion-hover motion-active mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
            pathname === '/recent-uploads'
              ? 'bg-success/10 text-success'
              : 'text-muted hover:bg-surface-hover hover:text-success'
          }`}
        >
          <Upload size={18} /> {!sidebarCollapsed && "Recent Uploads"}
        </Link>
        {/* Public board: signed-out students can read demand, so this is a plain
            link rather than an auth-prompt button. */}
        <Link
          href="/requests"
          title={sidebarCollapsed ? "Resource Requests" : undefined}
          className={`motion-hover motion-active mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
            pathname === '/requests'
              ? 'bg-primary/10 text-primary'
              : 'text-muted hover:bg-surface-hover hover:text-primary'
          }`}
        >
          <ClipboardList size={18} /> {!sidebarCollapsed && "Requests"}
        </Link>
      </div>

      <ErrorBoundary title="Trending section could not load" className="mt-2" message="Trending docs failed to load.">
        {sidebarLoading && !sidebarCollapsed ? (
          <div className="mt-4 animate-pulse space-y-3 px-3">
            <div className="h-3 w-24 rounded-xl bg-surface-hover" />
            <div className="h-32 w-full rounded-2xl bg-surface-hover" />
          </div>
        ) : (
          !sidebarCollapsed && trendingDocs.length > 0 && (
            <div>
              <p className="px-3 pb-2 text-xs font-bold tracking-[0.06em] text-muted uppercase">Discovery</p>
              <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-3">
                <div className="flex items-center gap-2 text-primary"><TrendingUp size={13} /><h3 className="text-xs font-extrabold tracking-[0.06em] uppercase">Trending Now</h3></div>
                {trendingDocs.slice(0, 5).map((doc: SearchDocument, idx: number) => (
                  <Link key={`tr-${doc.id}`} href={documentHref(doc)} className="group block text-xs">
                    <p className="truncate font-bold text-foreground transition-colors group-hover:text-primary">{idx + 1}. {doc.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          )
        )}
      </ErrorBoundary>
      </>
    </div>
  );
};

export const SidebarFooter = () => {
  const { sidebarCollapsed } = useSidebar();
  const { isAdmin, isStudent, userProfile, uploadedBy } = useAuth();
  
  if (sidebarCollapsed) return null;
  
  let roleDisplay = "Student Account";
  if (isAdmin) {
    roleDisplay = "Administrator";
  } else if (userProfile) {
    if (userProfile.academic_year && userProfile.preferred_branch) {
      roleDisplay = `${userProfile.academic_year} · ${userProfile.preferred_branch}`;
    } else if (userProfile.preferred_branch) {
      roleDisplay = userProfile.preferred_branch;
    } else if (userProfile.academic_year) {
      roleDisplay = userProfile.academic_year;
    }
  }

  return (
    <div className="mt-auto flex flex-col pt-4">
      {(isAdmin || isStudent) && (
        <ProfileSidebarCard userName={uploadedBy || (isAdmin ? "Admin" : "Student")} role={roleDisplay} />
      )}
      <div className="mt-3 space-y-0.5 border-t border-border px-3 pt-4 text-xs font-medium tracking-[0.06em] text-muted">
        <p>Academic Portal • Version 1.6</p>
        <p>© {new Date().getFullYear()} All Rights Reserved.</p>
      </div>
    </div>
  );
};

export const Sidebar = () => {
  const { sidebarCollapsed } = useSidebar();
  
  return (
    <aside aria-label="Main Desktop Navigation" className={`motion-sidebar sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col overflow-y-auto border-r border-border bg-background py-6 lg:flex ${sidebarCollapsed ? 'w-16 px-2' : 'w-[220px] px-4'}`}>
      <SidebarNavigation />
      <SidebarFooter />
    </aside>
  );
};
