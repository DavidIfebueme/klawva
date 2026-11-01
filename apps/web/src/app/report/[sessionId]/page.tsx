import React, { useRef, useState } from "react";
import {
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router-dom";
import * as Schema from "effect/Schema";
import { motion } from "motion/react";
import { toPng } from "html-to-image";
import { Navbar } from "../../../components/layout/Navbar";
import { Footer } from "../../../components/layout/Footer";
import { KlawvaMark } from "../../../components/icons/KlawvaMark";
import { Button } from "../../../components/ui/Button";
import { ApiError } from "../../../lib/api-error";
import { getSharedReport } from "../../../lib/public-api";
import { Markdown } from "../../../components/ui/Markdown";

const statSchema = Schema.Struct({ label: Schema.String, value: Schema.String });

const normalizeStats = (
  stats: ReadonlyArray<{ label: string; value: string }> | string,
): ReadonlyArray<{ label: string; value: string }> => {
  if (typeof stats !== "string") {
    return stats;
  }
  const parsed = Schema.decodeUnknownOption(
    Schema.fromJsonString(Schema.Array(statSchema)),
  )(stats);
  return parsed._tag === "Some" ? parsed.value : [];
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const sessionId = params.sessionId;
  if (sessionId === undefined) {
    throw redirect("/");
  }
  const url = new URL(request.url);
  const shareToken = url.searchParams.get("shareToken");
  if (shareToken === null) {
    return { sessionId, report: null, error: "This report needs its share link." };
  }
  const report = await getSharedReport(sessionId, shareToken).catch((err) => {
    if (err instanceof ApiError) {
      return null;
    }
    throw err;
  });
  return {
    sessionId,
    report,
    error: report === null ? "Report is not available yet." : null,
  };
};

export function Component() {
  const { sessionId, report, error } = useLoaderData<typeof loader>();
  const displayName = report === null ? "Your employee" : report.agentName;
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const stats = report === null ? [] : normalizeStats(report.stats);

  const handleShare = () => {
    let url = window.location.origin + window.location.pathname;
    if (report !== null && report.shareToken.length > 0) {
      url += `?shareToken=${encodeURIComponent(report.shareToken)}`;
    }
    navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!cardRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `klawva-report-${sessionId.substring(0, 8)}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to generate image", err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6 flex flex-col items-center">
        <div className="w-full max-w-[640px]">
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="bg-klawva-surface border border-klawva-border rounded-lg overflow-hidden mb-8 shadow-2xl shadow-klawva-accent/5"
          >
            <div className="h-1 w-full bg-klawva-accent" />
            <div className="p-8 md:p-12">
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-3">
                  <KlawvaMark size={32} />
                  <span className="font-syne font-bold text-klawva-text tracking-widest">
                    KLAWVA
                  </span>
                </div>
                {report !== null && (
                  <div className="font-mono text-klawva-accent text-xs uppercase tracking-wider border border-klawva-accent px-3 py-1 rounded-full">
                    SHIFT COMPLETE
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6 mb-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-klawva-border bg-[#0A0A0A] font-syne font-extrabold text-2xl text-klawva-accent">
                  {displayName.charAt(0)}
                </div>
                <div>
                  <h1 className="font-syne font-extrabold text-3xl md:text-4xl text-klawva-text mb-2">
                    {displayName}
                  </h1>
                  <div className="font-mono text-klawva-muted text-sm">
                    {report !== null ? "Shift report" : "Shift in progress"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-12">
                {stats.map((entry, i) => (
                  <div
                    key={i}
                    className="bg-[#0A0A0A] border border-klawva-border rounded p-4 text-center"
                  >
                    <div className="font-syne font-bold text-2xl md:text-3xl text-klawva-accent mb-2">
                      {entry.value}
                    </div>
                    <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider leading-tight">
                      {entry.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-12">
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-4">
                  Final summary
                </div>
                {report?.summary !== undefined ? (
                  <Markdown content={report.summary} />
                ) : (
                  <p className="font-mono text-klawva-text text-base leading-relaxed">
                    Shift report is still compiling and will appear here after final delivery.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-8 border-t border-klawva-border">
                <div className="font-mono text-klawva-dim text-xs">Powered by Klawva</div>
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                  ID: {sessionId.substring(0, 8)}
                </div>
              </div>
            </div>
          </motion.div>

          {error && (
            <div className="mb-8 border border-klawva-orange rounded p-3 font-mono text-klawva-orange text-xs">
              {error}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col gap-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button variant="secondary" onClick={handleShare}>
                {copied ? "Copied" : "Share this report"}
              </Button>
              <Button variant="secondary" onClick={handleDownload} disabled={isDownloading}>
                {isDownloading ? "Generating..." : "Download as image"}
              </Button>
            </div>
            <div className="h-px w-full bg-klawva-border my-2" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report !== null ? (
                <Button variant="primary" href={`/employees/${report.agentSlug}`}>
                  Hire {report.agentName} again
                </Button>
              ) : (
                <Button variant="primary" href="/employees">
                  Browse employees
                </Button>
              )}
              <Button variant="ghost" href="/employees">
                Try a different employee
              </Button>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
