'use client';

import React, { useEffect, useRef } from 'react';

const FEED_LINES = [
  'Scanning 47 product listings from Lagos market...',
  'Price delta detected: ₦2,400 → ₦1,850 on item #847',
  'Cross-referencing supplier ratings...',
  '3 new vendor responses received',
  'Research complete: 12 sources verified',
  'Compiling delivery schedule for zone 4...',
  'Scraping category: Electronics → 234 items found',
  'Duplicate listing filtered: SKU-9921 already tracked',
  'Vendor order #847 confirmed — ETA 48hrs',
  'Market trend alert: demand spike in hardware tools',
  'Extracting contact info from 18 supplier pages...',
  'Competitor price matrix updated — 6 changes',
  'Session note: employer prefers WhatsApp updates',
  'Inventory check: 3 items below threshold',
  'Scraping complete — 892 records extracted',
  'Research query: import regulations Ghana 2026',
  'Mapping supplier network — 14 nodes identified',
  'Flagging unreliable vendor: rating < 2.1',
  'Daily summary queued for delivery',
  'Price comparison table generated — 47 rows',
  'Outreach sent to 5 new suppliers',
  'Verifying product availability with vendor #12...',
  'Scraping target: e-commerce category page 3/8',
  'Lead qualified: construction materials distributor',
  'Session timer: 18h 32m remaining',
  'Data export ready — CSV format, 2.4MB',
  'New vendor onboarded: ABJ Wholesale Ltd',
  'Research note: exchange rate impact on pricing',
  'Scraping rate: 12 pages/min — within limits',
  'Order fulfillment rate: 94.2% this session',
  'Category scan: Automobile parts → 67 new listings',
  'Price alert: cement bag up 8% in 24hrs',
  'Vendor response time: avg 2.3hrs',
  'Generating procurement recommendations...',
  'Supply chain bottleneck flagged: port clearance delays',
];

interface FeedColumnProps {
  lines: string[];
  speed: number;
  offset: number;
}

function FeedColumn({ lines, speed, offset }: FeedColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const totalHeight = el.scrollHeight / 2;
    let frame: number;
    let pos = offset * totalHeight;

    const step = () => {
      pos += speed;
      if (pos >= totalHeight) pos -= totalHeight;
      el.scrollTop = pos;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [speed, offset]);

  const doubled = [...lines, ...lines];

  return (
    <div className="h-full overflow-hidden relative">
      <div
        ref={scrollRef}
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
          let visibilityClass = "h-full";
          if (i === 1) visibilityClass += " hidden md:block";
          if (i >= 2) visibilityClass += " hidden lg:block";
          
          return (
            <div key={i} className={visibilityClass}>
              <FeedColumn
                lines={col.lines}
                speed={col.speed}
                offset={col.offset}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
