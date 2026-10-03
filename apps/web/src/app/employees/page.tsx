import { useLoaderData } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "@/components/ui/AppLink";
import { listEmployees } from "@/lib/employees-api";

export const loader = async () => ({ employees: await listEmployees() });

export function Component() {
  const { employees } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Klawva Employees
          </span>
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-4">
            Hire an employee
          </h1>
          <p className="font-mono text-klawva-muted max-w-2xl mb-12">
            Every employee here runs a 24-hour shift and works through Telegram.
            Pick one, hand it a brief, and it gets to work.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {employees.map((employee) => (
              <Link
                key={employee.id}
                href={`/hire/${employee.slug}`}
                className="block bg-klawva-surface border border-klawva-border rounded-lg p-6 hover:border-klawva-accent transition-colors"
              >
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-2">
                  {employee.category}
                </div>
                <div className="font-syne font-bold text-xl text-klawva-text mb-2">
                  {employee.name}
                </div>
                <p className="font-mono text-klawva-muted text-sm mb-4">
                  {employee.tagline}
                </p>
                <div className="font-mono text-klawva-accent text-sm">
                  ₦{(employee.priceMinor / 100).toLocaleString()} per 24h
                </div>
              </Link>
            ))}
          </div>
          {employees.length === 0 && (
            <p className="font-mono text-klawva-muted">
              No employees published yet.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
