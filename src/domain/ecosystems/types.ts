
import type { PipelineDefinition } from '../pipelines/types';

export interface PortalLink {
  id: string;
  label: string;
  url: string;
  icon?: string; // emoji or svg name
  description?: string;
  audience: 'all' | 'entrepreneur' | 'eso'; // New: Who sees this link
}

export interface ChecklistTemplate {
  id: string;
  name: string; // e.g. "Legal & Admin"
  description?: string; // Added
  items: string[]; // e.g. ["Incorporation Documents", "EIN Obtained", "Bank Account Open"]
}

export interface ChecklistProgress {
  template_id: string;
  items_checked: Record<string, boolean>; // {"Incorporation Documents": true}
}

export interface Ecosystem {
  id: string;
  name: string;
  region: string;
  settings: {
    interaction_privacy_default: 'open' | 'restricted'; // Updated to match new model
    feature_flags?: {
      advanced_workflows?: boolean;
      dashboard?: boolean;
      tasks_advice?: boolean;
      initiatives?: boolean;
      processes?: boolean;
      interactions?: boolean;
      reports?: boolean;
      venture_scout?: boolean;
      api_console?: boolean;
      data_quality?: boolean;
      data_standards?: boolean;
      metrics_manager?: boolean;
      inbound_intake?: boolean;
      notify_entrepreneurs?: boolean;
      grant_lab?: boolean;
    };
  };
  // Configurable checklists available to all initiatives in this ecosystem
  checklist_templates?: ChecklistTemplate[];
  // Configurable pipelines specific to this ecosystem
  pipelines: PipelineDefinition[];
  // Admin configurable links for the client portal
  portal_links?: PortalLink[];
  // Admin configurable tags available for entities in this ecosystem
  tags?: string[];
}
