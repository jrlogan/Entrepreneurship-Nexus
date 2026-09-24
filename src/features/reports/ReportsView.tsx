import React, { useState } from 'react';
import { NetworkStatsView } from './NetworkStatsView';
import { ReferralReportsView } from './ReferralReportsView';

export const ReportsView = () => {
  const [tab, setTab] = useState<'network' | 'referrals'>('network');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-800">Reports</h2>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('network')}
            className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'network' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Network statistics
          </button>
          <button
            type="button"
            onClick={() => setTab('referrals')}
            className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'referrals' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Your referrals
          </button>
        </div>
      </div>
      {tab === 'network' ? <NetworkStatsView /> : <ReferralReportsView />}
    </div>
  );
};
