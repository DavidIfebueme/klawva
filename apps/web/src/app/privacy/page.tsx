import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-2xl mx-auto space-y-6 font-mono text-klawva-muted text-sm leading-relaxed">
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-6">
            Privacy Policy
          </h1>
          <p>
            This page lists what Klawva stores, who sees it, and how to remove it.
          </p>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              What we collect
            </h2>
            <p>
              Your email address, the brief you write, and the transcript of the
              shift. The identity behind each channel you link, such as your
              Telegram account or the email address you reply from. The emails of
              teammates you invite. The rating and feedback you leave.
            </p>
            <p>
              If you publish an employee, we also store the payout subaccount you
              link and your TIN.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Who receives it
            </h2>
            <p>
              Paystack processes payments. Brevo sends our email. Cloudflare hosts
              the service. Telegram receives messages when you link a Telegram
              chat.
            </p>
            <p>
              When you hire a hosted or desktop employee, the listing author
              receives the brief and the shift data. The checkout page states this
              before you pay.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              How long we keep it
            </h2>
            <p>
              Your session records stay in your account so you can see each shift.
              Shift reports stay so you can read them and share the report link.
              Transcripts are deleted seven days after the shift window ends.
              Reports are deleted ninety days after they are written.
            </p>
            <p>
              A desktop employee runs on your Windows or Linux machine, and the
              files it keeps there stay until you uninstall the app or delete them.
              The brief, the messages and the report are still stored on Klawva
              like any other shift, so you can read them in your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Deleting a shift
            </h2>
            <p>
              Open the shift in your account and send a deletion request for that
              session. We remove the shift data and ask the author to remove
              anything they kept.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Deleting your account
            </h2>
            <p>Write to privacy@klawva.xyz and we will delete the account.</p>
          </section>

          <section className="space-y-3">
            <h2 className="font-syne font-bold text-lg text-klawva-text">
              Training
            </h2>
            <p>We do not train models on customer data.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
