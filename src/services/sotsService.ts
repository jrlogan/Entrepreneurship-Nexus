
// Service for Connecticut Secretary of the State (SOTS) Business Registry via Socrata SODA API
// Docs: https://dev.socrata.com/

const BASE_URL = 'https://data.ct.gov/resource';
const MASTER_DATASET_ID = 'n7gp-d28j'; // Business Master
const PRINCIPALS_DATASET_ID = 'ka36-64k6'; // Business Principals

export interface SotsBusiness {
  business_name: string;
  business_alei: string; // The unique ID (ALEI)
  business_status: string;
  date_of_registration: string;
  business_address?: string;
  principal_business_address_city?: string;
  principal_business_address_state?: string;
  business_type?: string; // e.g. "Domestic Limited Liability Company"
}

export interface SotsPrincipal {
  business_alei: string;
  principal_name: string;
  principal_title: string;
}

// Fallback data for demo/offline/error states
const MOCK_SOTS_DATA: SotsBusiness[] = [
    {
        business_name: "New Wave Energy LLC",
        business_alei: "US-CT-998877",
        business_status: "Active",
        date_of_registration: new Date().toISOString(),
        business_address: "123 Innovation Dr, New Haven, CT",
        principal_business_address_city: "New Haven",
        principal_business_address_state: "CT",
        business_type: "Domestic Limited Liability Company"
    },
    {
        business_name: "Shoreline Robotics Inc",
        business_alei: "US-CT-776655",
        business_status: "Active",
        date_of_registration: new Date(Date.now() - 86400000 * 5).toISOString(), // 5 days ago
        business_address: "45 Technology Park, Groton, CT",
        principal_business_address_city: "Groton",
        principal_business_address_state: "CT",
        business_type: "Domestic Corporation"
    }
];

export const SotsService = {
  /**
   * Search for businesses by name using SoQL
   */
  searchBusinessByName: async (query: string): Promise<SotsBusiness[]> => {
    if (!query) return [];
    
    // SoQL query: select * where name like '%QUERY%' limit 10
    const params = new URLSearchParams();
    params.append('$where', `upper(business_name) like '%${query.toUpperCase()}%'`);
    params.append('$limit', '10');
    params.append('$order', 'business_name');

    const url = `${BASE_URL}/${MASTER_DATASET_ID}.json?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`SOTS API Error: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.warn("SOTS Search Error (using fallback):", error);
      // Return a mock result if the name matches our mock data, otherwise empty
      return MOCK_SOTS_DATA.filter(b => b.business_name.toLowerCase().includes(query.toLowerCase()));
    }
  },

  /**
   * Get details including principals (owners/members)
   */
  getBusinessDetails: async (alei: string): Promise<{ business: SotsBusiness | null, principals: SotsPrincipal[] }> => {
    try {
      // 1. Fetch Business Master Record
      const businessUrl = `${BASE_URL}/${MASTER_DATASET_ID}.json?business_alei=${alei}`;
      const businessRes = await fetch(businessUrl);
      
      if (!businessRes.ok) throw new Error("SOTS Business Fetch Failed");
      
      const businessData = await businessRes.json();
      
      if (!businessData || businessData.length === 0) {
        // Check mocks
        const mockBiz = MOCK_SOTS_DATA.find(b => b.business_alei === alei);
        if (mockBiz) return { business: mockBiz, principals: [] };
        return { business: null, principals: [] };
      }

      // 2. Fetch Principals
      const principalsUrl = `${BASE_URL}/${PRINCIPALS_DATASET_ID}.json?business_alei=${alei}`;
      const principalsRes = await fetch(principalsUrl);
      const principalsData = principalsRes.ok ? await principalsRes.json() : [];

      return {
        business: businessData[0],
        principals: principalsData
      };
    } catch (error) {
      console.warn("SOTS Details Error (using fallback):", error);
      const mockBiz = MOCK_SOTS_DATA.find(b => b.business_alei === alei);
      return { business: mockBiz || null, principals: [] };
    }
  },

  /**
   * Scout for new ventures registered in the last 30 days
   */
  getRecentRegistrations: async (daysAgo: number = 30): Promise<SotsBusiness[]> => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD

    // Filter for Active businesses registered recently
    const params = new URLSearchParams();
    params.append('$where', `date_of_registration > '${dateString}' AND business_status = 'Active'`);
    params.append('$limit', '50');
    params.append('$order', 'date_of_registration DESC');

    const url = `${BASE_URL}/${MASTER_DATASET_ID}.json?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
          throw new Error(`SOTS Scout API returned ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.warn("SOTS Scout Error (Switching to Mock Data):", error);
      // Return mock data so the UI isn't empty/broken
      return MOCK_SOTS_DATA;
    }
  }
};
