"use client";

import React from "react";

interface MarkdownPreviewProps {
    content: string;
    className?: string;
}

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const inlineMarkdown = (value: string) => {
    let html = escapeHtml(value);
    html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-muted/20 px-1.5 py-0.5 font-mono text-[0.9em] text-primary">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">$1</a>');
    return html;
};

export const MarkdownPreview = ({ content, className = "" }: MarkdownPreviewProps) => {
    const lines = content.split("\n");
    const blocks: React.ReactNode[] = [];
    let list: React.ReactNode[] = [];

    const flushList = (key: string) => {
        if (list.length) {
            blocks.push(<ul key={`list-${key}`} className="my-2 list-disc space-y-1 pl-5">{list}</ul>);
            list = [];
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (/^[-*] /.test(trimmed)) {
            list.push(<li key={`item-${index}`} dangerouslySetInnerHTML={{ __html: inlineMarkdown(trimmed.slice(2)) }} />);
            return;
        }
        flushList(String(index));
        if (!trimmed) return;
        if (trimmed.startsWith("> ")) {
            blocks.push(<blockquote key={`quote-${index}`} className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted" dangerouslySetInnerHTML={{ __html: inlineMarkdown(trimmed.slice(2)) }} />);
        } else if (trimmed.startsWith("# ")) {
            blocks.push(<h4 key={`heading-${index}`} className="my-2 text-base font-extrabold" dangerouslySetInnerHTML={{ __html: inlineMarkdown(trimmed.slice(2)) }} />);
        } else {
            blocks.push(<p key={`paragraph-${index}`} className="my-1 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }} />);
        }
    });
    flushList("end");

    return <div className={`leading-relaxed ${className}`}>{blocks}</div>;
};
