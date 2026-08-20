import { getPublicContributorDocs } from "@/app/lib/api/profile";
import DocumentInteractiveGrid from "@/components/subject/DocumentInteractiveGrid";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { Metadata } from "next";
import { User } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  return {
    title: `Contributor Profile`,
    description: `View resources uploaded by this contributor.`,
  };
}

export default async function ContributorPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const docs = await getPublicContributorDocs(userId);
  
  const totalUploads = docs.length;
  let totalViews = 0;
  let totalDownloads = 0;
  let contributorName = "Anonymous Contributor";
  
  if (totalUploads > 0) {
    contributorName = docs[0].uploader_name || "Anonymous Contributor";
    for (const doc of docs) {
      if (doc.document_analytics) {
        totalViews += (doc.document_analytics.view_count || 0);
        totalDownloads += (doc.document_analytics.download_count || 0);
      }
    }
  }

  return (
    <div className="animate-fade-up container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header Profile Section */}
      <div className="flex flex-col items-center justify-center gap-4 text-center pb-8 border-b border-border">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 border-4 border-background shadow-xl text-primary">
          <User size={48} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{contributorName}</h1>
          <p className="mt-2 text-sm text-muted font-medium uppercase tracking-wider">Community Contributor</p>
        </div>
        
        {/* Stats Row */}
        <div className="mt-4 flex gap-4">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-hover px-6 py-3 border border-border">
            <span className="text-2xl font-black text-foreground tabular-nums">{totalUploads}</span>
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Uploads</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-hover px-6 py-3 border border-border">
            <span className="text-2xl font-black text-foreground tabular-nums">{totalViews}</span>
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Views</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-hover px-6 py-3 border border-border">
            <span className="text-2xl font-black text-foreground tabular-nums">{totalDownloads}</span>
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Downloads</span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-extrabold mb-6">Contributions</h2>
        <ErrorBoundary
          title="Documents could not load"
          message="There was an error loading the contributor's documents."
        >
          {docs.length > 0 ? (
            <DocumentInteractiveGrid initialDocuments={docs} subjectSlug="" />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center text-muted">
              <p>This contributor hasn&rsquo;t uploaded any public resources yet.</p>
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
