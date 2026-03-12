# Firebase Architecture Draft

This document proposes a Firebase-backed architecture for Entrepreneurship Nexus that builds on the current repo and policy structure in this app and incorporates lessons from the Boat Club Manager app.

## Goals

- add real authentication with Google and email login
- preserve the current domain model instead of replacing it with raw Firebase documents
- support multi-ecosystem membership and context switching
- enforce privacy and consent boundaries in both app logic and Firestore rules
- support the BCC intake and follow-up consent flow
- avoid a large rewrite by keeping the current repository pattern

## Core Design Principle

Firebase Auth should answer:

- who is authenticated

The Nexus domain model should answer:

- who is this person in the network
- which organizations and ecosystems are they part of
- what are they allowed to see and do

That means Firebase user identity should not become the app's entire user model.

## Recommended Architecture Layers

### 1. Firebase Infrastructure Layer

Create a small set of focused Firebase modules:

- `src/services/firebaseApp.ts`
- `src/services/authService.ts`
- `src/services/firestoreClient.ts`
- `src/services/functionsClient.ts`

Responsibilities:

- `firebaseApp.ts`
  - initialize app once
  - support emulator configuration
  - export `auth`, `db`, and `functions`
- `authService.ts`
  - sign in with Google
  - sign in with email/password
  - sign out
  - subscribe to auth state changes
- `firestoreClient.ts`
  - generic read/write/query helpers
  - no domain-specific business logic
- `functionsClient.ts`
  - invoke privileged server workflows

Keep initialization centralized. This is one of the most useful patterns from Boat Club.

### 2. Session And Identity Layer

Add an auth/session provider that resolves Firebase auth into the existing app context.

Suggested modules:

- `src/app/AuthProvider.tsx`
- `src/app/useAuthSession.ts`

Suggested session shape:

```ts
interface AuthSession {
  authUser: FirebaseUser | null;
  person: Person | null;
  memberships: EcosystemMembership[];
  activeEcosystemId: string | null;
  activeOrgId: string | null;
  viewer: ViewerContext | null;
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'needs_profile';
}
```

Resolution flow:

1. Firebase auth emits authenticated user
2. app loads Nexus person record by auth UID
3. app loads memberships and available org contexts
4. app selects active ecosystem
5. app derives `ViewerContext`
6. current repos and features consume `viewer` as they do now

This lets the current app structure survive while moving auth to Firebase.

### 3. Domain Repository Layer

Keep the current repo pattern from `src/data/repos/`.

Do not let components call Firestore directly.

Recommended progression:

- keep existing `AppRepos`
- define Firebase-backed versions of the current repos
- swap repo implementations through one composition point

Suggested layout:

- `src/data/repos/firebase/organizations.ts`
- `src/data/repos/firebase/people.ts`
- `src/data/repos/firebase/referrals.ts`
- `src/data/repos/firebase/interactions.ts`
- `src/data/repos/firebase/consent.ts`
- `src/data/repos/firebase/inboundMessages.ts`

Suggested composition:

```ts
export class FirebaseAppRepos extends AppRepos {
  public consent = new FirebaseConsentRepo();
  public organizations = new FirebaseOrganizationsRepo(this.consent);
  public people = new FirebasePeopleRepo();
  public interactions = new FirebaseInteractionsRepo(this.consent);
  public referrals = new FirebaseReferralsRepo(this.consent);
  public inboundMessages = new FirebaseInboundMessagesRepo();
}
```

The important point is that the UI should still talk to domain repos, not to Firebase primitives.

## Recommended Firestore Data Model

Use Firebase for operational storage, but keep the data shaped around the existing Nexus concepts.

### Identity And Membership Collections

#### `people`

Primary directory/person records.

Suggested fields:

- `id`
- `auth_uid`
- `first_name`
- `last_name`
- `email`
- `primary_organization_id`
- `system_role`
- `memberships`
- `external_refs`
- `status`
- `created_at`
- `updated_at`

Notes:

- `id` may equal `auth_uid` for simplicity, but it does not have to
- if you want invite-first flows, keep `auth_uid` nullable until claim time

#### `person_memberships`

Explicit ecosystem/org memberships.

Suggested fields:

- `id`
- `person_id`
- `ecosystem_id`
- `organization_id`
- `system_role`
- `status`
- `joined_at`
- `invited_by_person_id`

Why separate this:

- one Firebase auth user may participate in multiple ecosystems
- this avoids stuffing access context into the auth token
- this maps well to the current `memberships` concept in `Person`

### Organization Collections

#### `organizations`

Suggested fields:

- existing organization fields from the current domain model
- `ecosystem_ids`
- `operational_visibility`
- `authorized_eso_ids`
- `external_refs`
- `created_at`
- `updated_at`

#### `organization_aliases`

Suggested for routing and entity resolution.

Suggested fields:

- `organization_id`
- `canonical_name`
- `alias`
- `domain`
- `ecosystem_id`

This will matter for BCC routing and matching.

### Referral And Interaction Collections

#### `referrals`

Keep this close to the current `Referral` type.

Suggested fields:

- `referring_org_id`
- `receiving_org_id`
- `subject_person_id`
- `subject_org_id`
- `ecosystem_id`
- `status`
- `notes`
- `response_notes`
- `intro_email_sent`
- lifecycle timestamps
- `created_by_person_id`
- `source`

Suggested `source` values:

- `manual_ui`
- `bcc_intake`
- `api`

#### `interactions`

Keep interaction visibility explicit.

Suggested fields:

- existing interaction fields
- `subject_person_id`
- `subject_org_id`
- `author_person_id`
- `author_org_id`
- `ecosystem_id`
- `visibility`
- `note_confidential`

### Consent And Access Collections

This is where the two-level sharing model matters.

#### `network_profiles`

Represents the person's presence in the shared network.

Suggested fields:

- `person_id`
- `display_name`
- `venture_name`
- `ecosystem_ids`
- `directory_status`
- `network_directory_consent`
- `network_activity_visibility`
- `consent_recorded_at`
- `consent_updated_at`

This collection supports the network-visible basics layer.

#### `access_policies`

Equivalent to the current `ConsentPolicy` model.

Suggested fields:

- `resource_type`
- `resource_id`
- `viewer_org_id`
- `access_level`
- `is_active`
- `updated_at`
- `granted_by_person_id`

This collection supports detailed partner access.

#### `access_policy_events`

Audit trail for changes.

Suggested fields:

- `policy_id`
- `resource_id`
- `viewer_org_id`
- `action`
- `actor_id`
- `previous_access_level`
- `new_access_level`
- `timestamp`
- `reason`

### BCC Intake Collections

#### `inbound_routes`

Suggested fields:

- `route_address`
- `ecosystem_id`
- `activity_type`
- `allowed_sender_domains`
- `is_active`

#### `inbound_messages`

Suggested fields:

- `provider`
- `provider_message_id`
- `message_id_header`
- `route_address`
- `ecosystem_id`
- `activity_type`
- `from_email`
- `to_emails`
- `cc_emails`
- `subject`
- `text_body`
- `html_body`
- `headers`
- `attachments`
- `raw_payload`
- `parse_status`
- `review_status`
- `received_at`

#### `inbound_parse_results`

Suggested fields:

- `inbound_message_id`
- `candidate_person_email`
- `candidate_person_name`
- `candidate_venture_name`
- `candidate_receiving_org_id`
- `candidate_referring_org_id`
- `intro_contact_permission`
- `venture_stage`
- `support_needs`
- `confidence`
- `needs_review_reasons`

## Recommended Auth Flows

### 1. Standard Sign-In

Supported methods:

- Google sign-in
- email/password
- password reset

Recommended rule:

- authentication creates a session
- it does not automatically grant a usable app context until a matching Nexus person/membership is resolved

Possible session outcomes:

- authenticated and mapped
- authenticated but no profile
- authenticated but no active membership
- authenticated with multiple memberships and needs context selection

### 2. Invite And Claim Flow

For this app, invite and claim flows should be first-class.

Suggested model:

1. admin or partner invites an email address
2. invite record is created in Firestore
3. invited person signs in with Google or email
4. Cloud Function or server logic matches the email to the invite
5. membership is activated

This pattern is worth reusing from the Boat Club app.

### 3. BCC Follow-Up Account Invitation

For BCC intake:

1. partner sends intro email and BCCs network address
2. inbound message is stored
3. app creates draft intake record
4. app sends a follow-up email to the client
5. client signs in or creates account
6. client confirms network-directory and activity visibility preferences
7. detailed partner access remains a separate later grant

This flow is cleaner than treating the BCC as full system consent.

## Recommended Firestore Rule Strategy

### Rule Philosophy

Use client-side policy code for UX and explanation.

Use Firestore rules for actual enforcement.

Do not rely on UI alone.

### Rule Helper Pattern

Mirror the successful helper style from Boat Club:

- `isAuthenticated()`
- `isPlatformAdmin()`
- `isEcosystemManager(ecosystemId)`
- `isOrgMember(orgId)`
- `hasDetailedAccess(resourceId, orgId)`
- `canReadNetworkProfile(personId)`
- `canReadInboundMessage(ecosystemId)`

### Rule Boundaries

#### Network-Level Basics

Allow wider read access to:

- network profile basics
- referral existence
- high-level activity metadata

But only where `network_directory_consent` and `network_activity_visibility` allow it.

#### Detailed Operational Data

Restrict:

- detailed interaction notes
- confidential note bodies
- detailed coaching/intervention records
- raw inbound emails
- consent administration

These should require explicit org-level access or elevated roles.

#### Inbound Messages

Very restrictive by default.

Suggested:

- no general client reads
- reviewers/admins only
- function/service account writes

## Recommended Cloud Functions

Use Cloud Functions for privileged workflows rather than trusting the client.

Suggested functions:

### `processInboundEmail`

Triggered by Postmark webhook or HTTPS endpoint.

Responsibilities:

- validate request
- resolve route
- write `inbound_messages`
- parse footer
- write `inbound_parse_results`
- enqueue follow-up email if appropriate

### `sendReferralFollowUpEmail`

Responsibilities:

- notify the referred person
- explain what was shared
- invite login/account creation
- link to preference/consent screen

### `claimInviteAndMembership`

Responsibilities:

- match auth user email to pending invite
- create person record if needed
- create membership record
- log claim event

### `grantPartnerDetailAccess`

Responsibilities:

- validate actor authority
- create/update `access_policies`
- write audit event

## Recommended App Integration Shape

The current app is already organized around `AppDataProvider`, `ViewerContext`, and repos.

That should remain the application-facing surface.

Recommended future shape:

```tsx
<FirebaseProvider>
  <AuthProvider>
    <SessionProvider>
      <AppDataProvider repos={repos} viewer={viewer}>
        <App />
      </AppDataProvider>
    </SessionProvider>
  </AuthProvider>
</FirebaseProvider>
```

Suggested responsibilities:

- `FirebaseProvider`
  - initializes Firebase once
- `AuthProvider`
  - exposes Firebase auth state
- `SessionProvider`
  - resolves auth user into Nexus person/membership/viewer
- `AppDataProvider`
  - continues to expose repos and viewer to features

This minimizes churn in the rest of the codebase.

## Recommended Collection Ownership Model

Use this rule of thumb:

- user-authored low-risk records can be client-written if rules are tight
- role changes, invites, access grants, and inbound processing should be function-written

Good candidates for client write:

- own profile edits
- own notification preferences
- own account preferences
- explicit directory/activity consent settings

Good candidates for function write:

- membership activation
- role assignment
- raw inbound message creation
- follow-up email dispatch
- access policy grants
- audit log events

## Testing Recommendations

Do not wait on full emulator integration before testing the security model.

Start with:

- Firestore rules contract tests
- auth/session mapping tests
- invite-claim flow tests
- BCC follow-up flow tests

Recommended test files:

- `src/firestore.rules.contract.test.ts`
- `src/domain/auth/sessionMapping.test.ts`
- `src/domain/inbound/inboundParsing.test.ts`
- `src/domain/consent/networkVisibility.test.ts`

## Concrete Best Practices To Carry Forward From Boat Club

### Reuse

- centralized Firebase initialization
- emulator support from day one
- profile/membership separation
- invite-aware account claim flow
- helper-driven Firestore rules
- rules contract tests

### Improve

- split Firebase services into smaller modules
- avoid giant top-level app auth orchestration
- avoid fallback production config in source
- keep business logic in repos/domain services, not service wrappers

## Suggested Implementation Phases

### Phase 1: Auth Foundation

- add Firebase bootstrap modules
- add AuthProvider and SessionProvider
- support Google sign-in and email sign-in
- map Firebase auth user to current `ViewerContext`

### Phase 2: Firestore Foundation

- create Firebase-backed `people`, `person_memberships`, and `organizations`
- write first Firestore rules
- add rules contract tests

### Phase 3: Referral And Consent Migration

- migrate `referrals`, `interactions`, and `access_policies`
- preserve current policy semantics
- add network directory/activity visibility model

### Phase 4: BCC Intake

- add inbound collections
- add Postmark webhook function
- add review queue
- add follow-up consent/account invitation flow

## Recommended MVP On Firebase

The best Firebase-backed MVP is:

- Cloud Function receives BCC webhook payloads
- Firestore stores inbound messages and parse results
- system resolves or creates shared people and organizations
- system creates a draft referral/introduction event
- HTTPS callable or REST endpoint resolves people/orgs for partner CRMs

### MVP Collections

Minimum Firebase collections:

- `people`
- `person_memberships`
- `organizations`
- `network_profiles`
- `inbound_routes`
- `inbound_messages`
- `inbound_parse_results`
- `referrals`

### MVP Functions

Minimum Firebase functions:

- `processInboundEmail`
- `resolvePerson`
- `resolveOrganization`
- `sendReferralFollowUpEmail`

### MVP Integration Story

For low-tech partners:

- add BCC
- optionally add footer

For technical partners:

- call resolve endpoint
- store returned Nexus ID
- later deep-link into shared profile

This makes the MVP a real CRM integration layer, not just an email archive.

## Bottom Line

The safest and least wasteful path is:

- use Firebase for auth and operational storage
- keep Nexus domain types and repos as the app contract
- separate auth identity from network membership and access
- encode privacy rules twice: once in client policy logic, once in Firestore rules
- make BCC intake a function-backed workflow, not a direct client write

That approach reuses the hard lessons from Boat Club without copying the parts that would make this app harder to evolve.
