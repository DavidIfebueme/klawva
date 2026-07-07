import React from 'react';
import { notFound } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { agents, AgentId } from '@/lib/agents';
import { ScrapperIcon } from '@/components/icons/ScrapperIcon';
import { VendorIcon } from '@/components/icons/VendorIcon';
import { ResearcherIcon } from '@/components/icons/ResearcherIcon';
import { JobSeekerIcon } from '@/components/icons/JobSeekerIcon';
import { LeadScoutIcon } from '@/components/icons/LeadScoutIcon';
import { HirePriceCardBits } from '@/components/billing/HirePriceCardBits';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

const iconMap = {
  scrapper: ScrapperIcon,
  vendor: VendorIcon,
  researcher: ResearcherIcon,
  jobseeker: JobSeekerIcon,
  leadscout: LeadScoutIcon,
};

export async function generateMetadata({ params }: { params: Promise<{ agent: string }> }) {
  const resolvedParams = await params;
  const agent = agents[resolvedParams.agent as AgentId];
  if (!agent) return { title: 'Agent Not Found' };
  
  return {
    title: `Hire ${agent.name} — Klawva`,
    description: agent.description,
  };
}

export default async function HireAgentPage({ params }: { params: Promise<{ agent: string }> }) {
  const resolvedParams = await params;
  const agentId = resolvedParams.agent as AgentId;
  const agent = agents[agentId];

  if (!agent) {
    notFound();
  }

  const Icon = iconMap[agentId];

  return (
    <main className="min-h-screen bg-klawva-bg text-klawva-text font-mono pt-16">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-32 grid grid-cols-1 lg:grid-cols-12 gap-16">
        
        {/* Left Column: Agent Info */}
        <div className="lg:col-span-7 flex flex-col gap-12">
          
          {/* Header */}
          <div>
            <Icon size={64} className="text-klawva-accent mb-8" />
            <h1 className="font-syne font-extrabold text-5xl md:text-6xl text-klawva-text mb-4 tracking-tight">
              {agent.name}
            </h1>
            <Badge variant="active" className="mb-6 px-3 py-1 text-sm">{agent.title}</Badge>
            <p className="font-syne text-klawva-muted text-2xl md:text-3xl leading-tight">
              {agent.tagline}
            </p>
          </div>

          <div className="h-px w-full bg-klawva-border" />

          {/* Description */}
          <div>
            <p className="font-mono text-klawva-muted text-lg leading-relaxed">
              {agent.description}
            </p>
          </div>

          {/* Capabilities */}
          <div>
            <h3 className="font-syne font-bold text-2xl text-klawva-text mb-6">Capabilities</h3>
            <ul className="flex flex-col gap-4">
              {agent.capabilities.map((cap, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-klawva-accent font-mono mt-0.5">→</span>
                  <span className="font-mono text-klawva-muted text-lg leading-relaxed">{cap}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Example Session */}
          <div className="bg-klawva-surface border border-klawva-border rounded-lg p-8 mt-4">
            <span className="font-mono text-klawva-dim text-xs tracking-[0.2em] uppercase mb-4 block">
              EXAMPLE SESSION
            </span>
            <p className="font-mono italic text-klawva-muted text-lg leading-relaxed">
              &quot;{agent.examplePrompt}&quot;
            </p>
          </div>

        </div>

        {/* Right Column: Sticky Hire Card */}
        <div className="lg:col-span-5 relative">
          <div className="sticky top-32 bg-klawva-surface border border-klawva-accent rounded-xl p-8 shadow-[0_0_40px_rgba(232,255,71,0.05)]">
            
            <div className="flex items-center gap-4 mb-8">
              <Icon size={32} className="text-klawva-accent" />
              <h2 className="font-syne font-bold text-2xl text-klawva-text">{agent.name}</h2>
            </div>

            <HirePriceCardBits />

            <div className="mb-8 p-4 bg-klawva-elevated border border-klawva-border rounded flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-klawva-accent animate-pulse" />
              <span className="font-mono text-klawva-muted text-sm">
                Available on: {agent.channels.join(' or ')}
              </span>
            </div>

             <Link href={`/checkout?agent=${agentId}`} className="block w-full">
                <Button variant="primary" size="lg" className="w-full mb-4">
                  Hire {agent.name.split(' ').pop()} →
                </Button>
              </Link>

            <div className="text-center">
              <Badge variant="pending" className="px-3 py-1 text-xs tracking-widest">[ 24HRS ]</Badge>
            </div>

          </div>
        </div>

      </div>
      
      <Footer />
    </main>
  );
}
