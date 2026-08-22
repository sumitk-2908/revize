"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { supabase } from "@/app/lib/api/core";
import { useAuth } from "@/app/context/AuthContext";
import { useSubjects } from "@/app/hooks/useSubjects";
import {
  useDeleteResourceRequestMutation,
  useMyRequestUpvotes,
  useResourceRequestStatusMutation,
  useResourceRequests,
  useToggleRequestUpvoteMutation,
} from "@/app/hooks/useResourceRequests";
import type { RequestSort, RequestStatusFilter, ResourceRequest } from "@/app/lib/api/requests";
import { requestAuthPrompt } from "@/app/lib/auth-prompts";
import { requestUploadPromptFor } from "@/app/lib/student-prompts";
import { EmptyState, SkeletonBlock } from "@/components/layout/SharedLayouts";
import { InlineProfileSetupModal } from "@/components/layout/modals/InlineProfileSetupModal";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import NewRequestDialog from "@/components/requests/NewRequestDialog";
import RequestCard from "@/components/requests/RequestCard";
import RequestFilters from "@/components/requests/RequestFilters";

function RequestsBoard() {
  const { isAdmin, isStudent, userProfile } = useAuth();
  const isSignedIn = isAdmin || isStudent;

  const [userId, setUserId] = useState<string>("");
  const [status, setStatus] = useState<RequestStatusFilter>("open");
  const [subject, setSubject] = useState("");
  const [sort, setSort] = useState<RequestSort>("wanted");
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sess }) => setUserId(sess?.session?.user?.id || ""));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || "");
    });

    return () => subscription.unsubscribe();
  }, []);

  const { data: subjects = [] } = useSubjects();
  const { data: requests = [], isLoading } = useResourceRequests({ status, subject: subject || undefined, sort });
  const { data: myUpvotes = [] } = useMyRequestUpvotes(userId || undefined);

  const toggleUpvote = useToggleRequestUpvoteMutation();
  const setRequestStatus = useResourceRequestStatusMutation();
  const deleteRequest = useDeleteResourceRequestMutation();

  const upvotedIds = useMemo(() => new Set(myUpvotes), [myUpvotes]);

  const openRequestForm = () => {
    if (!isSignedIn) {
      requestAuthPrompt("resourceRequest");
      return;
    }
    // Same gate the TopBar contribute button uses: a request carries the
    // requester's name, so the profile needs one first.
    if (!isAdmin && !userProfile?.full_name) {
      setShowProfileSetup(true);
      return;
    }
    setShowNewRequest(true);
  };

  const handleToggleUpvote = (request: ResourceRequest) => {
    if (!userId) {
      requestAuthPrompt("resourceRequest");
      return;
    }
    toggleUpvote.mutate({ requestId: request.id, userId, isAdding: !upvotedIds.has(request.id) });
  };

  /** Opens the shared upload modal pre-filled, carrying the request id so the
   *  approval trigger can link the finished document back here. */
  const handleFulfil = (request: ResourceRequest) => {
    requestUploadPromptFor({
      subject: request.subject,
      moduleId: request.module_id,
      category: request.category,
      title: request.title,
      fulfilsRequestId: request.id,
      requestTitle: request.title,
    });
  };

  const handleDelete = (request: ResourceRequest) => {
    if (!window.confirm(`Delete the request "${request.title}"? This cannot be undone.`)) return;
    deleteRequest.mutate(request.id);
  };

  return (
    <div className="animate-fade-up mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardList size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Resource Requests</h1>
            <p className="mt-1 text-sm font-semibold tracking-wider text-primary">
              What students are still missing
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openRequestForm}
          className="motion-hover motion-active flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus size={15} aria-hidden="true" /> Request a Resource
        </button>
      </div>

      <RequestFilters
        subjects={subjects}
        status={status}
        subject={subject}
        sort={sort}
        onStatusChange={setStatus}
        onSubjectChange={setSubject}
        onSortChange={setSort}
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={status === "fulfilled" ? "Nothing fulfilled yet" : "No open requests"}
          message={
            status === "fulfilled"
              ? "Once an upload answers a request, it shows up here with a link to the resource."
              : "Ask for the notes, PYQs, or tutorials you cannot find. Contributors use this board to decide what to upload next."
          }
          action={
            status !== "fulfilled" ? (
              <button
                type="button"
                onClick={openRequestForm}
                className="motion-hover motion-active inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                <Plus size={15} aria-hidden="true" /> Request a Resource
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              isUpvoted={upvotedIds.has(request.id)}
              isOwner={Boolean(userId) && request.user_id === userId}
              isAdmin={isAdmin}
              onToggleUpvote={handleToggleUpvote}
              onFulfil={handleFulfil}
              onSetStatus={(target, nextStatus) =>
                setRequestStatus.mutate({ requestId: target.id, status: nextStatus })
              }
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <NewRequestDialog
        open={showNewRequest}
        onOpenChange={setShowNewRequest}
        onProfileNameRequired={() => setShowProfileSetup(true)}
      />

      <InlineProfileSetupModal
        isOpen={showProfileSetup}
        onOpenChange={setShowProfileSetup}
        onSuccess={() => setShowNewRequest(true)}
      />
    </div>
  );
}

export default function RequestsPage() {
  return (
    <ErrorBoundary
      title="Requests could not load"
      message="The requests board ran into a problem. The rest of the portal stays available."
    >
      <RequestsBoard />
    </ErrorBoundary>
  );
}
