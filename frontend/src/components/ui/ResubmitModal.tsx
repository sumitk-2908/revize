"use client";

import { useState, useRef, useEffect } from "react";
import { UploadCloud, XCircle, AlertCircle, FileText } from "lucide-react";
import { supabase } from "@/app/lib/api/core";
import {
  uploadWithProgress,
  UploadState,
  DuplicateDocument,
  DuplicateUploadError,
} from "@/app/lib/api/documents";
import UploadProgressBar from "./UploadProgressBar";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { UPLOAD_ACCEPT, validateUploadFile } from "@/app/lib/file-types";
import { documentHref } from "@/components/layout/utils";

type DocumentData = {
  id: number;
  title: string;
  category: string;
  subject: string;
  module_id?: number | null;
  status?: string | null;
  created_at?: string | null;
  file_size?: number | null;
  file_url?: string;
  page_count?: number | null;
  thumbnail_url?: string | null;
  uploaded_by?: string;
  uploader_name?: string | null;
  rejection_reason?: string | null;
};

interface ResubmitModalProps {
  document: DocumentData;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ResubmitModal({ document, isOpen, onClose, onSuccess }: ResubmitModalProps) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [duplicateDocument, setDuplicateDocument] = useState<DuplicateDocument | null>(null);

  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState(document.category);
  const [newFile, setNewFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when the modal is open
  useEffect(() => {
    if (isOpen) {
      window.document.body.style.overflow = "hidden";
    } else {
      window.document.body.style.overflow = "unset";
    }

    return () => {
      window.document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadState("idle");
    setProgress(0);
    setError(null);
    setDuplicateDocument(null);

    if (newFile) {
      const fileError = validateUploadFile(newFile);
      if (fileError) {
        setUploadState("error");
        setError(fileError);
        return;
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("title", title);
      formData.append("category", category);
      formData.append("subject", document.subject);
      formData.append("module_id", document.module_id ? String(document.module_id) : "null");

      if (newFile) {
        formData.append("file", newFile);
      }

      const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/documents/${document.id}/resubmit`;

      await uploadWithProgress(
        endpoint,
        formData,
        session.access_token,
        (percent) => setProgress(percent),
        (state) => setUploadState(state)
      );

      setTimeout(() => {
        onSuccess();
        setUploadState("idle");
      }, 1500);

    } catch (err: unknown) {
      const uploadError = err as Partial<DuplicateUploadError> & { message?: string };
      setUploadState("error");
      setError(uploadError.message || "Something went wrong during resubmission.");
      setDuplicateDocument(
        uploadError.code === "duplicate_upload"
          ? uploadError.existingDocument || null
          : null
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Edit & Resubmit</h2>
          <button
            onClick={onClose}
            disabled={uploadState === "uploading" || uploadState === "processing"}
            className="text-muted transition-colors hover:text-destructive disabled:opacity-50"
          >
            <XCircle size={24} />
          </button>
        </div>

        {/* Rejection Note */}
        {document.rejection_reason && (
          <div className="mb-6 flex gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="shrink-0" size={20} />
            <div className="text-sm">
              <strong className="font-semibold">Moderator Note:</strong>
              <p className="mt-1 opacity-90">{document.rejection_reason}</p>
            </div>
          </div>
        )}

        <ErrorBoundary
          title="Resubmit form could not load"
          message="The resubmission workflow ran into a problem. Close this dialog and try again."
        >
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Title Input */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Document Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploadState !== "idle" && uploadState !== "error"}
                className="w-full rounded-xl border border-border bg-surface p-3 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>

            {/* Category Dropdown (Fixed for Dark Mode) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={uploadState !== "idle" && uploadState !== "error"}
                className="w-full rounded-xl border border-border bg-surface p-3 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                <option value="notes" className="bg-surface text-foreground">Notes</option>
                <option value="pyq" className="bg-surface text-foreground">PYQ</option>
                <option value="tutorial_sheet" className="bg-surface text-foreground">Tutorial</option>
                <option value="syllabus" className="bg-surface text-foreground">Syllabus</option>
              </select>
            </div>

            {/* File Dropzone */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Replace File (Optional)</label>
              <div
                onClick={() => { if (uploadState === "idle" || uploadState === "error") fileInputRef.current?.click() }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background p-6 transition-colors ${(uploadState === "idle" || uploadState === "error")
                    ? "hover:border-primary hover:bg-primary/5"
                    : "cursor-not-allowed opacity-50"
                  }`}
              >
                {newFile ? (
                  <div className="flex flex-col items-center text-primary">
                    <FileText size={32} className="mb-2" />
                    <span className="text-sm font-medium text-foreground">{newFile.name}</span>
                    <span className="mt-1 text-xs text-muted">Click to change</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-muted">
                    <UploadCloud size={32} className="mb-2" />
                    <span className="text-sm">Click to upload a new file</span>
                  </div>
                )}
                <input type="file" accept={UPLOAD_ACCEPT} className="hidden" ref={fileInputRef} onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            {/* Progress Bar */}
            <UploadProgressBar
              state={uploadState}
              progress={progress}
              fileName={newFile?.name}
              errorMessage={error || undefined}
              existingDocumentHref={duplicateDocument ? documentHref(duplicateDocument) : undefined}
            />

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploadState === "uploading" || uploadState === "processing" || uploadState === "success"}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary p-3 font-bold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {(uploadState === "uploading" || uploadState === "processing") ? (
                <><InlineSpinner label="Processing resubmission" size={20} /> Processing...</>
              ) : "Submit Changes"}
            </button>
          </form>
        </ErrorBoundary>
      </div>
    </div>
  );
}
