import { supabase } from './core';
import type { DocumentRecord } from '../document-types';

export type StudyHistoryDocument = DocumentRecord & {
  accessed_at: string;
  last_page?: number | null;
};

export const getRecentStudyActivity = async (userId?: string) => {
  let cloudHistory: StudyHistoryDocument[] = [];

  if (userId) {
    const { data: historyData, error: historyError } = await supabase
      .from('study_history')
      .select('accessed_at, last_page, documents!inner(*, document_analytics(view_count, upvotes, download_count))')
      .eq('user_id', userId)
      .eq('documents.status', 'approved')
      .order('accessed_at', { ascending: false })
      .limit(5);

    if (!historyError && historyData && historyData.length > 0) {
      cloudHistory = historyData.map((h: { documents: DocumentRecord | DocumentRecord[], accessed_at: string; last_page?: number | null }) => ({
        ...(Array.isArray(h.documents) ? h.documents[0] : h.documents),
        accessed_at: h.accessed_at,
        last_page: h.last_page
      }));
    }
  }

  try {
    const stored = localStorage.getItem("portal_study_history");
    const parsed = stored ? JSON.parse(stored) : [];
    const localHistory = Array.isArray(parsed) ? parsed : [];

    if (cloudHistory.length === 0) return localHistory;

    const combined = [...cloudHistory];
    for (const lh of localHistory) {
      if (!combined.find(h => h.id === lh.id)) {
        combined.push({
          ...lh,
          accessed_at: lh.accessed_at || lh.created_at
        });
      }
    }

    return combined.slice(0, 5);

  } catch (error) {
    console.warn("Resetting corrupted history local storage");
    return cloudHistory;
  }
};

export const getFullStudyHistory = async (userId?: string) => {
  let cloudHistory: StudyHistoryDocument[] = [];

  const currentYear = new Date().getFullYear();
  const fetchStartDate = new Date(currentYear, 0, 1);

  if (userId) {
    const { data: historyData, error: historyError } = await supabase
      .from('study_history')
      .select('accessed_at, last_page, documents!inner(*, document_analytics(view_count, upvotes, download_count))')
      .eq('user_id', userId)
      .gte('accessed_at', fetchStartDate.toISOString())
      .eq('documents.status', 'approved')
      .order('accessed_at', { ascending: false });

    if (!historyError && historyData && historyData.length > 0) {
      cloudHistory = historyData.map((h: { documents: DocumentRecord | DocumentRecord[], accessed_at: string; last_page?: number | null }) => ({
        ...(Array.isArray(h.documents) ? h.documents[0] : h.documents),
        accessed_at: h.accessed_at,
        last_page: h.last_page
      }));
    }
  }

  try {
    const stored = localStorage.getItem("portal_study_history");
    const parsed = stored ? JSON.parse(stored) : [];
    const localHistory = Array.isArray(parsed) ? parsed : [];

    if (cloudHistory.length === 0) return localHistory;

    const combined = [...cloudHistory];
    for (const lh of localHistory) {
      if (!combined.find(h => h.id === lh.id)) {
        combined.push({
          ...lh,
          accessed_at: lh.accessed_at || lh.created_at
        });
      }
    }
    return combined;
  } catch (error) {
    console.warn("Resetting corrupted history local storage");
    return cloudHistory;
  }
};

export type StudyActivityDay = { activity_date: string; interaction_count: number };

/**
 * Days the student actually studied, for the profile heatmap.
 *
 * Deliberately not derived from `study_history`: that table is UNIQUE on
 * (user_id, document_id) and written with an upsert that overwrites
 * `accessed_at`, so it holds one row per document stamped with the most recent
 * visit. Reading two documents across four days produced two dates, which is
 * why the heatmap used to contradict the streak counter. `study_activity` keeps
 * one row per day and is written by the same RPC that maintains the streak.
 */
export const getStudyActivityCalendar = async (
  userId?: string,
  year?: number,
): Promise<StudyActivityDay[]> => {
  if (!userId) return [];

  // UTC to match `activity_date`, which the RPC stamps with the UTC date.
  const target = year ?? new Date().getUTCFullYear();

  const { data, error } = await supabase
    .from('study_activity')
    .select('activity_date, interaction_count')
    .eq('user_id', userId)
    .gte('activity_date', `${target}-01-01`)
    .lte('activity_date', `${target}-12-31`)
    .order('activity_date', { ascending: true });

  if (error) {
    console.error("Fetch Study Activity Error:", error);
    return [];
  }

  return data || [];
};

export const updateReadingProgress = async (userId: string, documentId: number, lastPage: number) => {
  const { error } = await supabase.from('study_history').upsert({
    user_id: userId,
    document_id: documentId,
    last_page: lastPage,
    accessed_at: new Date().toISOString(),
  }, { onConflict: 'user_id, document_id' });
  if (error) throw error;
};

export const logStudySession = async (userId: string, documentId: number) => {
  try {
    const accessedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('study_history')
      .update({ accessed_at: accessedAt })
      .eq('user_id', userId)
      .eq('document_id', documentId)
      .select('id');
    if (updateError) throw updateError;

    // Updating first preserves last_page. Insert only when this is the first visit.
    if (!updated?.length) {
      const { error: insertError } = await supabase.from('study_history').insert({
        user_id: userId,
        document_id: documentId,
        accessed_at: accessedAt,
      });
      if (insertError && insertError.code !== '23505') throw insertError;
    }
  } catch (error) {
    console.error("Failed to log study session:", error);
  }
};
