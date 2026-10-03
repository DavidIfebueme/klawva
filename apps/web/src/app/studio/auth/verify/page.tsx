import React, { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { verifyStudioLink } from "@/lib/studio-api";
import { useStudioAuth } from "@/components/studio-auth-provider";
import { Button } from "@/components/ui/Button";
import { Loader2, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

function VerifyTokenComponent() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { login } = useStudioAuth();
  const [error, setError] = useState("");
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    async function verify() {
      if (!token) {
        setError("Verification token is missing.");
        return;
      }
      try {
        const data = await verifyStudioLink(token);
        login(data.sessionToken, data.email, data.admin);
      } catch (err: unknown) {
        console.error(err);
        setError(
          (err instanceof Error ? err.message : String(err)) ||
            "Verification link is invalid or has expired.",
        );
      }
    }

    verify();
  }, [token, login]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md bg-klawva-surface border border-klawva-border p-8 rounded-lg text-center"
    >
      {error ? (
        <div className="space-y-6">
          <div className="flex justify-center">
            <AlertCircle className="text-klawva-orange w-12 h-12 stroke-[1.5]" />
          </div>
          <h2 className="font-syne text-lg font-bold text-white uppercase">
            Authentication Error
          </h2>
          <p className="text-sm text-klawva-muted font-mono bg-klawva-orange/5 border border-klawva-orange/10 p-3 rounded text-left">
            {error}
          </p>
          <Button variant="primary" size="md" href="/studio/login" className="w-full">
            Back to Login
          </Button>
        </div>
      ) : (
        <div className="space-y-6 py-6">
          <div className="flex justify-center">
            <Loader2 className="text-klawva-accent w-12 h-12 animate-spin stroke-[1.5]" />
          </div>
          <h2 className="font-syne text-lg font-bold text-white uppercase">
            Verifying Token
          </h2>
          <p className="text-xs text-klawva-muted">
            Securing your studio session. Please do not close this window.
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default function StudioVerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-klawva-bg px-4">
      <Suspense
        fallback={
          <div className="text-center space-y-4">
            <Loader2 className="text-klawva-accent w-8 h-8 animate-spin mx-auto" />
            <p className="text-xs text-klawva-muted">Loading verify engine...</p>
          </div>
        }
      >
        <VerifyTokenComponent />
      </Suspense>
    </div>
  );
}
