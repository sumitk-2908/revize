"use client";

import { createContext, useContext, useState, useEffect } from "react";
import {
  uploadDocument,
  UploadState,
  DuplicateDocument,
  DuplicateUploadError,
} from "@/app/lib/api/documents";
import { useSubjects, getIsNonModuleSubject } from "@/app/hooks/useSubjects";
import { useAuth } from "@/app/context/AuthContext";
import { dispatchToast as showToast } from "@/app/lib/toast";
import { validateUploadFile } from "@/app/lib/file-types";
import { useQueryClient } from "@tanstack/react-query";

interface UploadContextType {
  showUploadForm: boolean;
  uploading: boolean;
  file: File | null;
  uploadTitle: string;
  uploadCategory: string;
  uploadSubject: string;
  uploadModule: number;
  uploadState: UploadState;
  uploadProgress: number;
  uploadErrorMsg: string;
  duplicateDocument: DuplicateDocument | null;

  setShowUploadForm: (v: boolean) => void;
  setFile: (v: File | null) => void;
  setUploadTitle: (v: string) => void;
  setUploadCategory: (v: string) => void;
  setUploadSubject: (v: string) => void;
  setUploadModule: (v: number) => void;
  handleUpload: (e: React.FormEvent) => Promise<void>;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin, isStudent, uploadedBy, openAuthPrompt } = useAuth();
  const queryClient = useQueryClient();

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("notes");
  const [uploadSubject, setUploadSubject] = useState("");
  const [uploadModule, setUploadModule] = useState(1);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadErrorMsg, setUploadErrorMsg] = useState("");
  const [duplicateDocument, setDuplicateDocument] = useState<DuplicateDocument | null>(null);

  const { data: subjects = [] } = useSubjects();

  useEffect(() => {
    if (subjects.length > 0 && !uploadSubject) {
      setUploadSubject(subjects[0].name);
    }
  }, [subjects, uploadSubject]);

  useEffect(() => {
    const handleUploadPrompt = () => {
      if (isAdmin || isStudent) setShowUploadForm(true);
      else openAuthPrompt("upload");
    };

    window.addEventListener("portal_upload_prompt", handleUploadPrompt);
    return () => window.removeEventListener("portal_upload_prompt", handleUploadPrompt);
  }, [isAdmin, isStudent, openAuthPrompt]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    if (!uploadSubject) {
      showToast("Upload Error", "Please choose a subject.", "error");
      return;
    }
    if (!file) {
      showToast("Upload Error", "Please attach a file to upload!", "error");
      return;
    }
    const fileError = validateUploadFile(file);
    if (fileError) {
      showToast("Upload Blocked", fileError, "error");
      return;
    }

    setUploadState("idle");
    setUploadProgress(0);
    setUploadErrorMsg("");
    setDuplicateDocument(null);
    setUploading(true);

    const formData = new FormData();
    const authorName = uploadedBy || (isAdmin ? "Admin" : "Student");
    formData.append("file", file);
    formData.append('title', uploadTitle);
    formData.append('uploader_name', authorName);
    formData.append("category", uploadCategory);
    const isModuleDisabled = uploadCategory === "syllabus" || getIsNonModuleSubject(subjects, uploadSubject);
    formData.append("module_id", isModuleDisabled ? "null" : String(uploadModule));
    formData.append("uploaded_by", authorName);
    formData.append("subject", uploadSubject);
    formData.append("status", isAdmin ? "approved" : "pending");

    try {
      await uploadDocument(formData, (percent) => setUploadProgress(percent), (state) => setUploadState(state));
      setTimeout(async () => {
        setFile(null);
        setUploadTitle("");
        setShowUploadForm(false);
        setUploadState("idle");
        setUploading(false);
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        if (!isAdmin) showToast("Success", "Notes submitted! Pending admin approval.", "success");
      }, 1500);
    } catch (err: unknown) {
      const error = err as Partial<DuplicateUploadError> & { message?: string };
      const message = error.message || "Failed to upload file.";
      setUploadState("error");
      setUploadErrorMsg(message);
      setDuplicateDocument(error.code === "duplicate_upload" ? error.existingDocument || null : null);
      setUploading(false);
      showToast("Upload Error", message, "error");
    }
  };

  return (
    <UploadContext.Provider value={{
      showUploadForm, uploading, file, uploadTitle, uploadCategory, uploadSubject, uploadModule, uploadState, uploadProgress, uploadErrorMsg, duplicateDocument,
      setShowUploadForm, setFile, setUploadTitle, setUploadCategory, setUploadSubject, setUploadModule, handleUpload
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
}
