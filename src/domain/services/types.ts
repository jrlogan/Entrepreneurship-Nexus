
// Ongoing Services (Long-range interactions)
export interface Service {
  id: string;
  name: string; // e.g. "Incubator Tenant", "Makerspace Membership"
  provider_org_id: string; // The ESO providing the service
  
  // Recipient can be Organization OR Person
  recipient_org_id?: string; 
  recipient_person_id?: string;
  
  start_date: string;
  end_date?: string; // Null if ongoing
  status: 'active' | 'past';
  description?: string;
}
