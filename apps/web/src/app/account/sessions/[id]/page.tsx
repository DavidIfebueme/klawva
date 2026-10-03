import React, { useState } from "react";
import {
  redirect,
  useLoaderData,
  useRevalidator,
  type LoaderFunctionArgs,
} from "react-router-dom";
import * as Schema from "effect/Schema";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requireAccountSession, rethrowAccountAuth } from "@/lib/account-loader";
import { addMember, getAccountSession, listMembers, submitFeedback } from "@/lib/account-api";
import { Markdown } from "@/components/ui/Markdown";

const humanize = (value: string): string =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const briefSchema = Schema.Record(Schema.String, Schema.Unknown);

const parseBrief = (raw: string): ReadonlyArray<readonly [string, string]> => {
  const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(briefSchema))(raw);
  if (parsed._tag === "None") {
    return [];
  }
  return Object.entries(parsed.value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]): readonly [string, string] => [key, value]);
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const session = requireAccountSession();
  if (params.id === undefined) {
    throw redirect("/account");
  }
  const detail = await getAccountSession(session.token, params.id).catch(
    rethrowAccountAuth,
  );
  const members = await listMembers(session.token, params.id).catch(() => []);
  return { session, detail, members };
};

function statusVariant(state: string): "active" | "pending" | "warning" {
  if (state === "active" || state === "ready") return "active";
  if (state === "completed") return "pending";
  return "warning";
}

export function Component() {
  const { session, detail, members } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const brief = parseBrief(detail.session.brief);
  const [rating, setRating] = useState(5);
  const [report, setReport] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState("");

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = memberEmail.trim();
    if (email.length === 0) return;
    setMemberBusy(true);
    setMemberError("");
    try {
      await addMember(session.token, detail.session.id, email);
      setMemberEmail("");
      revalidator.revalidate();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Could not add teammate.");
    } finally {
      setMemberBusy(false);
    }
  };

  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackBusy(true);
    setFeedbackError("");
    try {
      await submitFeedback(
        session.token,
        detail.session.id,
        rating,
        report.trim() || undefined,
      );
      setFeedbackSent(true);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Could not save feedback.");
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider block mb-1">
                {detail.session.channel}
              </span>
              <h1 className="font-syne font-bold text-3xl text-klawva-text">
                {detail.session.listingName ?? "Employee"}
              </h1>
            </div>
            <Badge variant={statusVariant(detail.session.state)}>
              {detail.session.state.replace("_", " ")}
            </Badge>
          </div>

          {detail.report !== null && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                  Shift report
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  href={`/report/${detail.session.id}?shareToken=${detail.report.shareToken}`}
                >
                  Open report
                </Button>
              </div>
              <div className="font-mono text-klawva-text text-sm leading-relaxed">
                <Markdown content={detail.report.summary} />
              </div>
            </Card>
          )}

          <Card>
            <h2 className="font-syne font-bold text-lg uppercase text-white mb-4">
              Brief
            </h2>
            {brief.length === 0 ? (
              <p className="font-mono text-klawva-muted text-sm">No brief recorded.</p>
            ) : (
              <dl className="space-y-3">
                {brief.map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                      {humanize(key)}
                    </dt>
                    <dd className="font-mono text-klawva-text text-sm mt-1 whitespace-pre-wrap">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card>
            <h2 className="font-syne font-bold text-lg uppercase text-white mb-4">
              Transcript
            </h2>
            {detail.transcript.length === 0 ? (
              <p className="font-mono text-klawva-muted text-sm">
                No messages yet.
              </p>
            ) : (
              <div className="space-y-4">
                {detail.transcript.map((entry, index) => (
                  <div key={index}>
                    <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-1">
                      {entry.role}
                    </div>
                    <Markdown content={entry.content} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-syne font-bold text-lg uppercase text-white mb-4">
              Rate this employee
            </h2>
            {feedbackSent ? (
              <p className="font-mono text-klawva-accent text-sm">
                Thanks. Your feedback is recorded.
              </p>
            ) : (
              <form onSubmit={handleFeedback} className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                    Rating
                  </label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="bg-klawva-bg border border-klawva-border rounded px-3 py-1 text-sm font-mono text-klawva-text focus:outline-none focus:border-klawva-accent"
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value} / 5
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="w-full min-h-[90px] bg-klawva-bg border border-klawva-border rounded p-3 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none font-mono"
                  placeholder="Report a problem (optional)"
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                />
                {feedbackError && (
                  <p className="text-xs text-klawva-orange font-mono">{feedbackError}</p>
                )}
                <Button type="submit" variant="secondary" size="sm" loading={feedbackBusy}>
                  Submit feedback
                </Button>
              </form>
            )}
          </Card>

          <Card>
            <h2 className="font-syne font-bold text-lg uppercase text-white mb-4">
              Team
            </h2>
            {members.length === 0 ? (
              <p className="font-mono text-klawva-muted text-sm mb-4">
                Only you so far.
              </p>
            ) : (
              <ul className="space-y-2 mb-4">
                {members.map((entry) => (
                  <li key={entry.email} className="font-mono text-klawva-text text-sm">
                    {entry.email} · {entry.role}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleAddMember} className="flex gap-3">
              <input
                className="flex-grow h-10 bg-klawva-bg border border-klawva-border rounded px-3 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none font-mono"
                placeholder="teammate@example.com"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm" loading={memberBusy}>
                Add
              </Button>
            </form>
            {memberError && (
              <p className="text-xs text-klawva-orange font-mono mt-3">{memberError}</p>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
