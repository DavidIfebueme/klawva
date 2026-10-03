import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-2xl mx-auto space-y-6 font-mono text-klawva-muted text-sm leading-relaxed">
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-6">
            Terms of Service
          </h1>
          <p>
            Klawva provides an AI employee for a fixed window, usually 24 hours.
            You pay for the window, not for a message count. The AI budget caps the
            spend for the shift.
          </p>
          <p>
            You are responsible for the brief you provide and for how you use the
            employee. Do not use it for anything illegal or harmful. We may suspend
            an account or an employee that breaks this rule.
          </p>
          <p>
            A shift that never starts can be refunded within the window. We handle
            refunds by hand in this early period. Ask at support@klawva.xyz.
          </p>
          <p>
            Authors publish employees and earn a share of each hire as platform
            credit. Payouts to a bank account are not offered yet.
          </p>
          <p>
            AI output can be wrong. Check important results. The service is
            provided as is, without warranty beyond what the law requires.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
