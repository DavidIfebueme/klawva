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
  description: 'Deploy an AI worker to your Telegram or WhatsApp. It handles the shift, delivers results, and signs off. One fee. No subscription.',
  openGraph: {
    title: 'Klawva',
    description: 'Deploy an AI worker to your Telegram or WhatsApp. It handles the shift, delivers results, and signs off. One fee. No subscription.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${syne.variable} ${dmMono.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
