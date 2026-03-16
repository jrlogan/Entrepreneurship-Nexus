
// Structured participation records capture time-ranged involvement in a program,
// service, application, event series, rental, or membership. This is intentionally
// distinct from point-in-time interactions/notes.
export interface Service {
  id: string;
  name: string; // e.g. "Incubator Tenant", "Makerspace Membership"
  provider_org_id: string; // The ESO providing the service
  participation_type?: 'program' | 'application' | 'membership' | 'residency' | 'rental' | 'event' | 'service';
  
  // Recipient can be Organization OR Person
  recipient_org_id?: string; 
  recipient_person_id?: string;
  
  start_date: string;
  end_date?: string; // Null if ongoing
  status: 'active' | 'past' | 'applied' | 'waitlisted';
  description?: string;
}
