/**
 * Maps conference display name to filename slug for /public/conferences/{slug}.png
 */

const CONF_TO_SLUG = {
  'Big Ten': 'big-ten',
  'SEC': 'sec',
  'ACC': 'acc',
  'Big 12': 'big-12',
  'Big East': 'big-east',
  'Mountain West': 'mwc',
  'MW': 'mwc',
  'AAC': 'aac',
  'American': 'aac',
  'WCC': 'wcc',
  'A-10': 'a10',
  'C-USA': 'cusa',
  'MVC': 'mvc',
  'MAC': 'mac',
  'Southland': 'southland',
  'Others': 'others',
};

export function getConferenceSlug(conferenceName) {
  if (!conferenceName) return null;
  return CONF_TO_SLUG[conferenceName] ?? conferenceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
