import { describe, expect, it } from "vitest";
import { boxNameFor, navigableUrl, renderCommand } from "../src/box/boxlite.ts";

describe("box lifecycle naming", () => {
  it("keys one box per session", () => {
    expect(boxNameFor("6ed9bce6-cb31-47cf-91b1-e6e4d29422a5")).toBe(
      "klawva-6ed9bce6-cb31-47cf-91b1-e6e4d29422a5",
    );
  });
});

describe("browse target", () => {
  it("accepts http and https", () => {
    expect(navigableUrl("https://example.com/a?b=c")).toBe(
      "https://example.com/a?b=c",
    );
    expect(navigableUrl("http://example.com")).toBe("http://example.com/");
  });

  it("refuses schemes the browser must not reach", () => {
    expect(navigableUrl("file:///etc/passwd")).toBeNull();
    expect(navigableUrl("ftp://example.com")).toBeNull();
    expect(navigableUrl("javascript:alert(1)")).toBeNull();
  });

  it("refuses loopback and private hosts", () => {
    expect(navigableUrl("http://127.0.0.1:8787")).toBeNull();
    expect(navigableUrl("http://localhost")).toBeNull();
    expect(navigableUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
  });
});

describe("render command", () => {
  it("carries the url as base64 so shell metacharacters cannot break out", () => {
    const url = "https://example.com/?q='; echo pwned; #";
    const command = renderCommand(url);
    const shell = command[1];
    expect(shell).not.toContain("pwned");
    expect(shell).not.toContain("'https");
    const encoded = shell.slice(shell.indexOf("printf %s '") + 11, shell.indexOf("' | base64 -d"));
    expect(atob(encoded)).toBe(url);
  });

  it("writes the page outside the unreachable tmp mount", () => {
    const shell = renderCommand("https://example.com")[1];
    expect(shell).toContain("/work/page.html");
    expect(shell).not.toContain("> /tmp/");
  });
});
