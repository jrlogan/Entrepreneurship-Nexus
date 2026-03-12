# MVP ESO Experience

This document defines the intended non-demo MVP experience for Entrepreneurship Nexus.

## ESO Workspace

For MVP, ESO users should land in a very small operational workspace:

- `Referrals`
- `Organizations`
- `People`

Additional admin tools may still exist for platform or ecosystem operations, but the day-to-day ESO interface should stay centered on those three areas.

## Referral Scope By Role

- `eso_admin`, `eso_staff`, `eso_coach`
  - can see referrals involving their organization
- `eso_admin`
  - can see all referrals for their organization
  - can assign or reassign referral follow-up ownership inside their organization
- `ecosystem_manager`
  - can see all referrals within the ecosystem
- `platform_admin`
  - can see all referrals across the system

## Referral Routing Loop

The MVP referral loop should support:

1. Intake creates or updates a referral record.
2. Receiving organization reviews the referral.
3. Receiving organization assigns a follow-up owner.
4. Receiving organization sets a follow-up due date.
5. Follow-up owner logs the interaction.
6. Referral is closed when outcome is known.

Important MVP behavior:

- the person who first receives the referral may not be the actual follow-up owner
- routing to another staff member or coach inside the ESO must be easy
- ownership and follow-up date must be visible in the referral list

## What Counts As Complete For MVP

The MVP should cover:

- inbound referral capture
- organization-scoped referral visibility
- ecosystem-scoped admin visibility
- referral owner assignment
- follow-up due date tracking
- logging follow-up interactions

The MVP does not need to fully automate reminder delivery yet, but the data model should support it cleanly later.

## Next Workflow Layer

The next layer after MVP should add:

- reminder notifications to the assigned follow-up owner
- overdue follow-up views
- reassignment audit trail
- explicit “follow-up complete” state if the team needs it separate from referral completion
