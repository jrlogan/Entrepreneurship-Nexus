
import type { ChecklistProgress } from '../ecosystems/types';

export interface PipelineStage {
  id: string; // Added ID for history tracking
  name: string;
  description: string;
  criteria?: string[]; // Checklist items required to pass this stage
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string; // Optional description
  context: 'venture' | 'product' | 'grant'; // Context helps assign pipeline to correct entity aspect
  applicable_types: string[];
  stages: PipelineStage[];
}

export interface StageHistoryLog {
  stage_index: number;
  stage_id: string;
  entered_at: string; // ISO Date
  exited_at?: string; // ISO Date (null if current)
}

export interface Initiative {
  id: string;
  organization_id: string;
  pipeline_id?: string; // Now optional for checklist-based initiatives
  name: string;
  description?: string; // New: General description of the project
  current_stage_index: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  ecosystem_id: string; // Scoped to ecosystem
  notes?: string;
  
  // New: Timeline Targets
  start_date?: string;
  target_end_date?: string;

  // Longitudinal Tracking
  stage_history: StageHistoryLog[];
  
  // Configurable Ecosystem Checklists
  checklists: ChecklistProgress[];
}
