/**
 * Server-side PostHog capture helper.
 *
 * Uses the PostHog HTTP API directly — no SDK dependency required.
 * All calls are fire-and-catch (never throw, never block the caller).
 *
 * Env vars (same key the frontend uses, available in Vercel serverless):
 *   POSTHOG_API_KEY  or  VITE_POSTHOG_KEY    — project API key
 *   POSTHOG_HOST     or  VITE_POSTHOG_HOST   — ingest endpoint
 */

/* global process, fetch */

const PH_KEY  = process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_KEY || '';
const PH_HOST = process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

function isTestEmail(email) {
  return typeof email === 'string' && /\+.*@gmail\.com$/i.test(email);
}

/**
 * Capture a single event via PostHog's /capture/ HTTP endpoint.
 *
 * @param {object} opts
 * @param {string} opts.distinctId  — stable user ID (Supabase UUID)
 * @param {string} opts.event       — event name
 * @param {Record<string, unknown>} [opts.properties] — event properties
 * @param {string} [opts.timestamp] — ISO-8601 timestamp (for historical events)
 */
export async function captureEvent({ distinctId, event, properties = {}, timestamp }) {
  if (!PH_KEY || !distinctId || !event) return;

  const body = {
    api_key: PH_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      ...properties,
      $lib: 'maximus-server',
    },
  };
  if (timestamp) body.timestamp = timestamp;

  try {
    const res = await fetch(`${PH_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[posthog-server] capture ${event} failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[posthog-server] capture ${event} error: ${err.message}`);
  }
}

/**
 * Identify a person (set person properties) via the /capture/ endpoint.
 *
 * @param {object} opts
 * @param {string} opts.distinctId
 * @param {Record<string, unknown>} opts.properties — person properties to $set
 */
export async function identifyPerson({ distinctId, properties = {} }) {
  if (!PH_KEY || !distinctId) return;

  try {
    await fetch(`${PH_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: PH_KEY,
        event: '$identify',
        distinct_id: distinctId,
        properties: { $set: properties },
      }),
    });
  } catch (err) {
    console.warn(`[posthog-server] identify error: ${err.message}`);
  }
}

/**
 * Convenience: fire `account_created` + `$identify` for a Supabase auth user.
 *
 * @param {object} authUser — Supabase auth user object
 * @param {object} [opts]
 * @param {string} [opts.sourcePath]   — creation path identifier
 * @param {string} [opts.username]     — profile username if known
 * @param {string} [opts.timestamp]    — override event timestamp (for backfills)
 * @returns {Promise<boolean>} true if the capture call succeeded
 */
export async function captureAccountCreated(authUser, {
  sourcePath = 'server_ensure',
  username = null,
  timestamp = null,
} = {}) {
  if (!PH_KEY || !authUser?.id) return false;

  const email = authUser.email || null;
  const method = authUser.app_metadata?.provider || 'email';
  const testUser = isTestEmail(email);

  const eventProps = {
    user_id:       authUser.id,
    email,
    username,
    signup_method:  method,
    plan_tier:      'free',
    is_test_user:   testUser,
    source_path:    sourcePath,
    created_at:     authUser.created_at || null,
    $insert_id:     `account_created_${authUser.id}`,
  };

  const personProps = {
    email,
    username,
    signup_method: method,
    plan_tier:     'free',
    plan:          'free',
    is_test_user:  testUser,
  };

  try {
    await Promise.all([
      captureEvent({
        distinctId: authUser.id,
        event: 'account_created',
        properties: eventProps,
        timestamp: timestamp || undefined,
      }),
      identifyPerson({
        distinctId: authUser.id,
        properties: personProps,
      }),
    ]);
    return true;
  } catch (err) {
    console.warn(`[posthog-server] captureAccountCreated failed for ${authUser.id}:`, err.message);
    return false;
  }
}

export { isTestEmail };
