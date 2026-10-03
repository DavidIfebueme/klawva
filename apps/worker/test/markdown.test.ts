import { describe, expect, it } from "vitest";
import { toEmailHtml, toTelegramHtml } from "../src/lib/markdown.ts";

describe("telegram markdown", () => {
  it("keeps bold, code, and links", () => {
    const html = toTelegramHtml("**bold** and `code` and [link](https://example.com)");
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it("turns list items into bullet lines", () => {
    const html = toTelegramHtml("- one\n- two");
    expect(html).toContain("• one");
    expect(html).toContain("• two");
  });

  it("drops unsupported tags so telegram accepts the payload", () => {
    const html = toTelegramHtml("# Heading\n\nplain <span>text</span>");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<span");
    expect(html).toContain("Heading");
    expect(html).toContain("plain text");
  });

  it("removes script tags", () => {
    const html = toTelegramHtml("<script>alert(1)</script>hi");
    expect(html).not.toContain("<script");
    expect(html).toContain("hi");
  });
});

describe("email markdown", () => {
  it("renders markdown and strips scripts", () => {
    const html = toEmailHtml("**bold**<script>alert(1)</script>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script");
  });
});
