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

export const toEmailHtml = (markdown: string): string =>
  render(markdown)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "");
