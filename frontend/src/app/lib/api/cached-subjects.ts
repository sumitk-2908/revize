import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/utils/supabase/public';
import { SUBJECT_SELECT, type Branch, type Subject, type Module } from './subjects';

export const getCachedSubjects = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.from('subjects').select(SUBJECT_SELECT).order('name');
    if (error) throw error;
    return data as Subject[];
  },
  ['all-subjects'],
  { revalidate: 86400, tags: ['subjects'] }
);

export const getCachedBranches = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.from('branches').select('*').order('code');
    if (error) throw error;
    return data as Branch[];
  },
  ['all-branches'],
  { revalidate: 86400, tags: ['subjects'] }
);

export const getCachedSubjectBySlug = unstable_cache(
  async (slug: string) => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.from('subjects').select(SUBJECT_SELECT).eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data as Subject | null;
  },
  ['subject-by-slug'],
  { revalidate: 86400, tags: ['subjects'] }
);

export const getCachedModules = unstable_cache(
  async (subjectId: number) => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.from('modules').select('*').eq('subject_id', subjectId).order('module_number');
    if (error) throw error;
    return data as Module[];
  },
  ['modules-by-subject'],
  { revalidate: 86400, tags: ['modules'] }
);

export const getCachedSubjectCounts = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data: countData, error } = await supabase.rpc("get_subject_counts");
    if (error) throw error;
    
    const counts: Record<string, number> = {};
    if (countData) {
      countData.forEach((row: any) => {
        if (row.subject) {
          counts[row.subject.toUpperCase()] = Number(row.count);
        }
      });
    }
    return counts;
  },
  ['subject-counts'],
  { revalidate: 86400, tags: ['subjects'] }
);

export const getCachedModuleCounts = unstable_cache(
  async (subjectName: string) => {
    const supabase = createPublicClient();
    const { data: countData, error } = await supabase.rpc('get_module_counts', { p_subject: subjectName });
    if (error) throw error;

    const moduleCounts: Record<number, number> = {};
    if (countData) {
      countData.forEach((row: any) => {
        if (row.module_id) {
          moduleCounts[row.module_id] = Number(row.count);
        }
      });
    }
    return moduleCounts;
  },
  ['module-counts'],
  { revalidate: 86400, tags: ['modules'] }
);
