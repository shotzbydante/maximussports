/**
 * AI model configuration.
 *
 * Text generation runs on Claude (see api/_lib/claude.js). CLAUDE_MODEL sets
 * the model for every feature; REEL_COPY_MODEL overrides it for reel copy only.
 * Claude models do not accept a temperature setting, so there is none here.
 */

export const REEL_COPY_MODEL = process.env.REEL_COPY_MODEL || undefined;

export const REEL_COPY_MAX_TOKENS = parseInt(process.env.REEL_COPY_MAX_TOKENS || '1200', 10);

export const REEL_COPY_TIMEOUT_MS = parseInt(process.env.REEL_COPY_TIMEOUT_MS || '8000', 10);
