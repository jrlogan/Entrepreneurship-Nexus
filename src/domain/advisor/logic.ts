
import { Organization, Person, Ecosystem, PortalLink, Referral } from '../types';
import { Todo } from '../todos/types';
import { AdvisorSuggestion, AdvisorAcceptanceResult } from './types';

/**
 * Builds the text prompt context for the AI Advisor.
 */
export function buildAdvisorContext(
    ecosystem: Ecosystem,
    esos: Organization[],
    resources: PortalLink[],
    person: Person,
    personOrg?: Organization
): string {
    const lines: string[] = [];

    // 1. Ecosystem Context
    lines.push(`Ecosystem: ${ecosystem.name} (${ecosystem.region})`);
    
    // 2. User Context
    lines.push(`User: ${person.first_name} ${person.last_name}`);
    lines.push(`Role: ${person.system_role}`);
    if (personOrg) {
        lines.push(`Organization: ${personOrg.name}`);
        lines.push(`Description: ${personOrg.description}`);
        lines.push(`Industry: ${personOrg.classification.industry_tags.join(', ')}`);
        lines.push(`Stage: ${personOrg.roles.join(', ')}`);
    }

    // 3. Available Support (ESOs)
    lines.push(`\nAvailable Support Organizations (ESOs):`);
    esos.forEach(eso => {
        lines.push(`- [ID: ${eso.id}] ${eso.name}: ${eso.description} (Tags: ${eso.classification.industry_tags.join(', ')})`);
    });

    // 4. Available Resources
    if (resources && resources.length > 0) {
        lines.push(`\nAvailable Resources (Portal Links):`);
        resources.forEach(res => {
            lines.push(`- [ID: ${res.id}] ${res.label}: ${res.description || 'No description'}`);
        });
    }

    return lines.join('\n');
}

/**
 * Validates and normalizes raw JSON output from the model.
 */
export function normalizeSuggestions(raw: any): AdvisorSuggestion[] {
    if (!raw || !raw.suggestions || !Array.isArray(raw.suggestions)) {
        console.warn("Advisor: Invalid raw response format", raw);
        return [];
    }

    return raw.suggestions.map((s: any, index: number) => ({
        id: `sugg_${Date.now()}_${index}`,
        title: s.title || "Untitled Suggestion",
        reason: s.reason || "No reason provided.",
        type: ['action', 'resource', 'referral', 'connection'].includes(s.type) ? s.type : 'action',
        confidence_score: typeof s.confidence_score === 'number' ? s.confidence_score : 50,
        target_id: s.target_id || undefined,
        action_url: s.action_url || undefined,
        priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium'
    }));
}

/**
 * Converts an accepted suggestion into actionable domain entities (Todo or Referral).
 */
export function acceptSuggestion(
    suggestion: AdvisorSuggestion, 
    actor: Person, 
    ecosystemId: string
): AdvisorAcceptanceResult {
    const timestamp = new Date().toISOString();
    const result: AdvisorAcceptanceResult = {
        audit_event: {
            event: 'suggestion_accepted',
            suggestion_id: suggestion.id,
            actor_id: actor.id,
            timestamp
        }
    };

    // Case 1: Referral Suggestion -> Create Referral Object
    if (suggestion.type === 'referral' || suggestion.type === 'connection') {
        if (suggestion.target_id) {
            const referralPayload: Partial<Referral> = {
                referring_org_id: actor.organization_id, // Self-referral logic or handled by system
                receiving_org_id: suggestion.target_id,
                subject_person_id: actor.id,
                subject_org_id: actor.organization_id,
                status: 'pending',
                notes: `AI Advisor Suggestion: ${suggestion.reason}`,
                date: timestamp.split('T')[0]
            };
            result.referral_payload = referralPayload;
        }
    }

    // Case 2: General Action/Resource -> Create Todo
    const todoPayload: Partial<Todo> = {
        title: suggestion.title,
        description: suggestion.reason,
        status: 'pending',
        source: 'advisor',
        owner_id: actor.id,
        ecosystem_id: ecosystemId,
        created_at: timestamp,
        created_by: 'system_advisor',
        suggestion_reference_id: suggestion.id,
        linked_resource_id: suggestion.target_id,
        action_url: suggestion.action_url || (suggestion.type === 'resource' && suggestion.target_id ? `portal_link:${suggestion.target_id}` : undefined)
    };

    result.todo_payload = todoPayload;

    return result;
}
