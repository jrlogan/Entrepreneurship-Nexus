import React from 'react';
import type { Organization, Ecosystem, SystemRole } from '../../domain/types';

export interface IntegrationGuideViewProps {
  organization: Organization | null;
  ecosystem: Ecosystem;
  viewerRole: SystemRole;
  onOpenApiConsole: () => void;
  onOpenOrganization: (orgId: string) => void;
}

export const IntegrationGuideView = (_props: IntegrationGuideViewProps) => null;
