export type DesktopOs = "windows" | "linux";
export type VisitorOs = DesktopOs | "macos" | "mobile" | "other";

export const DESKTOP_RELEASE_BASE =
  "https://github.com/DavidIfebueme/klawva/releases/download/desktop-latest";

export const desktopDownloadUrl = (os: DesktopOs): string =>
  os === "windows"
    ? `${DESKTOP_RELEASE_BASE}/klawva-desktop-windows.exe`
    : `${DESKTOP_RELEASE_BASE}/klawva-desktop-linux.AppImage`;

export const detectVisitorOs = (userAgent: string): VisitorOs => {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android") || ua.includes("iphone") || ua.includes("ipad")) {
    return "mobile";
  }
  if (ua.includes("windows")) {
    return "windows";
  }
  if (ua.includes("mac os") || ua.includes("macintosh")) {
    return "macos";
  }
  if (ua.includes("linux")) {
    return "linux";
  }
  return "other";
};

export const downloadOsFor = (visitor: VisitorOs): DesktopOs | null =>
  visitor === "windows" || visitor === "linux" ? visitor : null;

export const unavailableOsCopy = (visitor: VisitorOs): string =>
  visitor === "macos"
    ? "the mac app is coming soon. the desktop app runs on windows and linux today."
    : visitor === "mobile"
      ? "desktop employees run on your computer. open this page on a windows or linux machine."
      : "the desktop app runs on windows and linux. support for your platform is coming soon.";
