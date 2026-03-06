
export const ENUMS = {
  "TaxStatus": [
    { "id": "non_profit", "label": "Non-Profit (501c3 etc)" },
    { "id": "for_profit", "label": "For Profit" },
    { "id": "government", "label": "Government / Public Sector" },
    { "id": "other", "label": "Other / Unspecified" }
  ],
  "OrganizationRole": [
    { "id": "startup", "label": "Startup / Entrepreneur" },
    { "id": "funder", "label": "Funder / Investor" },
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
    { "id": "funding_secured", "label": "Funding / Capital Secured" },
    { "id": "service_delivered", "label": "Service / Support Delivered" },
    { "id": "mentorship_provided", "label": "Mentorship Provided" },
    { "id": "partnership_formed", "label": "Partnership / Deal Formed" },
    { "id": "new_client_signed", "label": "New Client / Contract" },
    { "id": "resource_accessed", "label": "Resource Accessed (Space/Equipment)" },
    { "id": "information_shared", "label": "Information Shared Only" },
    { "id": "no_outcome", "label": "No Tangible Outcome" },
    { "id": "other", "label": "Other" }
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
