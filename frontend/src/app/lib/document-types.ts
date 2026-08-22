import type { Database } from "@/app/lib/database.types";

type DatabaseDocument = Database["public"]["Tables"]["documents"]["Row"];

export type DocumentRecord = Pick<
  DatabaseDocument,
  "id" | "title" | "category" | "subject" | "file_url"
> &
  Partial<Omit<DatabaseDocument, "id" | "title" | "category" | "subject" | "file_url">>;
export type DocumentAnalytics = Database["public"]["Tables"]["document_analytics"]["Row"];

export type DocumentWithAnalytics = DocumentRecord & {
  last_page?: number | null;
  document_analytics?: Partial<DocumentAnalytics> | Partial<DocumentAnalytics>[] | null;
};

export type FlaggedDocument = DatabaseDocument & {
  flags?: Database["public"]["Tables"]["document_flags"]["Row"][];
};

export type DocumentsPage = {
  data: DocumentWithAnalytics[];
  nextCursor: number | null;
  total: number;
};

export type InfiniteDocumentsData = {
  pages: DocumentsPage[];
  pageParams: unknown[];
};

export type StoredBookmark = number | { id: number } | (DocumentRecord & { bookmarked_at?: string });
