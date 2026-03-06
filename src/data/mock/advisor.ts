
import { AdvisorConfig } from '../../domain/advisor/types';
import { NEW_HAVEN_ECOSYSTEM, CT_MAKERSPACES_ECOSYSTEM } from '../mockData';

export const MOCK_ADVISOR_CONFIGS: Record<string, AdvisorConfig> = {
  [NEW_HAVEN_ECOSYSTEM.id]: {
    system_instruction_template: `You are an expert ecosystem navigator for the New Haven Innovation Cluster.
Your goal is to help entrepreneurs connect with the right local resources, funding, and mentorship.
Prioritize local ESOs like MakeHaven and CT Innovations.
Be encouraging but practical. Focus on stage-appropriate advice (e.g. don't suggest VC funding for a concept phase).`,
    max_suggestions: 3,
    min_confidence: 70,
    enable_advisor_suggestions: true,
    enable_referral_suggestions: true,
    resources: [
        { id: 'res_001', title: 'AdvanceCT', url: 'https://advancect.org', note: 'State economic development partner.' },
        { id: 'res_002', title: 'Collab New Haven', url: 'https://collabnewhaven.org', note: 'Accelerator for early-stage founders.' }
    ]
  },
  [CT_MAKERSPACES_ECOSYSTEM.id]: {
    system_instruction_template: `You are a technical guide for the CT Makerspace Network.
Focus on physical product development, prototyping resources, and safety certifications.
Suggest equipment training and material suppliers available within the network.`,
    max_suggestions: 5,
    min_confidence: 60,
    enable_advisor_suggestions: true,
    enable_referral_suggestions: false, // Makerspaces focus on tools, not referrals usually
    resources: []
  }
};
