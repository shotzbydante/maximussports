import Link from 'next/link';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

export const metadata = {
  title: 'Terms of Service | Maximus Sports',
  description: 'Terms of service for Maximus Sports.',
  openGraph: {
    title: 'Terms of Service | Maximus Sports',
    url: `${BASE_URL}/terms`,
  },
  alternates: {
    canonical: `${BASE_URL}/terms`,
  },
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
      <p className="mt-4 text-slate-600">
        This is a placeholder. We will publish full terms of service before launch. For
        questions, contact us through the app or website.
      </p>
      <p className="mt-8">
        <Link href="/" className="font-medium text-sky-600 hover:text-sky-700">
          Back to home
        </Link>
      </p>
    </article>
  );
}
