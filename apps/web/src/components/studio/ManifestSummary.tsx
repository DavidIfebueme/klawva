import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Lane, StudioManifest } from "@/lib/studio-api";

function Chips({ values }: { values: ReadonlyArray<string> }) {
  if (values.length === 0) {
    return <span className="font-mono text-klawva-dim text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          key={value}
          className="text-xs font-mono uppercase tracking-wider text-klawva-muted border border-klawva-border rounded-full px-3 py-1"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-klawva-border/50 py-3 last:border-0">
      <span className="text-xs font-mono uppercase tracking-wider text-klawva-muted">
        {label}
      </span>
      <span className="font-mono text-xs text-klawva-text text-right break-all">
        {children}
      </span>
    </div>
  );
}

export function ManifestSummary({
  lane,
  manifest,
}: {
  lane: Lane | undefined;
  manifest: StudioManifest | null | undefined;
}) {
  const limits = manifest?.limits ?? null;
  const data = manifest?.data ?? null;
  const desktop = manifest?.desktop ?? null;
  const capabilities =
    desktop === null
      ? []
      : [
          ...(desktop.capabilities.screen !== undefined
            ? [`screen ${desktop.capabilities.screen}`]
            : []),
          ...(desktop.capabilities.input !== undefined
            ? [`input ${desktop.capabilities.input.join("/")}`]
            : []),
          ...(desktop.capabilities.network !== undefined
            ? [`network ${desktop.capabilities.network.join("/")}`]
            : []),
          ...(desktop.capabilities.fs !== undefined
            ? [`fs ${desktop.capabilities.fs.join("/")}`]
            : []),
        ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-syne font-bold text-lg uppercase text-white">
          Manifest
        </h2>
        <Badge variant={lane === "authored" ? "pending" : "active"}>
          {lane ?? "authored"}
        </Badge>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-klawva-muted mb-2">
            Transport
          </p>
          <Chips values={manifest?.transport ?? []} />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-klawva-muted mb-2">
            Launch markets
          </p>
          <Chips values={manifest?.launchMarkets ?? []} />
        </div>
      </div>

      <div className="mt-4">
        {manifest?.hosted && (
          <>
            <Row label="Card URL">{manifest.hosted.cardUrl}</Row>
            <Row label="Mode">{manifest.hosted.mode}</Row>
          </>
        )}
        {manifest?.desktop && (
          <>
            <Row label="Bundle id">{manifest.desktop.bundleId}</Row>
            <Row label="Entrypoint">{manifest.desktop.entrypoint}</Row>
            <Row label="Data dirs">
              {manifest.desktop.dataDirs.length > 0
                ? manifest.desktop.dataDirs.join(", ")
                : "—"}
            </Row>
            <Row label="Capabilities">
              {capabilities.length > 0 ? capabilities.join(" · ") : "—"}
            </Row>
          </>
        )}
        {data && (
          <Row label="Data policy">
            {data.retentionDays} days ·{" "}
            {data.leavesCountry ? "leaves country" : "stays in country"}
            {data.dpia ? " · DPIA note" : ""}
          </Row>
        )}
        {limits && (
          <Row label="Limits">
            {limits.maxWallClockSeconds ?? "—"}s wall clock ·{" "}
            {limits.maxEvents ?? "—"} events ·{" "}
            {limits.maxEventBytes ?? "—"} bytes/event
          </Row>
        )}
        {!manifest?.hosted && !manifest?.desktop && !data && !limits && (
          <p className="font-mono text-klawva-dim text-xs py-2">
            No manifest details reported for this listing.
          </p>
        )}
      </div>
    </Card>
  );
}
