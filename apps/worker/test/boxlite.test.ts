import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import {
  boxNameFor,
  navigableUrl,
  renderCommand,
  resolvePublicUrl,
  unwrapTransfer,
} from "../src/box/boxlite.ts";

describe("box lifecycle naming", () => {
  it("gives every session its own box name", () => {
    const first = boxNameFor("6ed9bce6-cb31-47cf-91b1-e6e4d29422a5");
    const second = boxNameFor("6ed9bce6-cb31-47cf-91b1-e6e4d29422b6");
    expect(first).not.toBe(second);
    expect(first.startsWith("klawva-")).toBe(true);
  });
});

describe("redirect guard", () => {
  it("refuses a private destination before any request is made", async () => {
    const exit = await Effect.runPromiseExit(
      resolvePublicUrl(new URL("http://127.0.0.1:8787/admin")),
    );
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") {
      expect(exit.value).toBeNull();
    }
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
    expect(shell).toContain("/home/chrome/work/page.html");
    expect(shell).not.toContain("> /tmp/");
    expect(shell).toContain("mkdir -p /home/chrome/work");
  });
});

const tarOf = (name: string, content: string): Uint8Array => {
  const header = new Uint8Array(512);
  header.set(new TextEncoder().encode(name), 0);
  const size = content.length.toString(8).padStart(11, "0");
  header.set(new TextEncoder().encode(`${size}\0`), 124);
  const body = new TextEncoder().encode(content);
  const out = new Uint8Array(512 + Math.ceil(body.length / 512) * 512);
  out.set(header, 0);
  out.set(body, 512);
  return out;
};

describe("file transfer", () => {
  it("reads the payload out of the tar the files endpoint returns", () => {
    const payload = tarOf("page.html", "<html><body>hello</body></html>");
    expect(unwrapTransfer(payload)).toBe("<html><body>hello</body></html>");
  });

  it("falls back to the raw bytes when the header carries no octal size", () => {
    const notTar = new Uint8Array(600);
    notTar.set(new TextEncoder().encode("plain body"), 512);
    expect(unwrapTransfer(notTar)).toContain("plain body");
  });
});
