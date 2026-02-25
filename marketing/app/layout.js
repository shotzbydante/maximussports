import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AnalyticsTracker } from '@/components/AnalyticsTracker';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Maximus Sports | March Madness Intelligence',
    template: '%s | Maximus Sports',
  },
  description:
    'College basketball odds, ATS insights, bracket intel, and team news. Built for high-intensity March Madness fans.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Maximus Sports',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        <AnalyticsTracker />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
