/**
 * Who is fetching a page, judged from the User-Agent header.
 *
 * Crawlers and AI agents do not run the page's JavaScript, so the browser
 * analytics never see them. middleware.js uses this to record their visits
 * to the plain-HTML pages, llms.txt, robots.txt and the sitemap.
 */

/** Named agents, most specific first. [pattern, name, kind] */
const AGENTS = [
  // AI assistants fetching a page because a person asked about it.
  [/ChatGPT-User/i, 'ChatGPT-User', 'ai_assistant'],
  [/Claude-User/i, 'Claude-User', 'ai_assistant'],
  [/Perplexity-User/i, 'Perplexity-User', 'ai_assistant'],
  [/MistralAI-User/i, 'MistralAI-User', 'ai_assistant'],
  [/DuckAssistBot/i, 'DuckAssistBot', 'ai_assistant'],
  // AI search indexes.
  [/OAI-SearchBot/i, 'OAI-SearchBot', 'ai_search'],
  [/Claude-SearchBot/i, 'Claude-SearchBot', 'ai_search'],
  [/PerplexityBot/i, 'PerplexityBot', 'ai_search'],
  // AI training and general AI crawlers.
  [/GPTBot/i, 'GPTBot', 'ai_crawler'],
  [/ClaudeBot|anthropic-ai/i, 'ClaudeBot', 'ai_crawler'],
  [/Google-Extended/i, 'Google-Extended', 'ai_crawler'],
  [/GoogleOther/i, 'GoogleOther', 'ai_crawler'],
  [/Applebot-Extended/i, 'Applebot-Extended', 'ai_crawler'],
  [/meta-externalagent/i, 'meta-externalagent', 'ai_crawler'],
  [/Amazonbot/i, 'Amazonbot', 'ai_crawler'],
  [/Bytespider/i, 'Bytespider', 'ai_crawler'],
  [/CCBot/i, 'CCBot', 'ai_crawler'],
  [/cohere-ai/i, 'cohere-ai', 'ai_crawler'],
  // Search engines.
  [/Googlebot|Google-InspectionTool|Storebot-Google/i, 'Googlebot', 'search'],
  [/bingbot|BingPreview/i, 'Bingbot', 'search'],
  [/DuckDuckBot/i, 'DuckDuckBot', 'search'],
  [/Applebot/i, 'Applebot', 'search'],
  [/YandexBot/i, 'YandexBot', 'search'],
  [/Baiduspider/i, 'Baiduspider', 'search'],
  [/Slurp/i, 'Yahoo', 'search'],
  [/BraveBot|Brave-Search/i, 'Brave', 'search'],
  // Link previews.
  [/facebookexternalhit|Facebot|meta-externalfetcher/i, 'Facebook', 'link_preview'],
  [/Twitterbot/i, 'Twitterbot', 'link_preview'],
  [/Slackbot|Slack-ImgProxy/i, 'Slackbot', 'link_preview'],
  [/Discordbot/i, 'Discordbot', 'link_preview'],
  [/LinkedInBot/i, 'LinkedInBot', 'link_preview'],
  [/WhatsApp/i, 'WhatsApp', 'link_preview'],
  [/TelegramBot/i, 'TelegramBot', 'link_preview'],
  // SEO tools.
  [/AhrefsBot/i, 'AhrefsBot', 'seo_tool'],
  [/SemrushBot/i, 'SemrushBot', 'seo_tool'],
  [/MJ12bot/i, 'MJ12bot', 'seo_tool'],
  [/DotBot/i, 'DotBot', 'seo_tool'],
];

const GENERIC_BOT = /bot\b|crawler|spider|scraper|fetch|curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|node-fetch|axios|okhttp|headless|lighthouse|monitor|uptime|vercel-/i;
const BROWSER = /Mozilla\/5\.0/;

/**
 * @param {string|null|undefined} userAgent
 * @returns {{ agent: string, kind: 'ai_assistant'|'ai_search'|'ai_crawler'|'search'|'link_preview'|'seo_tool'|'other_bot'|'browser'|'unknown' }}
 */
export function visitorKind(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return { agent: 'none', kind: 'unknown' };
  for (const [pattern, agent, kind] of AGENTS) {
    if (pattern.test(ua)) return { agent, kind };
  }
  if (GENERIC_BOT.test(ua)) return { agent: 'other', kind: 'other_bot' };
  if (BROWSER.test(ua)) return { agent: 'browser', kind: 'browser' };
  return { agent: 'other', kind: 'unknown' };
}

/** True for the kinds that are a machine reading the site on purpose. */
export const isMachine = (kind) => kind !== 'browser' && kind !== 'unknown';
