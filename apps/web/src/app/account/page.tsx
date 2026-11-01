import { useLoaderData } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "@/components/ui/AppLink";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireAccountSession, rethrowAccountAuth } from "@/lib/account-loader";
import {
  listAccountSessions,
  sessionChannelLabel,
  sessionStateLabel,
} from "@/lib/account-api";

export const loader = async () => {
  const session = requireAccountSession();
  const sessions = await listAccountSessions(session.token).catch(rethrowAccountAuth);
  return { session, sessions };
};

function statusVariant(state: string): "active" | "pending" | "warning" {
  if (state === "active" || state === "hibernating" || state === "recovering") {
    return "active";
  }
  if (state === "completed" || state === "pending") return "pending";
  return "warning";
}

const formatShiftWindow = (start: string | null, end: string | null): string => {
  if (start === null || end === null) return "not started yet";
  const time = (value: string): string => {
    const date = new Date(value);
    const month = date.toLocaleString("en-GB", { month: "short" });
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${date.getDate()} ${month} ${hours}:${minutes}`;
  };
  return `runs ${time(start)} to ${time(end)}`;
};

export function Component() {
  const { session, sessions } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-2">
                Your account
              </span>
              <h1 className="font-syne font-bold text-3xl text-klawva-text">
                My employees
              </h1>
            </div>
            <span className="font-mono text-klawva-muted text-sm">{session.email}</span>
          </div>

          {sessions.length === 0 ? (
            <Card className="text-center py-16">
              <p className="font-mono text-klawva-muted mb-6">
                You have not hired anyone yet.
              </p>
              <Link
                href="/employees"
                className="text-xs text-klawva-accent uppercase tracking-wider font-syne font-bold"
              >
                Browse employees
              </Link>
            </Card>
          ) : (
            <div className="space-y-4">
              {sessions.map((entry) => (
                <Link key={entry.id} href={`/account/sessions/${entry.id}`}>
                  <Card hover className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="font-syne font-bold text-lg text-klawva-text">
                        {entry.listingName ?? "Employee"}
                      </div>
                      <div className="font-mono text-klawva-muted text-xs mt-1">
                        {sessionChannelLabel(entry.channel)} ·{" "}
                        {formatShiftWindow(entry.windowStart, entry.windowEnd)}
                      </div>
                    </div>
                    <Badge variant={statusVariant(entry.state)}>
                      {sessionStateLabel(entry.state)}
                    </Badge>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
