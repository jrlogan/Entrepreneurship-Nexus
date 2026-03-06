
import React, { useState } from 'react';
import { Organization, OrganizationRole } from '../../domain/types';
import { SotsService, SotsBusiness, SotsPrincipal } from '../../services/sotsService';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS } from '../../shared/ui/Components';

const generateId = (prefix: string) => `${prefix}_${Date.now().toString(36)}`;

export const AddOrgForm = ({ onSave, onCancel }: { onSave: (org: Organization) => void, onCancel: () => void }) => {
    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [role, setRole] = useState<OrganizationRole>('startup');
    const [naics, setNaics] = useState('');
    const [industryTags, setIndustryTags] = useState('');
    const [website, setWebsite] = useState('');
    const [alei, setAlei] = useState(''); // CT Business ID

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

            // Map SOTS data to Nexus Schema
            setName(fullBiz.business_name);
            setAlei(fullBiz.business_alei);
            
            // Construct description from metadata
            let desc = `Registered entity in ${fullBiz.principal_business_address_city || 'CT'}. Type: ${fullBiz.business_type || 'Unknown'}. Status: ${fullBiz.business_status}.`;
            if (principals.length > 0) {
                const names = principals.map(p => `${p.principal_name} (${p.principal_title})`).join(', ');
                desc += `\nPrincipals: ${names}`;
            }
            setDescription(desc);

            // Infer Industry Tags (Very basic mapping based on name keywords)
            const tags = ['Connecticut'];
            if (fullBiz.business_type?.includes('Liability')) tags.push('LLC');
            setIndustryTags(tags.join(', '));

            // Reset search UI
            setSearchResults([]);
            setLookupQuery('');
        } catch (err) {
            console.error(err);
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleSubmit = () => {
        if (!name.trim()) return;
        
        onSave({ 
              id: generateId('org'), 
              name: name, 
              description: description || 'No description provided.', 
              url: website,
              tax_status: 'for_profit',
              roles: [role], 
              demographics: { minority_owned: false, woman_owned: false, veteran_owned: false }, 
              classification: { 
                  naics_code: naics,
                  industry_tags: industryTags.split(',').map(s => s.trim()).filter(Boolean) 
              }, 
              external_refs: alei ? [{ source: 'CT_SOTS', id: alei }] : [],
              managed_by_ids: [], 
              operational_visibility: 'open', 
              authorized_eso_ids: [],
              ecosystem_ids: [],
              version: 1
        });
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
                    placeholder="Search Business Name (e.g. 'Greenwich Tech')"
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
            
            {/* Search Results Dropdown */}
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
                                <div className="text-xs text-gray-500">{res.business_alei} • {res.business_status} • {new Date(res.date_of_registration).toLocaleDateString()}</div>
                            </div>
                            <span className="text-indigo-600 text-xs font-bold opacity-0 group-hover:opacity-100">Import →</span>
                        </button>
                    ))}
                </div>
            )}

            {lookupError && <p className="text-red-600 text-xs mt-2">{lookupError}</p>}
            
            <p className="text-indigo-400 text-xs mt-2 flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-green-400 rounded-full"></span>
                Connected to data.ct.gov
            </p>
        </div>

        <div className="border-t border-gray-200 my-4"></div>

        {/* Manual Fields */}
        <div className="space-y-4">
            <div>
            <label className={FORM_LABEL_CLASS}>Organization Name</label>
            <input 
                className={FORM_INPUT_CLASS} 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. Acme Corp" 
                required 
            />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={FORM_LABEL_CLASS}>Primary Role</label>
                    <select 
                        className={FORM_SELECT_CLASS} 
                        value={role} 
                        onChange={e => setRole(e.target.value as OrganizationRole)}
                    >
                        <option value="startup">Startup / Client</option>
                        <option value="eso">Support Organization (ESO)</option>
                        <option value="funder">Funder / Investor</option>
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

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={FORM_LABEL_CLASS}>NAICS Code</label>
                    <input 
                        className={FORM_INPUT_CLASS} 
                        value={naics} 
                        onChange={e => setNaics(e.target.value)} 
                        placeholder="e.g. 541511" 
                    />
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Industry Tags</label>
                    <input 
                        className={FORM_INPUT_CLASS} 
                        value={industryTags} 
                        onChange={e => setIndustryTags(e.target.value)} 
                        placeholder="Tech, Health, etc." 
                    />
                </div>
            </div>

            <div>
                <label className={FORM_LABEL_CLASS}>Description</label>
                <textarea 
                    className={FORM_TEXTAREA_CLASS} 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    rows={4} 
                    placeholder="Brief summary of the organization..." 
                />
            </div>
            
            {alei && (
                <div className="text-xs text-gray-400 font-mono">
                    Linked to CT SOTS ID: {alei}
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
                disabled={!name.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Add Organization
            </button>
            </div>
        </div>
      </div>
    );
};
