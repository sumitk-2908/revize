"use client";

export type AuthPromptFeature =
  | "bookmark"
  | "sidebarBookmark"
  | "continueStudying"
  | "upload"
  | "contributionHistory"
  | "activityGraph"
  | "studyStreak"
  | "profile"
  | "comment"
  | "resourceRequest"
  | "studySets";

export type AuthPromptCopy = {
  title: string;
  description: string;
};

export const AUTH_PROMPT_COPY: Record<AuthPromptFeature, AuthPromptCopy> = {
  bookmark: {
    title: "Save this bookmark",
    description: "Sign in to sync your bookmarks and continue studying across all your devices.",
  },
  sidebarBookmark: {
    title: "Bookmark important resources",
    description: "Sign in to sync your bookmarks and continue studying across all your devices.",
  },
  continueStudying: {
    title: "Continue studying",
    description: "Sign in to pick up where you left off and get study suggestions based on your recent materials.",
  },
  upload: {
    title: "Contribute a resource",
    description: "Sign in to upload PDFs, track approvals, and build your contribution history.",
  },
  contributionHistory: {
    title: "View contribution history",
    description: "Sign in to see your uploaded resources, approval status, and download impact.",
  },
  activityGraph: {
    title: "View your activity graph",
    description: "Sign in to build a private activity graph from your bookmarks, uploads, and study sessions.",
  },
  studyStreak: {
    title: "Track your study streak",
    description: "Sign in to keep your study streak updated every time you return to your materials.",
  },
  profile: {
    title: "Open your profile",
    description: "Sign in to see your bookmarks, study streak, contribution history, and activity in one place.",
  },
  comment: {
    title: "Join the discussion",
    description: "Sign in to ask questions, help others, and add your insights to these notes.",
  },
  resourceRequest: {
    title: "Request a resource",
    description: "Sign in to ask for the notes you need and upvote what other students are missing.",
  },
  studySets: {
    title: "Study with flashcards and quizzes",
    description: "Sign in to review curated flashcards and test yourself with quizzes for this document.",
  },
};

export const requestAuthPrompt = (feature: AuthPromptFeature) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuthPromptFeature>("portal_auth_prompt", { detail: feature }));
};
