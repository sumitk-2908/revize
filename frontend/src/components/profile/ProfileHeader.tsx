"use client";

import { useState, useEffect, useRef } from "react";
import { Edit, GraduationCap, BookOpen, X, Flame, Search } from "lucide-react";
import { getProfilePreferences, updateProfilePreferences } from "@/app/lib/api/profile";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import { useSubjects, useBranches } from "@/app/hooks/useSubjects";
import { ACADEMIC_YEARS, getYearLabel } from "@/app/lib/subject-config";
import { useRouter, useSearchParams } from "next/navigation";
import { dispatchToast } from "@/app/lib/toast";

export default function ProfileHeader({ user, streak }: { user: any, streak?: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { data: subjects = [] } = useSubjects();
  const { data: branches = [] } = useBranches();

  const email = user?.email || "No email provided";
  const avatarUrl = user?.user_metadata?.avatar_url;

  // Preference States
  const [fullName, setFullName] = useState("");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [favoriteSubjects, setFavoriteSubjects] = useState<string[]>([]);
  const [subjectQuery, setSubjectQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Refs for Focus Management
  const modalRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const getInitials = (fName: string) => fName === "Student" ? "ST" : (fName.substring(0, 2).toUpperCase() || "ST");
  const currentStreak = streak?.current_streak || 0;

  useEffect(() => {
    if (searchParams?.get("edit") === "true") {
      setIsEditModalOpen(true);
      router.replace("/profile");
    }
  }, [searchParams, router]);

  // Fetch existing preferences
  useEffect(() => {
    if (user?.id) {
      getProfilePreferences(user.id).then(data => {
        if (data) {
          setBranchId(data.branch_id ?? null);
          setYear(data.year_of_study ?? null);
          setFavoriteSubjects(data.favorite_subjects || []);
          setFullName(data.full_name || "Student");
        } else {
          setFullName("Student");
        }
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (isEditModalOpen && user?.id) {
      getProfilePreferences(user.id).then(data => {
        if (data) {
          setBranchId(data.branch_id ?? null);
          setYear(data.year_of_study ?? null);
          setFavoriteSubjects(data.favorite_subjects || []);
          if (data.full_name) setFullName(data.full_name);
        }
      });
    }
  }, [isEditModalOpen, user?.id]);

  // Focus Trap and Accessibility Keyboard Listeners
  useEffect(() => {
    if (!isEditModalOpen) {
      editButtonRef.current?.focus();
      return;
    }

    const modalElement = modalRef.current;
    if (!modalElement) return;

    const focusableElements = modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditModalOpen(false);
        return;
      }

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement?.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement?.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditModalOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !fullName.trim()) return;
    if ((branchId && !year) || (!branchId && year)) {
      setErrorMsg("If you provide a branch, you must also provide your year, and vice versa.");
      return;
    }
    setErrorMsg("");
    setIsSaving(true);
    try {
      const branchCode = branches.find(b => b.id === branchId)?.code || null;
      const updates = {
        full_name: fullName.trim(),
        branch_id: branchId,
        year_of_study: year,
        // Legacy text columns kept in sync for the sidebar label and recommendations.
        preferred_branch: branchCode,
        academic_year: year ? getYearLabel(year) : null,
        favorite_subjects: favoriteSubjects
      };
      await updateProfilePreferences(user.id, updates);

      // Dispatch event to update layout context
      window.dispatchEvent(new CustomEvent("portal_profile_update", { detail: updates }));

      setIsEditModalOpen(false);
    } catch (error) {
      dispatchToast("Error", "Failed to save preferences.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {(!fullName || fullName === "Student") && (
        <div className="animate-fade-up mb-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row">
          <p className="text-center text-sm font-semibold text-foreground sm:text-left">
            Complete your profile to unlock personalized recommendations and community recognition.
          </p>
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="motion-hover motion-active shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            Complete Profile
          </button>
        </div>
      )}
      <div className="mb-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
          {avatarUrl ? (
            <img src={avatarUrl} alt={fullName || "Student"} className="size-20 shrink-0 rounded-full object-cover shadow-sm sm:size-14" />
          ) : (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-sm sm:size-14">
              {getInitials(fullName || "Student")}
            </div>
          )}

          <div className="flex w-full min-w-0 flex-1 flex-col items-center sm:items-start">
            <div className="mb-1 flex flex-col items-center gap-2 sm:mb-0.5 sm:flex-row sm:gap-3">
              <h1 className="text-xl font-extrabold tracking-tight text-foreground">{fullName || "Student"}</h1>
              {currentStreak > 0 && (
                <div className="flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-bold text-orange-500 tabular-nums">
                  <Flame size={12} fill="currentColor" aria-hidden="true" />
                  {currentStreak} Day{currentStreak !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            <p className="mb-3 text-sm font-medium text-muted">{email}</p>
            <div className="flex flex-wrap justify-center gap-3 text-sm font-medium text-muted sm:justify-start sm:gap-4">
              <span className="flex items-center gap-1.5"><GraduationCap size={14} aria-hidden="true" /> {[branches.find(b => b.id === branchId)?.code, getYearLabel(year)].filter(Boolean).join(" · ") || "Revize"}</span>
              <span className="flex items-center gap-1.5"><BookOpen size={14} aria-hidden="true" /> Student Account</span>
            </div>
          </div>
          <button
            ref={editButtonRef}
            onClick={() => setIsEditModalOpen(true)}
            className="motion-hover motion-active mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-muted hover:bg-surface-hover sm:mt-0 sm:w-auto"
          >
            <Edit size={14} aria-hidden="true" /> Edit Profile
          </button>
        </div>
      </div>

      {isEditModalOpen && (
        <div className="motion-modal-static fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="motion-modal-static w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 id="edit-profile-title" className="text-xl font-bold tracking-tight text-foreground">Personalize Profile</h2>
              <button
                aria-label="Close modal"
                onClick={() => setIsEditModalOpen(false)}
                className="motion-hover text-muted hover:text-foreground"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="mb-6 space-y-4">
                <div>
                  <label htmlFor="nameInput" className="mb-2 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Display Name</label>
                  <input
                    id="nameInput"
                    required
                    type="text"
                    placeholder="e.g. John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="motion-focus w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:bg-surface"
                  />
                </div>
                {errorMsg && <p className="text-sm font-semibold text-destructive">{errorMsg}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="branchInput" className="mb-2 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Branch</label>
                    <select
                      id="branchInput"
                      value={branchId ?? ""}
                      onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
                      className="motion-focus w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:bg-surface"
                    >
                      <option value="">Select Branch</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="yearInput" className="mb-2 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Year</label>
                    <select
                      id="yearInput"
                      value={year ?? ""}
                      onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
                      className="motion-focus w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                    >
                      <option value="">Select Year</option>
                      {ACADEMIC_YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Favorite Subjects (Max 5)</label>
                  <div className="relative">
                    <div className="motion-focus flex items-center gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-primary focus-within:bg-surface">
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
                    <div className="mt-3 flex flex-wrap gap-2">
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
                  <p className="mt-1.5 text-xs text-muted">We will use this to recommend resources in the future.</p>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="motion-hover motion-active rounded-xl bg-surface-hover px-4 py-2 text-sm font-bold text-muted">Cancel</button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <InlineSpinner label="Saving preferences" size={16} />
                      <span aria-live="polite">Saving preferences...</span>
                    </>
                  ) : (
                    "Save Preferences"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
