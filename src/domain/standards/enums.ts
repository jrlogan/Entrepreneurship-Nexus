
export const ENUMS = {
  "TaxStatus": [
    { "id": "non_profit", "label": "Non-Profit (501c3 etc)" },
    { "id": "for_profit", "label": "For Profit" },
    { "id": "government", "label": "Government / Public Sector" },
    { "id": "other", "label": "Other / Unspecified" }
  ],
  "OrganizationRole": [
    { "id": "eso", "label": "Entrepreneur Support Org (ESO)" },
    { "id": "funder", "label": "Funder / Investor" },
    { "id": "resource", "label": "Resource / Service Provider" }
  ],
  "OrganizationType": [
    { "id": "startup", "label": "Startup / Venture" },
    { "id": "small_business", "label": "Small Business" },
    { "id": "business", "label": "Business / Company" },
    { "id": "nonprofit", "label": "Nonprofit Organization" },
    { "id": "government_agency", "label": "Government / Public Agency" },
    { "id": "other", "label": "Other" }
  ],
  "OwnerCharacteristic": [
    { "id": "woman_owned", "label": "Woman-Owned" },
    { "id": "minority_owned", "label": "Minority-Owned" },
    { "id": "veteran_owned", "label": "Veteran-Owned" },
    { "id": "lgbtq_owned", "label": "LGBTQ+-Owned" },
    { "id": "youth_owned", "label": "Youth-Owned (Under 35)" },
    { "id": "refugee_owned", "label": "Refugee/Immigrant-Owned" },
    { "id": "justice_involved", "label": "Justice-Involved" },
    { "id": "disabled_owned", "label": "Disability-Owned" },
    { "id": "low_income", "label": "Low-to-Moderate Income" }
  ],
  "OrgCertification": [
    { "id": "sba_8a", "label": "SBA 8(a) Certified" },
    { "id": "wosb", "label": "WOSB (Women-Owned Small Business)" },
    { "id": "hubzone", "label": "HUBZone Certified" },
    { "id": "mbe", "label": "MBE (Minority Business Enterprise)" },
    { "id": "wbe", "label": "WBE (Women Business Enterprise)" },
    { "id": "sdvosb", "label": "SDVOSB (Service-Disabled Veteran)" },
    { "id": "vosb", "label": "VOSB (Veteran-Owned)" },
    { "id": "dbe", "label": "DBE (Disadvantaged Business Enterprise)" }
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
  "SupportNeed": [
    { "id": "business_coaching", "label": "Business Concept & Strategy" },
    { "id": "product_development", "label": "Product & Technology" },
    { "id": "manufacturing", "label": "Manufacturing & Production" },
    { "id": "legal", "label": "Formation & Legal" },
    { "id": "funding", "label": "Capital & Fundraising" },
    { "id": "sales", "label": "Sales" },
    { "id": "marketing", "label": "Marketing & Branding" },
    { "id": "hiring", "label": "Talent & Hiring" },
    { "id": "workspace", "label": "Workspace & Facilities" },
    { "id": "networking", "label": "Networking & Connections" },
    { "id": "other", "label": "Other" }
  ],
  "VentureStage": [
    { "id": "idea", "label": "Concept / Pre-Launch" },
    { "id": "prototype", "label": "Pilot / Testing" },
    { "id": "early_revenue", "label": "Early Revenue" },
    { "id": "sustaining", "label": "Sustaining · Solo & Self-Sufficient" },
    { "id": "multi_person", "label": "Growing · Adding Team & Scale" },
    { "id": "established", "label": "Established" },
    { "id": "unknown", "label": "Unknown / Not Specified" }
  ],
  "InteractionVisibility": [
    { "id": "network_shared", "label": "Network Shared (Partners can see)" },
    { "id": "eso_private", "label": "Private (My organization only)" }
  ],
  "ServiceParticipationType": [
    { "id": "program", "label": "Program (Cohort / Curriculum)" },
    { "id": "application", "label": "Application / Competitive" },
    { "id": "membership", "label": "Membership" },
    { "id": "residency", "label": "Residency / Incubation" },
    { "id": "rental", "label": "Rental / Space Use" },
    { "id": "event", "label": "Event / Workshop" },
    { "id": "service", "label": "Direct Service / Advising" }
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
