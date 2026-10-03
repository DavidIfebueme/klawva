import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "@/components/ui/AppLink";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getEmployee } from "@/lib/employees-api";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  if (params.agent === undefined) {
    throw redirect("/employees");
  }
  return { employee: await getEmployee(params.agent) };
};

export function Component() {
  const { employee } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen bg-klawva-bg text-klawva-text font-mono pt-16">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-32 grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-7 flex flex-col gap-10">
          <div>
            <h1 className="font-syne font-extrabold text-5xl md:text-6xl text-klawva-text mb-4 tracking-tight">
              {employee.name}
            </h1>
            <Badge variant="active" className="mb-6 px-3 py-1 text-sm">
              {employee.category}
            </Badge>
            <p className="font-syne text-klawva-muted text-2xl md:text-3xl leading-tight">
              {employee.tagline}
            </p>
          </div>
          <div className="h-px w-full bg-klawva-border" />
          <p className="font-mono text-klawva-muted text-lg leading-relaxed">
            Hires run a 24-hour shift. You hand over a brief, then work with
            {" "}
            {employee.name.split(" ").pop()} entirely through Telegram from the
            moment your payment clears.
          </p>
        </div>
        <div className="lg:col-span-5 relative">
          <div className="sticky top-32 bg-klawva-surface border border-klawva-accent rounded-xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-syne font-bold text-2xl text-klawva-text">
                {employee.name}
              </h2>
              <span className="font-syne font-extrabold text-2xl text-klawva-accent">
                ₦{(employee.priceMinor / 100).toLocaleString()}
              </span>
            </div>
            <Link href={`/checkout?agent=${employee.slug}`} className="block w-full">
              <Button variant="primary" size="lg" className="w-full mb-4">
                Hire {employee.name.split(" ").pop()} →
              </Button>
            </Link>
            <div className="text-center">
              <Badge variant="pending" className="px-3 py-1 text-xs tracking-widest">
                [ 24 HRS ]
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
