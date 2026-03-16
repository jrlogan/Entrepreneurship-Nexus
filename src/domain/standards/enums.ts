
export const ENUMS = {
  "TaxStatus": [
    { "id": "non_profit", "label": "Non-Profit (501c3 etc)" },
    { "id": "for_profit", "label": "For Profit" },
    { "id": "government", "label": "Government / Public Sector" },
    { "id": "other", "label": "Other / Unspecified" }
  ],
  "OrganizationRole": [
    { "id": "startup", "label": "Startup / Entrepreneur" },
    { "id": "small_business", "label": "Small Business" },
    { "id": "nonprofit", "label": "Nonprofit Organization" },
    { "id": "government", "label": "Government / Public Agency" },
    { "id": "education", "label": "College / University / School" },
    { "id": "funder", "label": "Funder / Investor" },
    { "id": "service_provider", "label": "Professional Service Provider" },
    { "id": "workspace", "label": "Lab / Workspace / Makerspace" },
    { "id": "community_org", "label": "Community Organization" },
    { "id": "anchor_institution", "label": "Anchor Institution / Major Employer" },
    { "id": "eso", "label": "Entrepreneur Support Org (ESO)" }
  ],
  "OperationalVisibility": [
    { "id": "open", "label": "Open (Partners see details)" },
    { "id": "restricted", "label": "Restricted (Metadata only)" }
  ],
  "SystemRole": [
    { "id": "platform_admin", "label": "Platform Super Admin" },
    { "id": "ecosystem_manager", "label": "Ecosystem Manager" },
    { "id": "eso_admin", "label": "ESO Administrator" },
    { "id": "eso_staff", "label": "ESO Staff" },
    { "id": "eso_coach", "label": "ESO Coach / Mentor" },
    { "id": "entrepreneur", "label": "Entrepreneur / Client" }
  ],
  "InteractionType": [
    { "id": "meeting", "label": "Meeting (In-Person/Virtual)" },
    { "id": "email", "label": "Email Correspondence" },
    { "id": "call", "label": "Phone Call" },
    { "id": "event", "label": "Event Attendance" },
    { "id": "note", "label": "General Note" }
  ],
  "ReferralStatus": [
    { "id": "pending", "label": "Pending Review" },
    { "id": "accepted", "label": "Accepted" },
    { "id": "rejected", "label": "Rejected / Declined" },
    { "id": "completed", "label": "Completed" }
  ],
  "ReferralOutcome": [
    { "id": "enrolled", "label": "Enrolled / Became a Client" },
    { "id": "services_provided", "label": "Services Delivered" },
    { "id": "connected_to_resource", "label": "Connected to Another Resource" },
    { "id": "advice_only", "label": "Advice / Information Only" },
    { "id": "not_a_fit", "label": "Not a Fit / Declined" }
  ],
  "InitiativeStatus": [
    { "id": "active", "label": "Active" },
    { "id": "paused", "label": "Paused" },
    { "id": "completed", "label": "Completed" },
    { "id": "abandoned", "label": "Abandoned" }
  ],
  "MetricType": [
    { "id": "revenue", "label": "Revenue (Annual)" },
    { "id": "capital_raised", "label": "Capital Raised (Equity/Debt)" },
    { "id": "grant_funding", "label": "Grant Funding Awarded" },
    { "id": "jobs_ft", "label": "Full-Time Jobs Created" },
    { "id": "jobs_pt", "label": "Part-Time/Contract Jobs" },
    { "id": "patents_filed", "label": "Patents Filed/Issued" },
    { "id": "customer_count", "label": "Active Customers" }
  ],
  "MetricSource": [
    { "id": "self_reported", "label": "Self Reported by Client" },
    { "id": "verified", "label": "Verified by Staff" },
    { "id": "interaction_log", "label": "Extracted from Meeting" }
  ]
} as const;
