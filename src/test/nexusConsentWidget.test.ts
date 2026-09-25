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
const TERMS_PAGE = 'https://example.test/network-terms';

const field = (name: string) =>
  (document.querySelector(`input[type=hidden][name="${name}"]`) as HTMLInputElement | null)?.value;

const mount = async (attrs = '') => {
  const terms = await buildConsentTerms({ termsUrl: TERMS_PAGE });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => terms }));
  document.body.innerHTML = `
    <form id="signup">
      <input name="email" value="grace@example.com">
      <div data-nexus-consent data-terms-url="https://example.test/getConsentTerms" data-organization="MakeHaven" ${attrs}></div>
    </form>`;
  const ready = new Promise((r) => document.addEventListener('nexus-consent:ready', r, { once: true }));
  // eslint-disable-next-line no-new-func
  new Function(script)();
  await ready;
  return terms;
};

const host = () => document.querySelector('[data-nexus-consent]') as HTMLElement;
const box = (name: string) => document.querySelector(`input[data-nc="${name}"]`) as HTMLInputElement;
const tick = (name: string) => { box(name).checked = !box(name).checked; box(name).dispatchEvent(new Event('change')); };

describe('embeddable consent block', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('is one checkbox with the network\'s own words and a link to the full terms — not an extra page', async () => {
    const terms = await mount();
    expect(host().classList.contains('nc-compact')).toBe(true);
    expect(document.querySelectorAll('.nexus-consent input[type=checkbox]')).toHaveLength(3);
    expect(document.body.textContent).toContain(terms.summary.heading);
    expect(document.body.textContent).toContain(terms.summary.always);
    expect(document.body.textContent).toContain(terms.summary.never);
    const link = document.querySelector('.nexus-consent a') as HTMLAnchorElement;
    expect(link.href).toBe(TERMS_PAGE);
    expect(link.target).toBe('_blank');
    // The two choices wait until the founder joins.
    expect((document.querySelector('.nc-sub') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector('.nexus-consent script')).toBeNull();
  });

  it('starts with nothing agreed; directory listing is pre-ticked but not recorded until they join', async () => {
    await mount();
    expect(field('nexus_consent_agreed')).toBe('false');
    expect(box('directory_listing').checked).toBe(true);
    expect(box('directory_listing').disabled).toBe(true);
    expect(field('nexus_consent_directory_listing')).toBe('false');
    expect(field('nexus_consent_share_details')).toBe('false');
    expect(field('nexus_consent_accepted_at')).toBe('');
  });

  it('records agreement, the terms shown, and the founder\'s choices (directory on, details off by default)', async () => {
    const terms = await mount();
    tick('agreed');
    expect((document.querySelector('.nc-sub') as HTMLElement).hidden).toBe(false);
    expect(field('nexus_consent_agreed')).toBe('true');
    expect(field('nexus_consent_terms_hash')).toBe(terms.terms_hash);
    expect(field('nexus_consent_directory_listing')).toBe('true');
    expect(field('nexus_consent_share_details')).toBe('false');
    expect(field('nexus_consent_accepted_at')).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    tick('directory_listing');
    tick('share_details');
    expect(field('nexus_consent_directory_listing')).toBe('false');
    expect(field('nexus_consent_share_details')).toBe('true');

    const read = (window as any).NexusConsent.read(host());
    expect(read).toMatchObject({ agreed: true, terms_hash: terms.terms_hash, directory_listing: false, share_details: true });
  });

  it('clears the choices if the founder un-ticks the agreement', async () => {
    await mount();
    tick('agreed');
    tick('share_details');
    tick('agreed');
    expect(field('nexus_consent_agreed')).toBe('false');
    expect(field('nexus_consent_share_details')).toBe('false');
    expect(field('nexus_consent_accepted_at')).toBe('');
    expect((window as any).NexusConsent.read(host())).toBeNull();
  });

  it('can be pre-ticked; the moment of agreement is then the form submission', async () => {
    await mount('data-default-agreed="true"');
    expect(field('nexus_consent_agreed')).toBe('true');
    expect(field('nexus_consent_directory_listing')).toBe('true');
    expect(field('nexus_consent_accepted_at')).toBe('');
    const form = document.getElementById('signup') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(field('nexus_consent_accepted_at')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('offers the long form with the full terms inline', async () => {
    const terms = await mount('data-layout="full"');
    expect(host().classList.contains('nc-compact')).toBe(false);
    expect(document.querySelector('.nexus-consent details .nc-doc')).not.toBeNull();
    expect(document.body.textContent).toContain(terms.documents[0].sections[0].body);
    expect(box('directory_listing').checked).toBe(true);
  });
});
