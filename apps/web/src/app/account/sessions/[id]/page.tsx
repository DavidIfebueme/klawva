import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requireAccountSession, rethrowAccountAuth } from "@/lib/account-loader";
import { getAccountSession } from "@/lib/account-api";

const humanize = (value: string): string =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const parseBrief = (raw: string): ReadonlyArray<readonly [string, string]> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, String(value)] as const);
    }
  } catch {
    return [];
  }
  return [];
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const session = requireAccountSession();
  if (params.id === undefined) {
    throw redirect("/account");
  }
  const detail = await getAccountSession(session.token, params.id).catch(
    rethrowAccountAuth,
  );
  return { detail };
};

function statusVariant(state: string): "active" | "pending" | "warning" {
  if (state === "running" || state === "ready") return "active";
  if (state === "ended" || state === "reported") return "pending";
  return "warning";
}

export function Component() {
  const { detail } = useLoaderData<typeof loader>();
  const brief = parseBrief(detail.session.brief);

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
              <p className="font-mono text-klawva-text text-sm leading-relaxed">
                {detail.report.summary}
              </p>
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
                    <p className="font-mono text-klawva-text text-sm whitespace-pre-wrap">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
