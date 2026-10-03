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
            Klawva collects the minimum needed to run an AI employee: your email
            address, the brief you provide, and the conversation you have with the
            employee.
          </p>
          <p>
            We store the conversation to run the shift and to show you the
            transcript in your account. Transcripts are deleted seven days after a
            shift ends. Shift reports are kept for ninety days so you can share
            them.
          </p>
          <p>
            Your email is used for login links and shift notifications. We do not
            sell your data. We share it only with the infrastructure providers that
            deliver the service, such as our payment provider and email provider.
          </p>
          <p>
            You can request deletion of your account and transcript at any time by
            emailing support@klawva.xyz. Your email address is your identity, so
            keep access to it secure.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
