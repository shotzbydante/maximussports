/**
 * Tests for persistence hardening — classifyError() and the
 * missing-table detection the health endpoint relies on.
 *
 * We don't exercise the live Supabase client here; that's covered by the
 * runtime validation doc. We focus on the logic that decides whether an
 * error means "tables don't exist" vs "something else broke".
 */

import { describe, it, expect } from 'vitest';
import { classifyError } from './picksHistory.js';

describe('classifyError', () => {
  it('maps null/undefined to ok', () => {
    expect(classifyError(null).kind).toBe('ok');
    expect(classifyError(undefined).kind).toBe('ok');
  });

  it('detects Postgres undefined_table (42P01)', () => {
    const r = classifyError({ code: '42P01', message: 'relation "public.picks_runs" does not exist' });
    expect(r.kind).toBe('missing_table');
    expect(r.code).toBe('42P01');
  });

  it('detects Supabase PGRST205 schema-cache missing table', () => {
    const r = classifyError({ code: 'PGRST205', message: "Could not find the table 'public.picks' in the schema cache" });
    expect(r.kind).toBe('missing_table');
  });

  it('detects missing table from message text alone', () => {
    const r = classifyError({ code: 'SOMETHING_ELSE', message: 'relation picks_foo does not exist' });
    expect(r.kind).toBe('missing_table');
  });

  it('classifies other errors as db_error', () => {
    const r = classifyError({ code: '23505', message: 'duplicate key value violates unique constraint' });
    expect(r.kind).toBe('db_error');
    expect(r.code).toBe('23505');
  });

  it('db_error for generic error without matching text', () => {
    const r = classifyError({ code: '', message: 'connection timeout' });
    expect(r.kind).toBe('db_error');
  });
});
