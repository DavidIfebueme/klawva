import { useState, type FormEvent } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { getStudioSession } from "@/lib/studio-session";

const approveCode = async (
  token: string,
  code: string,
  name: string,
): Promise<{ ok: boolean }> => {
  const response = await fetch("/api/devices/codes", {
    method: "POST",
    headers: { "x-auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  if (!response.ok) {
    throw new Error(`approve failed with ${response.status}`);
  }
  return (await response.json()) as { ok: boolean };
};

export function Component() {
  const session = getStudioSession();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (session === null) {
      setError("sign in first, then come back to this page.");
      return;
    }
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) {
      setError("enter the code the app is showing you.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await approveCode(session.token, trimmed, name.trim() || "this computer");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "approve failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-md mx-auto">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Pair a device
          </span>
          {done ? (
            <>
              <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
                Paired. Go back to the app.
              </h1>
              <p className="font-mono text-klawva-muted text-sm">
                the app picks up the pairing within a few seconds and loads your
                desktop employees.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
                Enter the code from the app
              </h1>
              <p className="font-mono text-klawva-muted text-sm mb-8">
                the klawva desktop app shows a code like XXXX-XXXX. type it
                here to link that computer to your account.
              </p>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="XXXX-XXXX"
                  autoComplete="off"
                  className="bg-klawva-surface border border-klawva-border rounded px-4 py-3 font-mono text-klawva-text text-lg tracking-widest text-center uppercase"
                />
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="name this computer (optional)"
                  autoComplete="off"
                  className="bg-klawva-surface border border-klawva-border rounded px-4 py-3 font-mono text-klawva-text text-sm"
                />
                {error.length > 0 && (
                  <p className="font-mono text-red-400 text-xs">{error}</p>
                )}
                <Button variant="primary" size="lg" disabled={loading}>
                  {loading ? "pairing…" : "pair this device"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
