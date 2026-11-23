import { describe, it, expect } from 'vitest';
import { renderHTML, renderText, getSubject, BENEFITS } from './confirmSignup.js';

const URL = 'https://example.supabase.co/auth/v1/verify?token=abc&type=magiclink';

describe('confirm signup email', () => {
  it('puts the confirm button before the benefits and the raw link last', () => {
    const html = renderHTML({ confirmUrl: URL });
    const button = html.indexOf('>\n                Confirm email');
    const benefits = html.indexOf(BENEFITS[0][0]);
    const fallback = html.indexOf('Button not working?');
    expect(button).toBeGreaterThan(-1);
    expect(button).toBeLessThan(benefits);
    expect(benefits).toBeLessThan(fallback);
  });

  it('leads with football and no longer sells one sport', () => {
    const html = renderHTML({ confirmUrl: URL });
    expect(BENEFITS[0][0]).toMatch(/NFL/);
    expect(html).not.toMatch(/college basketball intelligence/i);
    expect(html).not.toMatch(/header-banner/);
  });

  it('escapes the link and keeps it usable', () => {
    const html = renderHTML({ confirmUrl: URL });
    expect(html).toContain('token=abc&amp;type=magiclink');
    expect(renderText({ confirmUrl: URL })).toContain(URL);
  });

  it('the welcome version has no confirm link and points at the NFL picks', () => {
    const html = renderHTML({ isWelcome: true });
    expect(html).not.toMatch(/Button not working/);
    expect(html).toContain('https://maximussports.ai/nfl');
    expect(getSubject({ isWelcome: true })).toBe('Welcome to Maximus Sports');
  });

  it('shows the code under the button and leads the subject with it', () => {
    const html = renderHTML({ confirmUrl: URL, code: '482913' });
    const button = html.indexOf('>\n                Confirm email');
    const code = html.indexOf('482913');
    expect(code).toBeGreaterThan(button);
    expect(code).toBeLessThan(html.indexOf(BENEFITS[0][0]));
    expect(renderText({ confirmUrl: URL, code: '482913' })).toContain('482913');
    expect(getSubject({ code: '482913' })).toBe('482913 is your Maximus Sports code');
  });

  it('leaves the code out when there is none or it is not digits', () => {
    expect(renderHTML({ confirmUrl: URL })).not.toMatch(/Enter this code/);
    expect(renderHTML({ confirmUrl: URL, code: '<b>1</b>' })).not.toMatch(/Enter this code/);
    expect(renderHTML({ isWelcome: true, code: '482913' })).not.toContain('482913');
    expect(getSubject({ code: 'abc' })).toBe('Confirm your email for Maximus Sports');
    expect(getSubject()).toBe('Confirm your email for Maximus Sports');
  });
});
