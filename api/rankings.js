/**
 * GET /api/rankings
 *
 * Returns current NCAA basketball rankings for Bracketology enrichment.
 * Placeholder: returns empty rankings until a live data source is wired.
 */

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({ rankings: [] });
}
