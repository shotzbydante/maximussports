import Link from 'next/link';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

export const metadata = {
  title: 'Team Intel | College Basketball Teams & Bracket Context',
  description:
    'How Maximus Sports surfaces team intel for March Madness: ATS records, news, and context for every team. No dynamic data on this page; see the app for live data.',
  openGraph: {
    title: 'Team Intel | Maximus Sports',
    url: `${BASE_URL}/teams`,
  },
  alternates: {
    canonical: `${BASE_URL}/teams`,
  },
};

export default function TeamsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-slate-900">Team intel</h1>
      <p className="mt-4 text-slate-600">
        For every team in the mix for March Madness, we bring together the intel that matters:
        how they perform against the spread, recent news, and context for brackets and betting.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">What we surface per team</h2>
        <p className="mt-2 text-slate-600">
          In the app you get live data. Here we explain the concept: for each team we show ATS
          record and trends, key news (injuries, roster, storylines), and how they fit into
          bracket and odds discussion.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">ATS and odds by team</h2>
        <p className="mt-2 text-slate-600">
          See how a team has performed against the spread and where current odds and lines sit
          for their games. This helps you compare teams and spot value.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">News that moves the needle</h2>
        <p className="mt-2 text-slate-600">
          We highlight team news that can move lines and brackets: injuries, suspensions,
          coaching notes, and momentum. Open the app for the full, up-to-date team intel.
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
