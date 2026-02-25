'use client';

import { trackCtaClick } from '@/lib/analytics';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://maximussports.vercel.app';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-slate-50 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          March Madness Intelligence
        </h1>
        <p className="mt-4 text-lg text-slate-600 sm:text-xl">
          College basketball odds, ATS insights, bracket intel, and team news. One place for
          high-intensity fans.
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCtaClick({ ctaId: 'open_app', location: 'hero_primary' })}
            className="inline-flex justify-center rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white hover:bg-sky-700"
          >
            Open the App
          </a>
          <a
            href="#get-updates"
            onClick={() => trackCtaClick({ ctaId: 'get_updates', location: 'hero_secondary' })}
            className="inline-flex justify-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            Get updates
          </a>
        </div>
      </div>
    </section>
  );
}
