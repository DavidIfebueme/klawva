import { useState } from "react";
import { useLoaderData } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "@/components/ui/AppLink";
import { Badge } from "@/components/ui/Badge";
import { listEmployees } from "@/lib/employees-api";

export const loader = async () => ({ employees: await listEmployees() });

export function Component() {
  const { employees } = useLoaderData<typeof loader>();
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"featured" | "low" | "high">("featured");

  const categories = Array.from(
    new Set(employees.map((employee) => employee.category)),
  ).sort();

  const visible = employees
    .filter((employee) => category === "all" || employee.category === category)
    .slice()
    .sort((a, b) => {
      if (sort === "low") return a.priceMinor - b.priceMinor;
      if (sort === "high") return b.priceMinor - a.priceMinor;
      const aFeatured = a.ownerId === "system" ? 0 : 1;
      const bFeatured = b.ownerId === "system" ? 0 : 1;
      return aFeatured - bFeatured || a.name.localeCompare(b.name);
    });

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
          <p className="font-mono text-klawva-muted max-w-2xl mb-10">
            Every employee here runs a 24-hour shift and works through Telegram,
            email, or the browser. Pick one, hand it a brief, and it gets to work.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-10">
            <button
              onClick={() => setCategory("all")}
              className={`text-xs font-mono uppercase tracking-wider px-3 py-1 rounded-full border transition-colors ${
                category === "all"
                  ? "border-klawva-accent text-klawva-accent"
                  : "border-klawva-border text-klawva-muted hover:text-klawva-text"
              }`}
            >
              All
            </button>
            {categories.map((entry) => (
              <button
                key={entry}
                onClick={() => setCategory(entry)}
                className={`text-xs font-mono uppercase tracking-wider px-3 py-1 rounded-full border transition-colors ${
                  category === entry
                    ? "border-klawva-accent text-klawva-accent"
                    : "border-klawva-border text-klawva-muted hover:text-klawva-text"
                }`}
              >
                {entry}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-klawva-dim">
                Sort
              </span>
              <select
                value={sort}
                onChange={(e) =>
                  setSort(e.target.value === "low" ? "low" : e.target.value === "high" ? "high" : "featured")
                }
                className="bg-klawva-surface border border-klawva-border rounded px-3 py-1 text-xs font-mono text-klawva-text focus:outline-none focus:border-klawva-accent"
              >
                <option value="featured">Featured</option>
                <option value="low">Price low to high</option>
                <option value="high">Price high to low</option>
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="bg-klawva-surface border border-klawva-border rounded-lg p-16 text-center">
              <p className="font-mono text-klawva-muted">
                No employees in this category yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visible.map((employee) => (
                <Link
                  key={employee.id}
                  href={`/employees/${employee.slug}`}
                  className="block bg-klawva-surface border border-klawva-border rounded-lg p-6 hover:border-klawva-accent transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                      {employee.category}
                    </span>
                    {employee.ownerId === "system" ? (
                      <Badge variant="active">By Klawva</Badge>
                    ) : (
                      <Badge variant="pending">By author</Badge>
                    )}
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
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
