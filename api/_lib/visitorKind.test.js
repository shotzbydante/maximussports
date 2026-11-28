import { describe, it, expect } from 'vitest';
import { visitorKind, isMachine } from './visitorKind.js';

const cases = [
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', 'ChatGPT-User', 'ai_assistant'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot', 'GPTBot', 'ai_crawler'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot', 'OAI-SearchBot', 'ai_search'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'ClaudeBot', 'ai_crawler'],
  ['Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)', 'Claude-User', 'ai_assistant'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', 'PerplexityBot', 'ai_search'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)', 'Perplexity-User', 'ai_assistant'],
  ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Googlebot', 'search'],
  ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'Bingbot', 'search'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)', 'Applebot', 'search'],
  ['Mozilla/5.0 (compatible; Applebot-Extended/0.1)', 'Applebot-Extended', 'ai_crawler'],
  ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Facebook', 'link_preview'],
  ['meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'meta-externalagent', 'ai_crawler'],
  ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'AhrefsBot', 'seo_tool'],
  ['python-requests/2.32.3', 'other', 'other_bot'],
  ['curl/8.5.0', 'other', 'other_bot'],
  ['Mozilla/5.0 (compatible; SomeNewBot/1.0)', 'other', 'other_bot'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 356.0', 'browser', 'browser'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'browser', 'browser'],
  ['', 'none', 'unknown'],
];

describe('visitorKind', () => {
  it.each(cases)('%s', (ua, agent, kind) => {
    expect(visitorKind(ua)).toEqual({ agent, kind });
  });
  it('handles a missing header', () => {
    expect(visitorKind(undefined)).toEqual({ agent: 'none', kind: 'unknown' });
  });
  it('separates machines from people', () => {
    expect(isMachine('ai_assistant')).toBe(true);
    expect(isMachine('other_bot')).toBe(true);
    expect(isMachine('browser')).toBe(false);
    expect(isMachine('unknown')).toBe(false);
  });
});
