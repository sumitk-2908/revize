import { supabase } from './core';
import type { Tables } from '../database.types';

export type ResourceRequestRow = Tables<'resource_requests'>;

/** The document that answered a request, when there is one. */
export interface FulfilledDocument {
  id: number;
  title: string;
  subject: string;
  category: string;
  module_id: number | null;
  slug: string | null;
}

export type ResourceRequest = ResourceRequestRow & {
  fulfilled_document: FulfilledDocument | null;
};

export type RequestStatusFilter = 'open' | 'fulfilled' | 'all';
export type RequestSort = 'wanted' | 'newest';

export interface ResourceRequestFilters {
  status?: RequestStatusFilter;
  /** Subject NAME, matching resource_requests.subject. */
  subject?: string;
  sort?: RequestSort;
  userId?: string;
  limit?: number;
}

/** documents and resource_requests reference each other in both directions, so
 *  the embed needs the constraint name to disambiguate — an unhinted
 *  `documents(...)` is ambiguous and PostgREST rejects it. */
const REQUEST_SELECT =
  '*, fulfilled_document:documents!resource_requests_fulfilled_document_id_fkey(id, title, subject, category, module_id, slug)';

/** PostgREST returns an embedded to-one relation as an object, but types it as a
 *  union with an array. Normalise before it reaches the components. */
const normalizeRequest = (row: Record<string, unknown>): ResourceRequest => {
  const embedded = row.fulfilled_document as FulfilledDocument | FulfilledDocument[] | null;
  return {
    ...(row as unknown as ResourceRequestRow),
    fulfilled_document: Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null,
  };
};

export const getResourceRequests = async ({
  status = 'open',
  subject,
  sort = 'wanted',
  userId,
  limit = 60,
}: ResourceRequestFilters = {}): Promise<ResourceRequest[]> => {
  let query = supabase.from('resource_requests').select(REQUEST_SELECT);

  if (status !== 'all') {
    query = query.eq('status', status);
  }
  if (subject) {
    query = query.eq('subject', subject);
  }
  if (userId) {
    query = query.eq('user_id', userId);
  }

  // Matches resource_requests_board_idx.
  if (sort === 'wanted') {
    query = query.order('upvote_count', { ascending: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    console.error('Fetch Resource Requests Error:', error);
    throw error;
  }

  return (data || []).map((row) => normalizeRequest(row as Record<string, unknown>));
};

/** The signed-in user's own votes. RLS restricts this table to own rows, so the
 *  board reads counts from resource_requests.upvote_count and only uses this to
 *  render the pressed state. */
export const getMyRequestUpvotes = async (userId?: string): Promise<string[]> => {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('resource_request_upvotes')
    .select('request_id')
    .eq('user_id', userId);

  if (error) {
    console.error('Fetch Request Upvotes Error:', error);
    return [];
  }

  return (data || []).map((row) => row.request_id);
};

export interface NewResourceRequest {
  subject: string;
  moduleId: number | null;
  category: string;
  title: string;
  details?: string;
}

export const createResourceRequest = async (
  request: NewResourceRequest
): Promise<ResourceRequestRow> => {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess?.session?.user?.id;
  if (!userId) throw new Error('You must be signed in to request a resource.');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();

  if (!profile?.full_name) {
    throw new Error('PROFILE_NAME_REQUIRED');
  }

  const { data, error } = await supabase
    .from('resource_requests')
    .insert({
      user_id: userId,
      // Denormalised, like documents.uploader_name — profiles is readable
      // own-row only, so the board cannot look this up for other students.
      requester_name: profile.full_name,
      subject: request.subject,
      module_id: request.moduleId,
      category: request.category,
      title: request.title.trim(),
      details: request.details?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    // Both come from 20260822000600_resource_requests.sql: the partial unique
    // index and the open-request cap. Their messages are user-facing.
    if (error.code === '23505') {
      throw new Error('You have already requested this. Look for it under Open requests.');
    }
    if (error.code === '23514' && error.message.includes('open requests')) {
      throw new Error(error.message);
    }
    throw error;
  }

  return data;
};

/** Toggles the caller's upvote. The count itself is maintained by a trigger. */
export const toggleRequestUpvote = async (
  requestId: string,
  userId: string,
  isAdding: boolean
) => {
  if (isAdding) {
    const { error } = await supabase
      .from('resource_request_upvotes')
      .insert({ request_id: requestId, user_id: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('resource_request_upvotes')
      .delete()
      .match({ request_id: requestId, user_id: userId });
    if (error) throw error;
  }
};

/** Withdraw a request, or put a withdrawn one back on the board. 'fulfilled' is
 *  not settable from here — only the approval trigger writes it. */
export const setResourceRequestStatus = async (requestId: string, status: 'open' | 'closed') => {
  const { error } = await supabase
    .from('resource_requests')
    .update({ status })
    .eq('id', requestId);

  if (error) throw error;
};

export const deleteResourceRequest = async (requestId: string) => {
  const { error } = await supabase.from('resource_requests').delete().eq('id', requestId);
  if (error) throw error;
};
