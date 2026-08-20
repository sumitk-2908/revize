import { supabase } from './core';
import type { DocumentRecord, StoredBookmark } from '../document-types';

export const getStudentBookmarks = async (userId?: string) => {
  let cloudBookmarks: (DocumentRecord & { bookmarked_at: string })[] = [];
  let cloudError = false;

  if (userId && typeof navigator !== 'undefined' && navigator.onLine !== false) {
    try {
      const { data: bookmarkData, error: bookmarkError } = await supabase
        .from('student_bookmarks')
        .select('created_at, documents!inner(*)') 
        .eq('user_id', userId)
        .eq('documents.status', 'approved')
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (bookmarkError) {
        cloudError = true;
      } else if (bookmarkData && bookmarkData.length > 0) {
        cloudBookmarks = bookmarkData.map((b: { documents: DocumentRecord | DocumentRecord[], created_at: string | null }) => ({
          ...(Array.isArray(b.documents) ? b.documents[0] : b.documents),
          bookmarked_at: b.created_at || new Date().toISOString()
        }));
      }
    } catch {
      cloudError = true;
    }
  } else if (userId) {
    cloudError = true;
  }
  
  try {
    const stored = localStorage.getItem("portal_bookmarks");
    const parsed: StoredBookmark[] = stored ? JSON.parse(stored) : [];
    
    // If successfully fetched from cloud, sync to local storage for offline use
    if (userId && !cloudError) {
      localStorage.setItem("portal_bookmarks", JSON.stringify(cloudBookmarks));
      return cloudBookmarks;
    }

    // Fallback to local storage
    const localIds = parsed.map((b: StoredBookmark) => typeof b === 'object' && 'id' in b ? b.id : (b as number));
    
    if (!Array.isArray(localIds) || localIds.length === 0) return cloudBookmarks;
    
    // Extract fully hydrated objects from local storage
    const fullyHydrated = parsed.filter(
      (b: StoredBookmark): b is (DocumentRecord & { bookmarked_at?: string }) => 
        typeof b === 'object' && 'title' in b && 'file_url' in b
    );

    // If online (e.g. not logged in), hydrate legacy ID-only bookmarks from Supabase
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
      const { data, error } = await supabase.from('documents').select('*').in('id', localIds).eq('status', 'approved');
      const localBookmarks = (!error && Array.isArray(data)) ? data : [];

      const allBookmarks = [...cloudBookmarks];
      let didHydrate = false;
      
      for (const lb of localBookmarks) {
        if (!allBookmarks.find(b => b.id === lb.id)) {
          const localItem = parsed.find((p: StoredBookmark) => (typeof p === 'object' && 'id' in p ? p.id : p) === lb.id);
          const actualDate = (localItem && typeof localItem === 'object' && 'bookmarked_at' in localItem && localItem.bookmarked_at) 
                              ? localItem.bookmarked_at 
                              : lb.created_at; 
                              
          allBookmarks.push({
            ...lb, 
            bookmarked_at: actualDate
          } as DocumentRecord & { bookmarked_at: string });
          didHydrate = true;
        }
      }
      
      if (didHydrate) {
        localStorage.setItem("portal_bookmarks", JSON.stringify(allBookmarks));
      }
      return allBookmarks;
    } else {
      // Offline: return fully hydrated items from local storage
      return fullyHydrated.map(b => ({
        ...b,
        bookmarked_at: b.bookmarked_at || new Date().toISOString()
      }));
    }

  } catch (error) {
    console.warn("Resetting corrupted bookmarks local storage");
    return cloudBookmarks;
  }
};

export const toggleBookmarkAPI = async (userId: string, documentId: number, isAdding: boolean) => {
  if (isAdding) {
    const { error } = await supabase.from('student_bookmarks').insert({ user_id: userId, document_id: documentId });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('student_bookmarks').delete().match({ user_id: userId, document_id: documentId });
    if (error) throw error;
  }
};
