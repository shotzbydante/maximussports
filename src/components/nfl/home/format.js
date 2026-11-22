/** Formatting helpers shared by the NFL home page sections. */

/** Kickoff in the viewer's own time zone, e.g. "Sun 10:00 AM". */
export function kickoffShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', '');
  } catch { return ''; }
}

export function fmtLine(v) {
  if (v == null) return '';
  return v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`;
}
export function fmtOdds(v) {
  if (v == null) return '';
  return v > 0 ? `+${v}` : `${v}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (!Number.isFinite(diffH) || diffH < 0) return '';
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}
