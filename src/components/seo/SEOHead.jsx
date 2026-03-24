import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

export const ORIGIN = 'https://maximussports.ai';
const DEFAULT_OG_IMAGE = `${ORIGIN}/og.png`;
export const SITE_NAME = 'Maximus Sports';
export const CURRENT_YEAR = new Date().getFullYear();

/**
 * Build a dynamic /api/og image URL.
 * Exported so pages can construct ogImage before passing to SEOHead.
 */
export function buildOgImageUrl({ title, subtitle, meta, team, type } = {}) {
  const params = new URLSearchParams();
  if (title)    params.set('title',    String(title).slice(0, 80));
  if (subtitle) params.set('subtitle', String(subtitle).slice(0, 120));
  if (meta)     params.set('meta',     String(meta).slice(0, 60));
  if (team)     params.set('team',     String(team).slice(0, 40));
  if (type)     params.set('type',     String(type).slice(0, 30));
  return `${ORIGIN}/api/og?${params.toString()}`;
}

/**
 * Per-page SEO metadata via react-helmet-async.
 * Overrides the static index.html defaults on a per-route basis.
 */
export default function SEOHead({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  noindex = false,
  jsonLd = null,
}) {
  const location = useLocation();
  // Use current URL pathname as canonical if not explicitly provided.
  // This ensures sport-prefixed routes (/ncaam/teams) get correct canonical URLs
  // without requiring every page to know its workspace prefix.
  const resolvedCanonical = canonicalPath ?? location.pathname;
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | College Basketball Betting Intelligence & March Madness Picks`;
  const canonicalUrl = `${ORIGIN}${resolvedCanonical}`;

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
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={fullTitle} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={fullTitle} />
      <meta name="twitter:site" content="@MaximusSports" />

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
