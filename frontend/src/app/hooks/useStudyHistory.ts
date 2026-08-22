import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRecentStudyActivity, getFullStudyHistory, getStudyActivityCalendar, logStudySession } from '@/app/lib/api/history';
import { dispatchToast } from '@/app/lib/toast';

export const useRecentStudyHistory = (userId?: string) => {
  return useQuery({
    queryKey: ['studyHistory', 'recent', userId],
    queryFn: () => getRecentStudyActivity(userId),
    enabled: true,
  });
};

export const useFullStudyHistory = (userId?: string) => {
  return useQuery({
    queryKey: ['studyHistory', 'full', userId],
    queryFn: () => getFullStudyHistory(userId),
    enabled: true,
  });
};

/** Per-day study activity for the profile heatmap. */
export const useStudyActivityCalendar = (userId?: string) => {
  return useQuery({
    queryKey: ['studyActivity', 'calendar', userId],
    queryFn: () => getStudyActivityCalendar(userId),
    enabled: !!userId,
  });
};

export const useLogStudySessionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, documentId, doc }: { userId: string, documentId: number, doc?: any }) => {
      await logStudySession(userId, documentId);
      return { userId, documentId, doc };
    },
    onMutate: async ({ userId, documentId, doc }) => {
      await queryClient.cancelQueries({ queryKey: ['studyHistory', 'recent', userId] });
      await queryClient.cancelQueries({ queryKey: ['studyHistory', 'full', userId] });

      const previousRecent = queryClient.getQueryData<any[]>(['studyHistory', 'recent', userId]);
      const previousFull = queryClient.getQueryData<any[]>(['studyHistory', 'full', userId]);

      if (doc) {
        queryClient.setQueryData<any[]>(['studyHistory', 'recent', userId], (old) => {
          const newHistory = (old || []).filter((d) => d.id !== documentId);
          newHistory.unshift(doc);
          return newHistory.slice(0, 5);
        });
        
        queryClient.setQueryData<any[]>(['studyHistory', 'full', userId], (old) => {
          const newHistory = (old || []).filter((d) => d.id !== documentId);
          newHistory.unshift(doc);
          return newHistory;
        });

        try {
          const stored = localStorage.getItem("portal_study_history");
          let parsed = stored ? JSON.parse(stored) : [];
          parsed = parsed.filter((d: any) => d.id !== documentId);
          parsed.unshift(doc);
          parsed = parsed.slice(0, 5);
          localStorage.setItem("portal_study_history", JSON.stringify(parsed));
        } catch (e) {
          console.warn("Error syncing history to localStorage", e);
        }
      }

      return { previousRecent, previousFull };
    },
    onError: (err, variables, context) => {
      if (context?.previousRecent) {
        queryClient.setQueryData(['studyHistory', 'recent', variables.userId], context.previousRecent);
      }
      if (context?.previousFull) {
        queryClient.setQueryData(['studyHistory', 'full', variables.userId], context.previousFull);
      }
      
      try {
        if (context?.previousRecent) {
          localStorage.setItem("portal_study_history", JSON.stringify(context.previousRecent.slice(0, 5)));
        }
      } catch (e) {}

      dispatchToast("Error", "Failed to log study session.", "error");
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['studyHistory', 'recent', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['studyHistory', 'full', variables.userId] });
      // update_study_streak() stamps today into study_activity on the same
      // visit, so the heatmap's cell for today needs a refetch too.
      queryClient.invalidateQueries({ queryKey: ['studyActivity', 'calendar', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['profile', 'streak', variables.userId] });
    },
  });
};
