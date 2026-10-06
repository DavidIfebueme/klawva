import { marked } from "marked";

const telegramAllowed = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "a",
  "blockquote",
]);

const render = (markdown: string): string => {
  const parsed = marked.parse(markdown, { async: false, gfm: true, breaks: true });
  return typeof parsed === "string" ? parsed : "";
};

export const toTelegramHtml = (markdown: string): string => {
  const html = render(markdown)
    .replace(/<h[1-6][^>]*>/gi, "<b>")
    .replace(/<\/h[1-6]>/gi, "</b>\n")
    .replace(/<p(?=[\s>])[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:ul|ol)>/gi, "\n")
    .replace(/<(?:ul|ol)[^>]*>/gi, "")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n")
    .replace(/<strong[^>]*>/gi, "<b>")
    .replace(/<\/strong>/gi, "</b>")
    .replace(/<em[^>]*>/gi, "<i>")
    .replace(/<\/em>/gi, "</i>")
    .replace(/<del[^>]*>/gi, "<s>")
    .replace(/<\/del>/gi, "</s>");
  return html
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g, (match, name: string) =>
      telegramAllowed.has(name.toLowerCase()) ? match : "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const toPlainText = (markdown: string): string =>
  render(markdown)
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<hr[^>]*>/gi, "\n---\n")
    .replace(/<[^>]*>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const escapeText = (value: string): string =>
  value
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const toEmailHtml = (markdown: string): string =>
  toPlainText(markdown)
    .split(/\n{2,}/)
    .map((block) => escapeText(block).replace(/\n/g, "<br>"))
    .join("\n");
