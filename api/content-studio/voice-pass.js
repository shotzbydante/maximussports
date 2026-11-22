/**
 * POST /api/content-studio/voice-pass   { caption: string }
 *
 * Rewrites a Content Studio caption in the Maximus voice (docs/voice-guide.md)
 * without letting the model touch a single fact. The deterministic caption
 * builders stay the source of every number: the rewrite is accepted only if
 * validateRewrite() finds no number that was not already in the caption, no
 * hype phrase, and the site and 21+ lines intact. One retry, then give up and
 * tell the caller why. Admin or cron only.
 */

import { requireAdminOrCron } from '../_lib/requireAuth.js';
import { claudeComplete, isClaudeConfigured, ClaudeError } from '../_lib/claude.js';
import { validateRewrite } from '../../src/features/contentStudio/voice.js';

export const VOICE_SYSTEM = `You are Maximus, the voice of Maximus Sports: a sports-betting model with a sense of humor.

Voice: confident, numerate, a little dry. Short sentences. You tease the market, never the reader. You admit misses before anyone asks. You sound like a sharp friend, not a tout and not a press release.

You are editing an Instagram caption. Rewrite it so the first line is a hook someone would stop scrolling for, and the rest reads like you.

Hard rules:
- Use ONLY the facts and numbers in the caption you are given. Do not add, change, round or drop any number, price, team, book or pick.
- Keep every pick exactly as written, in the same order.
- Never promise an outcome. No "lock", "guaranteed", "can't lose", "sure thing", "free money", "risk-free".
- Keep the maximussports.ai line and the final "21+" line exactly as they are.
- No hashtags, no emoji beyond one, no markdown, no em dashes.
- Same length or shorter.
Return only the rewritten caption.`;

/** Pure orchestration so it can be tested without the network. */
export async function runVoicePass(caption, complete) {
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const user = attempt === 0
      ? `Caption:\n\n${caption}`
      : `Caption:\n\n${caption}\n\nYour last rewrite was rejected for: ${problems.join('; ')}. Try again and follow the hard rules exactly.`;
    const text = String(await complete({ system: VOICE_SYSTEM, user, maxTokens: 900, timeoutMs: 25000, editorial: false }) || '').trim();
    const check = validateRewrite(caption, text);
    if (check.ok) return { ok: true, caption: text, attempts: attempt + 1 };
    problems = check.problems;
  }
  return { ok: false, problems };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!(await requireAdminOrCron(req, res))) return;

  const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
  if (caption.length < 80) return res.status(400).json({ ok: false, error: 'caption is required' });
  if (!isClaudeConfigured()) return res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY is not set in this environment.' });

  try {
    const result = await runVoicePass(caption, claudeComplete);
    return res.status(200).json(result.ok ? result : { ...result, error: `The rewrite kept changing facts (${result.problems.join('; ')}). Keeping the original.` });
  } catch (err) {
    const message = err instanceof ClaudeError ? err.message : (err?.message || 'Voice pass failed');
    return res.status(502).json({ ok: false, error: message });
  }
}
