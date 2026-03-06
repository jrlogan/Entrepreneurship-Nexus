
import React, { useState } from 'react';
import { Modal } from './Components';

export const PrivacyLegend = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-10 h-10 bg-white text-gray-500 hover:text-indigo-600 rounded-full shadow-lg border border-gray-200 z-50 flex items-center justify-center transition-transform hover:scale-110 group"
                title="Privacy & Access Legend"
            >
                <span className="text-lg font-bold group-hover:text-indigo-700">?</span>
            </button>

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="System Access Legend">
                <div className="space-y-6">
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Access Levels</h4>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 p-3 rounded bg-green-50 border border-green-100">
                                <div className="text-lg">🟢</div>
                                <div>
                                    <div className="font-bold text-green-900 text-sm">Full Access</div>
                                    <div className="text-xs text-green-700">See all organizational data including notes & metrics.</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded bg-gray-50 border border-gray-200">
                                <div className="text-lg">🔒</div>
                                <div>
                                    <div className="font-bold text-gray-700 text-sm">Basic Access</div>
                                    <div className="text-xs text-gray-600">Directory profile + activity metadata only.</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded bg-red-50 border border-red-100">
                                <div className="text-lg">🔴</div>
                                <div>
                                    <div className="font-bold text-red-900 text-sm">No Access</div>
                                    <div className="text-xs text-red-700">Organization hidden or not in your ecosystem.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-gray-100">
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Always Visible</h4>
                            <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4 marker:text-gray-300">
                                <li>Organization directory profile</li>
                                <li>Who has supported them (ESO names)</li>
                                <li>Interaction dates and types</li>
                                <li>Referral relationships/outcomes</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Requires Consent</h4>
                            <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4 marker:text-gray-300">
                                <li>Meeting notes & conversation details</li>
                                <li>Financial metrics & KPIs</li>
                                <li>Initiative specifics & progress</li>
                                <li>Full team member list</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-bold shadow-sm transition-colors"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
};
