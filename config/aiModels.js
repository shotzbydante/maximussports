/**
 * AI model configuration.
 *
 * Centralizes model selection for all OpenAI-powered features.
 * Override via environment variables for easy upgrades.
 */

export const REEL_COPY_MODEL = process.env.REEL_COPY_MODEL || 'gpt-4o-mini';

export const REEL_COPY_MAX_TOKENS = parseInt(process.env.REEL_COPY_MAX_TOKENS || '1200', 10);

export const REEL_COPY_TEMPERATURE = parseFloat(process.env.REEL_COPY_TEMPERATURE || '0.7');

export const REEL_COPY_TIMEOUT_MS = parseInt(process.env.REEL_COPY_TIMEOUT_MS || '8000', 10);
