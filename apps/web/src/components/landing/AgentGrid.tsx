
import React from 'react';
import { motion } from 'motion/react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ScrapperIcon } from '../icons/ScrapperIcon';
import { ResearcherIcon } from '../icons/ResearcherIcon';
import { JobSeekerIcon } from '../icons/JobSeekerIcon';
import { LeadScoutIcon } from '../icons/LeadScoutIcon';
import { KlawvaMark } from '../icons/KlawvaMark';
import type { EmployeeSummary } from '@/lib/employees-api';
import { formatPrice, useDisplay } from "@/lib/display";

const iconMap: Partial<Record<string, typeof ScrapperIcon>> = {
  scrapper: ScrapperIcon,
  researcher: ResearcherIcon,
  jobseeker: JobSeekerIcon,
  leadscout: LeadScoutIcon,
};

export function AgentGrid({
  employees,
  failed,
}: {
  employees: ReadonlyArray<EmployeeSummary>;
  failed: boolean;
}) {
  const display = useDisplay();
  const visible = employees.slice(0, 6);

  return (
    <section id="agents" className="py-32 px-6 bg-klawva-bg">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <span className="font-mono text-klawva-dim text-sm tracking-[0.2em] uppercase">
            THE EMPLOYEES
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {visible.map((employee, index) => {
            const Icon = iconMap[employee.slug] ?? KlawvaMark;
            return (
              <motion.div
                key={employee.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1, ease: 'easeOut' }}
              >
                <Card hover className="h-full flex flex-col group">
                  <div className="mb-6">
                    <div className="flex items-start justify-between gap-3 mb-6">
                      <Icon size={48} className="text-klawva-accent group-hover:text-white transition-colors duration-300" />
                      {employee.authorKind === 'klawva' ? (
                        <Badge variant="active">By Klawva</Badge>
                      ) : (
                        <Badge variant="pending">By {employee.authorDisplay}</Badge>
                      )}
                    </div>
                    <h3 className="font-syne font-bold text-2xl text-klawva-text mb-2">{employee.name}</h3>
                    <p className="font-mono text-klawva-muted text-sm">{employee.tagline}</p>
                  </div>
                  
                  <div className="h-px w-full bg-klawva-border mb-6" />
                  
                  <div className="flex-grow flex flex-col gap-2 mb-8">
                    <span className="font-mono text-klawva-dim text-xs uppercase tracking-wider">
                      {employee.category}
                    </span>
                    <span className="font-mono text-klawva-accent text-sm">
                      {formatPrice(employee.priceMinor, display)} per 24h
                    </span>
                  </div>

                  <Button variant="ghost" href={`/employees/${employee.slug}`} className="w-full justify-start px-0 group-hover:text-klawva-accent transition-colors duration-300">
                    Hire {employee.name} →
                  </Button>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {visible.length === 0 && (
          <p className="text-center font-mono text-klawva-muted">
            {failed
              ? "The catalogue is unavailable right now. Try again in a moment."
              : "No employees are listed yet."}
          </p>
        )}

        <div className="mt-16 text-center">
          <Button variant="ghost" href="/employees">
            See all employees →
          </Button>
        </div>
      </div>
    </section>
  );
}
