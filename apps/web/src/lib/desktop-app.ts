export type DesktopOs = "windows" | "linux";

export const DESKTOP_RELEASE_BASE =
  "https://github.com/DavidIfebueme/klawva/releases/download/desktop-latest";

export const desktopDownloadUrl = (os: DesktopOs): string =>
  os === "windows"
    ? `${DESKTOP_RELEASE_BASE}/klawva-desktop-windows.exe`
    : `${DESKTOP_RELEASE_BASE}/klawva-desktop-linux.AppImage`;

export const detectDesktopOs = (userAgent: string): DesktopOs => {
  const ua = userAgent.toLowerCase();
  return ua.includes("windows") ? "windows" : "linux";
};
