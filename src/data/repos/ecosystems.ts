
import type { Ecosystem, ChecklistTemplate } from '../../domain/ecosystems/types';
import type { PipelineDefinition } from '../../domain/pipelines/types';
import { ALL_ECOSYSTEMS } from '../mockData';

export class EcosystemsRepo {
  getAll(): Ecosystem[] {
    return ALL_ECOSYSTEMS;
  }

  getById(id: string): Ecosystem | undefined {
    return ALL_ECOSYSTEMS.find(e => e.id === id);
  }

  update(id: string, updates: Partial<Ecosystem>): void {
    const ecosystem = this.getById(id);
    if (ecosystem) {
      Object.assign(ecosystem, updates);
    }
  }

  addTag(id: string, tag: string): void {
    const ecosystem = this.getById(id);
    if (ecosystem) {
        if (!ecosystem.tags) ecosystem.tags = [];
        if (!ecosystem.tags.includes(tag)) {
            ecosystem.tags.push(tag);
        }
    }
  }

  removeTag(id: string, tag: string): void {
    const ecosystem = this.getById(id);
    if (ecosystem && ecosystem.tags) {
        ecosystem.tags = ecosystem.tags.filter(t => t !== tag);
    }
  }

  // --- Pipelines & Checklists ---

  addPipeline(ecosystemId: string, pipeline: PipelineDefinition): void {
    const ecosystem = this.getById(ecosystemId);
    if (ecosystem) {
      if (!ecosystem.pipelines) ecosystem.pipelines = [];
      ecosystem.pipelines.push(pipeline);
    }
  }

  addChecklistTemplate(ecosystemId: string, template: ChecklistTemplate): void {
    const ecosystem = this.getById(ecosystemId);
    if (ecosystem) {
      if (!ecosystem.checklist_templates) ecosystem.checklist_templates = [];
      ecosystem.checklist_templates.push(template);
    }
  }
}
