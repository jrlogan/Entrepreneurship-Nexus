/**
 * Tests for sidebar nav access logic.
 *
 * These exercise the real computeNavAccess function that App.tsx and
 * AppShell.tsx import, so regressions in feature-flag gating or role
 * bypasses are caught before they reach production.
 */
import { describe, it, expect } from 'vitest';
import { computeNavAccess as computeNav } from '../domain/access/navAccess';

describe('MVP views are on by default for staff', () => {
  for (const role of ['eso_admin', 'eso_staff', 'eso_coach', 'ecosystem_manager', 'platform_admin'] as const) {
    it(`${role} sees dashboard, interactions, reports, integration guide and data standards`, () => {
      const nav = computeNav(role, {});
      expect(nav.canAccessDashboard).toBe(true);
      expect(nav.canAccessInteractions).toBe(true);
      expect(nav.canAccessReports).toBe(true);
      expect(nav.canAccessIntegrationGuide).toBe(true);
      expect(nav.canAccessDataStandards).toBe(true);
    });
  }

  it('an explicit false switches a view off for non-admin staff', () => {
    const nav = computeNav('eso_staff', { reports: false, interactions: false, dashboard: false });
    expect(nav.canAccessReports).toBe(false);
    expect(nav.canAccessInteractions).toBe(false);
    expect(nav.canAccessDashboard).toBe(false);
  });
});

describe('entrepreneurs never see staff views', () => {
  it('has no staff access regardless of flags', () => {
    const nav = computeNav('entrepreneur', { dashboard: true, reports: true, api_console: true, data_quality: true });
    expect(Object.values(nav).every((v) => v === false)).toBe(true);
  });
});

describe('API console', () => {
  it('is available to ESO admins by default — they issue their org its keys', () => {
    expect(computeNav('eso_admin', {}).canAccessApiConsole).toBe(true);
  });

  it('is not available to ESO staff', () => {
    expect(computeNav('eso_staff', {}).canAccessApiConsole).toBe(false);
  });

  it('can be switched off for ESO admins, never for platform admins', () => {
    expect(computeNav('eso_admin', { api_console: false }).canAccessApiConsole).toBe(false);
    expect(computeNav('platform_admin', { api_console: false }).canAccessApiConsole).toBe(true);
  });
});

describe('data quality (record merging)', () => {
  it('is available to network operators', () => {
    expect(computeNav('platform_admin', {}).canAccessDataQuality).toBe(true);
    expect(computeNav('ecosystem_manager', {}).canAccessDataQuality).toBe(true);
  });

  it('is opt-in for ESO admins and never for ESO staff', () => {
    expect(computeNav('eso_admin', {}).canAccessDataQuality).toBe(false);
    expect(computeNav('eso_admin', { data_quality: true }).canAccessDataQuality).toBe(true);
    expect(computeNav('eso_staff', { data_quality: true }).canAccessDataQuality).toBe(false);
  });
});

describe('inbound intake', () => {
  it('is always available to platform admins', () => {
    expect(computeNav('platform_admin', {}).canAccessInboundIntake).toBe(true);
  });

  it('is opt-in for ecosystem managers only', () => {
    expect(computeNav('ecosystem_manager', {}).canAccessInboundIntake).toBe(false);
    expect(computeNav('ecosystem_manager', { inbound_intake: true }).canAccessInboundIntake).toBe(true);
    expect(computeNav('eso_admin', { inbound_intake: true }).canAccessInboundIntake).toBe(false);
  });
});
