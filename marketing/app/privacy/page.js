import Link from 'next/link';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

export const metadata = {
  title: 'Privacy Policy | Maximus Sports',
  description: 'Privacy policy for Maximus Sports.',
  openGraph: {
    title: 'Privacy Policy | Maximus Sports',
    url: `${BASE_URL}/privacy`,
  },
  alternates: {
    canonical: `${BASE_URL}/privacy`,
  },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
      <p className="mt-4 text-slate-600">
        This is a placeholder. We will publish a full privacy policy before launch. For
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
