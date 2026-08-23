import { api } from "./core";
import type { DocumentAiContent } from "../document-types";

export type AiContentKind = "summary" | "flashcards" | "quiz";

export type AiContentDocument = {
    id: number;
    title: string;
    status: string | null;
    has_content_text: boolean;
};

export type AiContentKindInfo = {
    prompt: string;
    schema: Record<string, unknown>;
};

export type AiContentResponse = {
    document: AiContentDocument;
    llm_configured: boolean;
    versions: DocumentAiContent[];
    kinds: Record<AiContentKind, AiContentKindInfo>;
};

export type AiContentMutationResponse = {
    message: string;
    version: DocumentAiContent;
};

function rethrow(error: unknown, fallback: string): never {
    const err = error as { response?: { data?: { detail?: string } } };
    console.error("FastAPI AI content error:", err.response?.data || error);
    throw new Error(err.response?.data?.detail || fallback);
}

export const getAiContent = async (documentId: number): Promise<AiContentResponse> => {
    try {
        const response = await api.get(`/api/v1/documents/${documentId}/ai-content`);
        return response.data;
    } catch (error: unknown) {
        return rethrow(error, "Failed to load AI content.");
    }
};

export const generateAiContent = async (
    documentId: number,
    kind: AiContentKind,
): Promise<AiContentMutationResponse> => {
    try {
        const response = await api.post(`/api/v1/documents/${documentId}/ai-content/generate`, { kind });
        return response.data;
    } catch (error: unknown) {
        return rethrow(error, "Failed to generate AI content.");
    }
};

export const saveAiContentDraft = async (
    documentId: number,
    kind: AiContentKind,
    payload: Record<string, unknown>,
    model?: string,
): Promise<AiContentMutationResponse> => {
    try {
        const response = await api.put(`/api/v1/documents/${documentId}/ai-content`, {
            kind,
            payload,
            ...(model?.trim() ? { model: model.trim() } : {}),
        });
        return response.data;
    } catch (error: unknown) {
        return rethrow(error, "Failed to save AI content draft.");
    }
};

export const publishAiContent = async (
    documentId: number,
    kind: AiContentKind,
    version: number,
): Promise<AiContentMutationResponse> => {
    try {
        const response = await api.post(`/api/v1/documents/${documentId}/ai-content/publish`, { kind, version });
        return response.data;
    } catch (error: unknown) {
        return rethrow(error, "Failed to publish AI content.");
    }
};

export const deleteAiContentDraft = async (
    documentId: number,
    kind: AiContentKind,
    version: number,
) => {
    try {
        const response = await api.delete(`/api/v1/documents/${documentId}/ai-content/${version}`, { params: { kind } });
        return response.data;
    } catch (error: unknown) {
        return rethrow(error, "Failed to delete AI content draft.");
    }
};
