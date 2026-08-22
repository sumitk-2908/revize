import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createResourceRequest,
  deleteResourceRequest,
  getMyRequestUpvotes,
  getResourceRequests,
  setResourceRequestStatus,
  toggleRequestUpvote,
  type NewResourceRequest,
  type ResourceRequest,
  type ResourceRequestFilters,
} from '@/app/lib/api/requests';
import { dispatchToast } from '@/app/lib/toast';

/** One key shape for every board read, so a mutation can invalidate all of them
 *  regardless of which filters are active. */
const REQUESTS_KEY = ['resource-requests'] as const;

export const useResourceRequests = (filters: ResourceRequestFilters = {}) => {
  return useQuery<ResourceRequest[]>({
    queryKey: [...REQUESTS_KEY, filters.status ?? 'open', filters.subject ?? 'all', filters.sort ?? 'wanted'],
    queryFn: () => getResourceRequests(filters),
  });
};

/** The signed-in user's own requests, for the profile tab. `enabled` keeps this
 *  off the wire until that tab is opened. */
export const useMyResourceRequests = (userId?: string, enabled = true) => {
  return useQuery<ResourceRequest[]>({
    queryKey: [...REQUESTS_KEY, 'mine', userId ?? 'anon'],
    queryFn: () => getResourceRequests({ userId, status: 'all', sort: 'newest' }),
    enabled: Boolean(userId) && enabled,
  });
};

export const useMyRequestUpvotes = (userId?: string) => {
  return useQuery<string[]>({
    queryKey: ['resource-request-upvotes', userId],
    queryFn: () => getMyRequestUpvotes(userId),
    enabled: Boolean(userId),
  });
};

export const useToggleRequestUpvoteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, userId, isAdding }: { requestId: string; userId: string; isAdding: boolean }) =>
      toggleRequestUpvote(requestId, userId, isAdding),

    onMutate: async ({ requestId, userId, isAdding }) => {
      await queryClient.cancelQueries({ queryKey: REQUESTS_KEY });
      await queryClient.cancelQueries({ queryKey: ['resource-request-upvotes', userId] });

      const previousVotes = queryClient.getQueryData<string[]>(['resource-request-upvotes', userId]);
      // Snapshot every cached board variant, since the same request can appear
      // under several filter combinations at once.
      const previousBoards = queryClient.getQueriesData<ResourceRequest[]>({ queryKey: REQUESTS_KEY });

      queryClient.setQueryData<string[]>(['resource-request-upvotes', userId], (old = []) =>
        isAdding ? [...old, requestId] : old.filter((id) => id !== requestId)
      );

      queryClient.setQueriesData<ResourceRequest[]>({ queryKey: REQUESTS_KEY }, (old) =>
        old?.map((request) =>
          request.id === requestId
            ? { ...request, upvote_count: Math.max(0, request.upvote_count + (isAdding ? 1 : -1)) }
            : request
        )
      );

      return { previousVotes, previousBoards };
    },

    onError: (error, variables, context) => {
      if (context?.previousVotes) {
        queryClient.setQueryData(['resource-request-upvotes', variables.userId], context.previousVotes);
      }
      context?.previousBoards?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      dispatchToast('Error', 'Failed to update your upvote.', 'error');
    },

    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['resource-request-upvotes', variables.userId] });
    },
  });
};

export const useCreateResourceRequestMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: NewResourceRequest) => createResourceRequest(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      dispatchToast('Request Posted', 'Contributors can now see what you need.', 'success');
    },
    // PROFILE_NAME_REQUIRED is handled by the caller, which opens the profile
    // setup modal instead of showing an error.
  });
};

export const useResourceRequestStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: 'open' | 'closed' }) =>
      setResourceRequestStatus(requestId, status),
    onSuccess: (data, { status }) => {
      queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      dispatchToast(
        status === 'closed' ? 'Request Closed' : 'Request Reopened',
        status === 'closed' ? 'It no longer appears on the board.' : 'It is back on the board.',
        'success'
      );
    },
    onError: () => dispatchToast('Error', 'Failed to update the request.', 'error'),
  });
};

export const useDeleteResourceRequestMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => deleteResourceRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      dispatchToast('Request Deleted', 'The request has been removed.', 'success');
    },
    onError: () => dispatchToast('Error', 'Failed to delete the request.', 'error'),
  });
};
