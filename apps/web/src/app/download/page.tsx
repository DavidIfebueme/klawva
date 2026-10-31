import { useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import {
  desktopDownloadUrl,
  detectVisitorOs,
  downloadOsFor,
  unavailableOsCopy,
  type DesktopOs,
} from "@/lib/desktop-app";

const steps = [
  "install the app and open it",
  "sign in on this site, then approve the pairing code the app shows",
  "your desktop employees run on your computer from then on",
];

export function Component() {
  const visitor = useMemo(() => detectVisitorOs(navigator.userAgent), []);
  const os = downloadOsFor(visitor);
  const other: DesktopOs = os === "windows" ? "linux" : "windows";
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-xl mx-auto text-center">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Klawva desktop
          </span>
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-4">
            get the desktop app
          </h1>
          <p className="font-mono text-klawva-muted mb-10">
            desktop employees run on your computer, not in the cloud. the app is
            how they get there.
          </p>
          {os === null ? (
            <div className="bg-klawva-surface border border-klawva-accent rounded-lg px-5 py-6">
              <p className="font-mono text-klawva-muted text-sm mb-4">
                {unavailableOsCopy(visitor)}
              </p>
            </div>
          ) : (
            <>
              <Button href={desktopDownloadUrl(os)}>download for {os}</Button>
              <div className="mt-4">
                <a
                  href={desktopDownloadUrl(other)}
                  className="text-xs text-klawva-muted underline font-mono"
                >
                  download for {other} instead
                </a>
              </div>
            </>
          )}
          <ol className="text-left font-mono text-klawva-muted text-sm mt-12 space-y-3 list-decimal list-inside">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </main>
      <Footer />
    </div>
  );
}
