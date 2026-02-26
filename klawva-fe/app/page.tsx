import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/landing/Hero';
import { AgentGrid } from '@/components/landing/AgentGrid';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Pricing } from '@/components/landing/Pricing';
import { WhyKlawva } from '@/components/landing/WhyKlawva';
import { FinalCTA } from '@/components/landing/FinalCTA';

export default function Home() {
  return (
    <main className="min-h-screen bg-klawva-bg text-klawva-text font-mono selection:bg-klawva-accent selection:text-klawva-bg">
      <Navbar />
      <Hero />
      <AgentGrid />
      <HowItWorks />
      <Pricing />
      <WhyKlawva />
      <FinalCTA />
      <Footer />
    </main>
  );
}
