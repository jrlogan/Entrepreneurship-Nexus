/*!
 * Entrepreneurship Nexus — embeddable consent block.
 *
 * Drop into a partner's own program or signup form so entrepreneurs can join
 * the network where they are already signing up. It is one checkbox, not an
 * extra page: "Join the network", a four-line summary in the network's exact
 * words, a link to the full terms, and — once ticked — the two choices
 * (directory listing on by default, detail sharing off). The block adds
 * hidden form fields with the founder's answers; the partner's server passes
 * them to partnerUpsertPerson as `consent`, and the network records consent
 * against those exact terms.
 *
 * Usage (inside your existing <form>):
 *
 *   <div data-nexus-consent
 *        data-terms-url="https://us-central1-PROJECT.cloudfunctions.net/getConsentTerms"
 *        data-organization="Your Organization"></div>
 *   <script src="https://YOUR-NEXUS-HOST/embed/nexus-consent.js" defer></script>
 *
 * Options:
 *   data-layout="compact" (default) | "full"
 *       compact: one checkbox + summary + link to the full terms; the two
 *                choices appear once the founder ticks it.
 *       full:    the summary, the full terms inline, and all three checkboxes.
 *   data-default-agreed="true"
 *       Pre-tick joining. The timestamp is then taken when the form is
 *       submitted, not when the page loads. Use only where the surrounding
 *       form makes the choice obvious — an unticked box is stronger evidence
 *       of consent.
 *   data-terms-page="https://…"   Override the "read the full terms" link
 *                                  (defaults to terms_url from the network).
 *   data-field-prefix="…"          Rename the hidden fields (default nexus_consent_).
 *
 * Fields added to the form:
 *   nexus_consent_agreed            "true" when the founder ticked the agreement
 *   nexus_consent_terms_hash        the terms they were shown
 *   nexus_consent_directory_listing "true" | "false"   (on by default)
 *   nexus_consent_share_details     "true" | "false"   (off by default)
 *   nexus_consent_accepted_at       ISO timestamp of the agreement tick ("" if
 *                                   pre-ticked and the form not yet submitted —
 *                                   omit accepted_at from `consent` when empty)
 *
 * Or read them in JavaScript: window.NexusConsent.read(element).
 *
 * The agreement checkbox is optional for the partner's own form: a founder may
 * sign up for your program without joining the network. Only send `consent`
 * when nexus_consent_agreed is "true".
 *
 * Plain JavaScript, no dependencies, and all text is inserted as text (never
 * as HTML).
 */
(function () {
  'use strict';

  var STYLE_ID = 'nexus-consent-style';
  var CSS = [
    '.nexus-consent{border:1px solid #d6d3d1;border-radius:10px;padding:14px 16px;margin:16px 0;font:inherit;color:inherit;background:#fafaf9}',
    '.nexus-consent h3{font-size:1.05em;margin:0 0 6px}',
    '.nexus-consent p{margin:0 0 10px;line-height:1.5}',
    '.nexus-consent ul{margin:0 0 10px;padding-left:1.2em}',
    '.nexus-consent li{margin:4px 0;line-height:1.45}',
    '.nexus-consent details{margin:0 0 12px}',
    '.nexus-consent summary{cursor:pointer;color:#8b1919;font-weight:600}',
    '.nexus-consent a{color:#8b1919;font-weight:600}',
    '.nexus-consent .nc-doc{max-height:260px;overflow:auto;border:1px solid #e7e5e4;border-radius:6px;padding:10px 12px;margin-top:8px;background:#fff}',
    '.nexus-consent .nc-doc h4{margin:10px 0 2px;font-size:.95em}',
    '.nexus-consent label{display:flex;gap:10px;align-items:flex-start;margin:8px 0;cursor:pointer}',
    '.nexus-consent input[type=checkbox]{margin-top:3px;accent-color:#8b1919}',
    '.nexus-consent .nc-help{display:block;font-size:.85em;opacity:.75}',
    '.nexus-consent .nc-error{color:#991b1b}',
    '.nexus-consent.nc-compact .nc-join{margin:0}',
    '.nexus-consent.nc-compact .nc-join>span>strong{display:block;margin-bottom:4px}',
    '.nexus-consent.nc-compact .nc-summary{font-size:.9em;line-height:1.45;opacity:.9}',
    '.nexus-consent.nc-compact .nc-summary p{margin:0 0 4px}',
    '.nexus-consent.nc-compact .nc-sub{margin:6px 0 0 30px;padding-top:6px;border-top:1px solid #e7e5e4}',
    '.nexus-consent.nc-compact .nc-sub label{margin:6px 0;font-size:.92em}',
    '.nexus-consent.nc-compact .nc-sub[hidden]{display:none}'
  ].join('');

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = el('style', { id: STYLE_ID });
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function hidden(form, host, name, value) {
    var input = (form || host).querySelector('input[type=hidden][name="' + name + '"]');
    if (!input) {
      input = el('input', { type: 'hidden', name: name });
      host.appendChild(input);
    }
    input.value = value;
  }

  function checkbox(label, help, name, className) {
    var wrap = el('label', className ? { 'class': className } : null);
    var box = el('input', { type: 'checkbox', 'data-nc': name });
    var text = el('span');
    wrap.appendChild(box);
    wrap.appendChild(text);
    return { wrap: wrap, box: box, text: text, label: label, help: help };
  }

  function plainLabel(c) {
    c.text.appendChild(document.createTextNode(c.label));
    if (c.help) c.text.appendChild(el('span', { 'class': 'nc-help' }, c.help));
  }

  function fullTerms(terms) {
    var details = el('details');
    details.appendChild(el('summary', null, 'Read the full terms'));
    var docBox = el('div', { 'class': 'nc-doc' });
    terms.documents.forEach(function (doc) {
      docBox.appendChild(el('h4', null, doc.title + ' (version ' + doc.version + ')'));
      doc.sections.forEach(function (section) {
        docBox.appendChild(el('strong', null, section.heading));
        docBox.appendChild(el('p', null, section.body));
      });
    });
    details.appendChild(docBox);
    return details;
  }

  function termsLink(host, terms) {
    var url = host.getAttribute('data-terms-page') || terms.terms_url;
    if (!url) return null;
    var p = el('p');
    p.appendChild(el('a', { href: url, target: '_blank', rel: 'noopener' }, 'Read the full terms ↗'));
    return p;
  }

  function render(host, terms) {
    var prefix = host.getAttribute('data-field-prefix') || 'nexus_consent_';
    var org = host.getAttribute('data-organization') || 'We';
    var layout = host.getAttribute('data-layout') === 'full' ? 'full' : 'compact';
    var defaultAgreed = host.getAttribute('data-default-agreed') === 'true';
    var form = host.closest('form');
    host.textContent = '';
    host.classList.add('nexus-consent');
    host.classList.toggle('nc-compact', layout === 'compact');

    var intro = org + ' is part of a regional network of organizations that support entrepreneurs. ' + terms.summary.intro;
    var agree = checkbox(terms.choices.agree.label, null, 'agreed', layout === 'compact' ? 'nc-join' : null);
    var directory = checkbox(terms.choices.directory_listing.label, terms.choices.directory_listing.help, 'directory_listing');
    var share = checkbox(terms.choices.share_details.label, terms.choices.share_details.help, 'share_details');
    var sub = null;

    if (layout === 'compact') {
      // One checkbox, with the summary and the link to the full terms as its
      // label; the two choices unfold beneath it once the founder ticks it.
      agree.text.appendChild(el('strong', null, terms.summary.heading));
      var summary = el('div', { 'class': 'nc-summary' });
      summary.appendChild(el('p', null, intro));
      summary.appendChild(el('p', null, terms.summary.always));
      summary.appendChild(el('p', null, terms.summary.choice));
      summary.appendChild(el('p', null, terms.summary.never));
      var link = termsLink(host, terms);
      if (link) summary.appendChild(link); else summary.appendChild(fullTerms(terms));
      agree.text.appendChild(summary);
      host.appendChild(agree.wrap);

      sub = el('div', { 'class': 'nc-sub' });
      plainLabel(directory);
      plainLabel(share);
      sub.appendChild(directory.wrap);
      sub.appendChild(share.wrap);
      host.appendChild(sub);
    } else {
      host.appendChild(el('h3', null, terms.summary.heading));
      host.appendChild(el('p', null, intro));
      var list = el('ul');
      list.appendChild(el('li', null, terms.summary.always));
      list.appendChild(el('li', null, terms.summary.choice));
      list.appendChild(el('li', null, terms.summary.never));
      host.appendChild(list);
      host.appendChild(fullTerms(terms));
      var link2 = termsLink(host, terms);
      if (link2) host.appendChild(link2);
      plainLabel(agree);
      plainLabel(directory);
      plainLabel(share);
      [agree, directory, share].forEach(function (c) { host.appendChild(c.wrap); });
    }

    agree.box.checked = defaultAgreed;
    directory.box.checked = !!terms.choices.directory_listing.default;
    share.box.checked = !!terms.choices.share_details.default;

    var acceptedAt = '';
    function sync() {
      // The optional choices only mean something once the founder has agreed.
      directory.box.disabled = !agree.box.checked;
      share.box.disabled = !agree.box.checked;
      if (sub) sub.hidden = !agree.box.checked;
      if (!agree.box.checked) acceptedAt = '';
      hidden(form, host, prefix + 'agreed', agree.box.checked ? 'true' : 'false');
      hidden(form, host, prefix + 'terms_hash', terms.terms_hash);
      hidden(form, host, prefix + 'directory_listing', agree.box.checked && directory.box.checked ? 'true' : 'false');
      hidden(form, host, prefix + 'share_details', agree.box.checked && share.box.checked ? 'true' : 'false');
      hidden(form, host, prefix + 'accepted_at', acceptedAt);
    }
    // A tick by the founder is the moment of agreement. A pre-ticked box is
    // not: that moment is when they submit the form.
    agree.box.addEventListener('change', function () {
      if (agree.box.checked) acceptedAt = new Date().toISOString();
      sync();
    });
    if (form) {
      form.addEventListener('submit', function () {
        if (agree.box.checked && !acceptedAt) { acceptedAt = new Date().toISOString(); sync(); }
      });
    }
    [directory, share].forEach(function (c) { c.box.addEventListener('change', sync); });
    sync();
    host.dispatchEvent(new CustomEvent('nexus-consent:ready', { bubbles: true, detail: { terms_hash: terms.terms_hash } }));
  }

  function load(host) {
    var url = host.getAttribute('data-terms-url');
    if (!url) {
      host.appendChild(el('p', { 'class': 'nc-error' }, 'Nexus consent: data-terms-url is missing.'));
      return;
    }
    fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (terms) { render(host, terms); })
      .catch(function () {
        host.textContent = '';
        host.appendChild(el('p', { 'class': 'nc-error' }, 'The network terms could not be loaded, so network sharing is not offered right now. Your signup is not affected.'));
      });
  }

  function read(host) {
    var q = function (name) { var box = host.querySelector('input[data-nc="' + name + '"]'); return !!(box && box.checked); };
    var hashInput = host.querySelector('input[type=hidden][name$="terms_hash"]');
    var timeInput = host.querySelector('input[type=hidden][name$="accepted_at"]');
    if (!q('agreed')) return null;
    return {
      agreed: true,
      terms_hash: hashInput ? hashInput.value : '',
      directory_listing: q('directory_listing'),
      share_details: q('share_details'),
      accepted_at: timeInput && timeInput.value ? timeInput.value : new Date().toISOString()
    };
  }

  function init() {
    injectStyle();
    var hosts = document.querySelectorAll('[data-nexus-consent]');
    for (var i = 0; i < hosts.length; i++) {
      if (!hosts[i].getAttribute('data-nexus-consent-loaded')) {
        hosts[i].setAttribute('data-nexus-consent-loaded', 'true');
        load(hosts[i]);
      }
    }
  }

  window.NexusConsent = { init: init, read: read };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
