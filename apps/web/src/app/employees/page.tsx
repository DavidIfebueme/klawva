import { useRef, useState } from "react";
import {
  useLoaderData,
  useNavigation,
  useSearchParams,
  type LoaderFunctionArgs,
} from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "@/components/ui/AppLink";
import { Badge } from "@/components/ui/Badge";
import { Search } from "lucide-react";
import {
  listEmployees,
  searchEmployees,
  type EmployeeSummary,
} from "@/lib/employees-api";

const MIN_QUERY_CHARS = 2;
const DEBOUNCE_MS = 250;

type SortOrder = "featured" | "low" | "high";

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const searching = query.length >= MIN_QUERY_CHARS;
  if (!searching) {
    return { query, searching, failed: false, employees: await listEmployees() };
  }
  const employees = await searchEmployees(query).catch(() => null);
  return {
    query,
    searching,
    failed: employees === null,
    employees: employees ?? [],
  };
};

export function Component() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortOrder>("featured");
  const [text, setText] = useState(data.query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typedQuery = text.trim();
  const typing = typedQuery.length >= MIN_QUERY_CHARS;
  const pending = navigation.state !== "idle";
  const searching = data.searching || (pending && typing);

  const commit = (value: string) => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      if (window.location.pathname !== "/employees") {
        return;
      }
      const trimmed = value.trim();
      const next = new URLSearchParams(params);
      if (trimmed.length >= MIN_QUERY_CHARS) {
        next.set("q", trimmed);
      } else {
        next.delete("q");
      }
      setParams(next, { replace: true });
    }, DEBOUNCE_MS);
  };

  const matched = data.employees.filter(
    (employee) => category === "all" || employee.category === category,
  );
  const visible = data.searching ? matched : sortEmployees(matched, sort);
  const categories = Array.from(
    new Set(data.employees.map((employee) => employee.category)),
  ).sort();

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
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-klawva-muted"
              />
              <input
                id="employee-search"
                type="search"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  commit(event.target.value);
                }}
                placeholder="Describe what you need, e.g. chase late invoices"
                autoComplete="off"
                className="w-full bg-klawva-surface border border-klawva-border rounded-lg py-3 pl-11 pr-4 font-mono text-sm text-klawva-text placeholder:text-klawva-dim focus:outline-none focus:border-klawva-accent"
              />
            </div>
            {searching && (
              <p className="font-mono text-klawva-dim text-xs mt-2" aria-live="polite">
                {pending
                  ? "searching..."
                  : `${visible.length} match${visible.length === 1 ? "" : "es"} for "${data.query}"`}
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
                {pending
                  ? "searching..."
                  : data.failed
                    ? "Search is unavailable right now. Try again in a moment."
                    : data.searching
                      ? `No employee matches "${data.query}". Try describing the job differently.`
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
