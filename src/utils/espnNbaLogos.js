/**
 * ESPN CDN logo resolver for NBA teams.
 * URL pattern: https://a.espncdn.com/i/teamlogos/nba/500/{espnId}.png
 */

const ESPN_NBA_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nba/500';

const SLUG_TO_ESPN_ID = {
  'atl': '1', 'bos': '2', 'bkn': '17', 'cha': '30', 'chi': '4',
  'cle': '5', 'dal': '6', 'den': '7', 'det': '8', 'gsw': '9',
  'hou': '10', 'ind': '11', 'lac': '12', 'lal': '13', 'mem': '29',
  'mia': '14', 'mil': '15', 'min': '16', 'nop': '3', 'nyk': '18',
  'okc': '25', 'orl': '19', 'phi': '20', 'phx': '21', 'por': '22',
  'sac': '23', 'sas': '24', 'tor': '28', 'uta': '26', 'was': '27',
};

export function getNbaEspnLogoUrl(slug) {
  if (!slug) return null;
  const id = SLUG_TO_ESPN_ID[slug];
  if (!id) return null;
  return `${ESPN_NBA_LOGO_BASE}/${id}.png`;
}

export function hasNbaEspnLogo(slug) {
  return slug != null && SLUG_TO_ESPN_ID[slug] != null;
}
