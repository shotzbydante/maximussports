import { Helmet } from 'react-helmet-async';

export const ORIGIN = 'https://maximussports.ai';
const DEFAULT_OG_IMAGE = `${ORIGIN}/og.png`;
export const SITE_NAME = 'Maximus Sports';
export const CURRENT_YEAR = new Date().getFullYear();

/**
 * Per-page SEO metadata via react-helmet-async.
 * Overrides the static index.html defaults on a per-route basis.
 */
export default function SEOHead({
  title,
  description,
  canonicalPath = '/',
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  noindex = false,
  jsonLd = null,
}) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | College Basketball Betting Intelligence & March Madness Picks`;
  const canonicalUrl = `${ORIGIN}${canonicalPath}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
