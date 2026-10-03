import React, { useState } from "react";
import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import {
  createHireSession,
  getEmployee,
  initializeHirePayment,
} from "@/lib/employees-api";

const humanize = (value: string): string =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const parseFields = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string");
    }
  } catch {
    return [];
  }
  return [];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get("agent");
  if (slug === null) {
    throw redirect("/employees");
  }
  return { employee: await getEmployee(slug) };
};

export function Component() {
  const { employee } = useLoaderData<typeof loader>();
  const fields = parseFields(employee.briefFields);
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = fields.filter((field) => !(brief[field] ?? "").trim());
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map(humanize).join(", ")}`);
      return;
    }
    if (!email.trim()) {
      setError("Please provide your email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await createHireSession({
        listingId: employee.id,
        agentId: employee.slug,
        channel: "telegram",
        brief,
        customerEmail: email.trim(),
      });
      const payment = await initializeHirePayment(session.id, email.trim());
      if (payment.checkoutUrl) {
        window.location.href = payment.checkoutUrl;
      } else {
        setError("Payment could not be started.");
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full bg-klawva-surface border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm focus:outline-none focus:border-klawva-accent transition-colors";

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-klawva-surface border border-klawva-border rounded-lg p-8 md:p-12">
            <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
              Hire {employee.name}
            </span>
            <h1 className="font-syne font-bold text-3xl text-klawva-text mb-2">
              The brief
            </h1>
            <p className="font-mono text-klawva-muted text-sm mb-10">
              Hand over what you need done. You will talk to it on Telegram after
              payment.
            </p>

            <form onSubmit={handlePay} className="flex flex-col gap-8">
              {fields.map((field) => (
                <div key={field} className="flex flex-col gap-2">
                  <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                    {humanize(field)}
                  </label>
                  <textarea
                    className={`${inputClass} min-h-[110px] resize-y`}
                    value={brief[field] ?? ""}
                    onChange={(e) => setBrief({ ...brief, [field]: e.target.value })}
                  />
                </div>
              ))}

              <div className="flex flex-col gap-2">
                <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email for shift updates and reports"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-klawva-border">
                <div>
                  <span className="font-syne font-extrabold text-2xl text-klawva-accent">
                    ₦{(employee.priceMinor / 100).toLocaleString()}
                  </span>
                  <p className="font-mono text-klawva-dim text-xs mt-1">
                    AI budget cap: {employee.budgetMinor}
                  </p>
                </div>
                <Button type="submit" variant="primary" size="lg" loading={loading}>
                  Pay and launch →
                </Button>
              </div>

              {error && (
                <div className="border border-klawva-orange rounded p-3 font-mono text-klawva-orange text-xs">
                  {error}
                </div>
              )}
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
