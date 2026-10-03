import React, { useState } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import { requireSession, rethrowAuth, handleActionAuthError } from "@/lib/studio-loader";
import {
  createStudioListing,
  getStudioListings,
  getStudioMe,
  startAuthorFee,
} from "@/lib/studio-api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import Link from "@/components/ui/AppLink";
import { Plus, ArrowRight, ShieldCheck } from "lucide-react";

const feeMinor = 2000;
const minPriceMinor = 1000;
const maxPriceMinor = 25000;

export const loader = async () => {
  const session = requireSession();
  const [me, listings] = await Promise.all([
    getStudioMe(session.token),
    getStudioListings(session.token),
  ]).catch(rethrowAuth);
  return { session, me, listings };
};

function statusVariant(status: string): "active" | "pending" | "warning" {
  if (status === "published") return "active";
  if (status === "draft") return "pending";
  return "warning";
}

export function Component() {
  const { session, me, listings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState("ops");
  const [priceNaira, setPriceNaira] = useState("30");
  const [budgetMinor, setBudgetMinor] = useState("3000");
  const [briefFields, setBriefFields] = useState("task");
  const [soul, setSoul] = useState("");

  const handlePayFee = async () => {
    setBusy(true);
    setError("");
    try {
      const checkout = await startAuthorFee(session.token);
      window.location.href = checkout.checkoutUrl;
    } catch (err) {
      if (handleActionAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to start payment");
      setBusy(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const priceMinor = Math.round(Number(priceNaira) * 100);
    if (!Number.isFinite(priceMinor) || priceMinor < minPriceMinor || priceMinor > maxPriceMinor) {
      setError(`Price must be between ₦${minPriceMinor / 100} and ₦${maxPriceMinor / 100}`);
      return;
    }
    setBusy(true);
    try {
      const created = await createStudioListing(session.token, {
        slug,
        name,
        tagline,
        category,
        priceMinor,
        budgetMinor: Number(budgetMinor) || 3000,
        briefFields: briefFields
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
        soul,
      });
      navigate(`/studio/listings/${created.id}`);
    } catch (err) {
      if (handleActionAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to create listing");
      setBusy(false);
    }
  };

  const inputClass =
    "w-full h-11 bg-klawva-bg border border-klawva-border rounded px-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono";

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase text-klawva-accent tracking-wider block mb-1">
            Author Studio
          </span>
          <h1 className="font-syne font-bold text-3xl uppercase text-white">
            Your Agents
          </h1>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} />
          New Listing
        </Button>
      </div>

      {error && (
        <p className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 font-mono">
          {error}
        </p>
      )}

      {!me.feePaid && (
        <Card className="border-klawva-accent/40">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-klawva-accent w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-syne font-bold text-lg uppercase text-white">
                  One-time author fee
                </h2>
                <p className="text-xs text-klawva-muted mt-1 max-w-xl">
                  Pay a single ₦{(feeMinor / 100).toFixed(2)} fee to unlock
                  submissions. No KYC. Your first listing can be submitted once
                  the fee clears.
                </p>
              </div>
            </div>
            <Button variant="primary" size="md" onClick={handlePayFee} loading={busy}>
              Pay Author Fee
            </Button>
          </div>
        </Card>
      )}

      {me.feePaid && (
        <div className="flex items-center gap-2 text-xs font-mono text-klawva-muted">
          <ShieldCheck size={14} className="text-klawva-accent" />
          Author fee paid. Submissions unlocked.
        </div>
      )}

      {showForm && (
        <Card>
          <h2 className="font-syne font-bold text-lg uppercase text-white mb-6">
            Create Listing
          </h2>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                  Slug
                </label>
                <input
                  className={inputClass}
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-ops-agent"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                  Name
                </label>
                <input
                  className={inputClass}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ops Agent"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                  Category
                </label>
                <input
                  className={inputClass}
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                  Price (₦ per 24h)
                </label>
                <input
                  className={inputClass}
                  required
                  type="number"
                  min={minPriceMinor / 100}
                  max={maxPriceMinor / 100}
                  step="0.01"
                  value={priceNaira}
                  onChange={(e) => setPriceNaira(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                  AI budget cap
                </label>
                <input
                  className={inputClass}
                  required
                  type="number"
                  min={100}
                  step="50"
                  value={budgetMinor}
                  onChange={(e) => setBudgetMinor(e.target.value)}
                />
                <p className="font-mono text-klawva-dim text-xs mt-1">
                  Internal cap. 50 per message.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Tagline
              </label>
              <input
                className={inputClass}
                required
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Handles your operations end to end"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Brief Fields (comma separated)
              </label>
              <input
                className={inputClass}
                required
                value={briefFields}
                onChange={(e) => setBriefFields(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-klawva-muted mb-2">
                Soul (system prompt)
              </label>
              <textarea
                className="w-full min-h-[140px] bg-klawva-bg border border-klawva-border rounded p-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono"
                required
                value={soul}
                onChange={(e) => setSoul(e.target.value)}
                placeholder="You are a focused operations assistant..."
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" size="md" loading={busy}>
                Create Draft
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-6">
        <h2 className="font-syne font-bold text-lg uppercase text-white tracking-wider border-b border-klawva-border pb-3">
          Listings ({listings.length})
        </h2>
        {listings.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-sm text-klawva-muted">
              No listings yet. Create your first agent to get started.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <Card key={listing.id} hover>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                    {listing.slug}
                  </span>
                  <Badge variant={statusVariant(listing.status)}>
                    {listing.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="font-syne font-bold text-xl text-klawva-text mb-2">
                  {listing.name}
                </div>
                <div className="font-mono text-klawva-accent text-sm mb-4">
                  ₦{(listing.priceMinor / 100).toLocaleString()} per 24h
                </div>
                <Link
                  href={`/studio/listings/${listing.id}`}
                  className="flex items-center gap-1.5 text-xs text-klawva-accent uppercase tracking-wider font-syne font-bold hover:brightness-110"
                >
                  <span>Open</span>
                  <ArrowRight size={14} />
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
