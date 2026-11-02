import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "@/components/ui/AppLink";
import { useLoaderData } from "react-router-dom";
import { formatPrice, useDisplay } from "@/lib/display";
import { listEmployees } from "@/lib/employees-api";

const shifts = ["24 hours", "2 days", "7 days", "30 days"];

export const loader = async () => {
  const employees = await listEmployees().catch(() => []);
  const prices = employees.map((employee) => employee.priceMinor);
  return {
    minPriceMinor: prices.length === 0 ? null : Math.min(...prices),
    maxPriceMinor: prices.length === 0 ? null : Math.max(...prices),
  };
};

export function Component() {
  const { minPriceMinor, maxPriceMinor } = useLoaderData<typeof loader>();
  const display = useDisplay();
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
            One Paystack charge for the shift you choose. No subscription and no
            per-message fee. The AI allowance is included for the whole shift.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {shifts.map((shift) => (
              <Card key={shift} className="text-center">
                <div className="font-syne font-extrabold text-2xl text-klawva-accent mb-2">
                  {shift}
                </div>
                <p className="font-mono text-klawva-dim text-xs">
                  one charge, AI allowance included
                </p>
              </Card>
            ))}
          </div>
          <p className="font-mono text-klawva-muted text-sm max-w-2xl mb-12">
            Longer shifts cost less per day.{" "}
            {minPriceMinor === null || maxPriceMinor === null
              ? "Each employee shows its exact price for every duration before you pay."
              : `Catalogue prices run from ${formatPrice(minPriceMinor, display)} to ${formatPrice(maxPriceMinor, display)} per shift, and each employee shows its exact price for every duration before you pay.`}
          </p>
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
