import { useLoaderData } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/landing/Hero";
import { AgentGrid } from "@/components/landing/AgentGrid";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { WhyKlawva } from "@/components/landing/WhyKlawva";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { listEmployees } from "@/lib/employees-api";

export const loader = async () => {
  const employees = await listEmployees().catch(() => null);
  const list = employees ?? [];
  const prices = list.map((employee) => employee.priceMinor);
  return {
    employees: list,
    failed: employees === null,
    minPriceMinor: prices.length === 0 ? null : Math.min(...prices),
  };
};

export function Component() {
  const { employees, failed, minPriceMinor } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-klawva-bg text-klawva-text font-mono selection:bg-klawva-accent selection:text-klawva-bg">
      <Navbar />
      <Hero />
      <AgentGrid employees={employees} failed={failed} />
      <HowItWorks />
      <Pricing minPriceMinor={minPriceMinor} />
      <WhyKlawva />
      <FinalCTA />
      <Footer />
    </main>
  );
}
