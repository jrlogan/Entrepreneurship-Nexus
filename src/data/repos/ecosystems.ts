
import type { Ecosystem, ChecklistTemplate } from '../../domain/ecosystems/types';
import type { PipelineDefinition } from '../../domain/pipelines/types';
import { ALL_ECOSYSTEMS } from '../mockData';

/**
 * In-memory ecosystem repository.
 *
 * Reads are intentionally synchronous: ecosystem config (feature flags,
 * pipelines, checklist templates) is read from ~12 call sites during render.
 * The Firebase subclass keeps that contract by hydrating a cache at boot
 * rather than making every caller async.
 */
export class EcosystemsRepo {
  protected list: Ecosystem[] = ALL_ECOSYSTEMS;

  /** Loads ecosystems from the backing store. No-op for the in-memory repo. */
  async hydrate(): Promise<Ecosystem[]> {
    return this.list;
  }

  getAll(): Ecosystem[] {
    return this.list;
  }

  getById(id: string): Ecosystem | undefined {
    return this.list.find(e => e.id === id);
  }

  update(id: string, updates: Partial<Ecosystem>): void {
    const ecosystem = this.getById(id);
    if (ecosystem) {
      Object.assign(ecosystem, updates);
    } else {
      // Newly created ecosystem — add it so the selector sees it immediately.
      this.list.push({ id, ...updates } as Ecosystem);
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
