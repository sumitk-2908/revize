/**
 * Single source of truth for which file types the portal accepts, and for
 * everything the UI derives from a stored file's extension.
 *
 * Mirrors `backend/app/file_types.py` — when you add a type there, add it here
 * too, or the browser will reject what the API accepts (or vice versa).
 *
 * A document's type is derived from the extension in its `file_url`. There is
 * deliberately no `file_type` column: deriving works retroactively for every
 * row already in the table, including the legacy Supabase Storage URLs.
 */

const MB = 1024 * 1024;

export type FileKind = "pdf" | "image" | "text" | "office" | "unknown";

export interface FileSpec {
  /** Lower-cased extension without the dot. */
  ext: string;
  kind: FileKind;
  /** Short badge text shown on cards, e.g. "PDF", "DOCX". */
  label: string;
  /** MIME type, used for the file input's `accept` attribute. */
  mime: string;
  maxBytes: number;
}

/** Keep these caps identical to ALLOWED_FILE_TYPES in backend/app/file_types.py. */
export const FILE_SPECS: Record<string, FileSpec> = {
  pdf: { ext: "pdf", kind: "pdf", label: "PDF", mime: "application/pdf", maxBytes: 50 * MB },

  docx: {
    ext: "docx",
    kind: "office",
    label: "DOCX",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    maxBytes: 75 * MB,
  },
  pptx: {
    ext: "pptx",
    kind: "office",
    label: "PPTX",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    maxBytes: 75 * MB,
  },
  xlsx: {
    ext: "xlsx",
    kind: "office",
    label: "XLSX",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    maxBytes: 75 * MB,
  },

  png: { ext: "png", kind: "image", label: "PNG", mime: "image/png", maxBytes: 10 * MB },
  jpg: { ext: "jpg", kind: "image", label: "JPG", mime: "image/jpeg", maxBytes: 10 * MB },
  jpeg: { ext: "jpeg", kind: "image", label: "JPEG", mime: "image/jpeg", maxBytes: 10 * MB },
  webp: { ext: "webp", kind: "image", label: "WEBP", mime: "image/webp", maxBytes: 10 * MB },
  gif: { ext: "gif", kind: "image", label: "GIF", mime: "image/gif", maxBytes: 10 * MB },

  txt: { ext: "txt", kind: "text", label: "TXT", mime: "text/plain", maxBytes: 2 * MB },
  md: { ext: "md", kind: "text", label: "MD", mime: "text/markdown", maxBytes: 2 * MB },
};

// SVG is deliberately excluded: it is a scriptable format, and the viewer's
// FullScreen link opens the stored file directly on the storage origin.

export const ALLOWED_EXTENSIONS = Object.keys(FILE_SPECS);

/** Value for a file input's `accept` attribute — MIME types plus extensions. */
export const UPLOAD_ACCEPT = [
  ...new Set(Object.values(FILE_SPECS).map((spec) => spec.mime)),
  ...ALLOWED_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

/** Short human-readable list for hint text, e.g. "PDF, DOCX, PPTX, …". */
export const ALLOWED_TYPES_LABEL = "PDF, Word, PowerPoint, Excel, images, TXT/MD";

/** Lower-cased extension without the dot, from a filename or a URL. */
export function getExtension(urlOrName: string | null | undefined): string {
  if (!urlOrName) return "";
  // Strip any query string / fragment first so `file.pdf?download=x` still works.
  const path = urlOrName.split(/[?#]/)[0];
  const lastSegment = path.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0) return "";
  return lastSegment.slice(dot + 1).toLowerCase();
}

/** The spec for a filename or stored URL, or null when the type isn't known. */
export function getFileSpec(urlOrName: string | null | undefined): FileSpec | null {
  return FILE_SPECS[getExtension(urlOrName)] ?? null;
}

/** How the viewer should render this file. Unknown types fall back to download-only. */
export function getFileKind(urlOrName: string | null | undefined): FileKind {
  return getFileSpec(urlOrName)?.kind ?? "unknown";
}

/**
 * Badge text for a stored file, e.g. "PDF" or "DOCX".
 * Falls back to the bare extension so an unrecognised legacy row still reads
 * sensibly, and to "FILE" when there is no extension at all.
 */
export function getFileLabel(urlOrName: string | null | undefined): string {
  const spec = getFileSpec(urlOrName);
  if (spec) return spec.label;
  const ext = getExtension(urlOrName);
  return ext ? ext.toUpperCase() : "FILE";
}

/** Whether a stored file can be cached for offline use / previewed in-app. */
export function isPreviewable(urlOrName: string | null | undefined): boolean {
  const kind = getFileKind(urlOrName);
  return kind === "pdf" || kind === "image" || kind === "text";
}

/**
 * Client-side pre-flight check, mirroring the backend's extension and per-type
 * size gates so the user gets an instant error instead of a round trip.
 * Returns an error message, or null when the file is acceptable.
 */
export function validateUploadFile(file: File): string | null {
  const spec = getFileSpec(file.name);
  if (!spec) {
    return `Unsupported file type. Allowed: ${ALLOWED_TYPES_LABEL}.`;
  }
  if (file.size > spec.maxBytes) {
    const limitMb = Math.round(spec.maxBytes / MB);
    return `${spec.label} files must be under ${limitMb}MB.`;
  }
  return null;
}

/** `Title.ext` — the name a downloaded copy should be saved under. */
export function buildDownloadFilename(
  fileUrl: string | null | undefined,
  title: string | null | undefined,
): string {
  const safeTitle = (title || "document").trim() || "document";
  const ext = getExtension(fileUrl);
  return ext ? `${safeTitle}.${ext}` : safeTitle;
}

/**
 * Href that makes R2 serve the file as an attachment under a friendly name.
 * The `?download=` query parameter is a Cloudflare R2 convention.
 */
export function buildDownloadHref(
  fileUrl: string | null | undefined,
  title: string | null | undefined,
): string {
  if (!fileUrl) return "#";
  const separator = fileUrl.includes("?") ? "&" : "?";
  return `${fileUrl}${separator}download=${encodeURIComponent(buildDownloadFilename(fileUrl, title))}`;
}
