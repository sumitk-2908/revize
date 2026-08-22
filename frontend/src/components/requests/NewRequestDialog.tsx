"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardList, X } from "lucide-react";
import SubjectCombobox from "@/components/ui/SubjectCombobox";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import { useSubjects, getIsNonModuleSubject } from "@/app/hooks/useSubjects";
import { useCreateResourceRequestMutation } from "@/app/hooks/useResourceRequests";
import { dispatchToast } from "@/app/lib/toast";

export interface NewRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Raised when the insert failed only because the profile has no name yet, so
   *  the board can open InlineProfileSetupModal — the flow CommentSection uses. */
  onProfileNameRequired: () => void;
}

export default function NewRequestDialog({ open, onOpenChange, onProfileNameRequired }: NewRequestDialogProps) {
  const { data: subjects = [] } = useSubjects();
  const createRequest = useCreateResourceRequestMutation();

  const [subject, setSubject] = useState("");
  const [moduleNumber, setModuleNumber] = useState(1);
  const [category, setCategory] = useState("notes");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");

  // Mirrors the upload modal: a syllabus, or a subject that has no modules at
  // all, is not module-scoped.
  const isModuleDisabled = category === "syllabus" || getIsNonModuleSubject(subjects, subject);

  const resetAndClose = () => {
    setTitle("");
    setDetails("");
    onOpenChange(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createRequest.isPending) return;

    // Required explicitly rather than defaulted: the combobox shows nothing until
    // a subject is picked, so silently posting to the first one would not match
    // what the form displays.
    if (!subject) {
      dispatchToast("Request Error", "Please choose a subject.", "error");
      return;
    }
    if (title.trim().length < 5) {
      dispatchToast("Request Error", "Give your request a title of at least 5 characters.", "error");
      return;
    }

    try {
      await createRequest.mutateAsync({
        subject,
        moduleId: isModuleDisabled ? null : moduleNumber,
        category,
        title,
        details,
      });
      resetAndClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to post your request.";
      if (message === "PROFILE_NAME_REQUIRED") {
        onOpenChange(false);
        onProfileNameRequired();
        return;
      }
      dispatchToast("Request Error", message, "error");
    }
  };

  const fieldClasses =
    "motion-focus h-11 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50";
  const labelClasses = "mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[100] w-full max-w-lg translate-[-50%] rounded-3xl border border-border bg-surface p-6 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-lg font-extrabold text-foreground">
              <ClipboardList size={18} className="text-primary" aria-hidden="true" />
              Request a Resource
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-muted transition-opacity hover:opacity-80">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-6 text-sm leading-6 font-medium text-muted">
            Tell contributors exactly what is missing. Other students can upvote it, and it is marked
            fulfilled automatically when a matching upload is approved.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="request-subject" className={labelClasses}>Subject</label>
                <SubjectCombobox
                  id="request-subject"
                  subjects={subjects}
                  value={subject}
                  onChange={setSubject}
                  disabled={createRequest.isPending}
                />
              </div>
              <div>
                <label htmlFor="request-module" className={labelClasses}>Module</label>
                <select
                  id="request-module"
                  value={moduleNumber}
                  onChange={(event) => setModuleNumber(Number(event.target.value))}
                  disabled={isModuleDisabled || createRequest.isPending}
                  className={fieldClasses}
                >
                  {[1, 2, 3, 4, 5].map((module) => (
                    <option key={module} value={module}>Module {module}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="request-title" className={labelClasses}>What do you need?</label>
              <input
                id="request-title"
                required
                type="text"
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. 2024 end-semester PYQ with solutions"
                disabled={createRequest.isPending}
                className={fieldClasses}
              />
            </div>

            <div>
              <label htmlFor="request-category" className={labelClasses}>Category</label>
              <select
                id="request-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={createRequest.isPending}
                className={fieldClasses}
              >
                <option value="notes">Notes</option>
                <option value="pyq">PYQ</option>
                <option value="tutorial_sheet">Tutorial</option>
                <option value="syllabus">Syllabus</option>
              </select>
            </div>

            <div>
              <label htmlFor="request-details" className={labelClasses}>Details (optional)</label>
              <textarea
                id="request-details"
                rows={3}
                maxLength={500}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Which topics or years matter most?"
                disabled={createRequest.isPending}
                className="motion-focus w-full resize-none rounded-xl border border-border bg-background p-3 text-xs text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="mt-1 text-right text-xs font-semibold text-muted tabular-nums">{details.length}/500</p>
            </div>

            <button
              type="submit"
              disabled={createRequest.isPending}
              className="motion-hover motion-active flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {createRequest.isPending ? (
                <>
                  <InlineSpinner label="Posting request" size={16} /> Posting
                </>
              ) : (
                "Post Request"
              )}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
