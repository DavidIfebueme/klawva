import React, { useState } from "react";
import {
  redirect,
  useLoaderData,
  useNavigate,
  useRevalidator,
  type LoaderFunctionArgs,
} from "react-router-dom";
import { requireSession, rethrowAuth, handleActionAuthError } from "@/lib/studio-loader";
import {
  deleteStudioListing,
  getStudioListing,
  runStudioKit,
  runStudioSandbox,
  submitStudioListing,
  updateStudioListing,
  uploadAuthorBundle,
  withdrawStudioListing,
  type BundleInfo,
  type DesktopCapabilities,
  type KitRun,
} from "@/lib/studio-api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Toast, type ToastState } from "@/components/ui/Toast";
import { ManifestSummary } from "@/components/studio/ManifestSummary";
import { blockedCopy } from "@/lib/studio-copy";
import {
  ArrowLeft,
  Check,
  FlaskConical,
  Save,
  Send,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const session = requireSession();
  if (params.id === undefined) {
    throw redirect("/studio");
  }
  const detail = await getStudioListing(session.token, params.id).catch(
    rethrowAuth,
  );
  return { session, detail };
};

function parseBriefFields(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v) => typeof v === "string").join(", ");
    }
  } catch {
    return raw;
  }
  return raw;
}

function statusVariant(status: string): "active" | "pending" | "warning" {
  if (status === "published") return "active";
  if (status === "draft") return "pending";
  return "warning";
}

const readFileBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read that file."));
        return;
      }
      const comma = reader.result.indexOf(",");
      resolve(comma === -1 ? reader.result : reader.result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });

const capabilityRecord = (
  capabilities: DesktopCapabilities | undefined,
): Record<string, string> => {
  if (capabilities === undefined) return {};
  const record: Record<string, string> = {};
  if (capabilities.screen !== undefined) record.screen = capabilities.screen;
  if (capabilities.input !== undefined) record.input = capabilities.input.join(",");
  if (capabilities.network !== undefined) record.network = capabilities.network.join(",");
  if (capabilities.fs !== undefined) record.fs = capabilities.fs.join(",");
  return record;
};

export function Component() {
  const { session, detail } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [busyAction, setBusyAction] = useState<null | "save" | "sandbox" | "submit">(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [outcome, setOutcome] = useState<{ score: number; band: string } | null>(null);
  const [kitRun, setKitRun] = useState<KitRun | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [kitBusy, setKitBusy] = useState(false);
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [bundleVersion, setBundleVersion] = useState("");
  const [bundleSignature, setBundleSignature] = useState("");
  const [bundleBusy, setBundleBusy] = useState(false);
  const [uploaded, setUploaded] = useState<BundleInfo | null>(null);

  const lane = detail.lane ?? "authored";
  const lastKit = kitRun ?? detail.kit ?? null;
  const canSubmit = detail.canSubmit !== false;
  const blockedReason = blockedCopy(detail.submitBlockedReason);
  const bundle = uploaded ?? detail.bundle ?? null;

  const showToast = (kind: ToastState["kind"], message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 5000);
  };

  const [name, setName] = useState(detail.name);
  const [tagline, setTagline] = useState(detail.tagline);
  const [category, setCategory] = useState(detail.category);
  const [priceNaira, setPriceNaira] = useState(String(detail.priceMinor / 100));
  const [budgetMinor, setBudgetMinor] = useState(String(detail.budgetMinor));
  const [briefFields, setBriefFields] = useState(parseBriefFields(detail.briefFields));
  const [soul, setSoul] = useState(detail.soul);

  const editable = detail.status === "draft" || detail.status === "rejected";

  const handleSave = async () => {
    setBusyAction("save");
    setError("");
    const priceMinor = Math.round(Number(priceNaira) * 100);
    if (!Number.isFinite(priceMinor) || priceMinor < 100000 || priceMinor > 2500000) {
      setError("Price must be between ₦1,000 and ₦25,000");
      setBusyAction(null);
      return;
    }
    try {
      await updateStudioListing(session.token, detail.id, {
        name,
        tagline,
        category,
        priceMinor,
        budgetMinor: Number(budgetMinor) || 3000,
        briefFields: briefFields
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
        soul,
      });
      showToast("success", "Draft saved.");
      revalidator.revalidate();
    } catch (err) {
      if (handleActionAuthError(err)) return;
      showToast("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSandbox = async () => {
    setBusyAction("sandbox");
    setError("");
    try {
      const result = await runStudioSandbox(session.token, detail.id);
      setOutcome(result);
      showToast("success", `Sandbox score ${result.score}, band ${result.band}.`);
    } catch (err) {
      if (handleActionAuthError(err)) return;
      showToast("error", err instanceof Error ? err.message : "Sandbox failed");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmit = async () => {
    setBusyAction("submit");
    setError("");
    try {
      const result = await submitStudioListing(session.token, detail.id);
      setOutcome({ score: result.score, band: result.band });
      showToast("success", `Submitted for review. New status: ${result.status.replace("_", " ")}.`);
      revalidator.revalidate();
    } catch (err) {
      if (handleActionAuthError(err)) return;
      showToast("error", err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusyAction(null);
    }
  };

  const handleWithdraw = async () => {
    setDangerBusy(true);
    setError("");
    try {
      await withdrawStudioListing(session.token, detail.id);
      revalidator.revalidate();
      showToast("success", "Back in draft. Edit and resubmit when ready.");
    } catch (err) {
      if (handleActionAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Could not withdraw the listing.");
    } finally {
      setDangerBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this draft? This cannot be undone.")) {
      return;
    }
    setDangerBusy(true);
    setError("");
    try {
      await deleteStudioListing(session.token, detail.id);
      navigate("/studio");
    } catch (err) {
      if (handleActionAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Could not delete the listing.");
      setDangerBusy(false);
    }
  };

  const handleKit = async () => {
    setKitBusy(true);
    setError("");
    try {
      const result = await runStudioKit(session.token, detail.id);
      setKitRun(result);
      showToast(
        result.ok ? "success" : "error",
        result.ok
          ? "Contract kit passed."
          : "Contract kit failed. Fix the red steps.",
      );
      revalidator.revalidate();
    } catch (err) {
      if (handleActionAuthError(err)) return;
      showToast("error", err instanceof Error ? err.message : "Contract kit failed");
    } finally {
      setKitBusy(false);
    }
  };

  const handleBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    const bundleId = detail.manifest?.desktop?.bundleId ?? "";
    if (bundleFile === null) {
      showToast("error", "Choose a bundle file first.");
      return;
    }
    if (bundleId.length === 0) {
      showToast("error", "Add a bundle id to the manifest first.");
      return;
    }
    setBundleBusy(true);
    setError("");
    try {
      const bytesBase64 = await readFileBase64(bundleFile);
      const result = await uploadAuthorBundle(session.token, {
        bundleId,
        version: bundleVersion.trim(),
        bytesBase64,
        signature: bundleSignature.trim(),
        capabilities: capabilityRecord(detail.manifest?.desktop?.capabilities),
      });
      setUploaded(result);
      showToast("success", `Bundle ${result.version ?? ""} uploaded.`);
      revalidator.revalidate();
    } catch (err) {
      if (handleActionAuthError(err)) return;
      showToast("error", err instanceof Error ? err.message : "Bundle upload failed");
    } finally {
      setBundleBusy(false);
    }
  };

  const inputClass =
    "w-full h-11 bg-klawva-bg border border-klawva-border rounded px-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono";

  return (
    <div className="space-y-8">
      <button
        onClick={() => navigate("/studio")}
        className="flex items-center gap-2 text-xs text-klawva-muted hover:text-klawva-text transition-colors font-mono uppercase tracking-wider"
      >
        <ArrowLeft size={14} />
        <span>Back to listings</span>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider block mb-1">
            {detail.slug}
          </span>
          <h1 className="font-syne font-bold text-3xl uppercase text-white">
            {detail.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={lane === "authored" ? "pending" : "active"}>{lane}</Badge>
          <Badge variant={statusVariant(detail.status)}>
            {detail.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <ManifestSummary lane={lane} manifest={detail.manifest} />

      {error && (
        <p className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 font-mono">
          {error}
        </p>
      )}

      {outcome && (
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-klawva-muted tracking-wider">
              Latest eval
            </span>
            <span className="font-syne font-extrabold text-2xl text-klawva-accent">
              {outcome.score}
            </span>
          </div>
          <p className="text-xs text-klawva-muted mt-1 font-mono">
            Band: {outcome.band}
          </p>
        </Card>
      )}

      {lane === "hosted" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-syne font-bold text-lg uppercase text-white">
                Run contract kit
              </h2>
              <p className="font-mono text-klawva-dim text-xs mt-1">
                {detail.kit?.ranAt
                  ? `Last run ${new Date(detail.kit.ranAt).toLocaleString()}`
                  : "Not run yet."}
              </p>
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={handleKit}
              loading={kitBusy}
              disabled={kitBusy || busyAction !== null}
            >
              <ShieldCheck size={16} />
              Run contract kit
            </Button>
          </div>
          {lastKit === null || lastKit.steps.length === 0 ? (
            <p className="font-mono text-sm text-klawva-muted">
              Submit stays blocked until the kit is green.
            </p>
          ) : (
            <div className="space-y-2">
              {lastKit.steps.map((step) => (
                <div
                  key={step.step}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-klawva-border/50 pb-2 last:border-0 font-mono text-xs"
                >
                  <span className="flex items-center gap-2 text-klawva-text">
                    {step.ok ? (
                      <Check size={14} className="text-klawva-accent" />
                    ) : (
                      <X size={14} className="text-klawva-orange" />
                    )}
                    {step.step}
                  </span>
                  <span
                    className={
                      step.ok ? "text-klawva-muted" : "text-klawva-orange"
                    }
                  >
                    {step.detail}
                  </span>
                </div>
              ))}
              <p className="font-mono text-klawva-dim text-xs pt-1">
                {lastKit === null
                  ? ""
                  : lastKit.ok
                    ? "Every step passed. You can submit for review."
                    : "Submit is blocked until every step passes."}
              </p>
            </div>
          )}
        </Card>
      )}

      {lane === "desktop" && (
        <Card>
          <h2 className="font-syne font-bold text-lg uppercase text-white mb-2">
            Bundle
          </h2>
          <p className="font-mono text-klawva-orange text-xs mb-4">
            Bundles are windows only.
          </p>
          <div className="flex flex-wrap gap-6 font-mono text-xs mb-5">
            <span className="text-klawva-muted">
              Version:{" "}
              <span className="text-klawva-text">{bundle?.version ?? "none"}</span>
            </span>
            <span className="text-klawva-muted">
              SHA256:{" "}
              <span className="text-klawva-text break-all">
                {bundle?.sha256 ?? "none"}
              </span>
            </span>
          </div>
          <form onSubmit={handleBundle} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Bundle file (.zip)
              </label>
              <input
                type="file"
                className={`${inputClass} file:mr-4 file:rounded file:border-0 file:bg-klawva-elevated file:px-4 file:py-2 file:font-mono file:text-sm file:text-klawva-text`}
                onChange={(e) => setBundleFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                  Version
                </label>
                <input
                  className={inputClass}
                  value={bundleVersion}
                  onChange={(e) => setBundleVersion(e.target.value)}
                  placeholder="1.0.0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Signature
              </label>
              <textarea
                className="w-full min-h-[90px] bg-klawva-bg border border-klawva-border rounded p-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono"
                value={bundleSignature}
                onChange={(e) => setBundleSignature(e.target.value)}
                placeholder="Signature over the bundle digest"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              size="md"
              loading={bundleBusy}
              disabled={
                bundleBusy || bundleFile === null || bundleVersion.trim().length === 0
              }
            >
              <Upload size={16} />
              Upload bundle
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="font-syne font-bold text-lg uppercase text-white mb-6">
          Configuration
        </h2>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Name
              </label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Category
              </label>
              <input
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Price (₦ per 24h)
              </label>
              <input
                className={inputClass}
                type="number"
                min="1000"
                max="25000"
                step="1"
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                AI budget cap
              </label>
              <input
                className={inputClass}
                type="number"
                min="100"
                step="50"
                value={budgetMinor}
                onChange={(e) => setBudgetMinor(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Brief Fields
              </label>
              <input
                className={inputClass}
                value={briefFields}
                onChange={(e) => setBriefFields(e.target.value)}
                disabled={!editable}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
              Tagline
            </label>
            <input
              className={inputClass}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              disabled={!editable}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
              Soul
            </label>
            <textarea
              className="w-full min-h-[180px] bg-klawva-bg border border-klawva-border rounded p-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono disabled:opacity-60"
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              disabled={!editable}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={handleSave}
              loading={busyAction === "save"}
              disabled={!editable}
            >
              <Save size={16} />
              Save Draft
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={handleSandbox}
              loading={busyAction === "sandbox"}
              disabled={busyAction !== null}
            >
              <FlaskConical size={16} />
              Run Sandbox
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              loading={busyAction === "submit"}
              disabled={
                detail.status === "published" || busyAction !== null || !canSubmit
              }
            >
              <Send size={16} />
              Submit for Review
            </Button>
          </div>
          {!canSubmit && (
            <p className="font-mono text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3">
              {blockedReason}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {detail.status === "in_review" && (
              <Button
                variant="secondary"
                size="md"
                onClick={handleWithdraw}
                loading={dangerBusy}
              >
                Withdraw from Review
              </Button>
            )}
            {(detail.status === "draft" || detail.status === "rejected") && (
              <Button
                variant="ghost"
                size="md"
                onClick={handleDelete}
                loading={dangerBusy}
                disabled={busyAction !== null}
              >
                Delete Draft
              </Button>
            )}
          </div>
        </div>
      </Card>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
