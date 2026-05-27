'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ScrapperIcon } from '../icons/ScrapperIcon';
import { VendorIcon } from '../icons/VendorIcon';
import { ResearcherIcon } from '../icons/ResearcherIcon';
import { agents } from '@/lib/agents';

const iconMap = {
  scrapper: ScrapperIcon,
  vendor: VendorIcon,
  researcher: ResearcherIcon,
};

export function AgentGrid() {
  return (
    <section id="agents" className="py-32 px-6 bg-klawva-bg">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            THE EMPLOYEES
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {Object.values(agents).map((agent, index) => {
            const Icon = iconMap[agent.id];
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1, ease: 'easeOut' }}
              >
                <Card hover className="h-full flex flex-col group">
                  <div className="mb-6">
                    <Icon size={48} className="mb-6 text-klawva-accent group-hover:text-white transition-colors duration-300" />
                    <h3 className="font-syne font-bold text-2xl text-klawva-text mb-2">{agent.name}</h3>
                    <p className="font-mono text-klawva-muted text-sm">{agent.specialty}</p>
                  </div>
                  
                  <div className="h-px w-full bg-klawva-border mb-6" />
                  
                  <ul className="flex-grow flex flex-col gap-4 mb-8">
                    {agent.capabilities.slice(0, 3).map((cap, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-klawva-accent font-mono mt-0.5">→</span>
                        <span className="font-mono text-sm text-klawva-muted leading-relaxed">{cap}</span>
                      </li>
                    ))}
                  </ul>

                  <Button variant="ghost" className="w-full justify-start px-0 opacity-40 cursor-not-allowed" disabled>
                    Coming soon →
                  </Button>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
