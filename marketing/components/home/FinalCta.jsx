'use client';

import { trackCtaClick } from '@/lib/analytics';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://maximussports.vercel.app';

export function FinalCta() {
  return (
    <section id="get-updates" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Ready for March Madness?
        </h2>
        <p className="mt-4 text-slate-600">
          Open the app for odds, ATS, and bracket intel. Get updates below when we add new
          features.
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCtaClick({ ctaId: 'open_app', location: 'final_cta' })}
            className="inline-flex justify-center rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white hover:bg-sky-700"
          >
            Open the App
          </a>
        </div>
        <form
          className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center"
          onSubmit={(e) => {
            e.preventDefault();
            trackCtaClick({ ctaId: 'get_updates_submit', location: 'final_cta' });
          }}
        >
          <input
            type="email"
            placeholder="Email for updates"
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:min-w-[240px]"
            aria-label="Email for updates"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-900"
          >
            Get updates
          </button>
        </form>
      </div>
    </section>
  );
}
