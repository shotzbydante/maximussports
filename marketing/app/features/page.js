import Link from 'next/link';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

export const metadata = {
  title: 'Features | Odds, ATS, Team News & Bracket Intel',
  description:
    'March Madness features: college basketball odds, ATS insights, team news, game recaps, and the daily Maximus summary. Built for bracket and betting intel.',
  openGraph: {
    title: 'Features | Maximus Sports',
    url: `${BASE_URL}/features`,
  },
  alternates: {
    canonical: `${BASE_URL}/features`,
  },
};

export default function FeaturesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-slate-900">Features</h1>
      <p className="mt-4 text-slate-600">
        Maximus Sports brings March Madness intelligence into one place: odds, ATS, team news,
        and bracket intel for high-intensity college basketball fans.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">College basketball odds</h2>
        <p className="mt-2 text-slate-600">
          See current lines, spreads, and totals for games. We aggregate odds so you can compare
          and act on movement.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">ATS (against the spread) insights</h2>
        <p className="mt-2 text-slate-600">
          Track which teams cover the spread. ATS records and trends help you understand
          performance relative to the line, not just wins and losses.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">Team news and intel</h2>
        <p className="mt-2 text-slate-600">
          Injuries, roster changes, and key storylines that affect brackets and betting. We
          focus on news that moves lines and outcomes.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">Game recaps</h2>
        <p className="mt-2 text-slate-600">
          Quick recaps and stats after games so you know what happened and how it might affect
          future matchups and spreads.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">Daily Maximus summary</h2>
        <p className="mt-2 text-slate-600">
          A daily digest of the most important intel: odds movement, ATS highlights, and top
          team news in one place.
        </p>
      </section>

      <p className="mt-12">
        <Link href="/" className="font-medium text-sky-600 hover:text-sky-700">
          Back to home
        </Link>
      </p>
    </article>
  );
}
