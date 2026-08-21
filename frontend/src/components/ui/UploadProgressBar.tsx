"use client";

import { UploadCloud, CheckCircle, AlertCircle, ServerCog } from "lucide-react";
import { UploadState } from "@/app/lib/api/documents";

interface UploadProgressBarProps {
  state: UploadState;
  progress: number;
  fileName?: string;
  errorMessage?: string;
}

export default function UploadProgressBar({
  state,
  progress,
  fileName,
  errorMessage,
}: UploadProgressBarProps) {
  if (state === "idle") return null;

  return (
    <div aria-live="polite" className="mt-4 overflow-hidden rounded-xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Dynamic Icon based on state */}
          <div
            className={`flex size-10 items-center justify-center rounded-xl text-white transition-colors
            ${
              state === "uploading"
                ? "bg-blue-500"
                : state === "processing"
                  ? "bg-amber-500"
                  : state === "success"
                    ? "bg-emerald-500"
                    : "bg-red-500"
            }`}
          >
            {state === "uploading" && (
              <UploadCloud size={20} className="animate-pulse" />
            )}
            {state === "processing" && (
              <ServerCog size={20} className="animate-spin" />
            )}
            {state === "success" && <CheckCircle size={20} />}
            {state === "error" && <AlertCircle size={20} />}
          </div>

          <div>
            <h4 className="text-sm font-bold text-foreground">
              {state === "uploading" && "Uploading Document..."}
              {state === "processing" &&
                "Extracting Metadata & Processing..."}
              {state === "success" && "Upload Complete!"}
              {state === "error" && "Upload Failed"}
            </h4>

            <p className="line-clamp-1 text-xs text-muted">
              {state === "error"
                ? errorMessage
                : fileName || "Large files may take a moment to process."}
            </p>
          </div>
        </div>

        {/* Progress Percentage */}
        {(state === "uploading" || state === "processing") && (
          <span className="text-sm font-black text-foreground">
            {progress}%
          </span>
        )}
      </div>

      {/* Progress Bar Track */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out
            ${
              state === "error"
                ? "bg-red-500"
                : state === "success"
                  ? "bg-emerald-500"
                  : state === "processing"
                    ? "bg-amber-500"
                    : "bg-blue-500"
            }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
