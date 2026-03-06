
import React, { useState } from 'react';
import { Organization, Person, Initiative, Interaction, Referral } from '../../domain/types';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, CompanyLogo, InfoBanner } from '../../shared/ui/Components';
import { METRIC_SETS } from '../../domain/metrics/reporting_config';
import { MetricAssignment } from '../../domain/metrics/reporting_types';
import { viewerHasCapability, canViewOperationalDetails } from '../../domain/access/policy';
import { RESTRICTED_INITIATIVE_NAME, REDACTED_TEXT } from '../../domain/access/redaction';

interface OrganizationDetailViewProps {
    org: Organization;
    organizations: Organization[];
    people: Person[];
    initiatives: Initiative[];
    interactions: Interaction[];
    referrals: Referral[];
    onBack: () => void;
    onRefresh?: () => void;
    initialTab?: string;
}

export const OrganizationDetailView = ({ 
    org, 
    organizations, 
    people, 
    initiatives, 
    interactions, 
    referrals, 
    onBack,
    onRefresh,
    initialTab
}: OrganizationDetailViewProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [activeTab, setActiveTab] = useState(initialTab || 'overview');
    const [showAllEvents, setShowAllEvents] = useState(false);
    const [showPrivacyHelp, setShowPrivacyHelp] = useState(false);

    const orgPeople = people.filter(p => p.organization_id === org.id);
    const orgInitiatives = initiatives.filter(i => i.organization_id === org.id);
    const orgInteractions = interactions.filter(i => i.organization_id === org.id);
    const orgReferrals = referrals.filter(r => r.referring_org_id === org.id || r.receiving_org_id === org.id || r.subject_org_id === org.id);

    // Metrics Data
    const canRequestUpdate = viewerHasCapability(viewer, 'metrics.assign_request');
    const metricSetId = METRIC_SETS[0].id; // Default to first set 'set_org_overview'
    
    const metricReport = repos.flexibleMetrics.getReport(metricSetId, {
        scope_type: 'organization',
        scope_id: org.id
    });

    // Privacy Data
    const activePolicies = repos.consent.getPoliciesForEntity(org.id);
    const consentEvents = repos.consent.getEventsForEntity(org.id);
    const visibleEvents = showAllEvents ? consentEvents : consentEvents.slice(0, 10);
    const isManageable = viewer.orgId === org.id || viewer.role === 'platform_admin';

    // Access Control Check
    const hasConsent = repos.consent.hasOperationalAccess(viewer.orgId, org.id);
    const canViewDetails = canViewOperationalDetails(viewer, org, hasConsent);

    // Restricted View Logic for People
    const isRestricted = !canViewDetails;
    const visiblePeople = isRestricted 
        ? orgPeople.filter(p => {
            const r = p.role.toLowerCase();
            return r.includes('founder') || r.includes('ceo') || r.includes('president') || r.includes('executive director') || r.includes('owner');
        })
        : orgPeople;
    const hiddenPeopleCount = orgPeople.length - visiblePeople.length;

    // Check for pending access request
    const pendingRequest = orgReferrals.find(r => 
        r.referring_org_id === viewer.orgId && 
        r.receiving_org_id === org.id && 
        r.status === 'pending' &&
        r.outcome_tags?.includes('Access Request')
    );

    const handleAssignUpdate = () => {
        const assignment: MetricAssignment = {
            id: `assign_${Date.now()}`,
            metric_set_id: metricSetId,
            ecosystem_id: viewer.ecosystemId,
            scope_type: 'organization',
            scope_id: org.id,
            assigned_by_id: viewer.personId,
            assigned_at: new Date().toISOString(),
            status: 'pending',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        };
        repos.flexibleMetrics.createAssignment(assignment);
        alert('Data update request sent to organization admins.');
    };

    const handleToggleVisibility = () => {
        if (!isManageable) return;
        const newVisibility = org.operational_visibility === 'open' ? 'restricted' : 'open';
        repos.organizations.update(org.id, { operational_visibility: newVisibility });
        if (onRefresh) onRefresh();
    };

    const handleRevokeConsent = (policyId: string) => {
        if (!isManageable) return;
        if (confirm("Are you sure you want to revoke access for this partner?")) {
            const policy = activePolicies.find(p => p.id === policyId);
            if (policy) {
                policy.isActive = false;
                repos.consent.logEvent({
                    id: `evt_revoke_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    actorId: viewer.personId,
                    action: 'revoked',
                    resourceId: org.id,
                    viewerId: policy.viewerId,
                    reason: 'User revoked via Privacy Dashboard'
                });
                if (onRefresh) onRefresh();
            }
        }
    };

    const handleRequestAccess = () => {
        const viewerOrgName = organizations.find(o => o.id === viewer.orgId)?.name || 'Partner Org';
        repos.referrals.add({
            id: `ref_access_${Date.now()}`,
            referring_org_id: viewer.orgId,
            receiving_org_id: org.id,
            subject_person_id: viewer.personId,
            subject_org_id: viewer.orgId,
            date: new Date().toISOString().split('T')[0],
            status: 'pending',
            notes: `Access Request from ${viewerOrgName}`,
            outcome_tags: ['Access Request']
        });
        alert("Access request sent.");
        if (onRefresh) onRefresh();
    };

    return (
        <div className="space-y-6">
           {/* Header */}
           <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <button onClick={onBack} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition">
                   <span className="sr-only">Back</span>
                   ←
                </button>
                <CompanyLogo src={org.logo_url} name={org.name} size="lg" />
                <div>
                   <h1 className="text-2xl font-bold text-gray-900 leading-none">{org.name}</h1>
                   <div className="flex items-center gap-2 mt-2">
                     {org.alternate_name && <span className="text-sm text-gray-500 mr-2">aka {org.alternate_name}</span>}
                     <Badge color={org.operational_visibility === 'open' ? 'green' : 'red'}>{org.operational_visibility === 'open' ? 'Network Visible' : 'Private / Hidden'}</Badge>
                     {org.roles.map(r => <Badge key={r} color="gray">{r}</Badge>)}
                   </div>
                </div>
              </div>
              <div className="flex gap-2">
                 {!canViewDetails && (
                     <button 
                        onClick={handleRequestAccess}
                        disabled={!!pendingRequest}
                        className={`px-4 py-2 border text-sm font-medium rounded transition-colors ${pendingRequest ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50 shadow-sm'}`}
                     >
                        {pendingRequest ? 'Request Pending' : 'Request Access'}
                     </button>
                 )}
                 <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">Edit Profile</button>
                 <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700">Log Interaction</button>
              </div>
           </div>

           {/* Restricted Access Banner */}
           {!canViewDetails && (
               <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                   <div className="flex items-start gap-4">
                       <div className="flex-shrink-0 mt-1">
                           <span className="text-2xl">ℹ️</span>
                       </div>
                       <div className="flex-1">
                           <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">You have Basic Access</h3>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mb-4">
                               <div>
                                   <span className="font-bold text-slate-700 block mb-2 border-b border-slate-200 pb-1">VISIBLE TO YOU</span>
                                   <ul className="list-disc list-outside ml-4 text-slate-600 space-y-1.5">
                                       <li>Directory profile (Name, Description, Industry)</li>
                                       <li>Activity metadata (Dates, Types, Authors)</li>
                                       <li>Referral status (Incoming/Outgoing)</li>
                                   </ul>
                               </div>
                               <div>
                                   <span className="font-bold text-slate-700 block mb-2 border-b border-slate-200 pb-1">RESTRICTED</span>
                                   <ul className="list-disc list-outside ml-4 text-slate-500 space-y-1.5">
                                       <li>Meeting notes and interaction content</li>
                                       <li>Specific metrics and financials</li>
                                       <li>Initiative details and progress</li>
                                       <li>Full team directory and contact info</li>
                                   </ul>
                               </div>
                           </div>

                           <div className="pt-2">
                               <button 
                                   onClick={handleRequestAccess}
                                   disabled={!!pendingRequest}
                                   className={`px-4 py-2 text-sm font-bold rounded shadow-sm flex items-center gap-2 transition-colors ${pendingRequest ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                               >
                                   {pendingRequest ? (
                                       <><span>⏳</span> Access Request Pending</>
                                   ) : (
                                       <><span>🔓</span> Request Full Access</>
                                   )}
                               </button>
                           </div>
                       </div>
                   </div>
               </div>
           )}
    
           {/* Tabs Navigation */}
           <div className="bg-white border-b border-gray-200 px-6">
             <nav className="-mb-px flex space-x-6 overflow-x-auto">
               {[
                 { id: 'overview', label: 'Overview' },
                 { id: 'metrics', label: 'Data & Metrics' },
                 { id: 'people', label: `People (${isRestricted ? visiblePeople.length : orgPeople.length})` },
                 { id: 'initiatives', label: `Initiatives (${orgInitiatives.length})` },
                 { id: 'interactions', label: `Interactions (${orgInteractions.length})` },
                 { id: 'referrals', label: `Referrals (${orgReferrals.length})` },
                 { id: 'privacy', label: 'Privacy' }
               ].map(tab => {
                 const isLocked = !canViewDetails && ['metrics', 'initiatives', 'interactions', 'referrals'].includes(tab.id);
                 return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center ${
                            activeTab === tab.id
                            ? 'border-indigo-500 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        {tab.label}
                        {isLocked && <span className="ml-2 text-xs opacity-60" title="Restricted Content">🔒</span>}
                    </button>
                 );
               })}
             </nav>
           </div>
    
           {/* Tab Content */}
           <div className="grid grid-cols-1 gap-6">
              
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                   <div className="lg:col-span-2 space-y-6">
                     <Card title="About">
                        <div className="prose prose-sm text-gray-600 max-w-none">
                          <p>{org.description}</p>
                        </div>
                        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">Website</span>
                             <a href={org.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{org.url || 'N/A'}</a>
                           </div>
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">Inc. Year</span>
                             <span className="text-gray-900">{org.year_incorporated || 'N/A'}</span>
                           </div>
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">Tax Status</span>
                             <Badge color="gray">{org.tax_status}</Badge>
                           </div>
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">EIN</span>
                             <span className="text-gray-900 font-mono">{org.ein || 'N/A'}</span>
                           </div>
                        </div>
                     </Card>
                   </div>
                   <div className="space-y-6">
                      <Card title="Classification">
                         <div className="space-y-4">
                            <div>
                               <span className="block text-xs font-bold text-gray-500 uppercase mb-1">NAICS Code</span>
                               <span className="text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded border">{org.classification.naics_code || 'N/A'}</span>
                            </div>
                            <div>
                               <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Industry Tags</span>
                               <div className="flex flex-wrap gap-2">
                                  {org.classification.industry_tags.map(t => <span key={t} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">{t}</span>)}
                               </div>
                            </div>
                         </div>
                      </Card>
                      <Card title="Demographics">
                         <div className="space-y-2">
                            <div className="flex justify-between text-sm"><span>Minority Owned</span> <span>{org.demographics.minority_owned ? '✅' : '❌'}</span></div>
                            <div className="flex justify-between text-sm"><span>Woman Owned</span> <span>{org.demographics.woman_owned ? '✅' : '❌'}</span></div>
                            <div className="flex justify-between text-sm"><span>Veteran Owned</span> <span>{org.demographics.veteran_owned ? '✅' : '❌'}</span></div>
                         </div>
                      </Card>
                   </div>
                </div>
              )}

              {activeTab === 'metrics' && (
                  <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {metricReport.results.map((res, i) => (
                                <div key={i} className="bg-white p-4 rounded border border-gray-200 text-center relative overflow-hidden group">
                                    <div className="text-xs text-gray-500 uppercase font-bold truncate mb-1">{res.metric.name}</div>
                                    <div className={`text-2xl font-bold ${res.status === 'auto' ? 'text-purple-600' : res.status === 'confirmed' ? 'text-green-700' : 'text-gray-900'}`}>
                                        {res.metric.unit === 'currency' ? '$' : ''}{Number(res.value).toLocaleString()}
                                    </div>
                                    
                                    {res.status === 'auto' && (
                                        <div className="absolute top-0 right-0 bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-bl font-bold">Auto</div>
                                    )}
                                    {res.status === 'confirmed' && (
                                        <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded-bl font-bold">Confirmed</div>
                                    )}
                                    {res.status === 'reported' && (
                                        <div className="absolute top-0 right-0 bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-bl">Reported</div>
                                    )}
                                </div>
                            ))}
                            
                            {canRequestUpdate && (
                                <button 
                                    onClick={handleAssignUpdate}
                                    className="bg-gray-50 p-4 rounded border border-dashed border-gray-300 flex flex-col items-center justify-center text-indigo-600 hover:bg-gray-100 transition-colors"
                                >
                                    <span className="text-lg font-bold">Request Update</span>
                                    <span className="text-[10px]">Send Task to Client</span>
                                </button>
                            )}
                        </div>

                        <InfoBanner title="Data Confidence Legend">
                            <ul className="flex gap-4 text-xs">
                                <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> <strong>Auto:</strong> Calculated live from system events.</li>
                                <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> <strong>Confirmed:</strong> Auto-calc verified by user.</li>
                                <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500"></span> <strong>Reported:</strong> Manually entered by user.</li>
                            </ul>
                        </InfoBanner>
                  </div>
              )}

              {activeTab === 'people' && (
                  <div className="space-y-4">
                      {isRestricted && (
                          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-md">
                              <div className="flex">
                                  <div className="flex-shrink-0">
                                      <span className="text-amber-400">🔒</span>
                                  </div>
                                  <div className="ml-3">
                                      <p className="text-sm text-amber-700">
                                          This organization has restricted visibility. Only primary public contacts are shown.
                                      </p>
                                      {hiddenPeopleCount > 0 && (
                                          <p className="text-xs font-bold text-amber-800 mt-1">
                                              + {hiddenPeopleCount} other team members hidden.
                                          </p>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}
                      
                      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                           <table className="min-w-full divide-y divide-gray-200">
                               <thead className="bg-gray-50">
                                   <tr>
                                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                                       {isRestricted && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Visibility</th>}
                                   </tr>
                               </thead>
                               <tbody className="bg-white divide-y divide-gray-200">
                                   {visiblePeople.map(p => (
                                       <tr key={p.id}>
                                           <td className="px-6 py-4 text-sm font-medium text-indigo-600">{p.first_name} {p.last_name}</td>
                                           <td className="px-6 py-4 text-sm text-gray-500">{p.role}</td>
                                           {isRestricted && (
                                               <td className="px-6 py-4 text-right">
                                                   <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                                       Public Contact
                                                   </span>
                                               </td>
                                           )}
                                       </tr>
                                   ))}
                                   {visiblePeople.length === 0 && (
                                       <tr>
                                           <td colSpan={isRestricted ? 3 : 2} className="px-6 py-8 text-center text-sm text-gray-500 italic">
                                               No public contacts listed.
                                           </td>
                                       </tr>
                                   )}
                               </tbody>
                           </table>
                      </div>
                  </div>
              )}
              {activeTab === 'initiatives' && (
                  <div className="space-y-4">
                      {orgInitiatives.map(init => {
                          if (init.name === RESTRICTED_INITIATIVE_NAME) {
                              return (
                                <div key={init.id} className="bg-gray-50 border border-gray-200 border-dashed rounded-lg p-4 flex items-center gap-3 opacity-75">
                                    <span className="text-xl">🔒</span>
                                    <div>
                                        <div className="font-bold text-gray-500 text-sm italic">Restricted Project</div>
                                        <div className="text-xs text-gray-400">Details hidden due to privacy settings.</div>
                                    </div>
                                </div>
                              );
                          }
                          return (
                              <Card key={init.id} title={init.name}>
                                  <p>Status: <Badge color={init.status === 'active' ? 'green' : 'gray'}>{init.status}</Badge></p>
                              </Card>
                          );
                      })}
                      {orgInitiatives.length === 0 && <p className="text-gray-500">No initiatives active.</p>}
                  </div>
              )}
              {activeTab === 'interactions' && (
                   <div className="space-y-4">
                       {orgInteractions.map(int => {
                           if (int.notes === REDACTED_TEXT) {
                               return (
                                   <div key={int.id} className="bg-gray-50 border border-gray-200 border-dashed rounded-lg p-4 flex items-center gap-3 opacity-75">
                                       <span className="text-xl">🔒</span>
                                       <div>
                                           <div className="font-bold text-gray-500 text-sm italic">Restricted Interaction</div>
                                           <div className="text-xs text-gray-400">{int.type.toUpperCase()} • {int.date}</div>
                                       </div>
                                   </div>
                               );
                           }
                           return (
                               <Card key={int.id} title={`${int.type} - ${int.date}`}>
                                   <p className="text-sm">{int.notes}</p>
                               </Card>
                           );
                       })}
                   </div>
              )}
              
              {activeTab === 'referrals' && (
                  <div className="space-y-4">
                      {orgReferrals.map(ref => {
                          const referrer = organizations.find(o => o.id === ref.referring_org_id);
                          const receiver = organizations.find(o => o.id === ref.receiving_org_id);
                          const isRedacted = ref.notes === REDACTED_TEXT;

                          return (
                              <Card key={ref.id} title={
                                  <div className="flex flex-wrap items-center gap-2 text-base">
                                      <span className="font-bold text-gray-700">{referrer?.name || 'Unknown'}</span>
                                      <span className="text-gray-400 text-sm">➔</span>
                                      <span className="font-bold text-indigo-700">{receiver?.name || 'Unknown'}</span>
                                  </div>
                              }>
                                  <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-gray-500">
                                          {new Date(ref.date).toLocaleDateString()}
                                      </div>
                                      <Badge color={
                                          ref.status === 'pending' ? 'yellow' : 
                                          ref.status === 'accepted' ? 'green' : 
                                          ref.status === 'rejected' ? 'red' : 'blue'
                                      }>
                                          {ref.status.toUpperCase()}
                                      </Badge>
                                  </div>
                                  
                                  {isRedacted ? (
                                      <div className="bg-gray-50 border border-gray-100 rounded p-2 text-xs text-gray-400 italic flex items-center gap-2">
                                          <span>🔒</span> Content Hidden
                                      </div>
                                  ) : (
                                      <p className="text-sm text-gray-600 mb-2">{ref.notes}</p>
                                  )}
                                  
                                  {ref.status === 'completed' && ref.outcome && !isRedacted && (
                                      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-2">
                                          <span className="text-xs font-bold text-gray-500 uppercase">Outcome:</span>
                                          <span className="text-sm font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                                              {ref.outcome.replace(/_/g, ' ')}
                                          </span>
                                      </div>
                                  )}
                              </Card>
                          );
                      })}
                      {orgReferrals.length === 0 && (
                          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                              No referral history found for this organization.
                          </div>
                      )}
                  </div>
              )}
              
              {activeTab === 'privacy' && (
                  <div className="grid gap-6">
                      <div className="bg-white border border-indigo-100 rounded-lg shadow-sm overflow-hidden">
                          <button 
                              onClick={() => setShowPrivacyHelp(!showPrivacyHelp)}
                              className="w-full flex items-center justify-between p-4 bg-indigo-50/50 hover:bg-indigo-50 transition-colors text-left"
                          >
                              <span className="font-bold text-indigo-900 flex items-center gap-2 text-sm">
                                  <span className="text-lg">ℹ️</span> How Privacy Works
                              </span>
                              <span className="text-indigo-400 text-xs">{showPrivacyHelp ? '▲' : '▼'}</span>
                          </button>
                          
                          {showPrivacyHelp && (
                              <div className="p-6 border-t border-indigo-100 animate-in slide-in-from-top-2 duration-200">
                                  <div className="overflow-hidden rounded-lg border border-gray-200 mb-4">
                                      <table className="min-w-full divide-y divide-gray-200">
                                          <thead className="bg-gray-50">
                                              <tr>
                                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Data Type</th>
                                                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">When Public</th>
                                                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">When Private</th>
                                              </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                              {[
                                                  { type: 'Directory Profile', public: 'Visible', private: 'Visible' },
                                                  { type: 'Activity Metadata', public: 'Visible', private: 'Visible' },
                                                  { type: 'Interaction Notes', public: 'Visible', private: 'Restricted' },
                                                  { type: 'Metrics & Financials', public: 'Visible', private: 'Restricted' },
                                                  { type: 'Initiative Details', public: 'Visible', private: 'Restricted' },
                                                  { type: 'Team Directory', public: 'Visible', private: 'Limited' }
                                              ].map((row, idx) => (
                                                  <tr key={idx} className="hover:bg-gray-50">
                                                      <td className="px-4 py-2 font-medium text-gray-900">{row.type}</td>
                                                      <td className="px-4 py-2 text-center text-green-600 font-bold">✓ {row.public}</td>
                                                      <td className="px-4 py-2 text-center">
                                                          {row.private === 'Visible' ? (
                                                              <span className="text-green-600 font-bold">✓ Visible</span>
                                                          ) : (
                                                              <span className="text-amber-600 font-bold flex items-center justify-center gap-1">
                                                                  <span>🔒</span> {row.private}
                                                              </span>
                                                          )}
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                                  
                                  <p className="text-sm text-gray-600 leading-relaxed">
                                      Even with privacy enabled, your organization remains discoverable
                                      in the ecosystem directory. Partners can see that you exist and
                                      who has supported you, but cannot access operational details
                                      without your consent.
                                  </p>
                              </div>
                          )}
                      </div>

                      <Card title="Data Visibility Settings">
                          <div className="flex items-center justify-between">
                              <div>
                                  <h4 className="text-sm font-bold text-gray-900">Global Visibility</h4>
                                  <p className="text-sm text-gray-500 mt-1">
                                      When set to <strong>Open</strong>, trusted ecosystem partners can view your initiatives, metrics, and team structure.<br/>
                                      When set to <strong>Restricted</strong>, they only see your directory listing (Name, Website, Tags).
                                  </p>
                              </div>
                              {isManageable ? (
                                  <button 
                                      onClick={handleToggleVisibility}
                                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${org.operational_visibility === 'open' ? 'bg-green-600' : 'bg-gray-200'}`}
                                  >
                                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${org.operational_visibility === 'open' ? 'translate-x-5' : 'translate-x-0'}`} />
                                  </button>
                              ) : (
                                  <Badge color={org.operational_visibility === 'open' ? 'green' : 'gray'}>
                                      {org.operational_visibility === 'open' ? 'Open' : 'Restricted'}
                                  </Badge>
                              )}
                          </div>
                      </Card>

                      <Card title="Trusted Partners (Consent Grants)">
                          <div className="space-y-4">
                              <p className="text-sm text-gray-500">
                                  These organizations have been granted specific permission to view your data, regardless of your global visibility setting.
                              </p>
                              {activePolicies.length === 0 ? (
                                  <div className="bg-gray-50 p-4 rounded border border-gray-200 text-center text-sm text-gray-500 italic">
                                      No specific consents granted.
                                  </div>
                              ) : (
                                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
                                      {activePolicies.map(policy => {
                                          const partner = organizations.find(o => o.id === policy.viewerId);
                                          return (
                                              <div key={policy.id} className="p-4 bg-white flex justify-between items-center">
                                                  <div className="flex items-center gap-3">
                                                      <div className="w-8 h-8 bg-indigo-100 rounded flex items-center justify-center text-indigo-700 font-bold text-xs">
                                                          {partner?.name.substring(0,2).toUpperCase() || '??'}
                                                      </div>
                                                      <div>
                                                          <div className="font-bold text-sm text-gray-900">{partner?.name || 'Unknown Partner'}</div>
                                                          <div className="text-xs text-gray-500">Access Level: {policy.accessLevel.toUpperCase()}</div>
                                                      </div>
                                                  </div>
                                                  {isManageable && (
                                                      <button 
                                                          onClick={() => handleRevokeConsent(policy.id)}
                                                          className="text-xs text-red-600 hover:text-red-800 font-bold border border-red-200 hover:bg-red-50 px-3 py-1 rounded"
                                                      >
                                                          Revoke Access
                                                      </button>
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}
                          </div>
                      </Card>

                      <Card title="Consent Audit History">
                        {consentEvents.length === 0 ? (
                            <p className="text-gray-500 text-sm italic">No history recorded.</p>
                        ) : (
                            <>
                                <div className="overflow-hidden rounded-md border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Partner ESO</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Updated By</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {visibleEvents.map(evt => {
                                                const partnerName = organizations.find(o => o.id === evt.viewerId)?.name || 'Unknown';
                                                const actorName = people.find(p => p.id === evt.actorId)?.first_name 
                                                    ? `${people.find(p => p.id === evt.actorId)?.first_name} ${people.find(p => p.id === evt.actorId)?.last_name}`
                                                    : (evt.actorId === org.id ? 'Organization Admin' : 'System'); // Fallback logic
                                                
                                                return (
                                                    <tr key={evt.id} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                            {new Date(evt.timestamp).toLocaleDateString()} <span className="text-gray-400 text-xs">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <Badge color={evt.action === 'granted' ? 'green' : evt.action === 'revoked' ? 'red' : 'yellow'}>
                                                                {evt.action.toUpperCase()}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                                                            {partnerName}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500">
                                                            {evt.reason || '-'}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                                            {actorName}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {consentEvents.length > 10 && (
                                    <div className="mt-4 text-center">
                                        <button 
                                            onClick={() => setShowAllEvents(!showAllEvents)}
                                            className="text-sm text-indigo-600 font-medium hover:underline"
                                        >
                                            {showAllEvents ? 'Show Less' : `View ${consentEvents.length - 10} older events`}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                  </div>
              )}
           </div>
        </div>
    );
};
