/**
 * ESPN CDN logo resolver for MLB teams.
 * URL pattern: https://a.espncdn.com/i/teamlogos/mlb/500/{espnId}.png
 */

const ESPN_MLB_LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/mlb/500';

const SLUG_TO_ESPN_ID = {
  'nyy': '10', 'bos': '2', 'tor': '14', 'tb': '30', 'bal': '1',
  'cle': '5', 'min': '9', 'det': '6', 'cws': '4', 'kc': '7',
  'hou': '18', 'sea': '12', 'tex': '13', 'laa': '3', 'oak': '11',
  'atl': '15', 'nym': '21', 'phi': '22', 'mia': '28', 'wsh': '20',
  'chc': '16', 'mil': '8', 'stl': '24', 'pit': '23', 'cin': '17',
  'lad': '19', 'sd': '25', 'sf': '26', 'ari': '29', 'col': '27',
};

export function getMlbEspnLogoUrl(slug) {
  if (!slug) return null;
  const id = SLUG_TO_ESPN_ID[slug];
  if (!id) return null;
  return `${ESPN_MLB_LOGO_BASE}/${id}.png`;
}

export function hasMlbEspnLogo(slug) {
  return slug != null && SLUG_TO_ESPN_ID[slug] != null;
}
