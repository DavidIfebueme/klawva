import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AgentGrid } from '@/components/landing/AgentGrid';

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-klawva-bg text-klawva-text font-mono selection:bg-klawva-accent selection:text-klawva-bg">
      <Navbar />
      <div className="pt-24">
        <AgentGrid showAll showSeeAllButton={false} />
      </div>
      <Footer />
    </main>
  );
}
