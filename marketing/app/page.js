import Link from 'next/link';
import { Hero } from '@/components/home/Hero';
import { ValueProps } from '@/components/home/ValueProps';
import { HowItWorks } from '@/components/home/HowItWorks';
import { SocialProof } from '@/components/home/SocialProof';
import { FAQ } from '@/components/home/FAQ';
import { FinalCta } from '@/components/home/FinalCta';
import { HomeJsonLd } from '@/components/seo/HomeJsonLd';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

export const metadata = {
  title: 'March Madness Intelligence | College Basketball Odds, ATS & Bracket Intel',
  description:
    'Get team news, college basketball odds, ATS insights, game recaps, and daily Maximus summaries. Built for high-intensity March Madness fans.',
  openGraph: {
    title: 'Maximus Sports | March Madness Intelligence',
    description:
      'College basketball odds, ATS insights, bracket intel, and team news. Built for high-intensity fans.',
    url: BASE_URL,
  },
  twitter: {
    title: 'Maximus Sports | March Madness Intelligence',
    description: 'College basketball odds, ATS insights, bracket intel, and team news.',
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function HomePage() {
  return (
    <>
      <HomeJsonLd />
      <Hero />
      <ValueProps />
      <HowItWorks />
      <SocialProof />
      <FAQ />
      <FinalCta />
    </>
  );
}
