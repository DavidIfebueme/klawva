import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useStudioAuth } from "@/components/studio-auth-provider";
import {
  getStudioListing,
  runStudioSandbox,
  submitStudioListing,
  updateStudioListing,
  startAuthorFee,
  type StudioListingDetail,
} from "@/lib/studio-api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Loader2, FlaskConical, Send, Save, ArrowLeft } from "lucide-react";

function parseBriefFields(raw: string | undefined): string {
  if (raw === undefined) return "";
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

export default function StudioListingPage() {
  const { session } = useStudioAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<StudioListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<{ score: number; band: string } | null>(null);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [briefFields, setBriefFields] = useState("");
  const [soul, setSoul] = useState("");

  useEffect(() => {
    if (session === null || id === undefined) return;
    const token = session.token;
    async function load() {
      try {
        const detail = await getStudioListing(token, id as string);
        setListing(detail);
        setName(detail.name);
        setTagline(detail.tagline);
        setCategory(detail.category);
        setPriceNaira(String(detail.priceMinor / 100));
        setBriefFields(parseBriefFields(detail.briefFields));
        setSoul(detail.soul ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load listing");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [session, id]);

  if (session === null) {
    return <Navigate to="/studio/login" replace />;
  }

  const editable =
    listing !== null && (listing.status === "draft" || listing.status === "rejected");

  const handleSave = async () => {
    if (id === undefined) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await updateStudioListing(session.token, id, {
        name,
        tagline,
        category,
        priceMinor: Math.round(Number(priceNaira) * 100),
        briefFields: briefFields
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
        soul,
      });
      setNotice("Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const handleSandbox = async () => {
    if (id === undefined) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await runStudioSandbox(session.token, id);
      setOutcome(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sandbox failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (id === undefined) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await submitStudioListing(session.token, id);
      setOutcome({ score: result.score, band: result.band });
      setListing((prev) => (prev ? { ...prev, status: result.status } : prev));
      setNotice(`Submitted. New status: ${result.status.replace("_", " ")}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submit failed";
      setError(message);
      if (message === "FeeRequired") {
        try {
          const checkout = await startAuthorFee(session.token);
          window.location.href = checkout.checkoutUrl;
        } catch (payErr) {
          setError(payErr instanceof Error ? payErr.message : "Fee payment failed");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full h-11 bg-klawva-bg border border-klawva-border rounded px-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono";

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-24 text-xs text-klawva-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading listing...
      </div>
    );
  }

  if (listing === null) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-klawva-orange">{error || "Listing not found."}</p>
        <Button variant="secondary" size="sm" onClick={() => navigate("/studio")}>
          Back to listings
        </Button>
      </div>
    );
  }

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
            {listing.slug}
          </span>
          <h1 className="font-syne font-bold text-3xl uppercase text-white">
            {listing.name}
          </h1>
        </div>
        <Badge variant={statusVariant(listing.status)}>
          {listing.status.replace("_", " ")}
        </Badge>
      </div>

      {error && (
        <p className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 font-mono">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-xs text-klawva-accent bg-klawva-accent/10 border border-klawva-accent/20 rounded p-3 font-mono">
          {notice}
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
                step="0.01"
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
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
              loading={busy}
              disabled={!editable}
            >
              <Save size={16} />
              Save Draft
            </Button>
            <Button variant="secondary" size="md" onClick={handleSandbox} loading={busy}>
              <FlaskConical size={16} />
              Run Sandbox
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              loading={busy}
              disabled={listing.status === "published"}
            >
              <Send size={16} />
              Submit for Review
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
