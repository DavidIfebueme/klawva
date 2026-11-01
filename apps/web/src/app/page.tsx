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
  const employees = await listEmployees();
  const minPriceMinor = employees.reduce(
    (lowest, employee) => Math.min(lowest, employee.priceMinor),
    employees[0]?.priceMinor ?? 0,
  );
  return { employees, minPriceMinor };
};

export function Component() {
  const { employees, minPriceMinor } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-klawva-bg text-klawva-text font-mono selection:bg-klawva-accent selection:text-klawva-bg">
      <Navbar />
      <Hero />
      <AgentGrid employees={employees} />
      <HowItWorks />
      <Pricing minPriceMinor={minPriceMinor} />
      <WhyKlawva />
      <FinalCTA />
      <Footer />
    </main>
  );
}
