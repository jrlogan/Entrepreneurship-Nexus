/*!
 * Entrepreneurship Nexus — embeddable consent block.
 *
 * Drop into a partner's own program or signup form so entrepreneurs see the
 * network's current terms, in the network's exact words, where they are
 * already signing up. The block adds hidden form fields with the founder's
 * answers; the partner's server passes them to partnerUpsertPerson as
 * `consent`, and the network records consent against those exact terms.
 *
 * Usage (inside your existing <form>):
 *
 *   <div data-nexus-consent
 *        data-terms-url="https://us-central1-PROJECT.cloudfunctions.net/getConsentTerms"
 *        data-organization="Your Organization"></div>
 *   <script src="https://YOUR-NEXUS-HOST/embed/nexus-consent.js" defer></script>
 *
 * Fields added to the form (names can be prefixed with data-field-prefix):
 *   nexus_consent_agreed            "true" when the founder ticked the agreement
 *   nexus_consent_terms_hash        the terms they were shown
 *   nexus_consent_directory_listing "true" | "false"   (off by default)
 *   nexus_consent_share_details     "true" | "false"   (off by default)
 *   nexus_consent_accepted_at       ISO timestamp of the agreement tick
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
    '.nexus-consent{border:1px solid #d6d3d1;border-radius:10px;padding:16px 18px;margin:16px 0;font:inherit;color:inherit;background:#fafaf9}',
    '.nexus-consent h3{font-size:1.05em;margin:0 0 6px}',
    '.nexus-consent p{margin:0 0 10px;line-height:1.5}',
    '.nexus-consent ul{margin:0 0 10px;padding-left:1.2em}',
    '.nexus-consent li{margin:4px 0;line-height:1.45}',
    '.nexus-consent details{margin:0 0 12px}',
    '.nexus-consent summary{cursor:pointer;color:#8b1919;font-weight:600}',
    '.nexus-consent .nc-doc{max-height:260px;overflow:auto;border:1px solid #e7e5e4;border-radius:6px;padding:10px 12px;margin-top:8px;background:#fff}',
    '.nexus-consent .nc-doc h4{margin:10px 0 2px;font-size:.95em}',
    '.nexus-consent label{display:flex;gap:10px;align-items:flex-start;margin:8px 0;cursor:pointer}',
    '.nexus-consent input[type=checkbox]{margin-top:3px;accent-color:#8b1919}',
    '.nexus-consent .nc-help{display:block;font-size:.85em;opacity:.75}',
    '.nexus-consent .nc-error{color:#991b1b}'
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

  function checkbox(label, help, name) {
    var wrap = el('label');
    var box = el('input', { type: 'checkbox', 'data-nc': name });
    var text = el('span');
    text.appendChild(document.createTextNode(label));
    if (help) text.appendChild(el('span', { 'class': 'nc-help' }, help));
    wrap.appendChild(box);
    wrap.appendChild(text);
    return { wrap: wrap, box: box };
  }

  function render(host, terms) {
    var prefix = host.getAttribute('data-field-prefix') || 'nexus_consent_';
    var org = host.getAttribute('data-organization') || 'We';
    var form = host.closest('form');
    host.textContent = '';
    host.classList.add('nexus-consent');

    host.appendChild(el('h3', null, terms.summary.heading));
    host.appendChild(el('p', null, org + ' is part of a regional network of organizations that support entrepreneurs. ' + terms.summary.intro));
    var list = el('ul');
    list.appendChild(el('li', null, terms.summary.always));
    list.appendChild(el('li', null, terms.summary.choice));
    list.appendChild(el('li', null, terms.summary.never));
    host.appendChild(list);

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
    host.appendChild(details);

    var agree = checkbox(terms.choices.agree.label, null, 'agreed');
    var directory = checkbox(terms.choices.directory_listing.label, terms.choices.directory_listing.help, 'directory_listing');
    var share = checkbox(terms.choices.share_details.label, terms.choices.share_details.help, 'share_details');
    directory.box.checked = !!terms.choices.directory_listing.default;
    share.box.checked = !!terms.choices.share_details.default;
    [agree, directory, share].forEach(function (c) { host.appendChild(c.wrap); });

    var acceptedAt = '';
    function sync() {
      // The optional choices only mean something once the founder has agreed.
      directory.box.disabled = !agree.box.checked;
      share.box.disabled = !agree.box.checked;
      if (agree.box.checked && !acceptedAt) acceptedAt = new Date().toISOString();
      if (!agree.box.checked) acceptedAt = '';
      hidden(form, host, prefix + 'agreed', agree.box.checked ? 'true' : 'false');
      hidden(form, host, prefix + 'terms_hash', terms.terms_hash);
      hidden(form, host, prefix + 'directory_listing', agree.box.checked && directory.box.checked ? 'true' : 'false');
      hidden(form, host, prefix + 'share_details', agree.box.checked && share.box.checked ? 'true' : 'false');
      hidden(form, host, prefix + 'accepted_at', acceptedAt);
    }
    [agree, directory, share].forEach(function (c) { c.box.addEventListener('change', sync); });
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
      accepted_at: timeInput ? timeInput.value : new Date().toISOString()
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
