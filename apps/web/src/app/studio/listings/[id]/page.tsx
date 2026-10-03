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
  getStudioListing,
  runStudioSandbox,
  submitStudioListing,
  updateStudioListing,
} from "@/lib/studio-api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Toast, type ToastState } from "@/components/ui/Toast";
import { FlaskConical, Send, Save, ArrowLeft } from "lucide-react";

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

export function Component() {
  const { session, detail } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [busyAction, setBusyAction] = useState<null | "save" | "sandbox" | "submit">(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [outcome, setOutcome] = useState<{ score: number; band: string } | null>(null);

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
        <Badge variant={statusVariant(detail.status)}>
          {detail.status.replace("_", " ")}
        </Badge>
      </div>

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
              disabled={detail.status === "published" || busyAction !== null}
            >
              <Send size={16} />
              Submit for Review
            </Button>
          </div>
        </div>
      </Card>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
