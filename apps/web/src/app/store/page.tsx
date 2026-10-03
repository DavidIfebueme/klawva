import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "@/components/ui/AppLink";

interface StoreListing {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  priceMinor: number;
  version: number;
  score: number | null;
}

export default function StorePage() {
  const [listings, setListings] = useState<StoreListing[]>([]);

  useEffect(() => {
    fetch("/api/listings")
      .then((response) => response.json())
      .then((data: StoreListing[]) => setListings(data))
      .catch(() => setListings([]));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-12">
            Agent store
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/hire/${listing.slug}`}
                className="block bg-klawva-surface border border-klawva-border rounded-lg p-6 hover:border-klawva-accent transition-colors"
              >
                <div className="font-mono text-klawva-dim text-xs uppercase tracking-wider mb-2">
                  {listing.category}
                </div>
                <div className="font-syne font-bold text-xl text-klawva-text mb-2">
                  {listing.name}
                </div>
                <p className="font-mono text-klawva-muted text-sm mb-4">
                  {listing.tagline}
                </p>
                <div className="font-mono text-klawva-accent text-sm">
                  ₦{(listing.priceMinor / 100).toLocaleString()} per 24h
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
