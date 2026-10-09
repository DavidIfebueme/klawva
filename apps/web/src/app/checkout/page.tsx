import React, { useRef, useState } from "react";
import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api-error";
import { getStudioSession } from "@/lib/studio-session";
import { agents, type AgentId, type BriefField } from "@/lib/agents";
import {
  createHireSession,
  getEmployee,
  initializeHirePayment,
  type EmployeeDetail,
} from "@/lib/employees-api";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const maxUploadBytes = 10 * 1024 * 1024;

const extractPdfText = async (buffer: ArrayBuffer): Promise<string> => {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const parts: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    parts.push(
      content.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .join(" "),
    );
  }
  await doc.cleanup();
  return parts.join("\n");
};

const extractFileText = async (file: File): Promise<string> => {
  const lower = file.name.toLowerCase();
  if (file.size > maxUploadBytes) {
    throw new Error("That file is over 10MB. Try a smaller one.");
  }
  const buffer = await file.arrayBuffer();
  if (lower.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }
  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }
  throw new Error("Upload a .pdf or .docx file.");
};

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

const isAgentId = (value: string): value is AgentId => value in agents;

const fieldsFor = (employee: EmployeeDetail): ReadonlyArray<BriefField> => {
  if (isAgentId(employee.slug)) {
    return agents[employee.slug].briefFields;
  }
  return parseFields(employee.briefFields).map((name) => ({
    id: name,
    label: humanize(name),
    placeholder: "",
    type: "textarea",
    required: true,
  }));
};

const channels = [
  {
    id: "telegram",
    label: "Telegram",
    blurb: "Chat with a bot. Fastest for back and forth.",
  },
  {
    id: "web",
    label: "Web",
    blurb: "Chat in the browser on this site.",
  },
  {
    id: "email",
    label: "Email",
    blurb: "Reply to an address. Best for long briefs.",
  },
] as const;

type ChannelChoice = (typeof channels)[number]["id"];

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get("agent");
  if (slug === null) {
    throw redirect("/employees");
  }
  const employee = await getEmployee(slug).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) {
      throw redirect("/employees");
    }
    throw error;
  });
  return { employee };
};

export function Component() {
  const { employee } = useLoaderData<typeof loader>();
  const fields = fieldsFor(employee);
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [email, setEmail] = useState(() => getStudioSession()?.email ?? "");
  const [channel, setChannel] = useState<ChannelChoice>("telegram");
  const [durationDays, setDurationDays] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [fileBusy, setFileBusy] = useState<Record<string, boolean>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const fileSelection = useRef<Record<string, number>>({});

  const handleFile = (fieldId: string) => async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    const selection = (fileSelection.current[fieldId] ?? 0) + 1;
    fileSelection.current[fieldId] = selection;
    setFileBusy((prev) => ({ ...prev, [fieldId]: true }));
    setFileErrors((prev) => ({ ...prev, [fieldId]: "" }));
    setBrief((prev) => ({ ...prev, [fieldId]: "" }));
    setFileNames((prev) => ({ ...prev, [fieldId]: "" }));
    try {
      const text = (await extractFileText(file)).trim();
      if (text.length === 0) {
        throw new Error("No readable text found in that file.");
      }
      if (fileSelection.current[fieldId] !== selection) {
        return;
      }
      setBrief((prev) => ({ ...prev, [fieldId]: text }));
      setFileNames((prev) => ({ ...prev, [fieldId]: file.name }));
    } catch (cause) {
      if (fileSelection.current[fieldId] !== selection) {
        return;
      }
      setFileErrors((prev) => ({
        ...prev,
        [fieldId]:
          cause instanceof Error ? cause.message : "Could not read that file.",
      }));
    } finally {
      if (fileSelection.current[fieldId] === selection) {
        setFileBusy((prev) => ({ ...prev, [fieldId]: false }));
      }
    }
  };

  const selected =
    employee.durations.find((option) => option.days === durationDays) ??
    employee.durations[0];
  const totalMinor = selected?.priceMinor ?? employee.priceMinor;
  const budgetMinor = employee.budgetMinor * durationDays;

  const emailOk = emailPattern.test(email.trim());
  const showEmailError = email.trim().length > 0 && !emailOk;

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.values(fileBusy).some(Boolean)) {
      setError("Still reading your file. Give it a second and try again.");
      return;
    }
    const missing = fields.filter(
      (field) => field.required && !(brief[field.id] ?? "").trim(),
    );
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((field) => field.label).join(", ")}`);
      setTouched((prev) => {
        const next = { ...prev };
        for (const field of missing) next[field.id] = true;
        return next;
      });
      return;
    }
    if (!emailOk) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await createHireSession({
        listingId: employee.id,
        agentId: employee.slug,
        channel,
        brief: Object.fromEntries(
          fields.map((field) => [field.id, (brief[field.id] ?? "").trim()]),
        ),
        customerEmail: email.trim(),
        durationDays,
      });
      const payment = await initializeHirePayment(
        session.id,
        session.sessionToken,
        email.trim(),
      );
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
    "w-full bg-klawva-surface border border-klawva-border rounded p-4 font-mono text-klawva-text text-sm placeholder-klawva-dim focus:outline-none focus:border-klawva-accent transition-colors";

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
              Hand over what you need done. You can talk to it after payment.
            </p>

            <form onSubmit={handlePay} className="flex flex-col gap-8">
              {fields.map((field) => {
                const value = brief[field.id] ?? "";
                const showError =
                  field.required && touched[field.id] === true && value.trim().length === 0;
                const borderClass = showError ? "border-klawva-orange" : "";
                const set = (next: string) =>
                  setBrief((prev) => ({ ...prev, [field.id]: next }));
                const blur = () => setTouched((prev) => ({ ...prev, [field.id]: true }));
                return (
                  <div key={field.id} className="flex flex-col gap-2">
                    <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                      {field.label}
                      {!field.required && (
                        <span className="text-klawva-dim normal-case"> (optional)</span>
                      )}
                    </label>
                    {field.type === "select" ? (
                      <select
                        className={inputClass}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        onBlur={blur}
                      >
                        <option value="">Select…</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "text" || field.type === "tel" ? (
                      <input
                        type={field.type === "tel" ? "tel" : "text"}
                        className={`${inputClass} ${borderClass}`}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        onBlur={blur}
                      />
                    ) : field.type === "file" ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="file"
                          accept=".pdf,.docx"
                          className={`${inputClass} ${borderClass} file:mr-4 file:rounded file:border-0 file:bg-klawva-elevated file:px-4 file:py-2 file:font-mono file:text-sm file:text-klawva-text`}
                          onChange={handleFile(field.id)}
                          onBlur={blur}
                        />
                        {fileBusy[field.id] === true && (
                          <p className="font-mono text-klawva-dim text-xs">
                            Reading the file…
                          </p>
                        )}
                        {fileNames[field.id] !== undefined &&
                          fileNames[field.id].length > 0 && (
                            <p className="font-mono text-klawva-dim text-xs">
                              {fileNames[field.id]} · {value.length.toLocaleString()} characters extracted
                            </p>
                          )}
                        {fileErrors[field.id] !== undefined &&
                          fileErrors[field.id].length > 0 && (
                            <p className="font-mono text-klawva-orange text-xs">
                              {fileErrors[field.id]}
                            </p>
                          )}
                      </div>
                    ) : (
                      <textarea
                        className={`${inputClass} min-h-[110px] resize-y ${borderClass}`}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        onBlur={blur}
                      />
                    )}
                    {field.hint && (
                      <p className="font-mono text-klawva-dim text-xs">{field.hint}</p>
                    )}
                    {showError && (
                      <p className="font-mono text-klawva-orange text-xs">This is required.</p>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-col gap-2">
                <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                  Email address
                </label>
                <input
                  type="email"
                  className={`${inputClass} ${showEmailError ? "border-klawva-orange" : ""}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                {showEmailError ? (
                  <p className="font-mono text-klawva-orange text-xs">
                    Enter a valid email address.
                  </p>
                ) : (
                  <p className="font-mono text-klawva-dim text-xs">
                    For shift updates, the report, and your account.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                  How long should the shift run?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {employee.durations.map((option) => (
                    <button
                      type="button"
                      key={option.days}
                      onClick={() => setDurationDays(option.days)}
                      className={`text-left border rounded p-3 transition-colors ${
                        durationDays === option.days
                          ? "border-klawva-accent bg-klawva-accent/5"
                          : "border-klawva-border hover:border-klawva-muted"
                      }`}
                    >
                      <div className="font-syne font-bold text-sm text-klawva-text">
                        {option.days === 1 ? "24 hours" : `${option.days} days`}
                      </div>
                      <div className="font-mono text-klawva-text text-xs mt-1">
                        ₦{(option.priceMinor / 100).toLocaleString()}
                      </div>
                      <div className="font-mono text-klawva-dim text-xs">
                        ₦{Math.round(option.priceMinor / 100 / option.days).toLocaleString()} per day
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="font-mono text-klawva-muted text-xs uppercase tracking-wider">
                  How should it reach you?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {channels.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      onClick={() => setChannel(option.id)}
                      className={`text-left border rounded p-3 transition-colors ${
                        channel === option.id
                          ? "border-klawva-accent bg-klawva-accent/5"
                          : "border-klawva-border hover:border-klawva-muted"
                      }`}
                    >
                      <div className="font-syne font-bold text-sm text-klawva-text">
                        {option.label}
                      </div>
                      <div className="font-mono text-klawva-dim text-xs mt-1">
                        {option.blurb}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="font-mono text-klawva-dim text-xs">
                  You can link another channel from the launch page after payment.
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-klawva-border">
                <div>
                  <span className="font-syne font-extrabold text-2xl text-klawva-accent">
                    ₦{(totalMinor / 100).toLocaleString()}
                  </span>
                  <p className="font-mono text-klawva-dim text-xs mt-1">
                    {durationDays === 1
                      ? "24-hour shift"
                      : `${durationDays}-day shift`}
                    . AI budget cap: {budgetMinor} credits, about{" "}
                    {Math.floor(budgetMinor / 50)} replies. 50 credits per reply.
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
