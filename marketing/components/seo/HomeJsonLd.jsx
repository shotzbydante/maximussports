const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maximussports.ai';

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Maximus Sports',
  url: BASE_URL,
  description:
    'March Madness intelligence: college basketball odds, ATS insights, bracket intel, and team news.',
};

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Maximus Sports',
  url: BASE_URL,
  description:
    'College basketball odds, ATS insights, bracket intel, and team news. Built for high-intensity March Madness fans.',
  publisher: {
    '@type': 'Organization',
    name: 'Maximus Sports',
    url: BASE_URL,
  },
};

export function HomeJsonLd() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
