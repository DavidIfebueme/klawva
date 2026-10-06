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
  it("emits no tag that came from the input", () => {
    expect(toEmailHtml("**bold**")).toBe("bold");
  });

  it("keeps structure through line breaks and bullets", () => {
    const html = toEmailHtml("# Report\n\nFound **7** roles.\n\n- One\n- Two\n\nEnd");
    expect(html).toBe("Report\nFound 7 roles.\n- One\n- Two\nEnd");
  });

  it.each([
    '<img src=x onerror=alert(1)>',
    '<IMG SRC=x ONERROR=alert(document.domain)>',
    '<svg onload=alert(1)>',
    '<body onload=alert(1)>',
    '<a href="javascript:alert(1)">click</a>',
    '<script>alert(1',
    '<iframe src=//evil.tld>',
  ])("neutralises %s", (payload) => {
    const html = toEmailHtml(payload);
    expect(html).not.toMatch(/<[a-z!/]/i);
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onload");
    expect(html).not.toContain("javascript:");
  });

  it("escapes the characters that could rebuild a tag", () => {
    expect(toEmailHtml("5 < 6 & 7 > 6")).toBe("5 &lt; 6 &amp; 7 &gt; 6");
  });
});
