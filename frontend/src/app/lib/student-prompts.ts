"use client";

export const STUDENT_DOWNLOAD_COUNT_KEY = "portal_download_count";
export const STUDENT_CONTRIBUTION_PROMPT_DISMISSED_KEY = "portal_contribution_prompt_dismissed";

export type UploadPromptTone = "empty" | "few" | "many";

export const getUploadPromptCopy = (documentCount: number, subjectName?: string) => {
  const subjectContext = subjectName ? ` for ${subjectName}` : "";
  const specificContext = subjectName ? ` on ${subjectName}` : "";

  if (documentCount === 0) {
    return {
      tone: "empty" as UploadPromptTone,
      title: `No documents yet${subjectContext}`,
      message: "Be the first student to upload notes.",
    };
  }

  if (documentCount < 5) {
    return {
      tone: "few" as UploadPromptTone,
      title: "A few resources are here",
      message: `Help your classmates by sharing another perspective${specificContext}.`,
    };
  }

  return {
    tone: "many" as UploadPromptTone,
    title: "This section is growing",
    message: `Have better notes${subjectContext}? Share them with the community.`,
  };
};

/** Fields the upload modal can be opened pre-filled with, e.g. from the resource
 *  requests board. `fulfilsRequestId` is what links the finished upload back to
 *  the request it answers. */
export interface UploadPrefill {
  subject?: string;
  moduleId?: number | null;
  category?: string;
  title?: string;
  fulfilsRequestId?: string;
  /** Shown in the modal so the contributor can see what they are answering. */
  requestTitle?: string;
}

export const requestUploadPrompt = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("portal_upload_prompt"));
};

/** `requestUploadPrompt` with the form pre-filled — used by the resource
 *  requests board. Kept separate so the plain version stays usable directly as
 *  an onClick handler, where the argument would otherwise be a MouseEvent. */
export const requestUploadPromptFor = (prefill: UploadPrefill) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<UploadPrefill>("portal_upload_prompt", { detail: prefill }));
};

export const recordStudentDownload = () => {
  if (typeof window === "undefined") return 0;
  const currentCount = Number(localStorage.getItem(STUDENT_DOWNLOAD_COUNT_KEY) || "0");
  const nextCount = currentCount + 1;
  localStorage.setItem(STUDENT_DOWNLOAD_COUNT_KEY, String(nextCount));
  return nextCount;
};

export const getStudentDownloadCount = () => {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(STUDENT_DOWNLOAD_COUNT_KEY) || "0");
};

export const shouldShowContributionPrompt = (bookmarkCount: number) => {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(STUDENT_CONTRIBUTION_PROMPT_DISMISSED_KEY) === "true") return false;
  return getStudentDownloadCount() >= 3 || bookmarkCount >= 3;
};

export const dismissContributionPrompt = () => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STUDENT_CONTRIBUTION_PROMPT_DISMISSED_KEY, "true");
};
