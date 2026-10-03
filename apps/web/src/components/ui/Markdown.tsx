import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => {
    const parsed = marked.parse(content, { async: false, gfm: true, breaks: true });
    const raw = typeof parsed === "string" ? parsed : "";
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [content]);
  return (
    <div
      className="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
