
// Service for Connecticut Secretary of the State (SOTS) Business Registry via Socrata SODA API
// Docs: https://dev.socrata.com/

const BASE_URL = 'https://data.ct.gov/resource';
const MASTER_DATASET_ID = 'n7gp-d28j'; // Business Master
const PRINCIPALS_DATASET_ID = 'ka36-64k6'; // Business Principals

export interface SotsBusiness {
  business_id?: string;
  business_name: string;
  business_alei: string; // CT account number / legacy ALEI mapping
  business_status: string;
  date_of_registration: string;
  business_address?: string;
  principal_business_address_city?: string;
  principal_business_address_state?: string;
  business_email_address?: string;
  naics_code?: string;
  business_type?: string; // e.g. "Domestic Limited Liability Company"
}

export interface SotsPrincipal {
  business_id?: string;
  business_alei?: string;
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

    const escapeSoql = (value: string) => value.replace(/'/g, "''").trim().toUpperCase();
    const normalizeBusiness = (record: any): SotsBusiness => ({
      business_id: record.business_id || record.id || undefined,
      business_name: record.business_name || record.name || '',
      business_alei: record.business_alei || record.accountnumber || '',
      business_status: record.business_status || record.status || '',
      date_of_registration: record.date_of_registration || record.date_registration || '',
      business_address: record.business_address || record.mailing_address || record.office_jurisdiction_address || '',
      principal_business_address_city: record.principal_business_address_city || record.office_jurisdiction_3 || '',
      principal_business_address_state: record.principal_business_address_state || record.office_in_jurisdiction_country || '',
      business_email_address: record.business_email_address || '',
      naics_code: record.naics_code || '',
      business_type: record.business_type || '',
    });

    const buildSearchUrl = (whereClause: string) => {
      const params = new URLSearchParams();
      params.append('$select', 'id,name,accountnumber,status,date_registration,business_email_address,naics_code,business_type,office_jurisdiction_address,office_jurisdiction_3,office_in_jurisdiction_country');
      params.append('$where', whereClause);
      params.append('$limit', '10');
      params.append('$order', 'name');
      return `${BASE_URL}/${MASTER_DATASET_ID}.json?${params.toString()}`;
    };

    const escapedQuery = escapeSoql(query);

    try {
      const broadResponse = await fetch(buildSearchUrl(`upper(name) like '%${escapedQuery}%'`));
      if (!broadResponse.ok) throw new Error(`SOTS API Error: ${broadResponse.statusText}`);
      let data = await broadResponse.json();

      if (!Array.isArray(data) || data.length === 0) {
        const prefixResponse = await fetch(buildSearchUrl(`starts_with(upper(name), '${escapedQuery}')`));
        if (prefixResponse.ok) {
          data = await prefixResponse.json();
        }
      }

      return Array.isArray(data) ? data.map(normalizeBusiness).filter((record) => record.business_name) : [];
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
      const normalizeBusiness = (record: any): SotsBusiness => ({
        business_id: record.business_id || record.id || undefined,
        business_name: record.business_name || record.name || '',
        business_alei: record.business_alei || record.accountnumber || '',
        business_status: record.business_status || record.status || '',
        date_of_registration: record.date_of_registration || record.date_registration || '',
        business_address: record.business_address || record.mailing_address || record.office_jurisdiction_address || '',
        principal_business_address_city: record.principal_business_address_city || record.office_jurisdiction_3 || '',
        principal_business_address_state: record.principal_business_address_state || record.office_in_jurisdiction_country || '',
        business_email_address: record.business_email_address || '',
        naics_code: record.naics_code || '',
        business_type: record.business_type || '',
      });
      const normalizePrincipal = (record: any): SotsPrincipal => ({
        business_id: record.business_id || undefined,
        business_alei: record.business_alei || undefined,
        principal_name: record.principal_name || record.name__c || [record.firstname, record.lastname].filter(Boolean).join(' '),
        principal_title: record.principal_title || record.designation || '',
      });
      // 1. Fetch Business Master Record
      const businessParams = new URLSearchParams();
      businessParams.append('$select', 'id,name,accountnumber,status,date_registration,business_email_address,naics_code,business_type,office_jurisdiction_address,office_jurisdiction_3,office_in_jurisdiction_country');
      businessParams.append('$where', `accountnumber='${alei.replace(/'/g, "''")}' OR id='${alei.replace(/'/g, "''")}'`);
      const businessUrl = `${BASE_URL}/${MASTER_DATASET_ID}.json?${businessParams.toString()}`;
      const businessRes = await fetch(businessUrl);
      
      if (!businessRes.ok) throw new Error("SOTS Business Fetch Failed");
      
      const businessData = await businessRes.json();
      
      if (!businessData || businessData.length === 0) {
        // Check mocks
        const mockBiz = MOCK_SOTS_DATA.find(b => b.business_alei === alei);
        if (mockBiz) return { business: mockBiz, principals: [] };
        return { business: null, principals: [] };
      }

      const normalizedBusiness = normalizeBusiness(businessData[0]);

      // 2. Fetch Principals
      const principalsParams = new URLSearchParams();
      principalsParams.append('$select', 'business_id,name__c,designation,firstname,lastname');
      principalsParams.append('$where', `business_id='${(normalizedBusiness.business_id || '').replace(/'/g, "''")}'`);
      const principalsUrl = `${BASE_URL}/${PRINCIPALS_DATASET_ID}.json?${principalsParams.toString()}`;
      const principalsRes = await fetch(principalsUrl);
      const principalsData = principalsRes.ok ? await principalsRes.json() : [];

      return {
        business: normalizedBusiness,
        principals: Array.isArray(principalsData) ? principalsData.map(normalizePrincipal) : []
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
    params.append('$select', 'id,name,accountnumber,status,date_registration,business_email_address,naics_code,business_type,office_jurisdiction_address,office_jurisdiction_3,office_in_jurisdiction_country');
    params.append('$where', `date_registration > '${dateString}' AND status = 'Active'`);
    params.append('$limit', '50');
    params.append('$order', 'date_registration DESC');

    const url = `${BASE_URL}/${MASTER_DATASET_ID}.json?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
          throw new Error(`SOTS Scout API returned ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data.map((record: any) => ({
        business_id: record.id || undefined,
        business_name: record.name || '',
        business_alei: record.accountnumber || '',
        business_status: record.status || '',
        date_of_registration: record.date_registration || '',
        business_address: record.office_jurisdiction_address || '',
        principal_business_address_city: record.office_jurisdiction_3 || '',
        principal_business_address_state: record.office_in_jurisdiction_country || '',
        business_email_address: record.business_email_address || '',
        naics_code: record.naics_code || '',
        business_type: record.business_type || '',
      })) : [];
    } catch (error) {
      console.warn("SOTS Scout Error (Switching to Mock Data):", error);
      // Return mock data so the UI isn't empty/broken
      return MOCK_SOTS_DATA;
    }
  }
};
