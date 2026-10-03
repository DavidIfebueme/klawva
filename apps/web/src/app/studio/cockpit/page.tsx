import { useState } from "react";
import { redirect, useLoaderData, useRevalidator } from "react-router-dom";
import { getStudioSession } from "@/lib/studio-session";
import {
  approveListing,
  getAdminAudit,
  getAdminOverview,
  getAdminReviews,
  rejectListing,
} from "@/lib/cockpit-api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Check, X, ShieldAlert } from "lucide-react";

export const loader = async () => {
  const session = getStudioSession();
  if (session === null) {
    throw redirect("/studio/login");
  }
  if (!session.admin) {
    return { session, admin: false as const, overview: null, reviews: [], audit: [] };
  }
  const [overview, reviews, audit] = await Promise.all([
    getAdminOverview(session.token),
    getAdminReviews(session.token),
    getAdminAudit(session.token),
  ]);
  return { session, admin: true as const, overview, reviews, audit };
};

export default function CockpitPage() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!data.admin) {
    return (
      <Card className="text-center py-16">
        <ShieldAlert className="text-klawva-orange w-10 h-10 mx-auto mb-4" />
        <h1 className="font-syne font-bold text-xl uppercase text-white">
          Admins Only
        </h1>
        <p className="text-xs text-klawva-muted mt-2">
          This cockpit is restricted to the operator.
        </p>
      </Card>
    );
  }

  const { session, overview, reviews, audit } = data;

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await action();
      revalidator.revalidate();
      setReasonFor(null);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const stat = (label: string, value: number) => (
    <Card key={label}>
      <div className="text-xs font-mono uppercase tracking-wider text-klawva-muted mb-2">
        {label}
      </div>
      <div className="font-syne font-extrabold text-3xl text-klawva-accent">
        {value}
      </div>
    </Card>
  );

  return (
    <div className="space-y-10">
      <div>
        <span className="text-xs font-mono uppercase text-klawva-accent tracking-wider block mb-1">
          Operator Cockpit
        </span>
        <h1 className="font-syne font-bold text-3xl uppercase text-white">
          Marketplace Control
        </h1>
      </div>

      {error && (
        <p className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 font-mono">
          {error}
        </p>
      )}

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stat("Users", overview.users)}
          {stat("Authors", overview.authors)}
          {stat("Sessions", overview.sessions)}
          {stat("Pending Reviews", overview.pendingReviews)}
        </div>
      )}

      {overview && overview.listingsByStatus.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {overview.listingsByStatus.map((entry) => (
            <span
              key={entry.status}
              className="text-xs font-mono uppercase tracking-wider text-klawva-muted border border-klawva-border rounded-full px-3 py-1"
            >
              {entry.status}: {entry.count}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-6">
        <h2 className="font-syne font-bold text-lg uppercase text-white tracking-wider border-b border-klawva-border pb-3">
          Review Queue ({reviews.length})
        </h2>
        {reviews.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-sm text-klawva-muted">No listings awaiting review.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {reviews.map((item) => (
              <Card key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-1">
                      {item.slug}
                    </div>
                    <div className="font-syne font-bold text-xl text-klawva-text">
                      {item.name}
                    </div>
                    <div className="text-xs text-klawva-muted mt-1 font-mono">
                      {item.ownerEmail ?? item.ownerId} · ₦
                      {(item.priceMinor / 100).toLocaleString()} · score{" "}
                      {item.score ?? "—"}
                    </div>
                    {item.soul && (
                      <p className="text-xs text-klawva-muted mt-3 max-w-2xl whitespace-pre-wrap border-l-2 border-klawva-border pl-3">
                        {item.soul}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busyId === item.id}
                      onClick={() => run(item.id, () => approveListing(session.token, item.id))}
                    >
                      <Check size={14} />
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setReasonFor(reasonFor === item.id ? null : item.id)
                      }
                    >
                      <X size={14} />
                      Reject
                    </Button>
                  </div>
                </div>
                {reasonFor === item.id && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <input
                      className="flex-grow h-10 bg-klawva-bg border border-klawva-border rounded px-3 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none font-mono"
                      placeholder="Reason for rejection"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busyId === item.id}
                      onClick={() =>
                        run(item.id, () => rejectListing(session.token, item.id, reason))
                      }
                    >
                      Confirm Reject
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h2 className="font-syne font-bold text-lg uppercase text-white tracking-wider border-b border-klawva-border pb-3">
          Audit Log
        </h2>
        {audit.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-sm text-klawva-muted">No decisions recorded yet.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-klawva-muted uppercase tracking-wider text-left border-b border-klawva-border">
                  <th className="py-3 pr-4">When</th>
                  <th className="py-3 pr-4">Actor</th>
                  <th className="py-3 pr-4">Action</th>
                  <th className="py-3 pr-4">Target</th>
                  <th className="py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id} className="border-b border-klawva-border/50">
                    <td className="py-3 pr-4 text-klawva-muted whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-klawva-text">{entry.actorEmail}</td>
                    <td className="py-3 pr-4 text-klawva-accent">{entry.action}</td>
                    <td className="py-3 pr-4 text-klawva-muted">{entry.targetId}</td>
                    <td className="py-3 text-klawva-muted">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
