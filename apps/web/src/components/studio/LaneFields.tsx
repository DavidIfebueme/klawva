import React from "react";
import { Monitor, Server, Sparkles } from "lucide-react";
import type { Lane } from "@/lib/studio-api";
import { marketOptions, type LaneDraft } from "./lane-draft";

const inputClass =
  "w-full h-11 bg-klawva-bg border border-klawva-border rounded px-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono";

const laneOptions: ReadonlyArray<{
  id: Lane;
  label: string;
  blurb: string;
  icon: React.ReactNode;
}> = [
  {
    id: "authored",
    label: "Authored",
    blurb: "runs on klawva's model",
    icon: <Sparkles size={16} />,
  },
  {
    id: "hosted",
    label: "Hosted",
    blurb: "your own server answers",
    icon: <Server size={16} />,
  },
  {
    id: "desktop",
    label: "Desktop",
    blurb: "runs on the customer's machine, windows",
    icon: <Monitor size={16} />,
  },
];

const labelClass =
  "block text-xs uppercase tracking-wider text-klawva-muted mb-2";

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        className={inputClass}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-klawva-muted font-mono cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-klawva-accent h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}

export function LaneFields({
  value,
  onChange,
}: {
  value: LaneDraft;
  onChange: (patch: Partial<LaneDraft>) => void;
}) {
  const toggleMarket = (id: string, checked: boolean) => {
    const next = checked
      ? [...value.launchMarkets, id]
      : value.launchMarkets.filter((market) => market !== id);
    onChange({ launchMarkets: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Lane</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {laneOptions.map((option) => {
            const selected = value.lane === option.id;
            return (
              <button
                type="button"
                key={option.id}
                onClick={() => onChange({ lane: option.id })}
                className={`text-left border rounded p-4 transition-colors ${
                  selected
                    ? "border-klawva-accent bg-klawva-accent/5"
                    : "border-klawva-border hover:border-klawva-muted"
                }`}
              >
                <span className="flex items-center gap-2 font-syne font-bold text-sm text-klawva-text">
                  {option.icon}
                  {option.label}
                </span>
                <span className="block font-mono text-klawva-dim text-xs mt-1">
                  {option.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {value.lane === "hosted" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <Field
              label="Agent card URL"
              value={value.cardUrl}
              onChange={(cardUrl) => onChange({ cardUrl })}
              placeholder="https://agent.example.com/.well-known/agent-card.json"
            />
          </div>
          <div>
            <label className={labelClass}>Mode</label>
            <select
              className={inputClass}
              value={value.mode}
              onChange={(e) =>
                onChange({ mode: e.target.value === "push" ? "push" : "pull" })
              }
            >
              <option value="push">push</option>
              <option value="pull">pull</option>
            </select>
          </div>
          <Field
            label="Auth type (optional)"
            value={value.authType}
            onChange={(authType) => onChange({ authType })}
            placeholder="bearer"
          />
          <div className="md:col-span-2">
            <Field
              label="Auth header (optional)"
              value={value.authHeader}
              onChange={(authHeader) => onChange({ authHeader })}
              placeholder="Authorization: Bearer …"
            />
          </div>
        </div>
      )}

      {value.lane === "desktop" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              label="Bundle id"
              value={value.bundleId}
              onChange={(bundleId) => onChange({ bundleId })}
              placeholder="com.example.agent"
            />
            <Field
              label="Entrypoint"
              value={value.entrypoint}
              onChange={(entrypoint) => onChange({ entrypoint })}
              placeholder="agent.exe"
            />
          </div>
          <Field
            label="Data dirs (comma separated)"
            value={value.dataDirs}
            onChange={(dataDirs) => onChange({ dataDirs })}
            placeholder="%APPDATA%/Agent, %LOCALAPPDATA%/Agent"
          />
          <div>
            <label className={labelClass}>Capabilities</label>
            <div className="border border-klawva-border rounded p-4 space-y-3">
              <Check
                label="Read the screen"
                checked={value.screenRead}
                onChange={(screenRead) => onChange({ screenRead })}
              />
              <Field
                label="Input actions (comma separated)"
                value={value.inputActions}
                onChange={(inputActions) => onChange({ inputActions })}
                placeholder="click, type, scroll"
              />
              <Field
                label="Network hosts (comma separated)"
                value={value.networkHosts}
                onChange={(networkHosts) => onChange({ networkHosts })}
                placeholder="api.example.com"
              />
              <Field
                label="File system scopes (comma separated)"
                value={value.fsScopes}
                onChange={(fsScopes) => onChange({ fsScopes })}
                placeholder="%USERPROFILE%/Documents"
              />
            </div>
          </div>
        </div>
      )}

      {value.lane !== "authored" && (
        <>
          <div>
            <label className={labelClass}>Launch markets</label>
            <div className="flex flex-wrap gap-5">
              {marketOptions.map((market) => (
                <Check
                  key={market.id}
                  label={market.label}
                  checked={value.launchMarkets.includes(market.id)}
                  onChange={(checked) => toggleMarket(market.id, checked)}
                />
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Data policy</label>
            <div className="border border-klawva-border rounded p-4 space-y-3">
              <Field
                label="Retention days"
                type="number"
                value={value.retentionDays}
                onChange={(retentionDays) => onChange({ retentionDays })}
              />
              <Check
                label="Data leaves the country"
                checked={value.leavesCountry}
                onChange={(leavesCountry) => onChange({ leavesCountry })}
              />
              <Check
                label="I have a DPIA note for this agent"
                checked={value.dpia}
                onChange={(dpia) => onChange({ dpia })}
              />
            </div>
          </div>
        </>
      )}

      <details className="border border-klawva-border rounded">
        <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-wider text-klawva-muted font-mono">
          Advanced limits
        </summary>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field
            label="Max wall clock (seconds)"
            type="number"
            value={value.maxWallClockSeconds}
            onChange={(maxWallClockSeconds) => onChange({ maxWallClockSeconds })}
          />
          <Field
            label="Max events"
            type="number"
            value={value.maxEvents}
            onChange={(maxEvents) => onChange({ maxEvents })}
          />
          <Field
            label="Max event bytes"
            type="number"
            value={value.maxEventBytes}
            onChange={(maxEventBytes) => onChange({ maxEventBytes })}
          />
          <Field
            label="Max artifact bytes"
            type="number"
            value={value.maxArtifactBytes}
            onChange={(maxArtifactBytes) => onChange({ maxArtifactBytes })}
          />
          <Field
            label="Min idle seconds"
            type="number"
            value={value.minIdleSeconds}
            onChange={(minIdleSeconds) => onChange({ minIdleSeconds })}
          />
          <p className="font-mono text-klawva-dim text-xs md:col-span-2">
            Limits may only narrow the platform caps. A higher number is
            rejected.
          </p>
        </div>
      </details>
    </div>
  );
}
