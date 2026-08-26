import { MetadataRoute } from 'next';
import { createClient } from '@/utils/supabase/server';
import { subjectSlug as generateFallbackSlug, documentPath } from '@/components/layout/utils';
import { getCachedSubjects } from '@/app/lib/api/cached-subjects';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const supabase = await createClient();

  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  // Fetch subjects to map names to actual URL slugs
  const subjectsData = await getCachedSubjects();
  const subjectSlugMap = new Map<string, string>();
  if (subjectsData) {
    subjectsData.forEach((sub) => subjectSlugMap.set(sub.name, sub.slug));
  }

  // Fetch approved documents to extract subjects, modules, and document IDs
  // `category` is selected because it decides whether a document's URL carries
  // a module segment (see documentPath).
  const { data: documents } = await supabase
    .from('documents')
    .select('id, slug, subject, module_id, category, updated_at')
    .eq('status', 'approved');

  if (documents && documents.length > 0) {
    const subjects = new Set<string>();
    const modulesBySubject = new Map<string, Set<number>>();

    documents.forEach((doc) => {
      if (doc.subject) {
        subjects.add(doc.subject);

        if (!modulesBySubject.has(doc.subject)) {
          modulesBySubject.set(doc.subject, new Set());
        }

        if (doc.module_id) {
          modulesBySubject.get(doc.subject)!.add(doc.module_id);
        }

        const currentSlug = subjectSlugMap.get(doc.subject) || generateFallbackSlug(doc.subject);

        // Add individual document route (title slug, id only as a fallback).
        // Module-less documents sit directly under the subject.
        routes.push({
          url: `${baseUrl}${documentPath(currentSlug, doc)}`,
          lastModified: new Date(doc.updated_at || Date.now()),
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    });

    // Add subject routes
    subjects.forEach((subject) => {
      const currentSlug = subjectSlugMap.get(subject) || generateFallbackSlug(subject);

      routes.push({
        url: `${baseUrl}/subject/${currentSlug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });

      // Add module routes
      const modules = modulesBySubject.get(subject);
      if (modules) {
        modules.forEach((moduleId) => {
          routes.push({
            url: `${baseUrl}/subject/${currentSlug}/module-${moduleId}`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
          });
        });
      }
    });
  }

  return routes;
}
