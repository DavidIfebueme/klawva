import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { verifyStudioLink } from "@/lib/studio-api";
import { setStudioSession } from "@/lib/studio-session";
import { Button } from "@/components/ui/Button";
import { AlertCircle, Loader2 } from "lucide-react";
import { motion } from "motion/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token === null) {
    return { error: "Verification token is missing." };
  }
  try {
    const result = await verifyStudioLink(token);
    setStudioSession({
      token: result.sessionToken,
      email: result.email,
      admin: result.admin,
    });
    return redirect("/studio");
  } catch (err) {
    return {
      error:
        (err instanceof Error ? err.message : String(err)) ||
        "Verification link is invalid or has expired.",
    };
  }
};

export function Component() {
  const data = useLoaderData<typeof loader>();
  const error = "error" in data ? data.error : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-klawva-bg px-4">
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
    </div>
  );
}
