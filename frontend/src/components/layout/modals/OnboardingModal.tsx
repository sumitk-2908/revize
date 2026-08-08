"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Search } from "lucide-react";
import { useSubjects, useBranches } from "@/app/hooks/useSubjects";
import { ACADEMIC_YEARS, getYearLabel } from "@/app/lib/subject-config";
import { useAuth } from "@/app/context/AuthContext";
import { supabase } from "@/app/lib/api/core";

export const OnboardingModal = () => {
  const { currentUserEmail, showOnboardingModal, setShowOnboardingModal, updateUserProfile } = useAuth();
  const { data: subjects = [] } = useSubjects();
  const { data: branches = [] } = useBranches();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [favoriteSubjects, setFavoriteSubjects] = useState<string[]>([]);
  const [subjectQuery, setSubjectQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSkip = () => {
    sessionStorage.setItem(`skipped_onboarding_${currentUserEmail}`, "true");
    setShowOnboardingModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Display name is required.");
      return;
    }
    if ((branchId && !year) || (!branchId && year)) {
      setErrorMsg("If you provide a branch, you must also provide your year, and vice versa.");
      return;
    }
    setErrorMsg("");
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session?.user) {
        const branchCode = branches.find(b => b.id === branchId)?.code || null;
        const updates = {
          full_name: name.trim(),
          branch_id: branchId,
          year_of_study: year,
          // Legacy text columns kept in sync for the sidebar label and recommendations.
          preferred_branch: branchCode,
          academic_year: year ? getYearLabel(year) : null,
          favorite_subjects: favoriteSubjects,
        };
        const { error } = await supabase.from('profiles').upsert({
          id: sess.session.user.id,
          ...updates,
        });
        if (error) throw error;
        updateUserProfile(updates);
        setShowOnboardingModal(false);
      }
    } catch (err: any) {
      setErrorMsg("Error saving profile: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={showOnboardingModal} onOpenChange={(open) => {
      if (!open && !sessionStorage.getItem(`skipped_onboarding_${currentUserEmail}`)) return;
      setShowOnboardingModal(open);
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="motion-modal data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[50%] left-[50%] z-[100] w-full max-w-md translate-[-50%] rounded-3xl border border-border bg-surface p-6 shadow-2xl">
          <div className="mb-6">
            <Dialog.Title className="text-xl font-extrabold text-foreground">Welcome!</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 font-medium text-muted">
              Let&apos;s set up your profile so you can get the most out of the portal.
            </Dialog.Description>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && <p className="text-sm font-semibold text-destructive">{errorMsg}</p>}
            <div>
              <label className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Display Name *</label>
              <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Doe" className="motion-focus h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-primary" />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="onboarding-branch" className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Branch</label>
                <select
                  id="onboarding-branch"
                  value={branchId ?? ""}
                  onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
                  className="motion-focus h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Select Branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="onboarding-year" className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Year</label>
                <select
                  id="onboarding-year"
                  value={year ?? ""}
                  onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
                  className="motion-focus h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Select Year</option>
                  {ACADEMIC_YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                </select>
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted">We use these to show the subjects for your branch and year first.</p>

            <div>
              <label className="mb-2 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Favorite Subjects (Max 5)</label>
              <div className="relative">
                <div className="motion-focus-within flex items-center gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-primary focus-within:bg-surface">
                  <Search size={16} className="ml-1 text-muted" />
                  <input 
                    type="text" 
                    placeholder={favoriteSubjects.length < 5 ? "Search subjects..." : "Maximum subjects reached"}
                    value={subjectQuery}
                    onChange={(e) => setSubjectQuery(e.target.value)}
                    disabled={favoriteSubjects.length >= 5}
                    className="w-full bg-transparent text-sm text-foreground outline-none disabled:opacity-50"
                  />
                </div>
                {subjectQuery.trim() && favoriteSubjects.length < 5 && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
                    {subjects.map(s => s.name).filter(s => s.toLowerCase().includes(subjectQuery.toLowerCase()) && !favoriteSubjects.includes(s)).map(subject => (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => {
                          setFavoriteSubjects([...favoriteSubjects, subject]);
                          setSubjectQuery("");
                        }}
                        className="motion-hover w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-primary/10 hover:text-primary"
                      >
                        {subject}
                      </button>
                    ))}
                    {subjects.map(s => s.name).filter(s => s.toLowerCase().includes(subjectQuery.toLowerCase()) && !favoriteSubjects.includes(s)).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted">No subjects found.</div>
                    )}
                  </div>
                )}
              </div>
              {favoriteSubjects.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {favoriteSubjects.map(subject => (
                     <span key={subject} className="flex items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-3 text-xs font-bold text-primary">
                      {subject}
                      <button type="button" onClick={() => setFavoriteSubjects(favoriteSubjects.filter(s => s !== subject))} className="motion-hover rounded-full p-1 text-primary hover:bg-primary/20">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2">
              <button type="submit" disabled={loading} className="motion-hover motion-active h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:opacity-90">
                {loading ? "Saving..." : "Save & Continue"}
              </button>
              <button type="button" onClick={handleSkip} disabled={loading} className="mt-2 w-full text-xs font-bold text-muted hover:text-foreground">
                Skip for now
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
