import { useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "@/components/ui/AppLink";
import { Badge } from "@/components/ui/Badge";
import {
  listEmployees,
  searchEmployees,
  type EmployeeSummary,
} from "@/lib/employees-api";

export const loader = async () => ({ employees: await listEmployees() });

type SortOrder = "featured" | "low" | "high";

const queryFromLocation = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get("q") ?? "";
};

const sortEmployees = (
  employees: ReadonlyArray<EmployeeSummary>,
  sort: SortOrder,
): ReadonlyArray<EmployeeSummary> =>
  employees.slice().sort((a, b) => {
    if (sort === "low") return a.priceMinor - b.priceMinor;
    if (sort === "high") return b.priceMinor - a.priceMinor;
    const aFeatured = a.authorDisplay === "klawva" ? 0 : 1;
    const bFeatured = b.authorDisplay === "klawva" ? 0 : 1;
    return aFeatured - bFeatured || a.name.localeCompare(b.name);
  });

export function Component() {
  const { employees } = useLoaderData<typeof loader>();
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortOrder>("featured");
  const [query, setQuery] = useState(queryFromLocation);
  const [results, setResults] = useState<ReadonlyArray<EmployeeSummary> | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (trimmed.length >= 2) {
        url.searchParams.set("q", trimmed);
      } else {
        url.searchParams.delete("q");
      }
      window.history.replaceState(null, "", url);
    }
    if (trimmed.length < 2) {
      sequence.current += 1;
      setResults(null);
      setPending(false);
      setFailed(false);
      return;
    }
    const ticket = sequence.current + 1;
    sequence.current = ticket;
    const controller = new AbortController();
    setPending(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      searchEmployees(trimmed, controller.signal)
        .then((rows) => {
          if (sequence.current !== ticket) {
            return;
          }
          setResults(rows);
          setPending(false);
        })
        .catch(() => {
          if (sequence.current !== ticket) {
            return;
          }
          setResults([]);
          setFailed(true);
          setPending(false);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const trimmed = query.trim();
  const searching = trimmed.length >= 2 && results !== null;
  const source: ReadonlyArray<EmployeeSummary> =
    searching && results !== null ? results : employees;
  const categories = Array.from(new Set(employees.map((employee) => employee.category))).sort();
  const matched = source.filter(
    (employee) => category === "all" || employee.category === category,
  );
  const visible = searching ? matched : sortEmployees(matched, sort);

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
          <p className="font-mono text-klawva-muted max-w-2xl mb-8">
            Every employee here runs a 24-hour shift and works through Telegram,
            email, or the browser. Pick one, hand it a brief, and it gets to work.
          </p>

          <div className="mb-8">
            <label htmlFor="employee-search" className="sr-only">
              Describe the employee you need
            </label>
            <input
              id="employee-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Describe what you need, e.g. chase late invoices"
              autoComplete="off"
              className="w-full bg-klawva-surface border border-klawva-border rounded-lg px-4 py-3 font-mono text-sm text-klawva-text placeholder:text-klawva-dim focus:outline-none focus:border-klawva-accent"
            />
            {searching && (
              <p className="font-mono text-klawva-dim text-xs mt-2" aria-live="polite">
                {pending
                  ? "searching..."
                  : `${visible.length} match${visible.length === 1 ? "" : "es"} for "${trimmed}"`}
              </p>
            )}
          </div>

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
            {!searching && (
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
            )}
          </div>

          {visible.length === 0 ? (
            <div className="bg-klawva-surface border border-klawva-border rounded-lg p-16 text-center">
              <p className="font-mono text-klawva-muted">
                {failed
                  ? "Search is unavailable right now. Try again in a moment."
                  : searching
                    ? `No employee matches "${trimmed}". Try describing the job differently.`
                    : "No employees in this category yet."}
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
                    {employee.authorDisplay === "klawva" ? (
                      <Badge variant="active">By Klawva</Badge>
                    ) : (
                      <Badge variant="pending">By author</Badge>
                    )}
                  </div>
                  <div className="font-syne font-bold text-xl text-klawva-text mb-2">
                    {employee.name}
                  </div>
                  <p className="font-mono text-klawva-muted text-sm mb-1">
                    {employee.tagline}
                  </p>
                  {employee.why !== undefined && (
                    <p className="font-mono text-klawva-dim text-xs mb-3">
                      {employee.why}
                    </p>
                  )}
                  <div className="font-mono text-klawva-accent text-sm">
                    ₦{(employee.priceMinor / 100).toLocaleString()} per 24h
                  </div>
                  {employee.avgRating !== null && (
                    <div className="font-mono text-klawva-dim text-xs mt-1">
                      Rating: {employee.avgRating.toFixed(1)} / 5
                    </div>
                  )}
                </Link>
              ))}
              {visible.some((employee) => employee.category === "desktop") && (
                <div className="col-span-full text-center mt-4">
                  <a
                    href="/download"
                    className="text-xs text-klawva-muted underline font-mono"
                  >
                    desktop employees run on your computer — get the app
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
