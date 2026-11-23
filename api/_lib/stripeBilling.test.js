/**
 * Tests for the shared Stripe billing logic and the webhook built on it.
 * Stripe and Supabase are faked. These lock: both Stripe payload shapes are
 * read, a customer's plan is decided from all of their subscriptions, a
 * cancellation reaches the profile, and a missing optional column cannot
 * lose a plan change.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  subscriptionPeriodEnd, invoiceSubscriptionId, subscriptionToFields, endedFields,
  pickSubscription, resolveCustomerPlan, updateProfile, isActiveStatus,
} from './stripeBilling.js';

vi.mock('./supabaseAdmin.js', () => ({ getSupabaseAdmin: () => null, verifyUserToken: async () => null }));
vi.mock('./posthogServer.js', () => ({ captureEvent: async () => {} }));
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_unit_tests';
const { syncFromEvent } = await import('../stripe/webhook.js');

const END = 1795890283;
const sub = (over = {}) => ({
  id: 'sub_1', status: 'active', created: 100, customer: 'cus_1', cancel_at_period_end: false, cancel_at: null,
  default_payment_method: null,
  items: { data: [{ current_period_end: END, price: { id: 'price_pro' } }] },
  ...over,
});

/** A fake profiles table: records updates, can pretend columns are missing. */
function fakeDb({ missing = [], profile = { id: 'user_1', plan_tier: 'free' } } = {}) {
  const updates = [];
  const sb = {
    updates,
    from: () => ({
      update: (payload) => ({
        eq: async () => {
          const bad = missing.find((c) => c in payload);
          if (bad) return { error: { message: `Could not find the '${bad}' column of 'profiles' in the schema cache` } };
          updates.push(payload);
          Object.assign(profile, payload);
          return { error: null };
        },
      }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
    }),
  };
  return sb;
}

const fakeStripe = (subs, card = { last4: '4242', brand: 'visa' }) => ({
  subscriptions: { list: vi.fn(async () => ({ data: subs })) },
  paymentMethods: { retrieve: vi.fn(async () => ({ card })) },
});

describe('reading Stripe objects', () => {
  it('finds the period end on the subscription or on its items', () => {
    expect(subscriptionPeriodEnd({ current_period_end: 5 })).toBe(5);
    expect(subscriptionPeriodEnd(sub())).toBe(END);
    expect(subscriptionPeriodEnd({ items: { data: [] } })).toBeNull();
  });

  it('finds an invoice\'s subscription in either API shape', () => {
    expect(invoiceSubscriptionId({ subscription: 'sub_old' })).toBe('sub_old');
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_new' } } })).toBe('sub_new');
    expect(invoiceSubscriptionId({})).toBeNull();
  });

  it('maps a live subscription to Pro with its renewal date and price', () => {
    expect(subscriptionToFields(sub(), { last4: '4242', brand: 'visa' })).toEqual({
      stripe_subscription_id: 'sub_1', stripe_price_id: 'price_pro', subscription_status: 'active', plan_tier: 'pro',
      current_period_end: new Date(END * 1000).toISOString(), cancel_at_period_end: false,
      payment_method_last4: '4242', payment_method_brand: 'visa',
    });
  });

  it('marks a subscription set to cancel, and treats non-live statuses as free', () => {
    expect(subscriptionToFields(sub({ cancel_at_period_end: true })).cancel_at_period_end).toBe(true);
    expect(subscriptionToFields(sub({ cancel_at: END })).cancel_at_period_end).toBe(true);
    expect(subscriptionToFields(sub({ status: 'past_due' })).plan_tier).toBe('free');
    expect(isActiveStatus('trialing')).toBe(true);
    expect(isActiveStatus('canceled')).toBe(false);
  });

  it('clears billing details when nothing is live', () => {
    expect(endedFields(sub({ status: 'canceled' }))).toEqual({
      plan_tier: 'free', subscription_status: 'canceled', stripe_subscription_id: 'sub_1', current_period_end: null,
      cancel_at_period_end: false, payment_method_last4: null, payment_method_brand: null,
    });
    expect(endedFields().subscription_status).toBe('canceled');
  });
});

describe('pickSubscription', () => {
  it('prefers a live subscription over a cancelled one', () => {
    expect(pickSubscription([sub({ id: 'a', status: 'canceled', created: 900 }), sub({ id: 'b' })]).id).toBe('b');
  });
  it('prefers one that is not set to cancel, then the later renewal', () => {
    expect(pickSubscription([sub({ id: 'a', cancel_at_period_end: true }), sub({ id: 'b' })]).id).toBe('b');
    expect(pickSubscription([sub({ id: 'a' }), sub({ id: 'b', items: { data: [{ current_period_end: END + 10 }] } })]).id).toBe('b');
  });
  it('falls back to the newest when none is live, and to null when there are none', () => {
    expect(pickSubscription([sub({ id: 'a', status: 'canceled', created: 1 }), sub({ id: 'b', status: 'canceled', created: 2 })]).id).toBe('b');
    expect(pickSubscription([])).toBeNull();
  });
});

describe('resolveCustomerPlan', () => {
  it('returns Pro with the card for a customer with a live subscription', async () => {
    const stripe = fakeStripe([sub({ default_payment_method: 'pm_1' })]);
    const plan = await resolveCustomerPlan(stripe, 'cus_1');
    expect(plan.isPro).toBe(true);
    expect(plan.fields.stripe_customer_id).toBe('cus_1');
    expect(plan.fields.payment_method_last4).toBe('4242');
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 20 });
  });

  it('returns free when every subscription has ended, or there are none', async () => {
    expect((await resolveCustomerPlan(fakeStripe([sub({ status: 'canceled' })]), 'cus_1')).fields.plan_tier).toBe('free');
    const none = await resolveCustomerPlan(fakeStripe([]), 'cus_1');
    expect(none.isPro).toBe(false);
    expect(none.fields.stripe_subscription_id).toBeNull();
  });

  it('keeps Pro when one of two subscriptions is cancelled, and counts the live ones', async () => {
    const plan = await resolveCustomerPlan(fakeStripe([sub({ id: 'a', status: 'canceled' }), sub({ id: 'b' }), sub({ id: 'c' })]), 'cus_1');
    expect(plan.isPro).toBe(true);
    expect(plan.liveCount).toBe(2);
  });

  it('still returns Pro when the card lookup fails', async () => {
    const stripe = fakeStripe([sub({ default_payment_method: 'pm_1' })]);
    stripe.paymentMethods.retrieve = vi.fn(async () => { throw new Error('nope'); });
    const plan = await resolveCustomerPlan(stripe, 'cus_1');
    expect(plan.isPro).toBe(true);
    expect('payment_method_last4' in plan.fields).toBe(false);
  });
});

describe('updateProfile', () => {
  it('writes every field when the table has them', async () => {
    const sb = fakeDb();
    expect(await updateProfile(sb, 'user_1', { plan_tier: 'pro', payment_method_last4: '4242' })).toEqual({ ok: true, dropped: [] });
    expect(sb.updates[0].plan_tier).toBe('pro');
    expect(sb.updates[0].updated_at).toBeTruthy();
  });

  it('drops missing columns one at a time and still saves the plan', async () => {
    const sb = fakeDb({ missing: ['cancel_at_period_end', 'payment_method_last4', 'payment_method_brand'] });
    const r = await updateProfile(sb, 'user_1', endedFields(sub({ status: 'canceled' })));
    expect(r.ok).toBe(true);
    expect(r.dropped.sort()).toEqual(['cancel_at_period_end', 'payment_method_brand', 'payment_method_last4']);
    expect(sb.updates[0].plan_tier).toBe('free');
  });

  it('fails rather than save without the plan column, or on any other error', async () => {
    expect((await updateProfile(fakeDb({ missing: ['plan_tier'] }), 'user_1', { plan_tier: 'pro' })).ok).toBe(false);
    const sb = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'permission denied' } }) }) }) };
    expect(await updateProfile(sb, 'user_1', { plan_tier: 'pro' })).toEqual({ ok: false, dropped: [], error: 'permission denied' });
    expect((await updateProfile(fakeDb(), null, {})).ok).toBe(false);
  });
});

describe('webhook syncFromEvent', () => {
  const event = (type, object) => ({ type, id: 'evt_1', data: { object } });

  it('downgrades a Pro profile when its only subscription is deleted', async () => {
    const profile = { id: 'user_1', plan_tier: 'pro' };
    const sb = fakeDb({ profile });
    const record = vi.fn();
    const r = await syncFromEvent(event('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1', metadata: { supabase_user_id: 'user_1' } }),
      { stripeClient: fakeStripe([sub({ status: 'canceled' })]), sb, record });
    expect(r).toMatchObject({ handled: true, isPro: false, wasPro: true });
    expect(profile.plan_tier).toBe('free');
    expect(profile.subscription_status).toBe('canceled');
    expect(record).toHaveBeenCalledWith('user_1', 'subscription_cancelled', { plan: 'pro' });
  });

  it('keeps Pro when another subscription is still live', async () => {
    const profile = { id: 'user_1', plan_tier: 'pro' };
    const record = vi.fn();
    await syncFromEvent(event('customer.subscription.deleted', { id: 'sub_a', customer: 'cus_1', metadata: { supabase_user_id: 'user_1' } }),
      { stripeClient: fakeStripe([sub({ id: 'sub_a', status: 'canceled' }), sub({ id: 'sub_b' })]), sb: fakeDb({ profile }), record });
    expect(profile.plan_tier).toBe('pro');
    expect(profile.stripe_subscription_id).toBe('sub_b');
    expect(record).not.toHaveBeenCalled();
  });

  it('grants Pro on checkout completion and records the start once', async () => {
    const profile = { id: 'user_1', plan_tier: 'free' };
    const record = vi.fn();
    await syncFromEvent(event('checkout.session.completed', { customer: 'cus_1', metadata: { supabase_user_id: 'user_1' } }),
      { stripeClient: fakeStripe([sub()]), sb: fakeDb({ profile }), record });
    expect(profile).toMatchObject({ plan_tier: 'pro', stripe_customer_id: 'cus_1', current_period_end: new Date(END * 1000).toISOString() });
    expect(record).toHaveBeenCalledWith('user_1', 'subscription_started', { plan: 'pro', status: 'active' });
  });

  it('refreshes the renewal date from a new-shape invoice.paid with no metadata on the invoice', async () => {
    const profile = { id: 'user_1', plan_tier: 'pro', stripe_customer_id: 'cus_1' };
    const record = vi.fn();
    const r = await syncFromEvent(event('invoice.paid', { customer: 'cus_1', parent: { subscription_details: { subscription: 'sub_1' } } }),
      { stripeClient: fakeStripe([sub()]), sb: fakeDb({ profile }), record });
    expect(r.handled).toBe(true);
    expect(profile.current_period_end).toBe(new Date(END * 1000).toISOString());
    expect(record).not.toHaveBeenCalled();
  });

  it('records a scheduled cancellation while keeping Pro until the period ends', async () => {
    const profile = { id: 'user_1', plan_tier: 'pro' };
    await syncFromEvent(event('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', metadata: { supabase_user_id: 'user_1' } }),
      { stripeClient: fakeStripe([sub({ cancel_at_period_end: true })]), sb: fakeDb({ profile }), record: vi.fn() });
    expect(profile).toMatchObject({ plan_tier: 'pro', cancel_at_period_end: true });
  });

  it('ignores other events, and throws when the profile cannot be saved so Stripe retries', async () => {
    expect(await syncFromEvent(event('charge.succeeded', { customer: 'cus_1' }), { stripeClient: fakeStripe([]), sb: fakeDb(), record: vi.fn() })).toEqual({ handled: false });
    const broken = fakeDb();
    broken.from = () => ({
      update: () => ({ eq: async () => ({ error: { message: 'permission denied' } }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan_tier: 'pro' }, error: null }) }) }),
    });
    await expect(syncFromEvent(event('customer.subscription.deleted', { customer: 'cus_1', metadata: { supabase_user_id: 'user_1' } }),
      { stripeClient: fakeStripe([]), sb: broken, record: vi.fn() })).rejects.toThrow('profile update failed');
  });
});
