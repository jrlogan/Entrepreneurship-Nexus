# Onboarding And Role Model

This document defines the intended non-demo onboarding and role-assignment model for Entrepreneurship Nexus.

The main goal is to separate:

- authentication
- person identity
- organization/ecosystem membership
- permission grants

`Firebase Auth` proves identity. It does not grant role-based access by itself.

## Design Principles

- Self-signup creates a generic person and grants entrepreneur membership by default
- ESO and admin roles are never self-assigned
- Role grants are attached to memberships, not just the person record
- Invitations are the primary path for ESO participation
- Promotions are explicit admin actions with audit trail
- Demo-only identity switching must remain boxed behind `VITE_DEMO_MODE`

## Role Rules

Default self-signup outcome:

- `Person` record is created
- default membership role is `entrepreneur`

Restricted roles:

- `eso_staff`
- `eso_coach`
- `eso_admin`
- `ecosystem_manager`
- `platform_admin`

Restricted roles may only be granted by:

- invitation
- promotion by an authorized admin

## Role Authority

Long-term authority should come from membership records, not from `person.system_role` alone.

Recommended conceptual model:

- `Person`
  Identity and profile
- `PersonMembership`
  Organization + ecosystem + role + status
- `Invite`
  Pending role grant
- `Audit`
  Who granted, changed, revoked, or accepted access

`person.system_role` can remain as a derived/default convenience field for now, but should not be the sole source of authorization truth.

## Core Onboarding Paths

### 1. Entrepreneur Self-Signup

This is the only open self-service path.

Flow:

1. User signs up with email/password or Google
2. System creates authenticated account
3. System creates `Person`
4. System creates default entrepreneur membership in chosen ecosystem
5. User chooses organization context:
   - create new company/venture
   - join existing company/venture
   - skip for now

Rules:

- result access is entrepreneur access by default
- no ESO role is granted from this path
- network visibility and sharing consent are handled separately

### 2. ESO Invite Flow

This is the primary path for staff, coaches, and ESO admins.

Flow:

1. Admin enters:
   - email
   - target role
   - organization
   - ecosystem
2. System creates signed invite token
3. User opens invite link
4. User authenticates with:
   - email/password
   - Google login
5. System verifies:
   - token valid
   - token not expired
   - email matches invite
6. System attaches or creates `Person`
7. System activates invited membership
8. User lands in the correct org/ecosystem context

Rules:

- invite email and authenticated email should match by default
- mismatches should go to review, not auto-link
- invite should be single-use and expiring

### 3. Promotion Flow

Used when an existing user needs elevated permissions.

Examples:

- entrepreneur becomes `eso_coach`
- entrepreneur becomes `eso_staff`
- `eso_staff` becomes `eso_admin`

Rules:

- promotion creates or updates a membership
- it should not destroy existing entrepreneur context
- dual-role users must be supported

## Invitation Authority By Role

### Platform Admin

May:

- invite or promote any role
- operate across ecosystems and organizations
- revoke access anywhere

### Ecosystem Manager

May:

- invite and promote within assigned ecosystems
- manage ESO access inside those ecosystems

Should not:

- act outside assigned ecosystems
- grant platform-wide roles

### ESO Admin

May invite within their own organization and allowed ecosystem:

- `eso_admin`
- `eso_staff`
- `eso_coach`
- `entrepreneur`

Should not:

- invite outside their organization
- grant `ecosystem_manager`
- grant `platform_admin`

### ESO Staff / Coach / Entrepreneur

May not grant roles.

## Membership States

Recommended membership lifecycle:

- `invited`
- `pending_acceptance`
- `active`
- `suspended`
- `revoked`

Recommended invite lifecycle:

- `pending`
- `accepted`
- `expired`
- `revoked`

Implementation note:

- invite URLs should carry a raw acceptance token, but the database should store only a hashed token plus non-sensitive lifecycle metadata

## Organization Attachment For Entrepreneurs

Entrepreneurs may arrive in several states:

- they have a new company they want to create
- they belong to an existing company
- they are exploring and have no company yet
- they want to become a coach later

So onboarding should ask:

- Do you already have a company or venture?
- Are you joining an existing company?
- Do you want to create a new venture record?
- Do you want to skip company setup for now?

Important:

- avoid blind auto-creation of duplicate company records
- show likely matches before creating a new organization/company
- allow an entrepreneur to exist without company attachment
- company affiliation requests may need approval when the user is asking to join an existing company

### Company Affiliation Follow-Up

After self-signup, the user may:

- create a new company/venture
- request to join an existing company
- skip company affiliation for now

Potential future rule:

- if the user has a matching company-domain email, the system may allow a simpler affiliation path
- otherwise, joining an existing company should go through a company-level approval flow

Open design question:

- does the product need a formal `company_admin` concept, or should company affiliation always be handled by ESO/admin staff?

## Multi-Role / Dual-Context Users

A person may have more than one valid context.

Examples:

- entrepreneur + ESO coach
- entrepreneur in one ecosystem + staff in another
- staff in one org + advisor in another

This means the app needs:

- membership-aware authorization
- active context selection when multiple memberships exist
- clear separation between personal venture identity and ESO role

This is a real app feature. It should not be implemented through demo-style user switching.

## Consent And Visibility

Role assignment is separate from visibility and data sharing.

Do not combine:

- account creation
- role grant
- network directory consent
- detailed case-note sharing consent

Those should stay separate.

## Audit And Governance

The system should capture:

- who invited the user
- who approved promotion
- who revoked access
- previous role
- new role
- org/ecosystem scope
- timestamps

This matters for trust, debugging, and support.

## Immediate Product Decisions

These should be treated as current direction:

1. Self-signup creates a person and default entrepreneur membership.
2. ESO roles require invite or promotion.
3. Invite links must support both Google and email/password auth.
4. Email identity should be verified against the invite before activation.
5. Demo-only user switching and demo tours should be hidden when not in demo mode.

## Near-Term Implementation Steps

### Phase 1

- Gate all demo-only identity switching behind `VITE_DEMO_MODE`
- Keep entrepreneur self-signup
- Keep admin approval flow for elevated roles
- Add invite data model

### Phase 2

- Implement signed invite tokens
- Add invite acceptance flow for Google and email/password
- Add membership statuses and invite statuses

### Phase 3

- Move authorization to membership-first evaluation
- Support real multi-membership context switching
- Add audit log for invites, promotions, and revocations

## Open Questions

These should be decided before the invite flow is finalized:

- Should `eso_admin` be allowed to invite other `eso_admin` users immediately, or only after platform approval?
- Should personal-email acceptance of a work-email invite ever be allowed?
- What is the default entrepreneur ecosystem when multiple ecosystems are available?
- Should entrepreneur self-signup create a person immediately, or first create a pending onboarding record?
- How should company dedupe work during entrepreneur signup?
- Do we need a formal `company_admin` role or approval path for company affiliation?
