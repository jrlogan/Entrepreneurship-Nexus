import React, { useState } from 'react';
import { Person, Organization, Interaction, Referral } from '../../domain/types';
import { Card, Badge, Avatar } from '../../shared/ui/Components';
import { LogInteractionModal } from '../interactions/LogInteractionModal';
import { CreateReferralModal } from '../referrals/CreateReferralModal';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface PersonDetailViewProps {
  person: Person;
  organizations: Organization[];
  interactions: Interaction[];
  referrals: Referral[];
  onBack: () => void;
  onLogInteraction: () => void;
  onCreateReferral: () => void;
}

export const PersonDetailView = ({
    person,
    organizations,
    interactions,
    referrals,
    onBack,
    onLogInteraction,
    onCreateReferral
  }: PersonDetailViewProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [activeTab, setActiveTab] = useState<'associations' | 'interactions' | 'referrals'>('associations');
    const [showLogInteraction, setShowLogInteraction] = useState(false);
    const [showCreateReferral, setShowCreateReferral] = useState(false);
    // State to trigger re-renders if necessary, though ideally data flows from props
    const [refreshTrigger, setRefreshTrigger] = useState(0); 

    const personName = `${person.first_name} ${person.last_name}`;
    const personInteractions = interactions.filter(i => i.attendees?.includes(personName)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const personReferrals = referrals.filter(r => r.subject_person_id === person.id);

    const primaryOrg = organizations.find(o => o.id === person.organization_id);
    const secondaryOrg = person.secondary_profile ? organizations.find(o => o.id === person.secondary_profile!.organization_id) : null;

    const handleInteractionComplete = () => {
        setRefreshTrigger(prev => prev + 1);
        // In a real app we might refetch or props would update
    };

    const handleReferralSave = (referral: Partial<Referral>) => {
        repos.referrals.add({
            id: `ref_${Date.now()}`,
            ...referral
        } as Referral);
        setRefreshTrigger(prev => prev + 1);
    };
  
    return (
      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition">←</button>
              <Avatar src={person.avatar_url} name={personName} size="xl" />
              <div>
                 <h1 className="text-2xl font-bold text-gray-900 leading-none">{personName}</h1>
                 <div className="text-sm text-gray-500 mt-1">{person.role}</div>
                 <div className="flex items-center gap-3 mt-2">
                   <Badge color="gray">{person.system_role.replace('_', ' ')}</Badge>
                   <a href={`mailto:${person.email}`} className="text-sm text-indigo-600 hover:underline">{person.email}</a>
                 </div>
              </div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => setShowLogInteraction(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700">Log Interaction</button>
               <button onClick={() => setShowCreateReferral(true)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">Make Referral</button>
            </div>
          </div>
          <div className="mt-6 flex gap-4 border-t pt-4">
            {person.links?.length ? person.links.map((link, idx) => (
                <a key={idx} href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors">
                  <span className="font-bold uppercase text-xs">{link.platform}</span>
                </a>
              )) : <span className="text-sm text-gray-400 italic">No social links added.</span>}
          </div>
        </div>
  
        <div className="bg-white border-b border-gray-200 px-6">
           <nav className="-mb-px flex space-x-6">
             {[
               { id: 'associations', label: 'Associations' },
               { id: 'interactions', label: `Interactions (${personInteractions.length})` },
               { id: 'referrals', label: `Referrals (${personReferrals.length})` },
             ].map(tab => (
               <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.label}</button>
             ))}
           </nav>
         </div>
  
         <div className="space-y-6">
           {activeTab === 'associations' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {primaryOrg && <Card title="Primary Organization">
                   <h4 className="text-lg font-bold text-gray-900">{primaryOrg.name}</h4>
                   <p className="text-sm text-gray-500">{person.role}</p>
                   <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                     {primaryOrg.classification.industry_tags.map(tag => <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{tag}</span>)}
                   </div>
               </Card>}
               {secondaryOrg && <Card title="Secondary Association">
                   <h4 className="text-lg font-bold text-gray-900">{secondaryOrg.name}</h4>
                   <p className="text-sm text-gray-500">{person.secondary_profile?.role_title}</p>
                   <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                     {secondaryOrg.classification.industry_tags.map(tag => <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{tag}</span>)}
                   </div>
               </Card>}
             </div>
           )}
           {activeTab === 'interactions' && (
              <div className="space-y-4">
                {personInteractions.map(int => (
                   <Card key={int.id} title={`${int.type.toUpperCase()} - ${int.date}`}>
                      <p className="text-gray-800">{int.notes}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <span>Org: {organizations.find(o => o.id === int.organization_id)?.name}</span>
                        <span>By: {int.recorded_by}</span>
                      </div>
                   </Card>
                ))}
                {personInteractions.length === 0 && <p className="text-gray-500 text-center">No interactions found.</p>}
              </div>
           )}
           {activeTab === 'referrals' && (
              <div className="space-y-4">
                {personReferrals.map(ref => (
                   <Card key={ref.id} title={`Referral: ${organizations.find(o => o.id === ref.referring_org_id)?.name} → ${organizations.find(o => o.id === ref.receiving_org_id)?.name}`}>
                      <p className="text-gray-800 mb-2">{ref.notes}</p>
                      <Badge color={ref.status === 'pending' ? 'yellow' : 'green'}>{ref.status}</Badge>
                   </Card>
                ))}
                {personReferrals.length === 0 && <p className="text-gray-500 text-center">No referrals found.</p>}
              </div>
           )}
         </div>

         {/* Modals */}
         <LogInteractionModal 
            isOpen={showLogInteraction} 
            onClose={() => setShowLogInteraction(false)}
            onComplete={handleInteractionComplete}
            organizations={organizations}
         />

         <CreateReferralModal 
            isOpen={showCreateReferral}
            onClose={() => setShowCreateReferral(false)}
            onSave={handleReferralSave}
            organizations={organizations}
            currentOrgId={viewer.orgId}
            subjectOrg={organizations.find(o => o.id === person.organization_id)}
         />
      </div>
    );
};