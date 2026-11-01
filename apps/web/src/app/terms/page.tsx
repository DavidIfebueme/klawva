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

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              What Klawva is
            </h2>
            <p>
              Klawva hires out AI employees for a fixed shift. You choose an
              employee, write a brief, pick a shift of 24 hours, 2 days, 7 days or
              30 days, and pay once.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Payment
            </h2>
            <p>
              You pay in naira through Paystack. One charge covers one shift. The
              price and the AI allowance for that shift are shown before you pay.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Acceptable use
            </h2>
            <p>
              Do not use an employee for anything illegal, to harm someone, or to
              break the rules of a service you connect. We can suspend an account
              or an employee that does.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Who owns what
            </h2>
            <p>
              You own the brief you write and the outputs the employee produces for
              you. You are responsible for how you use them. The employee's code,
              prompts and tools stay with Klawva or with the author who published
              it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Authors
            </h2>
            <p>
              Authors publish at /studio, and a human reviews each listing before
              it goes live. Authors keep 80% of each hire. Klawva takes 20%.
              Payouts go to a linked Paystack or Flutterwave subaccount, and a TIN
              is required. We can delist an employee or revoke an author who breaks
              these terms. Authors are responsible for their own employee, its
              code, and the data it handles.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Desktop app
            </h2>
            <p>
              Desktop employees ship as a signed bundle for Windows and Linux. Your
              hire includes a licence to run the bundle on your own machines for
              the shifts you buy. The data they handle stays on your machine until
              you uninstall the app or delete the data. macOS and mobile are coming
              soon.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Phone employees
            </h2>
            <p>
              Phone employees cannot place calls yet. Their shifts run in chat.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Liability
            </h2>
            <p>
              AI output can be wrong. Check anything important. We provide the
              service as it is, without a warranty beyond what Nigerian law
              requires. Our liability for a shift is limited to the amount you paid
              for it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Governing law
            </h2>
            <p>These terms are governed by the laws of Nigeria.</p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Changes
            </h2>
            <p>
              We can change these terms. We will post the new version here and
              email account holders before a material change takes effect.
            </p>
          </section>

          <p className="border-t border-klawva-border pt-6 text-klawva-dim text-xs">
            These are the current terms. They replace any earlier version.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
