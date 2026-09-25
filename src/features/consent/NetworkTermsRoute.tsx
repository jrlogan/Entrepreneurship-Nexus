import React, { useEffect, useState } from 'react';
import { buildConsentTerms, type ConsentTerms } from '../../../functions/src/consent/terms';

/**
 * /network-terms — the full text of what an entrepreneur agrees to (the
 * Network Compact and Privacy Notice), as a public page. The embeddable
 * consent block links here so a partner's signup form can stay one checkbox
 * long; getConsentTerms returns this address as `terms_url`.
 *
 * Rendered from the same module the server hashes, so the page can never
 * show different words from the ones consent is recorded against.
 */
export const NetworkTermsRoute = () => {
  const [terms, setTerms] = useState<ConsentTerms | null>(null);

  useEffect(() => {
    let cancelled = false;
    void buildConsentTerms().then((t) => { if (!cancelled) setTerms(t); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10 text-gray-900">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#8b1919]">Entrepreneurship network</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">The terms entrepreneurs agree to</h1>
          {!terms ? (
            <p className="mt-4 text-gray-600">Loading…</p>
          ) : (
            <>
              <p className="mt-4 text-gray-700">{terms.summary.intro}</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                <li><span className="font-semibold text-gray-900">Always shared, with organizations you work with. </span>{terms.summary.always}</li>
                <li><span className="font-semibold text-gray-900">Your choice. </span>{terms.summary.choice}</li>
                <li><span className="font-semibold text-gray-900">Never shared. </span>{terms.summary.never}</li>
              </ul>
              <div className="mt-8 space-y-8 border-t border-gray-100 pt-6">
                {terms.documents.map((docItem) => (
                  <section key={docItem.type}>
                    <h2 className="text-lg font-semibold">
                      {docItem.title} <span className="text-xs font-normal text-gray-500">version {docItem.version}</span>
                    </h2>
                    {docItem.sections.map((section) => (
                      <div key={section.heading} className="mt-4">
                        <h3 className="text-sm font-semibold text-gray-800">{section.heading}</h3>
                        <p className="text-sm leading-6 text-gray-700">{section.body}</p>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
              <p className="mt-8 text-xs text-gray-500">
                Terms reference {terms.terms_hash.slice(0, 12)}. Every organization in the network has signed the same
                agreements and was approved by the network before joining.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
