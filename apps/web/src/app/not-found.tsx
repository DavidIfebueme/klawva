import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow flex items-center justify-center px-6 py-40">
        <div className="text-center">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-4">
            404
          </span>
          <h1 className="font-syne font-bold text-4xl text-klawva-text mb-4">
            Nothing here
          </h1>
          <p className="font-mono text-klawva-muted mb-8">
            That page does not exist.
          </p>
          <Button variant="primary" href="/">Back to Klawva</Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
