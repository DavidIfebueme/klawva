
import React from 'react';

const FEED_LINES = [
  'scrapper: price check on 12 listings, 3 changed',
  'scrapper: saved a comparison table for the brief',
  'scrapper: page 4 of 8 read, no errors',
  'researcher: reading source 6 of 11',
  'researcher: flagged one source as undated',
  'researcher: outline drafted, filling in citations',
  'inbox: drafted a reply to a customer enquiry',
  'inbox: moved 4 messages to awaiting your answer',
  'inbox: tagged an invoice request for moneyadmin',
  'receptionist: took a message for the 3pm call',
  'receptionist: logged a caller who wants a callback',
  'receptionist: shared the opening hours reply',
  'moneyadmin: matched 8 payments to invoices',
  'moneyadmin: flagged one receipt with no reference',
  'paperwork: filed the signed contract',
  'paperwork: renamed 6 documents to the client format',
  'jobseeker: found 14 roles that match the brief',
  'jobseeker: checked 5 listings for closing dates',
  'leadscout: qualified 6 new leads',
  'leadscout: removed 3 duplicates from the list',
  'cvtailor: rewrote the summary for a fintech role',
  'cvtailor: shortened the CV to two pages',
  'study: summarised chapter 3 into 12 points',
  'study: built a practice set from last week',
  'followupcaller: queued a follow-up for tomorrow',
  'followupcaller: logged two people who asked for email',
  'checkincaller: recorded a check-in from a patient',
  'checkincaller: rescheduled one check-in to Friday',
  'session note: shift ends in 18h 32m',
  'session note: brief updated by the employer',
  'report: shift report drafted, waiting for the end',
];

interface FeedColumnProps {
  lines: string[];
  speed: number;
  offset: number;
  className?: string;
}

function FeedColumn({ lines, speed, offset, className = '' }: FeedColumnProps) {
  const start = (el: HTMLDivElement | null) => {
    if (el === null) return;

    const totalHeight = el.scrollHeight / 2;
    let frame = 0;
    let pos = offset * totalHeight;

    const step = () => {
      pos += speed;
      if (pos >= totalHeight) pos -= totalHeight;
      el.scrollTop = pos;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  };

  const doubled = [...lines, ...lines];

  return (
    <div className={`h-full overflow-hidden relative ${className}`}>
      <div
        ref={start}
        className="h-full overflow-y-hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="flex flex-col gap-3">
          {doubled.map((line, i) => (
            <div
              key={i}
              className="font-mono text-xs leading-relaxed whitespace-nowrap text-klawva-muted/20 truncate"
            >
              <span className="text-klawva-accent/30 mr-2">›</span>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function AgentActivityFeed() {
  const columns = [
    { lines: shuffleArray(FEED_LINES, 7), speed: 0.3, offset: 0 },
    { lines: shuffleArray(FEED_LINES, 13), speed: 0.25, offset: 0.4 },
    { lines: shuffleArray(FEED_LINES, 23), speed: 0.35, offset: 0.7 },
    { lines: shuffleArray(FEED_LINES, 37), speed: 0.28, offset: 0.2 },
  ];

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <div className="w-full h-full max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 pt-32">
        {columns.map((col, i) => {
          let className = "";
          if (i === 1) className = "hidden md:block";
          if (i >= 2) className = "hidden lg:block";

          return (
            <FeedColumn
              key={i}
              lines={col.lines}
              speed={col.speed}
              offset={col.offset}
              className={className}
            />
          );
        })}
      </div>
    </div>
  );
}
