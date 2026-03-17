
import React, { useState } from 'react';
import { Organization, OrganizationType } from '../../domain/types';
import { SotsService, SotsBusiness, SotsPrincipal } from '../../services/sotsService';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS } from '../../shared/ui/Components';

const generateId = (prefix: string) => `${prefix}_${Date.now().toString(36)}`;

// NAICS 2-digit sector → human-readable label
const NAICS_SECTORS: Record<string, string> = {
    '11': 'Agriculture, Forestry & Fishing',
    '21': 'Mining & Extraction',
    '22': 'Utilities',
    '23': 'Construction',
    '31': 'Manufacturing', '32': 'Manufacturing', '33': 'Manufacturing',
    '42': 'Wholesale Trade',
    '44': 'Retail Trade', '45': 'Retail Trade',
    '48': 'Transportation & Warehousing', '49': 'Transportation & Warehousing',
    '51': 'Information & Technology',
    '52': 'Finance & Insurance',
    '53': 'Real Estate',
    '54': 'Professional & Technical Services',
    '55': 'Management & Consulting',
    '56': 'Administrative Services',
    '61': 'Education',
    '62': 'Health Care & Social Assistance',
    '71': 'Arts, Entertainment & Recreation',
    '72': 'Accommodation & Food Services',
    '81': 'Other Services',
    '92': 'Public Administration',
};

// Look up NAICS label from a code string (handles "541511", "(541511)", "541511 - Description" etc.)
const naicsLabel = (raw: string): { code: string; sector: string; label: string } | null => {
    const digits = raw.match(/\d+/)?.[0];
    if (!digits) return null;
    const sector = digits.slice(0, 2);
    const sectorLabel = NAICS_SECTORS[sector] || 'Other';
    return { code: digits, sector, label: sectorLabel };
};

// Title-case a name like "JOHN RICHARD LOGAN" → "John Richard Logan"
const toTitleCase = (s: string) =>
    s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

// CT SOTS public business lookup URL
const sotsPublicUrl = (alei: string) =>
    `https://service.ct.gov/business/s/onlinebusiness?businessId=${encodeURIComponent(alei)}`;

interface SotsPreview {
    businessName: string;
    businessType: string;
    status: string;
    dateFormed: string;
    alei: string;
    naicsCode: string;
    naicsLabel: string;
    principals: SotsPrincipal[];
    city?: string;
}

export const AddOrgForm = ({ onSave, onCancel, saveError }: { onSave: (org: Organization, esoDomains: string[]) => void, onCancel: () => void, saveError?: string | null }) => {
    // Form State
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [orgType, setOrgType] = useState<OrganizationType>('startup');
    const [roles, setRoles] = useState<string[]>([]);
    const [naics, setNaics] = useState('');
    const [industryTags, setIndustryTags] = useState('');
    const [website, setWebsite] = useState('');
    const [alei, setAlei] = useState('');
    const [yearFormed, setYearFormed] = useState<number | undefined>();
    const [sotsPreview, setSotsPreview] = useState<SotsPreview | null>(null);

    // ESO Domain State
    const [esoDomains, setEsoDomains] = useState<string[]>([]);
    const [domainInput, setDomainInput] = useState('');

    // Lookup State
    const [lookupQuery, setLookupQuery] = useState('');
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [searchResults, setSearchResults] = useState<SotsBusiness[]>([]);
    const [lookupError, setLookupError] = useState('');

    const handleSearch = async () => {
        if (!lookupQuery.trim()) return;
        setIsLookingUp(true);
        setLookupError('');
        setSearchResults([]);

        try {
            const results = await SotsService.searchBusinessByName(lookupQuery);
            if (results.length === 0) {
                setLookupError('No matches found in CT Registry.');
            } else {
                setSearchResults(results);
            }
        } catch (err) {
            setLookupError('Connection to State Registry failed.');
        } finally {
            setIsLookingUp(false);
        }
    };

    const selectBusiness = async (biz: SotsBusiness) => {
        setIsLookingUp(true);
        try {
            const details = await SotsService.getBusinessDetails(biz.business_alei);
            const fullBiz = details.business || biz;
            const principals = details.principals;

            setName(fullBiz.business_name);
            setAlei(fullBiz.business_alei);

            // Website from email domain
            if (fullBiz.business_email_address) {
                const emailDomain = fullBiz.business_email_address.split('@')[1];
                if (emailDomain) {
                    setWebsite(`https://${emailDomain}`);
                    setEsoDomains(prev => prev.includes(emailDomain) ? prev : [...prev, emailDomain]);
                }
            }

            // NAICS → code + human-readable sector as industry tag
            let naicsInfo: ReturnType<typeof naicsLabel> = null;
            if (fullBiz.naics_code) {
                naicsInfo = naicsLabel(fullBiz.naics_code);
                if (naicsInfo) {
                    setNaics(naicsInfo.code);
                    setIndustryTags(naicsInfo.label);
                }
            }

            // Year incorporated from registration date
            if (fullBiz.date_of_registration) {
                const year = new Date(fullBiz.date_of_registration).getFullYear();
                if (!isNaN(year)) setYearFormed(year);
            }

            // Description — leave blank for the user to fill in; registry data is shown in the preview panel
            setDescription('');

            // Store preview data for the info panel
            setSotsPreview({
                businessName: fullBiz.business_name,
                businessType: fullBiz.business_type || 'Unknown',
                status: fullBiz.business_status,
                dateFormed: fullBiz.date_of_registration
                    ? new Date(fullBiz.date_of_registration).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : 'Unknown',
                alei: fullBiz.business_alei,
                naicsCode: naicsInfo?.code || fullBiz.naics_code || '',
                naicsLabel: naicsInfo?.label || '',
                principals,
                city: fullBiz.principal_business_address_city,
            });

            setSearchResults([]);
            setLookupQuery('');
        } catch (err) {
            console.error(err);
        } finally {
            setIsLookingUp(false);
        }
    };

    const addDomain = () => {
        const d = domainInput.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (d && !esoDomains.includes(d)) {
            setEsoDomains(prev => [...prev, d]);
        }
        setDomainInput('');
    };

    const handleSubmit = async () => {
        if (!name.trim() || isSaving) return;
        setIsSaving(true);
        try {
        await onSave({
            id: generateId('org'),
            name,
            description: description || '',
            url: website,
            tax_status: 'for_profit',
            ...(yearFormed ? { year_incorporated: yearFormed } : {}),
            org_type: orgType,
        roles: roles as Organization['roles'],
            owner_characteristics: [],
            classification: {
                naics_code: naics,
                industry_tags: industryTags.split(',').map(s => s.trim()).filter(Boolean),
            },
            external_refs: alei ? [{ source: 'CT_SOTS', id: alei }] : [],
            managed_by_ids: [],
            operational_visibility: 'open',
            authorized_eso_ids: [],
            ecosystem_ids: [],
            version: 1,
        }, esoDomains);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Smart Lookup Section */}
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                <label className="block text-xs font-bold text-indigo-800 mb-2 uppercase tracking-wide">
                    Import from CT State Registry
                </label>
                <div className="flex gap-2 relative">
                    <input
                        className="block w-full rounded-md border-indigo-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        value={lookupQuery}
                        onChange={e => setLookupQuery(e.target.value)}
                        placeholder="Search business name (e.g. 'Progressable')"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button
                        onClick={handleSearch}
                        disabled={isLookingUp || !lookupQuery}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0 flex items-center gap-2"
                    >
                        {isLookingUp ? '...' : '🔍 Search'}
                    </button>
                </div>

                {searchResults.length > 0 && (
                    <div className="mt-2 bg-white rounded-md shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
                        {searchResults.map(res => (
                            <button
                                key={res.business_alei}
                                onClick={() => selectBusiness(res)}
                                className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-0 flex justify-between items-center group"
                            >
                                <div>
                                    <div className="font-bold text-sm text-gray-900 group-hover:text-indigo-700">{res.business_name}</div>
                                    <div className="text-xs text-gray-500">
                                        {res.business_alei} · {res.business_status}
                                        {res.date_of_registration && ` · Formed ${new Date(res.date_of_registration).getFullYear()}`}
                                    </div>
                                </div>
                                <span className="text-indigo-600 text-xs font-bold opacity-0 group-hover:opacity-100">Import →</span>
                            </button>
                        ))}
                    </div>
                )}

                {lookupError && <p className="text-red-600 text-xs mt-2">{lookupError}</p>}

                <p className="text-indigo-400 text-xs mt-2 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-green-400 rounded-full" />
                    Connected to data.ct.gov
                </p>
            </div>

            {/* Registry data preview (shown after import) */}
            {sotsPreview && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">CT Registry Record</span>
                        <a
                            href={sotsPublicUrl(sotsPreview.alei)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                            View on CT SOTS →
                        </a>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-700">
                        <div><span className="text-slate-400">Type:</span> {sotsPreview.businessType}</div>
                        <div><span className="text-slate-400">Status:</span> {sotsPreview.status}</div>
                        <div><span className="text-slate-400">Date Formed:</span> {sotsPreview.dateFormed}</div>
                        {sotsPreview.city && <div><span className="text-slate-400">City:</span> {sotsPreview.city}</div>}
                        {sotsPreview.naicsCode && (
                            <div className="col-span-2">
                                <span className="text-slate-400">NAICS:</span>{' '}
                                <span className="font-medium">{sotsPreview.naicsCode}</span>
                                {sotsPreview.naicsLabel && <span className="text-slate-500"> — {sotsPreview.naicsLabel}</span>}
                            </div>
                        )}
                        {sotsPreview.principals.length > 0 && (
                            <div className="col-span-2">
                                <span className="text-slate-400">Principal{sotsPreview.principals.length > 1 ? 's' : ''}:</span>{' '}
                                {sotsPreview.principals
                                    .map(p => {
                                        const cleanName = toTitleCase(p.principal_name.trim());
                                        const title = p.principal_title?.trim();
                                        return title ? `${cleanName} (${title})` : cleanName;
                                    })
                                    .join(', ')
                                }
                            </div>
                        )}
                        <div className="col-span-2 text-slate-400 font-mono">{sotsPreview.alei}</div>
                    </div>
                </div>
            )}

            <div className="border-t border-gray-200" />

            {/* Manual Fields */}
            <div className="space-y-4">
                <div>
                    <label className={FORM_LABEL_CLASS}>Organization Name</label>
                    <input
                        className={FORM_INPUT_CLASS}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Progressable LLC"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Organization Type</label>
                        <select
                            className={FORM_SELECT_CLASS}
                            value={orgType}
                            onChange={e => setOrgType(e.target.value as OrganizationType)}
                        >
                            <option value="startup">Startup / Venture</option>
                            <option value="small_business">Small Business</option>
                            <option value="business">Business / Company</option>
                            <option value="nonprofit">Nonprofit Organization</option>
                            <option value="government_agency">Government / Public Agency</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Website</label>
                        <input
                            className={FORM_INPUT_CLASS}
                            value={website}
                            onChange={e => setWebsite(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>
                </div>

                <div>
                    <label className={FORM_LABEL_CLASS}>Functional Roles <span className="font-normal text-gray-400">(select all that apply)</span></label>
                    <div className="flex flex-wrap gap-4 mt-1">
                        {([
                            ['eso', 'Support Org (ESO)'],
                            ['funder', 'Funder / Investor'],
                            ['resource', 'Lab / Workspace'],
                        ] as [string, string][]).map(([value, label]) => (
                            <label key={value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={roles.includes(value)}
                                    onChange={e => setRoles(prev =>
                                        e.target.checked ? [...prev, value] : prev.filter(r => r !== value)
                                    )}
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>
                            NAICS Code
                            {naics && NAICS_SECTORS[naics.slice(0, 2)] && (
                                <span className="ml-2 font-normal text-gray-400">— {NAICS_SECTORS[naics.slice(0, 2)]}</span>
                            )}
                        </label>
                        <input
                            className={FORM_INPUT_CLASS}
                            value={naics}
                            onChange={e => {
                                setNaics(e.target.value);
                                const info = naicsLabel(e.target.value);
                                if (info) setIndustryTags(info.label);
                            }}
                            placeholder="e.g. 541511"
                        />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Industry Tags</label>
                        <input
                            className={FORM_INPUT_CLASS}
                            value={industryTags}
                            onChange={e => setIndustryTags(e.target.value)}
                            placeholder="e.g. Professional & Technical Services"
                        />
                    </div>
                </div>

                <div>
                    <label className={FORM_LABEL_CLASS}>Description <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea
                        className={FORM_TEXTAREA_CLASS}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                        placeholder="Brief summary of what this organization does..."
                    />
                </div>

                {roles.includes('eso') && (
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wide mb-1">Email Domains</label>
                            <p className="text-xs text-indigo-600">Domains this organization sends from and receives at — used for automatic inbound email recognition.</p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="block w-full rounded-md border-indigo-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
                                value={domainInput}
                                onChange={e => setDomainInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                                placeholder="e.g. makehaven.org"
                            />
                            <button
                                type="button"
                                onClick={addDomain}
                                disabled={!domainInput.trim()}
                                className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 flex-shrink-0"
                            >
                                Add
                            </button>
                        </div>
                        {esoDomains.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {esoDomains.map(d => (
                                    <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-indigo-200 text-xs font-medium text-indigo-800">
                                        {d}
                                        <button type="button" onClick={() => setEsoDomains(prev => prev.filter(x => x !== d))} className="text-indigo-400 hover:text-red-500 font-bold leading-none">×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {esoDomains.length === 0 && (
                            <p className="text-xs text-indigo-400 italic">No domains added yet. You can add them later in the organization settings.</p>
                        )}
                    </div>
                )}

                {saveError && (
                    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {saveError}
                    </div>
                )}

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!name.trim() || isSaving}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Add Organization'}
                    </button>
                </div>
            </div>
        </div>
    );
};
