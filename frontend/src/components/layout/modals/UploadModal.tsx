"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, Upload } from "lucide-react";
import { useSubjects, getIsNonModuleSubject } from "@/app/hooks/useSubjects";
import { useUpload } from "@/app/context/UploadContext";
import { useAuth } from "@/app/context/AuthContext";
import UploadProgressBar from "@/components/ui/UploadProgressBar";
import SubjectCombobox from "@/components/ui/SubjectCombobox";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import { ALLOWED_TYPES_LABEL, UPLOAD_ACCEPT } from "@/app/lib/file-types";

export const UploadModal = () => {
  const { 
    showUploadForm, setShowUploadForm, uploadSubject, setUploadSubject, 
    uploadModule, setUploadModule, uploadCategory, setUploadCategory, 
    uploadTitle, setUploadTitle, file, setFile, uploadState, 
    uploadProgress, uploadErrorMsg, handleUpload 
  } = useUpload();
  const { isAdmin } = useAuth();
  const { data: subjects = [] } = useSubjects();

  return (
  <Dialog.Root open={showUploadForm} onOpenChange={setShowUploadForm}>
    <Dialog.Portal>
      <Dialog.Overlay className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
      <Dialog.Content className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[50%] left-[50%] z-[100] w-full max-w-lg translate-[-50%] rounded-3xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Dialog.Title className="text-lg font-extrabold text-foreground">{isAdmin ? "Admin Database Upload" : "Student Contribution"}</Dialog.Title>
          <Dialog.Close asChild><button className="text-muted transition-opacity hover:opacity-80"><X size={20} /></button></Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">Upload a document to the portal.</Dialog.Description>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="upload-subject" className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Subject</label>
              <SubjectCombobox
                id="upload-subject"
                subjects={subjects}
                value={uploadSubject}
                onChange={setUploadSubject}
                disabled={uploadState === "uploading" || uploadState === "processing"}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Module</label>
              <select value={uploadModule} onChange={(e) => setUploadModule(Number(e.target.value))} disabled={uploadCategory === "syllabus" || getIsNonModuleSubject(subjects, uploadSubject)} className="motion-focus h-11 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50">
                {[1, 2, 3, 4, 5].map(m => <option key={m} value={m}>Module {m}</option>)}
              </select>
            </div>
          </div>
          <div><label className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Title</label><input required type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} className="motion-focus h-11 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none" /></div>
          <div><label className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Category</label><select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className="motion-focus h-11 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none"><option value="notes">Notes</option><option value="pyq">PYQ</option><option value="tutorial_sheet">Tutorial</option><option value="syllabus">Syllabus</option></select></div>
          <div>
            <label className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">File Upload</label>
            <div className="relative flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-hover p-6 transition-colors hover:border-primary/50 hover:bg-surface">
              <div className="text-center">
                <Upload className="mx-auto mb-2 size-6 text-muted" />
                <p className="text-sm font-semibold text-foreground">{file ? file.name : "Choose a file or drag & drop it here"}</p>
                <p className="mt-1 text-xs text-muted">{ALLOWED_TYPES_LABEL}</p>
              </div>
              <input required type="file" accept={UPLOAD_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" disabled={uploadState === "uploading" || uploadState === "processing"} />
            </div>
          </div>
          <UploadProgressBar state={uploadState} progress={uploadProgress} fileName={file?.name} errorMessage={uploadErrorMsg} />
          <button type="submit" disabled={uploadState === "uploading" || uploadState === "processing" || uploadState === "success"} className="motion-hover motion-active flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">{(uploadState === "uploading" || uploadState === "processing") ? <><InlineSpinner label="Processing upload" size={16} /> Processing</> : "Publish Resource"}</button>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
  );
};
