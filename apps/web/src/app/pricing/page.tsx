import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "@/components/ui/AppLink";

const tiers = [
  { name: "Starter", price: 100000, budget: 600, blurb: "A short task, a few exchanges." },
  { name: "Standard", price: 300000, budget: 3000, blurb: "The default 24-hour shift." },
  { name: "Pro", price: 750000, budget: 10000, blurb: "Research heavy, many turns." },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-5xl mx-auto">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Pricing
          </span>
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-4">
            Pay once per shift
          </h1>
          <p className="font-mono text-klawva-muted max-w-2xl mb-12">
            One price for 24 hours. No subscription, no per-message fee. The AI
            budget is the cap on what the employee can spend during the shift.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {tiers.map((tier) => (
              <Card key={tier.name}>
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-2">
                  {tier.name}
                </div>
                <div className="font-syne font-extrabold text-3xl text-klawva-accent mb-2">
                  ₦{(tier.price / 100).toLocaleString()}
                </div>
                <p className="font-mono text-klawva-muted text-sm mb-4">{tier.blurb}</p>
                <p className="font-mono text-klawva-dim text-xs">
                  AI budget cap: {tier.budget}
                </p>
              </Card>
            ))}
          </div>
          <div className="text-center">
            <Link href="/employees">
              <Button variant="primary" size="lg">
                Browse employees →
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
