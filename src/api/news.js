/**
 * Client-side news API wrapper.
 * Fetches team headlines from /api/news/team/:slug (Google News RSS, no API key).
 */

export async function fetchTeamNews(teamSlug) {
  const res = await fetch(`/api/news/team/${teamSlug}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch news for multiple teams and aggregate.
 * Returns { teamNews: [{ team, slug, headlines }], newsFeed: [{ id, title, source, time, excerpt, sentiment }] }.
 */
export async function fetchAggregatedNews(teamSlugs, options = {}) {
  const { maxFeedItems = 10 } = options;
  const results = await Promise.allSettled(
    teamSlugs.map((slug) => fetchTeamNews(slug))
  );

  const teamNews = [];
  const allHeadlines = [];

  results.forEach((result, i) => {
    const slug = teamSlugs[i];
    if (result.status === 'fulfilled' && result.value?.headlines) {
      const { team, headlines } = result.value;
      const shortName = team.split(' ')[0] || team;
      teamNews.push({ team: shortName, slug, headlines: headlines.length });
      headlines.forEach((h) => {
        allHeadlines.push({ ...h, teamSlug: slug });
      });
    }
  });

  allHeadlines.sort((a, b) => {
    const da = new Date(a.pubDate || 0).getTime();
    const db = new Date(b.pubDate || 0).getTime();
    return db - da;
  });

  const newsFeed = allHeadlines.slice(0, maxFeedItems).map((h) => ({
    id: h.id,
    title: h.title,
    source: h.source || 'News',
    time: formatRelativeTime(h.pubDate),
    excerpt: '',
    sentiment: 'neutral',
    link: h.link,
  }));

  return { teamNews, newsFeed };
}

function formatRelativeTime(pubDate) {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
