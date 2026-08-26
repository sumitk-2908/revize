"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Bot, Check, Clipboard, ClipboardCopy, Eye, FileJson, Sparkles, Upload, X } from "lucide-react";
import { dispatchToast as showToast } from "@/app/lib/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    type AiContentKind,
    getAiContent,
    generateAiContent,
    publishAiContent,
    saveAiContentDraft,
} from "@/app/lib/api/ai-content";
import type { DocumentAiContent } from "@/app/lib/document-types";
import { InlineSpinner } from "@/components/layout/SharedLayouts";

const KINDS: { value: AiContentKind; label: string }[] = [
    { value: "summary", label: "Summary" },
    { value: "flashcards", label: "Flashcards" },
    { value: "quiz", label: "Quiz" },
];

const queryKey = (documentId: number) => ["admin", "ai-content", documentId];

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "The AI content request failed.";
}

function jsonObject(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

export default function AiContentPanel({ documentId, title }: { documentId: number; title: string }) {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<AiContentKind>("summary");
    const [jsonText, setJsonText] = useState("");
    const [model, setModel] = useState("");
    const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
    const [busy, setBusy] = useState<"generate" | "save" | "publish" | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    const query = useQuery({
        queryKey: queryKey(documentId),
        queryFn: () => getAiContent(documentId),
        enabled: open,
        staleTime: 0,
    });

    const versions = query.data?.versions ?? [];
    const kindVersions = useMemo(
        () => versions.filter((version) => version.kind === kind).sort((a, b) => b.version - a.version),
        [versions, kind],
    );
    const selected = kindVersions.find((version) => version.version === selectedVersion) ?? kindVersions[0];
    const kindInfo = query.data?.kinds?.[kind];
    const previewPayload = jsonObject(selected?.payload);

    const updateCache = (row: DocumentAiContent) => {
        queryClient.setQueryData(queryKey(documentId), (current: typeof query.data) => {
            if (!current) return current;
            const withoutRow = current.versions.filter(
                (version) => !(version.kind === row.kind && version.version === row.version),
            );
            return { ...current, versions: [row, ...withoutRow] };
        });
        setSelectedVersion(row.version);
        setJsonText(JSON.stringify(row.payload, null, 2));
        setModel(row.model ?? "");
    };

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
            setError(null);
            setMessage(null);
        }
    };

    const handleSelectVersion = (version: DocumentAiContent) => {
        setSelectedVersion(version.version);
        setJsonText(JSON.stringify(version.payload, null, 2));
        setModel(version.model ?? "");
        setError(null);
    };

    const handleGenerate = async () => {
        setBusy("generate");
        setError(null);
        setMessage(null);
        try {
            const result = await generateAiContent(documentId, kind);
            updateCache(result.version);
            setMessage(result.message);
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setBusy(null);
        }
    };

    const handleSave = async () => {
        let payload: Record<string, unknown>;
        try {
            const parsed: unknown = JSON.parse(jsonText);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON must be an object.");
            payload = parsed as Record<string, unknown>;
        } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : "Enter valid JSON before saving.");
            return;
        }

        setBusy("save");
        setError(null);
        setMessage(null);
        try {
            const result = await saveAiContentDraft(documentId, kind, payload, model);
            updateCache(result.version);
            setMessage(result.message);
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setBusy(null);
        }
    };

    const handlePublish = async () => {
        if (!selected) return;
        setBusy("publish");
        setError(null);
        setMessage(null);
        try {
            const result = await publishAiContent(documentId, kind, selected.version);
            updateCache(result.version);
            setMessage(result.message);
            await queryClient.invalidateQueries({ queryKey: queryKey(documentId) });
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setBusy(null);
        }
    };

    const handleCopyPrompt = async () => {
        if (!kindInfo) return;
        const text = `${kindInfo.prompt}\n\n${JSON.stringify(kindInfo.schema, null, 2)}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedPrompt(true);
            showToast("Copied", "Prompt and schema copied to your clipboard.", "success");
            window.setTimeout(() => setCopiedPrompt(false), 1500);
        } catch {
            showToast("Copy Failed", "Could not copy the prompt and schema.", "error");
        }
    };

    const CopyIcon = copiedPrompt ? Check : ClipboardCopy;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="motion-hover motion-active flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20"
                title={`Curate AI content for ${title}`}
            >
                <Bot size={13} /> AI Content
            </button>
            <Dialog.Root open={open} onOpenChange={handleOpenChange}>
                <Dialog.Portal>
                    <Dialog.Overlay className="motion-modal fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                    <Dialog.Content className="motion-modal fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                            <div className="min-w-0">
                                <Dialog.Title className="flex items-center gap-2 text-lg font-bold text-foreground"><Bot size={18} className="text-primary" /> AI Content</Dialog.Title>
                                <Dialog.Description className="mt-1 truncate text-xs text-muted">{title}</Dialog.Description>
                            </div>
                            <Dialog.Close asChild><button type="button" aria-label="Close" className="text-muted hover:text-foreground"><X size={19} /></button></Dialog.Close>
                        </div>

                        <div className="grid min-h-0 gap-5 overflow-y-auto p-5 lg:grid-cols-[13rem_1fr]">
                            <aside className="space-y-3">
                                <div className="flex gap-2 overflow-x-auto lg:grid lg:overflow-visible">
                                    {KINDS.map((option) => <button key={option.value} type="button" onClick={() => { setKind(option.value); setSelectedVersion(null); setJsonText(""); setMessage(null); }} className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-bold ${kind === option.value ? "bg-primary text-primary-foreground" : "bg-surface-hover text-muted hover:text-foreground"}`}>{option.label}</button>)}
                                </div>
                                <div className="rounded-xl border border-border bg-surface-hover/50 p-3 text-xs text-muted">
                                    <p className="font-bold text-foreground">Versions</p>
                                    {kindVersions.length === 0 ? <p className="mt-2">No drafts yet.</p> : <div className="mt-2 space-y-1">{kindVersions.map((version) => <button key={version.version} type="button" onClick={() => handleSelectVersion(version)} className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${selected?.version === version.version ? "bg-primary/10 text-primary" : "hover:bg-surface-hover"}`}><span>v{version.version}</span><span className="text-[10px] uppercase">{version.status}</span></button>)}</div>}
                                </div>
                            </aside>

                            <section className="min-w-0 space-y-4">
                                {query.isLoading && <div className="flex items-center gap-2 text-sm text-muted"><InlineSpinner label="Loading AI content" /> Loading content...</div>}
                                {query.isError && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage(query.error)}</p>}
                                {query.data && !query.data.document.has_content_text && <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">No extracted text is available. Use the manual paste workflow with the source file.</p>}

                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={handleGenerate} disabled={busy !== null || !query.data?.llm_configured || !query.data?.document.has_content_text} className="motion-hover flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"><Sparkles size={14} /> {busy === "generate" ? "Generating..." : "Generate draft"}</button>
                                    <button type="button" onClick={() => { setJsonText(JSON.stringify(selected?.payload ?? {}, null, 2)); setError(null); }} disabled={!selected} className="motion-hover flex items-center gap-2 rounded-xl bg-surface-hover px-3 py-2 text-xs font-bold text-foreground hover:opacity-80 disabled:opacity-50"><Clipboard size={14} /> Load selected</button>
                                    {selected && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${selected.status === "published" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{selected.status} v{selected.version}</span>}
                                </div>

                                {kindInfo && <details className="relative rounded-xl border border-border bg-surface-hover/50 p-3"><summary className="cursor-pointer pr-8 text-xs font-bold text-foreground">Prompt and schema</summary><button type="button" onClick={handleCopyPrompt} aria-label="Copy prompt and schema" title="Copy prompt and schema" className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground"><CopyIcon size={14} /></button><pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap text-[11px] text-muted">{kindInfo.prompt}{"\n\n"}{JSON.stringify(kindInfo.schema, null, 2)}</pre></details>}
                                <label className="block text-xs font-bold text-muted">Model provenance<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="e.g. gemini-2.5-pro" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" /></label>
                                <label className="block text-xs font-bold text-muted">JSON draft<textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} placeholder="Paste the validated JSON object here..." className="mt-1 h-56 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-primary" /></label>

                                <div className="rounded-xl border border-border bg-background p-4">
                                    <div className="mb-3 flex items-center gap-2 text-xs font-bold text-muted"><Eye size={14} /> Preview</div>
                                    {selected && kind === "summary" && (
                                        <div className="space-y-3 text-sm text-foreground">
                                            <p className="whitespace-pre-wrap leading-6">{String(previewPayload.summary ?? "")}</p>
                                            <ul className="list-disc space-y-1 pl-5 text-muted">
                                                {Array.isArray(previewPayload.key_points) && previewPayload.key_points.map((point, index) => <li key={index}>{String(point)}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {selected && kind === "flashcards" && (
                                        <div className="space-y-2">
                                            {Array.isArray(previewPayload.cards) && previewPayload.cards.map((card, index) => {
                                                const item = card as { question?: unknown; answer?: unknown };
                                                return <div key={index} className="rounded-lg border border-border p-3 text-sm"><p className="font-bold text-foreground">{String(item.question ?? "")}</p><p className="mt-1 whitespace-pre-wrap text-muted">{String(item.answer ?? "")}</p></div>;
                                            })}
                                        </div>
                                    )}
                                    {selected && kind === "quiz" && (
                                        <div className="space-y-3">
                                            {Array.isArray(previewPayload.questions) && previewPayload.questions.map((question, index) => {
                                                const item = question as { question?: unknown; options?: unknown; correct_index?: unknown; explanation?: unknown };
                                                const options = Array.isArray(item.options) ? item.options : [];
                                                return <div key={index} className="rounded-lg border border-border p-3 text-sm"><p className="font-bold text-foreground">{index + 1}. {String(item.question ?? "")}</p><ol className="mt-2 list-[upper-alpha] space-y-1 pl-5 text-muted">{options.map((option, optionIndex) => <li key={optionIndex} className={optionIndex === item.correct_index ? "font-bold text-success" : ""}>{String(option)}</li>)}</ol><p className="mt-2 whitespace-pre-wrap text-xs text-muted">{String(item.explanation ?? "")}</p></div>;
                                            })}
                                        </div>
                                    )}
                                    {!selected && <p className="text-sm text-muted">Save or generate a draft to see its rendered preview.</p>}
                                </div>

                                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                                    <button type="button" onClick={handleSave} disabled={busy !== null || !jsonText.trim()} className="motion-hover flex items-center gap-2 rounded-xl bg-surface-hover px-3 py-2 text-xs font-bold text-foreground hover:opacity-80 disabled:opacity-50"><Upload size={14} /> {busy === "save" ? "Saving..." : "Save draft"}</button>
                                    <button type="button" onClick={handlePublish} disabled={busy !== null || !selected || selected.status === "published"} className="motion-hover flex items-center gap-2 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"><Eye size={14} /> {busy === "publish" ? "Publishing..." : "Publish selected"}</button>
                                </div>
                                {message && <p className="text-sm font-semibold text-success">{message}</p>}
                                {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
                            </section>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}
