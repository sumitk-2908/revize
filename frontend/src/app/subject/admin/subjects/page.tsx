"use client";

import { useEffect, useState } from "react";
import {
  getSubjects, getModulesBySubject, createSubject, updateSubject, deleteSubject,
  createModule, updateModule, deleteModule,
  getBranches, createBranch, updateBranch, deleteBranch,
  setSubjectOfferings, subjectMatchesFilter,
  Subject, Module, Branch, Offering
} from "@/app/lib/api/subjects";
import { ACADEMIC_YEARS, getYearLabel } from "@/app/lib/subject-config";
import { revalidateContentCache } from "@/app/actions/cache";
import { ArrowLeft, Plus, Pencil, Trash2, X, BookOpen, Layers, GitBranch } from "lucide-react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { useNotifications } from "@/app/context/NotificationsContext";

const offeringKey = (o: Offering) => `${o.branch_id ?? "all"}-${o.year}`;

function AdminSubjectsContent() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingModules, setLoadingModules] = useState(false);

  const { setGlobalToast } = useNotifications();
  const setToast = (t: { open: boolean, message: string, type: "success" | "error" }) => {
    setGlobalToast({ open: t.open, title: t.type === 'error' ? 'Error' : 'Success', message: t.message, type: t.type });
  };

  // Modals state
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: "", slug: "", is_non_module: false });

  // Offerings being edited for the current subject, plus the "add an offering" builder
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [offeringYear, setOfferingYear] = useState(1);
  const [offeringCommon, setOfferingCommon] = useState(true);
  const [offeringBranchIds, setOfferingBranchIds] = useState<number[]>([]);

  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [moduleForm, setModuleForm] = useState({ name: "", module_number: 1 });

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ code: "", name: "" });

  // List filters
  const [filterBranchId, setFilterBranchId] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadSubjects();
    loadBranches();
  }, []);

  const loadSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const data = await getSubjects();
      setSubjects(data);
    } catch {
      setToast({ open: true, message: "Failed to load subjects", type: "error" });
    } finally {
      setLoadingSubjects(false);
    }
  };

  const loadBranches = async () => {
    try {
      const data = await getBranches();
      setBranches(data);
    } catch {
      setToast({ open: true, message: "Failed to load branches", type: "error" });
    }
  };

  const branchLabel = (branchId: number | null) =>
    branchId === null ? "All branches" : branches.find(b => b.id === branchId)?.code || "Unknown";

  const handleSelectSubject = async (subject: Subject) => {
    setSelectedSubject(subject);
    setLoadingModules(true);
    try {
      const data = await getModulesBySubject(subject.id);
      setModules(data);
    } catch {
      setToast({ open: true, message: "Failed to load modules", type: "error" });
    } finally {
      setLoadingModules(false);
    }
  };

  // Subject Actions
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const saved = editingSubject
        ? await updateSubject(editingSubject.id, subjectForm)
        : await createSubject(subjectForm);

      await setSubjectOfferings(saved.id, offerings);
      const withOfferings: Subject = { ...saved, subject_offerings: offerings };

      if (editingSubject) {
        setSubjects(prev => prev.map(s => s.id === withOfferings.id ? withOfferings : s));
        if (selectedSubject?.id === withOfferings.id) setSelectedSubject(withOfferings);
        setToast({ open: true, message: "Subject updated successfully", type: "success" });
      } else {
        setSubjects(prev => [...prev, withOfferings].sort((a, b) => a.name.localeCompare(b.name)));
        setToast({ open: true, message: "Subject created successfully", type: "success" });
      }
      await revalidateContentCache();
      setIsSubjectModalOpen(false);
    } catch (e: any) {
      setToast({ open: true, message: e.message || "Failed to save subject", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSubject = async (subject: Subject) => {
    if (!confirm(`Are you sure you want to delete ${subject.name}?`)) return;
    setIsProcessing(true);
    try {
      await deleteSubject(subject.id, subject.name);
      setSubjects(prev => prev.filter(s => s.id !== subject.id));
      if (selectedSubject?.id === subject.id) {
        setSelectedSubject(null);
        setModules([]);
      }
      await revalidateContentCache();
      setToast({ open: true, message: "Subject deleted successfully", type: "success" });
    } catch (e: any) {
      setToast({ open: true, message: e.message || "Failed to delete subject", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetOfferingBuilder = (year: number) => {
    setOfferingYear(year);
    setOfferingCommon(year === 1);
    setOfferingBranchIds([]);
  };

  const openAddSubject = () => {
    setEditingSubject(null);
    setSubjectForm({ name: "", slug: "", is_non_module: false });
    setOfferings([]);
    resetOfferingBuilder(1);
    setIsSubjectModalOpen(true);
  };

  const openEditSubject = (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubject(subject);
    setSubjectForm({ name: subject.name, slug: subject.slug, is_non_module: subject.is_non_module });
    setOfferings(subject.subject_offerings || []);
    resetOfferingBuilder(1);
    setIsSubjectModalOpen(true);
  };

  // Offering builder actions
  const handleAddOfferings = () => {
    const additions: Offering[] = offeringCommon
      ? [{ branch_id: null, year: offeringYear }]
      : offeringBranchIds.map(branch_id => ({ branch_id, year: offeringYear }));

    if (additions.length === 0) {
      setToast({ open: true, message: "Select at least one branch, or mark it common to all branches.", type: "error" });
      return;
    }

    setOfferings(prev => {
      const existing = new Set(prev.map(offeringKey));
      const fresh = additions.filter(o => !existing.has(offeringKey(o)));
      return [...prev, ...fresh];
    });
    setOfferingBranchIds([]);
  };

  const handleRemoveOffering = (offering: Offering) => {
    setOfferings(prev => prev.filter(o => offeringKey(o) !== offeringKey(offering)));
  };

  const toggleOfferingBranch = (branchId: number) => {
    setOfferingBranchIds(prev =>
      prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId]
    );
  };

  // Branch Actions
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const payload = { code: branchForm.code.trim().toUpperCase(), name: branchForm.name.trim() };
      if (editingBranch) {
        const updated = await updateBranch(editingBranch.id, payload);
        setBranches(prev => prev.map(b => b.id === updated.id ? updated : b).sort((a, b) => a.code.localeCompare(b.code)));
        setToast({ open: true, message: "Branch updated successfully", type: "success" });
      } else {
        const created = await createBranch(payload);
        setBranches(prev => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
        setToast({ open: true, message: "Branch created successfully", type: "success" });
      }
      await revalidateContentCache();
      setIsBranchModalOpen(false);
    } catch (e: any) {
      setToast({ open: true, message: e.message || "Failed to save branch", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (!confirm(`Are you sure you want to delete ${branch.code}?`)) return;
    setIsProcessing(true);
    try {
      await deleteBranch(branch.id);
      setBranches(prev => prev.filter(b => b.id !== branch.id));
      if (filterBranchId === branch.id) setFilterBranchId(null);
      await revalidateContentCache();
      setToast({ open: true, message: "Branch deleted successfully", type: "success" });
    } catch (e: any) {
      setToast({ open: true, message: e.message || "Failed to delete branch", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  const openAddBranch = () => {
    setEditingBranch(null);
    setBranchForm({ code: "", name: "" });
    setIsBranchModalOpen(true);
  };

  const openEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchForm({ code: branch.code, name: branch.name });
    setIsBranchModalOpen(true);
  };

  // Module Actions
  const handleSaveModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;
    setIsProcessing(true);
    try {
      if (editingModule) {
        const updated = await updateModule(editingModule.id, { ...moduleForm });
        setModules(prev => prev.map(m => m.id === updated.id ? updated : m).sort((a, b) => a.module_number - b.module_number));
        setToast({ open: true, message: "Module updated successfully", type: "success" });
      } else {
        const created = await createModule({ ...moduleForm, subject_id: selectedSubject.id });
        setModules(prev => [...prev, created].sort((a, b) => a.module_number - b.module_number));
        setToast({ open: true, message: "Module created successfully", type: "success" });
      }
      await revalidateContentCache();
      setIsModuleModalOpen(false);
    } catch (e: any) {
      setToast({ open: true, message: e.message || "Failed to save module", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteModule = async (module: Module) => {
    if (!selectedSubject) return;
    if (!confirm(`Are you sure you want to delete Module ${module.module_number}?`)) return;
    setIsProcessing(true);
    try {
      await deleteModule(module.id, selectedSubject.name, module.module_number);
      setModules(prev => prev.filter(m => m.id !== module.id));
      await revalidateContentCache();
      setToast({ open: true, message: "Module deleted successfully", type: "success" });
    } catch (e: any) {
      setToast({ open: true, message: e.message || "Failed to delete module", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  const openAddModule = () => {
    setEditingModule(null);
    const nextNum = modules.length > 0 ? Math.max(...modules.map(m => m.module_number)) + 1 : 1;
    setModuleForm({ name: "", module_number: nextNum });
    setIsModuleModalOpen(true);
  };

  const openEditModule = (module: Module) => {
    setEditingModule(module);
    setModuleForm({ name: module.name || "", module_number: module.module_number });
    setIsModuleModalOpen(true);
  };

  const visibleSubjects = subjects.filter(s => subjectMatchesFilter(s, filterBranchId, filterYear));
  const sortedOfferings = [...offerings].sort((a, b) => a.year - b.year || (a.branch_id ?? -1) - (b.branch_id ?? -1));

  return (
    <main className="animate-fade-up mx-auto w-full max-w-6xl space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <Link href="/subject/admin/inbox" className="motion-hover inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-primary">
          <ArrowLeft size={14} /> Back to Inbox
        </Link>
        <Link href="/portal-admin/analytics" className="motion-hover inline-flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20">
          View Analytics
        </Link>
      </div>

      <section className="premium-transition flex items-center gap-4 rounded-3xl border border-primary/20 bg-primary/5 p-6">
        <div className="premium-transition flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BookOpen size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Content Management</h1>
          <p className="mt-0.5 text-xs font-semibold tracking-wider text-primary">
            Manage branches, subjects, and their respective modules.
          </p>
        </div>
      </section>

      {/* Branches */}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">Branches</h2>
          </div>
          <button onClick={openAddBranch} className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground hover:opacity-90">
            <Plus size={16} /> Add Branch
          </button>
        </div>

        {branches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No branches yet. Add one to start assigning subjects.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map(branch => (
              <div key={branch.id} className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground">{branch.code}</h3>
                  <p className="truncate text-xs text-muted">{branch.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => openEditBranch(branch)} className="motion-hover p-2 text-muted hover:text-primary" title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDeleteBranch(branch)} className="motion-hover p-2 text-muted hover:text-destructive" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          First-year subjects are shared by every branch — mark them &ldquo;Common to all branches&rdquo; when adding a subject.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Subjects List */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-4">
            <h2 className="text-lg font-bold text-foreground">Subjects</h2>
            <button onClick={openAddSubject} className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground hover:opacity-90">
              <Plus size={16} /> Add
            </button>
          </div>

          <div className="mb-4 flex gap-2">
            <select
              aria-label="Filter subjects by branch"
              value={filterBranchId ?? ""}
              onChange={(e) => setFilterBranchId(e.target.value ? Number(e.target.value) : null)}
              className="motion-focus h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
            >
              <option value="">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
            </select>
            <select
              aria-label="Filter subjects by year"
              value={filterYear ?? ""}
              onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : null)}
              className="motion-focus h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
            >
              <option value="">All years</option>
              {ACADEMIC_YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px] space-y-3">
            {loadingSubjects ? (
              <div className="flex justify-center p-8"><InlineSpinner label="Loading subjects..." /></div>
            ) : visibleSubjects.length === 0 ? (
              <p className="text-center text-sm text-muted py-8">
                {subjects.length === 0 ? "No subjects found." : "No subjects match this branch and year."}
              </p>
            ) : (
              visibleSubjects.map(subject => (
                <div
                  key={subject.id}
                  onClick={() => handleSelectSubject(subject)}
                  className={`flex items-start justify-between p-3 rounded-xl border cursor-pointer premium-transition ${selectedSubject?.id === subject.id ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-surface-hover'}`}
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground">{subject.name}</h3>
                    <p className="text-xs text-muted">/{subject.slug}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(subject.subject_offerings || []).length === 0 ? (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-bold text-warning">Not offered yet</span>
                      ) : (
                        [...subject.subject_offerings]
                          .sort((a, b) => a.year - b.year || (a.branch_id ?? -1) - (b.branch_id ?? -1))
                          .map(o => (
                            <span key={offeringKey(o)} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                              {branchLabel(o.branch_id)} · {getYearLabel(o.year)}
                            </span>
                          ))
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={(e) => openEditSubject(subject, e)} className="p-2 text-muted hover:text-primary motion-hover" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSubject(subject); }} className="p-2 text-muted hover:text-destructive motion-hover" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modules List */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-4">
            <h2 className="text-lg font-bold text-foreground">
              {selectedSubject ? `Modules for ${selectedSubject.name}` : "Select a Subject"}
            </h2>
            {selectedSubject && (
              <button onClick={openAddModule} className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground hover:opacity-90">
                <Plus size={16} /> Add Module
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px] space-y-3">
            {!selectedSubject ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted">
                <Layers size={48} className="mb-4 opacity-20" />
                <p>Select a subject from the list to view and manage its modules.</p>
              </div>
            ) : loadingModules ? (
              <div className="flex justify-center p-8"><InlineSpinner label="Loading modules..." /></div>
            ) : modules.length === 0 ? (
              <p className="text-center text-sm text-muted py-8">No modules exist for this subject.</p>
            ) : (
              modules.map(module => (
                <div key={module.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-background">
                  <div>
                    <h3 className="font-bold text-foreground">Module {module.module_number}</h3>
                    {module.name && <p className="text-xs text-muted">{module.name}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditModule(module)} className="p-2 text-muted hover:text-primary motion-hover" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDeleteModule(module)} className="p-2 text-muted hover:text-destructive motion-hover" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* --- MODAL: ADD/EDIT SUBJECT --- */}
      <Dialog.Root open={isSubjectModalOpen} onOpenChange={setIsSubjectModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="motion-modal fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="motion-modal fixed top-[50%] left-[50%] z-50 grid max-h-[90vh] w-full max-w-md translate-[-50%] gap-4 overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-xl font-bold text-foreground">
                {editingSubject ? "Edit Subject" : "Add Subject"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="motion-hover text-muted hover:text-foreground"><X size={20} /></button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleSaveSubject} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-foreground">Subject Name</label>
                <input
                  required
                  type="text"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value, slug: editingSubject ? subjectForm.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') })}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="e.g. Mathematics 1"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-foreground">URL Slug</label>
                <input
                  required
                  type="text"
                  value={subjectForm.slug}
                  onChange={(e) => setSubjectForm({ ...subjectForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') })}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="e.g. mathematics-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_non_module"
                  checked={subjectForm.is_non_module}
                  onChange={(e) => setSubjectForm({ ...subjectForm, is_non_module: e.target.checked })}
                  className="size-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="is_non_module" className="text-sm font-semibold text-foreground">Non-Module Subject (e.g. Previous Year Papers only)</label>
              </div>

              {/* Offerings */}
              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-bold text-foreground">Offered in</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Pick a year, then the branches that study this subject. First year defaults to all branches.
                </p>

                {sortedOfferings.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sortedOfferings.map(o => (
                      <span key={offeringKey(o)} className="flex items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-3 text-xs font-bold text-primary">
                        {branchLabel(o.branch_id)} · {getYearLabel(o.year)}
                        <button type="button" onClick={() => handleRemoveOffering(o)} className="motion-hover rounded-full p-1 text-primary hover:bg-primary/20" aria-label={`Remove ${branchLabel(o.branch_id)} ${getYearLabel(o.year)}`}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 space-y-3 border-t border-border pt-3">
                  <div>
                    <label htmlFor="offering-year" className="mb-1 block text-xs font-bold tracking-[0.06em] text-muted uppercase">Year</label>
                    <select
                      id="offering-year"
                      value={offeringYear}
                      onChange={(e) => resetOfferingBuilder(Number(e.target.value))}
                      className="motion-focus h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
                    >
                      {ACADEMIC_YEARS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="offering-common"
                      checked={offeringCommon}
                      onChange={(e) => { setOfferingCommon(e.target.checked); if (e.target.checked) setOfferingBranchIds([]); }}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="offering-common" className="text-sm font-semibold text-foreground">Common to all branches</label>
                  </div>

                  {!offeringCommon && (
                    branches.length === 0 ? (
                      <p className="text-xs font-semibold text-warning">Add a branch first to make this subject branch-specific.</p>
                    ) : (
                      <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto custom-scrollbar">
                        {branches.map(b => (
                          <label key={b.id} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <input
                              type="checkbox"
                              checked={offeringBranchIds.includes(b.id)}
                              onChange={() => toggleOfferingBranch(b.id)}
                              className="size-4 rounded border-border text-primary focus:ring-primary"
                            />
                            {b.code}
                          </label>
                        ))}
                      </div>
                    )
                  )}

                  <button
                    type="button"
                    onClick={handleAddOfferings}
                    className="motion-hover motion-active flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-2 text-sm font-bold text-primary hover:bg-primary/20"
                  >
                    <Plus size={16} /> Add to {getYearLabel(offeringYear)}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
                <Dialog.Close asChild><button type="button" className="motion-hover rounded-xl bg-surface-hover px-4 py-2 text-sm font-bold">Cancel</button></Dialog.Close>
                <button type="submit" disabled={isProcessing} className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {isProcessing ? <InlineSpinner label="Saving" size={16} /> : "Save Subject"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* --- MODAL: ADD/EDIT BRANCH --- */}
      <Dialog.Root open={isBranchModalOpen} onOpenChange={setIsBranchModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="motion-modal fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="motion-modal fixed top-[50%] left-[50%] z-50 grid w-full max-w-md translate-[-50%] gap-4 rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-xl font-bold text-foreground">
                {editingBranch ? "Edit Branch" : "Add Branch"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="motion-hover text-muted hover:text-foreground"><X size={20} /></button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleSaveBranch} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-foreground">Branch Code</label>
                <input
                  required
                  type="text"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="e.g. CSE"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-foreground">Branch Name</label>
                <input
                  required
                  type="text"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="e.g. Computer Science & Engineering"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
                <Dialog.Close asChild><button type="button" className="motion-hover rounded-xl bg-surface-hover px-4 py-2 text-sm font-bold">Cancel</button></Dialog.Close>
                <button type="submit" disabled={isProcessing} className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {isProcessing ? <InlineSpinner label="Saving" size={16} /> : "Save Branch"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* --- MODAL: ADD/EDIT MODULE --- */}
      <Dialog.Root open={isModuleModalOpen} onOpenChange={setIsModuleModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="motion-modal fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="motion-modal fixed top-[50%] left-[50%] z-50 grid w-full max-w-md translate-[-50%] gap-4 rounded-2xl bg-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-xl font-bold text-foreground">
                {editingModule ? "Edit Module" : "Add Module"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="motion-hover text-muted hover:text-foreground"><X size={20} /></button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleSaveModule} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-foreground">Module Number</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={moduleForm.module_number}
                  onChange={(e) => setModuleForm({ ...moduleForm, module_number: parseInt(e.target.value) || 1 })}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-foreground">Module Name (Optional)</label>
                <input
                  type="text"
                  value={moduleForm.name}
                  onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="e.g. Integration"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border">
                <Dialog.Close asChild><button type="button" className="motion-hover rounded-xl bg-surface-hover px-4 py-2 text-sm font-bold">Cancel</button></Dialog.Close>
                <button type="submit" disabled={isProcessing} className="motion-hover motion-active flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {isProcessing ? <InlineSpinner label="Saving" size={16} /> : "Save Module"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </main>
  );
}

export default function AdminSubjectsRoute() {
  return (
    <ErrorBoundary
      title="Content management could not load"
      message="The subjects and modules dashboard ran into a problem."
    >
      <AdminSubjectsContent />
    </ErrorBoundary>
  );
}
