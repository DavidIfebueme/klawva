import { CheckCircle2, AlertCircle } from "lucide-react";

export type ToastKind = "success" | "error";

export interface ToastState {
  kind: ToastKind;
  message: string;
}

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const success = toast.kind === "success";
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[min(90vw,22rem)]">
      <div
        className={`flex items-start gap-3 rounded-lg border bg-klawva-surface p-4 shadow-2xl ${
          success ? "border-klawva-accent/40" : "border-klawva-orange/40"
        }`}
      >
        {success ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-klawva-accent" />
        ) : (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-klawva-orange" />
        )}
        <p className="flex-grow font-mono text-xs leading-relaxed text-klawva-text">
          {toast.message}
        </p>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-klawva-dim transition-colors hover:text-klawva-text"
        >
          ×
        </button>
      </div>
    </div>
  );
}
