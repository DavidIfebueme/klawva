const DESKTOP_ORIGINS = new Set([
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
]);

export const deviceApiPath = (pathname: string): boolean =>
  pathname === "/api/devices/claim" || pathname === "/api/device/sessions";

export const desktopCorsHeaders = (
  origin: string | null,
): Record<string, string> => {
  if (origin === null || !DESKTOP_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-auth-token",
    vary: "origin",
  };
};
