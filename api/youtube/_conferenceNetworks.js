/**
 * Conference → primary TV network name for YouTube query enrichment.
 * Keys match the `conference` field in data/teams.js.
 */
export const CONF_NETWORK_MAP = {
  'SEC':      'SEC Network',
  'ACC':      'ACC Network',
  'Big Ten':  'Big Ten Network',
  'Big 12':   'Big 12 Conference',
  'Big East': 'Big East Conference',
  'Pac-12':   'Pac-12 Networks',
};

/**
 * Return the primary network name for a conference, or null if unmapped.
 * @param {string|undefined} conference
 * @returns {string|null}
 */
export function getConferenceNetwork(conference) {
  return CONF_NETWORK_MAP[conference] ?? null;
}
