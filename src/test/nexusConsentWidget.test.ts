/**
 * The embeddable consent block partners put in their own signup forms
 * (public/embed/nexus-consent.js). It runs on sites we don't control, so this
 * checks the contract partners rely on: the hidden fields it writes.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConsentTerms } from '../../functions/src/consent/terms';

const script = readFileSync(resolve(__dirname, '../../public/embed/nexus-consent.js'), 'utf8');

const field = (name: string) =>
  (document.querySelector(`input[type=hidden][name="${name}"]`) as HTMLInputElement | null)?.value;

const mount = async () => {
  const terms = await buildConsentTerms();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => terms }));
  document.body.innerHTML = `
    <form id="signup">
      <input name="email" value="grace@example.com">
      <div data-nexus-consent data-terms-url="https://example.test/getConsentTerms" data-organization="MakeHaven"></div>
    </form>`;
  const ready = new Promise((r) => document.addEventListener('nexus-consent:ready', r, { once: true }));
  // eslint-disable-next-line no-new-func
  new Function(script)();
  await ready;
  return terms;
};

const box = (name: string) => document.querySelector(`input[data-nc="${name}"]`) as HTMLInputElement;
const tick = (name: string) => { box(name).checked = !box(name).checked; box(name).dispatchEvent(new Event('change')); };

describe('embeddable consent block', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders the network\'s own words, as text', async () => {
    const terms = await mount();
    expect(document.body.textContent).toContain(terms.summary.never);
    expect(document.body.textContent).toContain(terms.choices.agree.label);
    expect(document.querySelector('.nexus-consent script')).toBeNull();
  });

  it('starts with nothing agreed and both choices off', async () => {
    await mount();
    expect(field('nexus_consent_agreed')).toBe('false');
    expect(field('nexus_consent_directory_listing')).toBe('false');
    expect(field('nexus_consent_share_details')).toBe('false');
    expect(box('directory_listing').disabled).toBe(true);
  });

  it('records agreement, the terms shown, and the founder\'s choices', async () => {
    const terms = await mount();
    tick('agreed');
    tick('directory_listing');
    expect(field('nexus_consent_agreed')).toBe('true');
    expect(field('nexus_consent_terms_hash')).toBe(terms.terms_hash);
    expect(field('nexus_consent_directory_listing')).toBe('true');
    expect(field('nexus_consent_share_details')).toBe('false');
    expect(field('nexus_consent_accepted_at')).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const read = (window as any).NexusConsent.read(document.querySelector('[data-nexus-consent]'));
    expect(read).toMatchObject({ agreed: true, terms_hash: terms.terms_hash, directory_listing: true, share_details: false });
  });

  it('clears the choices if the founder un-ticks the agreement', async () => {
    await mount();
    tick('agreed');
    tick('share_details');
    tick('agreed');
    expect(field('nexus_consent_agreed')).toBe('false');
    expect(field('nexus_consent_share_details')).toBe('false');
    expect((window as any).NexusConsent.read(document.querySelector('[data-nexus-consent]'))).toBeNull();
  });
});
