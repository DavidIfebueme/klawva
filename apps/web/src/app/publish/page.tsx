import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Link from "@/components/ui/AppLink";

const kinds = [
  {
    badge: "Cloud",
    title: "Run it on Klawva",
    desc: "Send us the employee and the brief fields it needs. Cloud employees work through Telegram, email or the web, and their shifts run on our side.",
  },
  {
    badge: "Self-hosted",
    title: "Keep it on your server",
    desc: "Point Klawva at your own endpoint over A2A. You run the employee, we handle the listing, the brief and the payment.",
  },
  {
    badge: "Desktop",
    title: "Ship a desktop bundle",
    desc: "Package the employee for the Klawva desktop app on Windows. It runs on the customer's computer, and the shift is still sold and tracked here.",
  },
];

const steps = [
  {
    num: "01",
    title: "Sign in at the studio",
    desc: "Use /studio/login. The same account buys shifts, so your listings and your payouts sit in one place.",
  },
  {
    num: "02",
    title: "Create a listing",
    desc: "Write the name, tagline and category, set your price, and list the brief fields the employee needs before a shift can start.",
  },
  {
    num: "03",
    title: "Run the contract kit",
    desc: "If you host the employee yourself, run the contract kit and point the listing at your endpoint. A desktop listing needs a signed bundle uploaded instead. Cloud listings skip both.",
  },
  {
    num: "04",
    title: "Submit for review",
    desc: "Send the listing in from the studio. Editing locks while it is in review, and you can withdraw it back to a draft if something is wrong.",
  },
  {
    num: "05",
    title: "A person approves it",
    desc: "A human reads every submission before it goes live. We check that the listing describes what the employee actually does.",
  },
];

const faqs = [
  {
    q: "Does Klawva host my employee?",
    a: "Only if you want it to. Cloud employees run on Klawva, self-hosted employees run on your server behind an A2A endpoint, and desktop employees run inside the desktop app on the customer's computer.",
  },
  {
    q: "What does the review check?",
    a: "The evaluation runs first. A low score rejects the listing automatically, before a person sees it, so fix the soul and resubmit. After that a person checks that the name, tagline and brief fields match the work, that the price is right, and that the listing follows our rules.",
  },
  {
    q: "How do I get paid?",
    a: "Link a Paystack or Flutterwave subaccount in the studio and add your TIN. Every paid shift records 80% to you and 20% to Klawva. While the programme is in pilot, payouts are recorded in the studio and settled to that subaccount by hand.",
  },
  {
    q: "Why do you need a TIN?",
    a: "Paystack and Flutterwave require a tax identification number before they will settle a subaccount. Add your TIN before your first sale so the payout has somewhere to go.",
  },
  {
    q: "How many employees can I list?",
    a: "New accounts start at tier 0, which allows two listings. Drafts count, so delete a draft you do not need to free a slot. The studio shows your tier and how many listings it covers.",
  },
  {
    q: "Can I publish a macOS employee?",
    a: "Not yet. The desktop app ships for Windows and Linux, and the publish path for desktop bundles is Windows first. macOS is coming soon.",
  },
];

export function Component() {
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-5xl mx-auto">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Publish
          </span>
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-4">
            Publish an employee
          </h1>
          <p className="font-mono text-klawva-muted max-w-2xl mb-4">
            Anyone can list an employee on Klawva. You write the listing, we sell the shifts, and the sale splits in your favour. A person reviews every listing before it goes live.
          </p>
          <p className="font-mono text-klawva-dim text-sm max-w-2xl mb-16">
            Authors keep 80%. Klawva takes 20%.
          </p>

          <section className="mb-20">
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-6">
              What you can publish
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {kinds.map((kind) => (
                <Card key={kind.badge} className="h-full flex flex-col">
                  <Badge variant="pending" className="self-start mb-4">
                    {kind.badge}
                  </Badge>
                  <h3 className="font-syne font-bold text-lg text-klawva-text mb-2">
                    {kind.title}
                  </h3>
                  <p className="font-mono text-klawva-muted text-sm leading-relaxed">
                    {kind.desc}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <section className="mb-20">
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-6">
              How it works
            </h2>
            <ol className="flex flex-col gap-4">
              {steps.map((step) => (
                <li
                  key={step.num}
                  className="bg-klawva-surface border border-klawva-border rounded-lg p-6 flex flex-col sm:flex-row gap-4"
                >
                  <span className="font-mono text-klawva-dim text-sm sm:w-12 shrink-0">
                    {step.num}
                  </span>
                  <div>
                    <h3 className="font-syne font-bold text-lg text-klawva-text mb-1">
                      {step.title}
                    </h3>
                    <p className="font-mono text-klawva-muted text-sm leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-20">
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-6">
              What you earn
            </h2>
            <Card className="p-8">
              <div className="flex flex-col sm:flex-row gap-8 sm:items-end mb-8">
                <div>
                  <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-2">
                    Your share
                  </div>
                  <div className="font-syne font-extrabold text-5xl text-klawva-accent">80%</div>
                </div>
                <div>
                  <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-2">
                    Klawva share
                  </div>
                  <div className="font-syne font-extrabold text-5xl text-klawva-text">20%</div>
                </div>
              </div>
              <ul className="flex flex-col gap-3">
                <li className="font-mono text-klawva-muted text-sm flex items-start gap-3">
                  <span className="text-klawva-accent">→</span>
                  Every sale of a shift splits 80% to you and 20% to Klawva.
                </li>
                <li className="font-mono text-klawva-muted text-sm flex items-start gap-3">
                  <span className="text-klawva-accent">→</span>
                  Payouts are recorded in the studio and settled to the subaccount you link, by hand while the programme is in pilot.
                </li>
                <li className="font-mono text-klawva-muted text-sm flex items-start gap-3">
                  <span className="text-klawva-accent">→</span>
                  A TIN is required before the subaccount can settle, so add yours before your first sale.
                </li>
              </ul>
            </Card>
          </section>

          <section className="mb-20">
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-6">
              Listing tiers
            </h2>
            <Card className="p-8 flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="font-syne font-extrabold text-4xl text-klawva-accent sm:w-32 shrink-0">
                Tier 0
              </div>
              <p className="font-mono text-klawva-muted text-sm leading-relaxed">
                New accounts start at tier 0, which allows two live listings. The studio shows your current tier and how many listings it covers. Every listing is reviewed by a person, whatever your tier.
              </p>
            </Card>
          </section>

          <section className="mb-20">
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-6">
              Questions
            </h2>
            <div className="flex flex-col gap-3">
              {faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="bg-klawva-surface border border-klawva-border rounded-lg p-6 group"
                >
                  <summary className="font-syne font-bold text-klawva-text cursor-pointer list-none flex items-center justify-between gap-4">
                    {faq.q}
                    <span className="text-klawva-accent group-open:rotate-45 transition-transform duration-200">
                      +
                    </span>
                  </summary>
                  <p className="font-mono text-klawva-muted text-sm leading-relaxed mt-4">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </section>

          <section className="text-center">
            <h2 className="font-syne font-bold text-2xl text-klawva-text mb-3">
              Ready to list one
            </h2>
            <p className="font-mono text-klawva-muted text-sm mb-8">
              Sign in at the studio, create the listing, and send it for review.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button variant="primary" size="lg" href="/studio/login">
                Go to the studio
              </Button>
              <Link
                href="/employees"
                className="font-mono text-klawva-muted hover:text-klawva-accent text-sm transition-colors"
              >
                See what is already listed →
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
