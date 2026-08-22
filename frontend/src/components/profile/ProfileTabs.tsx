"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, Download, BookOpen, Clock, Sparkles, Upload, Settings, Trash2, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { 
  trackDocumentStat, 
  getTrendingDocuments   
} from "@/app/lib/api/analytics";
import { triggerStreakUpdate, getSuggestedNextSteps, deleteUserAccount } from "@/app/lib/api/profile";
import { supabase } from "@/app/lib/api/core";
import { dispatchToast } from "@/app/lib/toast";
import ActivityHeatmap from "./ActivityHeatmap";
import AchievementsList from "./AchievementsList";
import ActivityTimeline from "./ActivityTimeline";
import UserDocumentCard from "./UserDocumentCard";
import RequestCard from "@/components/requests/RequestCard";
import { recordStudentDownload, requestUploadPrompt, requestUploadPromptFor, shouldShowContributionPrompt, dismissContributionPrompt } from "@/app/lib/student-prompts";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { DocumentWithAnalytics } from "@/app/lib/document-types";
import { buildDownloadHref } from "@/app/lib/file-types";
import { Tables } from "@/app/lib/database.types";
import { User } from "@supabase/supabase-js";
import { useLogStudySessionMutation } from "@/app/hooks/useStudyHistory";
import {
  useDeleteResourceRequestMutation,
  useMyRequestUpvotes,
  useMyResourceRequests,
  useResourceRequestStatusMutation,
  useToggleRequestUpvoteMutation,
} from "@/app/hooks/useResourceRequests";
import type { ResourceRequest } from "@/app/lib/api/requests";
import type { StudyActivityDay } from "@/app/lib/api/history";
import { useQueryClient } from "@tanstack/react-query";
import { documentHref } from "@/components/layout/utils";

interface ProfileTabsProps {
  user: User | null;
  history: DocumentWithAnalytics[];
  /** Per-day study activity; drives the heatmap. */
  studyActivity?: StudyActivityDay[];
  bookmarks: DocumentWithAnalytics[];
  uploads: DocumentWithAnalytics[];
  achievements: Tables<'user_achievements'>[];
}

export default function ProfileTabs({ user, history, studyActivity = [], bookmarks, uploads, achievements }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [suggestions, setSuggestions] = useState<DocumentWithAnalytics[]>([]);
  const [showContributionPrompt, setShowContributionPrompt] = useState(false);
  const downloadingRef = useRef<Set<number>>(new Set());
  const logStudySessionMutation = useLogStudySessionMutation();
  const queryClient = useQueryClient();
  
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "library", label: "My Library" },
    { id: "contributions", label: "Contributions" },
    { id: "requests", label: "My Requests" },
    { id: "achievements", label: "Achievements" },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" }
  ];

  // Kept off the wire until the tab is opened, so /profile's existing load gate
  // is unaffected.
  const { data: myRequests = [], isLoading: loadingRequests } = useMyResourceRequests(
    user?.id,
    activeTab === "requests"
  );
  const { data: myRequestUpvotes = [] } = useMyRequestUpvotes(activeTab === "requests" ? user?.id : undefined);
  const toggleRequestUpvote = useToggleRequestUpvoteMutation();
  const setRequestStatus = useResourceRequestStatusMutation();
  const deleteRequest = useDeleteResourceRequestMutation();

  const handleDeleteRequest = (request: ResourceRequest) => {
    if (!window.confirm(`Delete the request "${request.title}"? This cannot be undone.`)) return;
    deleteRequest.mutate(request.id);
  };
   
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && tabs.some(t => t.id === tab)) {
        setActiveTab(tab);
        window.history.replaceState(null, '', '/profile');
      }
    }
  }, []);

  useEffect(() => {
    setShowContributionPrompt(shouldShowContributionPrompt(bookmarks.length));
  }, [bookmarks.length]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (activeTab !== "overview") return;

      try {
        if (history.length > 0 && history.length < 5) {
          const lastDoc = history[0];
          const excludeIds = history.map((d: any) => d.id);
          const related = await getSuggestedNextSteps(lastDoc, excludeIds, 3);
          setSuggestions(related || []);
        } else if (history.length === 0) {
          const trending = await getTrendingDocuments();
          setSuggestions(trending ? trending.slice(0, 3) : []);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        console.error("Failed to load profile suggestions:", error);
      }
    };

    fetchSuggestions();
  }, [history, activeTab]);

  const handleViewDocument = async (docId: number) => {
    await trackDocumentStat(docId, 'view');
    if (user?.id) {
      await triggerStreakUpdate(user.id);
      logStudySessionMutation.mutate({ userId: user.id, documentId: docId });
    }
  };

  const handleDownload = async (e: React.MouseEvent, doc: any) => {
    e.preventDefault();
    
    if (downloadingRef.current.has(doc.id)) return;
    downloadingRef.current.add(doc.id);

    try {
      await trackDocumentStat(doc.id, 'download');
      const downloadCount = recordStudentDownload();
      if (downloadCount >= 3) setShowContributionPrompt(shouldShowContributionPrompt(bookmarks.length));
      const link = document.createElement("a");
      link.href = buildDownloadHref(doc.file_url, doc.title);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {
        downloadingRef.current.delete(doc.id);
      }, 2000);
    }
  };

  return (
    <div>
      <div className="hide-scrollbar sticky top-16 z-30 -mx-4 mb-6 flex overflow-x-auto border-b border-border bg-background px-4 pt-2 sm:static sm:mx-0 sm:px-0 sm:pt-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`motion-hover rounded-xl px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="animate-fade-up">
          {(history.length > 0 || studyActivity.length > 0) && (
            <ErrorBoundary title="Activity chart could not load" message="The activity heatmap hit an unexpected problem.">
              <ActivityHeatmap history={history} activity={studyActivity} />
            </ErrorBoundary>
          )}
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-[0.06em] text-muted uppercase">Continue Studying</h3>
              <Link href="/continue-studying" className="motion-hover text-sm font-bold text-primary hover:opacity-80">View All</Link>
            </div>
            
            {history.length > 0 ? history.slice(0, 3).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 shadow-sm">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Clock size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                  <p className="truncate text-xs text-muted capitalize">{item.subject} • {item.category}</p>
                </div>
                <Link
                  href={documentHref(item)}
                  onClick={() => handleViewDocument(item.id)}
                  className="motion-hover motion-active flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground uppercase hover:opacity-90"
                >
                  <Eye size={12} /> Resume
                </Link>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface-hover/50 py-8 text-center">
                 <h3 className="text-base font-extrabold tracking-tight text-foreground">Start studying from your dashboard</h3>
                 <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">Open a resource and your recent study activity will appear here.</p>
                 <Link href="/recent-uploads" className="motion-hover motion-active mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
                   Start Studying
                 </Link>
              </div>
            )}

            {showContributionPrompt && (
              <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold tracking-tight text-foreground">These resources helped you.</p>
                  <p className="mt-1 text-sm leading-6 font-medium text-muted">Consider uploading your own notes to help future students.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={requestUploadPrompt} className="motion-hover motion-active inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
                    <Upload size={15} /> Upload Notes
                  </button>
                  <button
                    onClick={() => {
                      dismissContributionPrompt();
                      setShowContributionPrompt(false);
                    }}
                    className="motion-hover motion-active rounded-xl px-3 py-2 text-sm font-bold text-muted hover:bg-surface-hover"
                  >
                    Later
                  </button>
                </div>
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="mt-8 space-y-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-warning uppercase">
                    <Sparkles size={14} />
                    {history.length === 0 ? "Trending Right Now" : "Suggested Next Steps"}
                  </h3>
                </div>
                
                {suggestions.map((item: any, idx: number) => (
                  <div key={`sugg-${idx}`} className="motion-hover flex items-center gap-4 rounded-2xl border border-warning/20 bg-warning/5 p-3 shadow-sm hover:border-warning">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                      <Sparkles size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                      <p className="truncate text-xs text-muted capitalize">{item.subject} • {item.category}</p>
                    </div>
                    <Link
                      href={documentHref(item)}
                      onClick={() => handleViewDocument(item.id)}
                      className="motion-hover motion-active flex shrink-0 items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 text-xs font-bold text-white uppercase hover:opacity-90"
                    >
                      <Eye size={12} /> View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "library" && (
        <div className="animate-fade-up space-y-4">
           {bookmarks.length > 0 ? bookmarks.map((item: any, idx: number) => (
             <div key={idx} className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 shadow-sm">
               <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning"><BookOpen size={18} /></div>
               <div className="min-w-0 flex-1">
                 <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                 <p className="truncate text-xs text-muted capitalize">{item.subject}</p>
               </div>
               
               <div className="flex shrink-0 items-center gap-2">
                 <Link
                   href={documentHref(item)}
                   onClick={() => handleViewDocument(item.id)}
                   className="motion-hover motion-active flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground uppercase hover:opacity-90"
                 >
                   <Eye size={12} /> View
                 </Link>
                 <button 
                   onClick={(e) => handleDownload(e, item)} 
                   className="motion-hover motion-active flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-1.5 text-xs font-bold text-foreground uppercase hover:opacity-80"
                 >
                   <Download size={12} />
                 </button>
               </div>
             </div>
           )) : (
             <div className="rounded-2xl border border-dashed border-warning/30 bg-warning/5 p-8 text-center">
               <h3 className="text-base font-extrabold tracking-tight text-foreground">Build your study library</h3>
               <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">Bookmark resources you want to revisit before exams.</p>
               <Link href="/recent-uploads" className="motion-hover motion-active mt-4 inline-flex rounded-xl bg-warning px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                 Bookmark Resources
               </Link>
             </div>
           )}
        </div>
      )}

      {activeTab === "contributions" && (
        <div className="animate-fade-up space-y-4">
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
               <div className="mb-1 text-xs font-bold tracking-[0.06em] text-muted uppercase">Total Uploads</div>
               <div className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums">{uploads.length}</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
               <div className="mb-1 text-xs font-bold tracking-[0.06em] text-muted uppercase">Total Impact</div>
               <div className="text-3xl font-extrabold tracking-tight text-success tabular-nums">
                 {uploads.reduce((acc: number, u: any) => acc + (u.document_analytics?.download_count || 0), 0)} DLs
               </div>
            </div>
          </div>

          <h3 className="text-xs font-bold tracking-[0.06em] text-muted uppercase">Upload History</h3>
          {uploads.length > 0 ? uploads.map((item: any, idx: number) => (
             <UserDocumentCard 
               key={idx} 
               item={item} 
               onRefresh={() => queryClient.invalidateQueries()} 
             />
           )) : (
             <div className="rounded-2xl border border-dashed border-success/30 bg-success/5 p-8 text-center">
               <h3 className="text-base font-extrabold tracking-tight text-foreground">Share the notes you wish you had earlier</h3>
               <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">Upload notes, PYQs, or syllabus PDFs so the next student has a better starting point.</p>
               <button onClick={requestUploadPrompt} className="motion-hover motion-active mt-4 inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                 <Upload size={15} /> Upload Notes
               </button>
             </div>
           )}
        </div>
      )}

      {activeTab === "requests" && (
        <div className="animate-fade-up space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold tracking-[0.06em] text-muted uppercase">My Requests</h3>
            <Link href="/requests" className="motion-hover text-sm font-bold text-primary hover:opacity-80">
              Browse Board
            </Link>
          </div>

          {loadingRequests ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-hover/50 py-8 text-center text-sm font-bold text-muted">
              Loading your requests...
            </div>
          ) : myRequests.length > 0 ? (
            myRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                isUpvoted={myRequestUpvotes.includes(request.id)}
                isOwner
                onToggleUpvote={(target) =>
                  user?.id &&
                  toggleRequestUpvote.mutate({
                    requestId: target.id,
                    userId: user.id,
                    isAdding: !myRequestUpvotes.includes(target.id),
                  })
                }
                onFulfil={(target) =>
                  requestUploadPromptFor({
                    subject: target.subject,
                    moduleId: target.module_id,
                    category: target.category,
                    title: target.title,
                    fulfilsRequestId: target.id,
                    requestTitle: target.title,
                  })
                }
                onSetStatus={(target, status) =>
                  setRequestStatus.mutate({ requestId: target.id, status })
                }
                onDelete={handleDeleteRequest}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center">
              <h3 className="text-base font-extrabold tracking-tight text-foreground">Ask for what is missing</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 font-medium text-muted">
                Post the notes, PYQs, or tutorials you cannot find. Other students upvote them, and contributors
                use the board to decide what to upload next.
              </p>
              <Link
                href="/requests"
                className="motion-hover motion-active mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                <Plus size={15} /> Request a Resource
              </Link>
            </div>
          )}
        </div>
      )}

      {activeTab === "achievements" && (
         <div className="animate-fade-up">
           <ErrorBoundary title="Achievements could not load" message="The achievements list hit an unexpected problem.">
             <AchievementsList achievements={achievements} />
           </ErrorBoundary>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="animate-fade-up">
           <ErrorBoundary title="Timeline could not load" message="The activity timeline hit an unexpected problem.">
             <ActivityTimeline history={history} bookmarks={bookmarks} uploads={uploads} />
           </ErrorBoundary>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="animate-fade-up space-y-6">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold tracking-tight text-foreground">Danger Zone</h3>
                <p className="mt-1 text-sm leading-6 font-medium text-muted">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                
                <button 
                  onClick={async () => {
                    if (window.confirm("Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.")) {
                      try {
                        await deleteUserAccount();
                        await supabase.auth.signOut();
                        dispatchToast("Account Deleted", "Your account has been permanently deleted.", "success");
                        window.location.href = "/";
                      } catch (error) {
                        dispatchToast("Error", "Failed to delete account. Please try again.", "error");
                      }
                    }
                  }}
                  className="motion-hover motion-active mt-4 flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-white hover:opacity-90"
                >
                  <Trash2 size={16} /> Delete My Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
