import { describe, expect, it } from "vitest";
import { desktopCorsHeaders, deviceApiPath } from "../src/lib/desktop-cors.ts";

describe("desktop cors", () => {
  it("answers the preflight for the tauri webview on the two device endpoints", () => {
    expect(deviceApiPath("/api/devices/claim")).toBe(true);
    expect(deviceApiPath("/api/device/sessions")).toBe(true);
    const headers = desktopCorsHeaders("http://tauri.localhost");
    expect(headers["access-control-allow-origin"]).toBe("http://tauri.localhost");
    expect(headers["access-control-allow-methods"]).toContain("POST");
  });

  it("allows the windows tauri origin too", () => {
    const headers = desktopCorsHeaders("https://tauri.localhost");
    expect(headers["access-control-allow-origin"]).toBe("https://tauri.localhost");
  });

  it("returns no cors headers for a browser origin, the surface stays narrow", () => {
    expect(desktopCorsHeaders("https://evil.example")).toEqual({});
    expect(deviceApiPath("/api/auth/request-link")).toBe(false);
  });
});
