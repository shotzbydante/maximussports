import Link from 'next/link';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

export const metadata = {
  title: 'About | Maximus Sports',
  description:
    'Maximus Sports is built for high-intensity March Madness fans who want college basketball odds, ATS insights, bracket intel, and team news in one place.',
  openGraph: {
    title: 'About | Maximus Sports',
    url: `${BASE_URL}/about`,
  },
  alternates: {
    canonical: `${BASE_URL}/about`,
  },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-slate-900">About Maximus Sports</h1>
      <p className="mt-4 text-slate-600">
        Maximus Sports is built for fans who care as much about odds, ATS, and bracket intel
        as they do about the games. We bring college basketball odds, against-the-spread
        insights, team news, game recaps, and a daily summary into one place.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Who it is for</h2>
        <p className="mt-2 text-slate-600">
          High-intensity March Madness fans who want to stay on top of lines, spreads, team
          news, and the context that shapes brackets and betting decisions.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">What we do</h2>
        <p className="mt-2 text-slate-600">
          We aggregate and present college basketball odds, ATS trends, team intel, and recaps
          so you can use one app instead of jumping between multiple sources.
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
