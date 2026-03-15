
import type { AdvisorConfig } from '../../domain/advisor/types';
import type { Organization } from '../../domain/organizations/types';
import type { PortalLink } from '../../domain/ecosystems/types';
import { MOCK_ADVISOR_CONFIGS } from '../mock/advisor';
import { ALL_ECOSYSTEMS, ALL_ORGANIZATIONS } from '../mockData';

export class AdvisorRepo {
  private static readonly STORAGE_KEY = 'nexus_advisor_configs';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const storedConfigs = localStorage.getItem(AdvisorRepo.STORAGE_KEY);
      if (!storedConfigs) return;

      const parsed = JSON.parse(storedConfigs) as Record<string, AdvisorConfig>;
      Object.assign(MOCK_ADVISOR_CONFIGS, parsed);
    } catch (error) {
      console.error('Failed to load advisor configs', error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(AdvisorRepo.STORAGE_KEY, JSON.stringify(MOCK_ADVISOR_CONFIGS));
    } catch (error) {
      console.error('Failed to save advisor configs', error);
    }
  }
  
  getConfig(ecosystemId: string): AdvisorConfig | null {
    return MOCK_ADVISOR_CONFIGS[ecosystemId] || null;
  }

  updateConfig(ecosystemId: string, updates: Partial<AdvisorConfig>): void {
    const current = MOCK_ADVISOR_CONFIGS[ecosystemId];
    if (current) {
        Object.assign(current, updates);
    } else {
        // Create default if missing
        MOCK_ADVISOR_CONFIGS[ecosystemId] = {
            system_instruction_template: 'You are a helpful assistant.',
            max_suggestions: 3,
            min_confidence: 50,
            enable_advisor_suggestions: true,
            enable_referral_suggestions: true,
            resources: [],
            ...updates
        };
    }

    this.saveToStorage();
  }

  /**
   * Returns a list of Support Organizations (ESOs) relevant to the ecosystem.
   * Filters for ESOs/Funders participating in the specific ecosystem.
   */
  getAvailableESOs(ecosystemId: string): Organization[] {
    // 1. Filter by ecosystem participation
    let esos = ALL_ORGANIZATIONS.filter(org => 
        org.ecosystem_ids?.includes(ecosystemId)
    );
    
    // 2. Filter specifically for Support/Funder roles (exclude pure startups unless they mentor)
    esos = esos.filter(org => 
        org.roles.includes('eso') || 
        org.roles.includes('funder')
    );

    return esos;
  }

  /**
   * Returns resources (PortalLinks) for the ecosystem
   */
  getResources(ecosystemId: string): PortalLink[] {
    const eco = ALL_ECOSYSTEMS.find(e => e.id === ecosystemId);
    return eco?.portal_links || [];
  }
}
