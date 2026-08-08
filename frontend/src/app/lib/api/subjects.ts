import { supabase } from './core';

export interface Offering {
  branch_id: number | null;
  year: number;
}

export interface Subject {
  id: number;
  name: string;
  slug: string;
  is_non_module: boolean;
  subject_offerings: Offering[];
}

export interface Branch {
  id: number;
  code: string;
  name: string;
}

export interface Module {
  id: number;
  subject_id: number;
  module_number: number;
  name: string;
}

export const SUBJECT_SELECT = '*, subject_offerings(branch_id, year)';

/** A subject is visible to (branch, year) when it has an offering for that year
 *  that is either branch-specific or common to all branches. */
export const subjectMatchesFilter = (subject: Subject, branchId: number | null, year: number | null) => {
  const offerings = subject.subject_offerings || [];
  if (branchId === null && year === null) return true;

  return offerings.some(o => {
    const yearMatches = year === null || o.year === year;
    const branchMatches = branchId === null || o.branch_id === branchId || o.branch_id === null;
    return yearMatches && branchMatches;
  });
};

export const getSubjects = async () => {
  const { data, error } = await supabase.from('subjects').select(SUBJECT_SELECT).order('name');
  if (error) throw error;
  return data as Subject[];
};

export const getModulesBySubject = async (subjectId: number) => {
  const { data, error } = await supabase.from('modules').select('*').eq('subject_id', subjectId).order('module_number');
  if (error) throw error;
  return data as Module[];
};

export const createSubject = async (subject: Omit<Subject, 'id' | 'subject_offerings'>) => {
  const { data, error } = await supabase.from('subjects').insert([subject]).select(SUBJECT_SELECT).single();
  if (error) throw error;
  return data as Subject;
};

export const updateSubject = async (id: number, updates: Partial<Omit<Subject, 'subject_offerings'>>) => {
  const { data, error } = await supabase.from('subjects').update(updates).eq('id', id).select(SUBJECT_SELECT).single();
  if (error) throw error;
  return data as Subject;
};

export const deleteSubject = async (id: number, name: string) => {
  const { count, error: countError } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('subject', name);
  if (countError) throw countError;
  if (count && count > 0) throw new Error("Cannot delete subject: there are documents associated with it.");

  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) throw error;
};

/** Replaces the whole offering set for a subject. */
export const setSubjectOfferings = async (subjectId: number, offerings: Offering[]) => {
  const { error: deleteError } = await supabase.from('subject_offerings').delete().eq('subject_id', subjectId);
  if (deleteError) throw deleteError;

  if (offerings.length === 0) return;

  const { error } = await supabase
    .from('subject_offerings')
    .insert(offerings.map(o => ({ subject_id: subjectId, branch_id: o.branch_id, year: o.year })));
  if (error) throw error;
};

export const getBranches = async () => {
  const { data, error } = await supabase.from('branches').select('*').order('code');
  if (error) throw error;
  return data as Branch[];
};

export const createBranch = async (branch: Omit<Branch, 'id'>) => {
  const { data, error } = await supabase.from('branches').insert([branch]).select().single();
  if (error) throw error;
  return data as Branch;
};

export const updateBranch = async (id: number, updates: Partial<Branch>) => {
  const { data, error } = await supabase.from('branches').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as Branch;
};

export const deleteBranch = async (id: number) => {
  const { count, error: countError } = await supabase.from('subject_offerings').select('*', { count: 'exact', head: true }).eq('branch_id', id);
  if (countError) throw countError;
  if (count && count > 0) throw new Error("Cannot delete branch: there are subjects offered to it.");

  // Students on this branch are not counted here — RLS hides other users' profiles.
  // The profiles.branch_id FK is ON DELETE SET NULL, so they simply re-pick a branch.
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) throw error;
};

export const createModule = async (module: Omit<Module, 'id'>) => {
  const { data, error } = await supabase.from('modules').insert([module]).select().single();
  if (error) throw error;
  return data as Module;
};

export const updateModule = async (id: number, updates: Partial<Module>) => {
  const { data, error } = await supabase.from('modules').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as Module;
};

export const deleteModule = async (id: number, subjectName: string, moduleId: number) => {
  const { count, error: countError } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('subject', subjectName).eq('module_id', moduleId);
  if (countError) throw countError;
  if (count && count > 0) throw new Error("Cannot delete module: there are documents associated with it.");

  const { error } = await supabase.from('modules').delete().eq('id', id);
  if (error) throw error;
};
