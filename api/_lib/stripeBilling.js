/**
 * Shared Stripe subscription logic for the webhook, the billing sync and
 * checkout.
 *
 * Two facts about Stripe shape this file:
 *
 *   - Webhook payloads are rendered in the API version of the webhook
 *     endpoint, not the version this code pins. From the 2025 "basil"
 *     versions on, a subscription's period end lives on its items and an
 *     invoice names its subscription under `parent.subscription_details`.
 *     The readers here accept both shapes.
 *   - One customer can hold several subscriptions. The plan a profile gets
 *     is decided from all of them (`resolveCustomerPlan`), so cancelling one
 *     of two does not take Pro away, and cancelling the only one does.
 */

export const ACTIVE_STATUSES = Object.freeze(['active', 'trialing']);

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.includes(status);
}

const idOf = (v) => (typeof v === 'string' ? v : v?.id ?? null);

/** Period end in epoch seconds, from either API shape. */
export function subscriptionPeriodEnd(sub) {
  if (Number.isFinite(sub?.current_period_end)) return sub.current_period_end;
  const ends = (sub?.items?.data || []).map((i) => i?.current_period_end).filter(Number.isFinite);
  return ends.length ? Math.max(...ends) : null;
}

/** The subscription an invoice belongs to, from either API shape. */
export function invoiceSubscriptionId(invoice) {
  return idOf(invoice?.subscription) || idOf(invoice?.parent?.subscription_details?.subscription) || null;
}

/** Profile columns for a subscription. `card` is a payment method's card, when known. */
export function subscriptionToFields(sub, card = null) {
  const active = isActiveStatus(sub.status);
  const end = subscriptionPeriodEnd(sub);
  const fields = {
    stripe_subscription_id: sub.id,
    stripe_price_id: sub.items?.data?.[0]?.price?.id ?? null,
    subscription_status: sub.status,
    plan_tier: active ? 'pro' : 'free',
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: !!(sub.cancel_at_period_end || (active && sub.cancel_at)),
  };
  if (card) {
    fields.payment_method_last4 = card.last4 ?? null;
    fields.payment_method_brand = card.brand ?? null;
  }
  return fields;
}

/** Profile columns for a customer with no live subscription. */
export function endedFields(sub = null) {
  return {
    plan_tier: 'free',
    subscription_status: sub?.status && !isActiveStatus(sub.status) ? sub.status : 'canceled',
    stripe_subscription_id: sub?.id ?? null,
    current_period_end: null,
    cancel_at_period_end: false,
    payment_method_last4: null,
    payment_method_brand: null,
  };
}

/**
 * The subscription that decides a customer's plan: a live one if there is
 * one (preferring one not set to cancel, then the latest period end),
 * otherwise the most recently created.
 */
export function pickSubscription(subs) {
  const list = (subs || []).filter(Boolean);
  if (list.length === 0) return null;
  const live = list.filter((s) => isActiveStatus(s.status));
  if (live.length > 0) {
    return [...live].sort((a, b) =>
      (Number(!!a.cancel_at_period_end) - Number(!!b.cancel_at_period_end)) ||
      ((subscriptionPeriodEnd(b) || 0) - (subscriptionPeriodEnd(a) || 0)))[0];
  }
  return [...list].sort((a, b) => (b.created || 0) - (a.created || 0))[0];
}

/**
 * Ask Stripe what plan a customer is on right now.
 * @returns {Promise<{ isPro: boolean, subscription: object|null, liveCount: number, fields: object }>}
 */
export async function resolveCustomerPlan(stripe, customerId) {
  const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  const subs = list?.data || [];
  const chosen = pickSubscription(subs);
  const liveCount = subs.filter((s) => isActiveStatus(s.status)).length;
  if (!chosen || !isActiveStatus(chosen.status)) {
    return { isPro: false, subscription: chosen, liveCount, fields: endedFields(chosen) };
  }

  let card = null;
  const pm = chosen.default_payment_method;
  if (pm && typeof pm === 'object') card = pm.card ?? null;
  else if (typeof pm === 'string') {
    try { card = (await stripe.paymentMethods.retrieve(pm)).card ?? null; } catch { /* the card is a nicety */ }
  }
  return {
    isPro: true, subscription: chosen, liveCount,
    fields: { stripe_customer_id: customerId, ...subscriptionToFields(chosen, card) },
  };
}

const MISSING_COLUMN = /Could not find the '([a-z_0-9]+)' column|column "?(?:profiles\.)?([a-z_0-9]+)"? (?:of relation "profiles" )?does not exist/i;

/**
 * Update a profile, dropping any column the table does not have and trying
 * again, so one missing optional column can never lose a plan change.
 * @returns {Promise<{ ok: boolean, dropped: string[], error?: string }>}
 */
export async function updateProfile(sb, userId, fields) {
  if (!userId) return { ok: false, dropped: [], error: 'no user id' };
  const payload = { ...fields, updated_at: new Date().toISOString() };
  const dropped = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await sb.from('profiles').update(payload).eq('id', userId);
    if (!error) return { ok: true, dropped };
    const m = MISSING_COLUMN.exec(error.message || '');
    const column = m?.[1] || m?.[2];
    if (!column || !(column in payload) || column === 'plan_tier') return { ok: false, dropped, error: error.message };
    delete payload[column];
    dropped.push(column);
  }
  return { ok: false, dropped, error: 'too many missing columns' };
}
