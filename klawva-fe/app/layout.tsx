import type {Metadata} from 'next';
import { Syne, DM_Mono } from 'next/font/google';
import './globals.css'; // Global styles

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-syne',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
});

export const metadata: Metadata = {
  title: 'Klawva — Hire Autonomous AI Workers',
  description: 'Rent a high-performance AI agent for 24 hours. Scrapper, Vendor, or Researcher. Pay once. It works. Then it disappears.',
  openGraph: {
    title: 'Klawva — Hire the Worker. Fire the Worker.',
    description: 'Three autonomous AI agents. One flat fee. 24 hours. Then gone.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${syne.variable} ${dmMono.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
