
import React, { useState } from 'react';
import { MetricsPreviewView } from './MetricsPreviewView';
import { ReferralReportsView } from './ReferralReportsView';

export const ReportsView = () => {
  const [activeTab, setActiveTab] = useState<'impact' | 'network'>('impact');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Reports & Analytics</h2>
        
        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
            <button
                onClick={() => setActiveTab('impact')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'impact' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
                Economic Impact
            </button>
            <button
                onClick={() => setActiveTab('network')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'network' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
                Network Health
            </button>
        </div>
      </div>

      {activeTab === 'impact' ? (
          <MetricsPreviewView />
      ) : (
          <ReferralReportsView />
      )}
    </div>
  );
};
