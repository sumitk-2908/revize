import { supabase, api } from './core';
import { getTrendingDocuments } from './analytics';
import type { DocumentRecord, DocumentWithAnalytics } from '../document-types';

export const getStudyStreak = async (userId: string) => {
  const { data, error } = await supabase
    .from('study_streaks')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle(); 

  if (error) {
    console.error("Fetch Streak Error:", error);
    return null;
  }
  return data;
};

export const getAchievements = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  if (error) {
    console.error("Fetch Achievements Error:", error);
    return [];
  }
  return data || [];
};

export const getEnhancedContributions = async (userId: string) => {
  try {
    const { data: docs, error } = await supabase
      .from('documents')
      .select('*, document_analytics(*)')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!docs || docs.length === 0) return [];

    return docs.map((doc: DocumentWithAnalytics) => {
      const analytics = Array.isArray(doc.document_analytics) 
        ? doc.document_analytics[0] 
        : doc.document_analytics;

      return {
        ...doc,
        document_analytics: analytics || { view_count: 0, download_count: 0 }
      };
    });
  } catch (error) {
    console.error("Fetch Contributions Error:", error);
    return [];
  }
};

export const triggerStreakUpdate = async (userId: string) => {
  try {
    const { error } = await supabase.rpc('update_study_streak', { p_user_id: userId });
    if (error) throw error;
  } catch (error) {
    console.error("Failed to update streak:", error);
  }
};

export const getProfilePreferences = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error("Fetch Profile Error:", error);
    return null;
  }
  return data;
};

export const updateProfilePreferences = async (
  userId: string,
  preferences: { favorite_subjects?: string[], preferred_branch?: string | null, full_name?: string, academic_year?: string | null, branch_id?: number | null, year_of_study?: number | null }
) => {
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      ...preferences
    });

  if (error) {
    console.error("Update Profile Error:", error);
    throw error;
  }
};

export const getPersonalizedRecentUploads = async (userId?: string, limit = 5) => {
  let personalizedDocs: DocumentRecord[] = [];
  let userFavs: string[] = [];

  if (userId) {
    const profile = await getProfilePreferences(userId);
    userFavs = profile?.favorite_subjects || [];

    if (userFavs.length > 0) {
      const orQuery = userFavs.map((f: string) => `subject.ilike.%${f.trim()}%`).join(',');
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('status', 'approved')
        .or(orQuery)
        .order('created_at', { ascending: false })
        .limit(limit);
        
      if (data) personalizedDocs = data;
    }
  }

  if (personalizedDocs.length < limit) {
    const remainingLimit = limit - personalizedDocs.length;
    const excludeIds = personalizedDocs.map(d => d.id);
    
    let fallbackQuery = supabase
      .from('documents')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(remainingLimit);

    if (excludeIds.length > 0) {
      fallbackQuery = fallbackQuery.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data: fallbackDocs } = await fallbackQuery;
    if (fallbackDocs) {
      personalizedDocs = [...personalizedDocs, ...fallbackDocs];
    }
  }

  return personalizedDocs;
};

export const getPersonalizedRecommendations = async (userId?: string, limit = 5) => {
  const globalTrending = await getTrendingDocuments();
  
  if (!userId) return globalTrending;

  const profile = await getProfilePreferences(userId);
  if (!profile || !profile.favorite_subjects || (!profile.favorite_subjects.length && !profile.preferred_branch)) {
    return globalTrending;
  }

  const orQuery = profile.favorite_subjects.map((f: string) => `subject.ilike.%${f.trim()}%`).join(',');
  const { data: personalizedTrending } = await supabase
    .from('documents')
    .select('*')
    .eq('status', 'approved')
    .or(orQuery)
    .order('created_at', { ascending: false }) 
    .limit(limit);

  const combined = [...((personalizedTrending as unknown as DocumentWithAnalytics[]) || [])];
  const existingIds = new Set(combined.map(d => d.id));

  for (const doc of globalTrending) {
    if (combined.length >= limit) break;
    if (!existingIds.has(doc.id)) {
      combined.push(doc as unknown as DocumentWithAnalytics);
      existingIds.add(doc.id);
    }
  }

  return combined;
};

export const getSuggestedNextSteps = async (lastDoc: Pick<DocumentRecord, 'subject'>, excludeIds: number[] = [], limit = 3) => {
  if (!lastDoc || !lastDoc.subject) return [];
  
  let query = supabase
    .from('documents')
    .select('*')
    .eq('status', 'approved')
    .eq('subject', lastDoc.subject);
    
  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  }
  
  const { data, error } = await query
    .order('category', { ascending: false }) 
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch suggestions:", error);
    return [];
  }
  return data || [];
};

export const getPublicContributorDocs = async (userId: string) => {
  try {
    const { data: docs, error } = await supabase
      .from('documents')
      .select('*, document_analytics(*)')
      .eq('uploaded_by', userId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!docs || docs.length === 0) return [];

    return docs.map((doc: DocumentWithAnalytics) => {
      const analytics = Array.isArray(doc.document_analytics) 
        ? doc.document_analytics[0] 
        : doc.document_analytics;

      return {
        ...doc,
        document_analytics: analytics || { view_count: 0, download_count: 0 }
      };
    });
  } catch (error) {
    console.error("Fetch Contributor Docs Error:", error);
    return [];
  }
};

export const deleteUserAccount = async () => {
  const { data } = await api.delete('/api/v1/users/me');
  return data;
};

