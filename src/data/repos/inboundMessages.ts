import type {
  InboundMessage,
  InboundParseResult,
  InboundRoute,
  ResolveOrganizationRequest,
  ResolveOrganizationResult,
  ResolvePersonRequest,
  ResolvePersonResult,
} from '../../domain/inbound/types';
import { MOCK_PEOPLE, ALL_ORGANIZATIONS } from '../mockData';

const MOCK_INBOUND_ROUTES: InboundRoute[] = [
  {
    id: 'route_newhaven_intro',
    route_address: 'newhaven+introduction@inbound.example.org',
    ecosystem_id: 'eco_new_haven',
    activity_type: 'introduction',
    allowed_sender_domains: ['makehaven.org', 'ctinnovations.com'],
    is_active: true,
  },
  {
    id: 'route_newhaven_referral',
    route_address: 'newhaven+referral@inbound.example.org',
    ecosystem_id: 'eco_new_haven',
    activity_type: 'referral',
    allowed_sender_domains: ['makehaven.org', 'ctinnovations.com'],
    is_active: true,
  },
];
const MOCK_INBOUND_MESSAGES: InboundMessage[] = [];
const MOCK_INBOUND_PARSE_RESULTS: InboundParseResult[] = [];

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

export class InboundMessagesRepo {
  async getRoutes(): Promise<InboundRoute[]> {
    return Promise.resolve(MOCK_INBOUND_ROUTES);
  }

  async getMessages(): Promise<InboundMessage[]> {
    return Promise.resolve(MOCK_INBOUND_MESSAGES);
  }

  async getParseResults(): Promise<InboundParseResult[]> {
    return Promise.resolve(MOCK_INBOUND_PARSE_RESULTS);
  }

  async addMessage(message: InboundMessage): Promise<void> {
    MOCK_INBOUND_MESSAGES.push(message);
    return Promise.resolve();
  }

  async addParseResult(result: InboundParseResult): Promise<void> {
    MOCK_INBOUND_PARSE_RESULTS.push(result);
    return Promise.resolve();
  }

  async resolvePerson(request: ResolvePersonRequest): Promise<ResolvePersonResult> {
    const email = normalize(request.email);
    const organizationName = normalize(request.organization_name);
    const fullName = normalize(request.full_name);

    const emailMatch = email
      ? MOCK_PEOPLE.find((person) => normalize(person.email) === email)
      : undefined;

    if (emailMatch) {
      return Promise.resolve({
        match_found: true,
        confidence: 0.98,
        person_id: emailMatch.id,
        organization_id: emailMatch.organization_id,
        network_profile_url: `/people/${emailMatch.id}`,
      });
    }

    const nameMatch = fullName
      ? MOCK_PEOPLE.find((person) => normalize(`${person.first_name} ${person.last_name}`) === fullName)
      : undefined;

    if (nameMatch) {
      const org = ALL_ORGANIZATIONS.find((candidate) => candidate.id === nameMatch.organization_id);
      const orgBoost = org && organizationName && normalize(org.name) === organizationName ? 0.12 : 0;
      return Promise.resolve({
        match_found: true,
        confidence: Math.min(0.85 + orgBoost, 0.95),
        person_id: nameMatch.id,
        organization_id: nameMatch.organization_id,
        network_profile_url: `/people/${nameMatch.id}`,
      });
    }

    return Promise.resolve({
      match_found: false,
      confidence: 0,
    });
  }

  async resolveOrganization(request: ResolveOrganizationRequest): Promise<ResolveOrganizationResult> {
    const name = normalize(request.name);
    const domain = normalize(request.domain);

    const exactNameMatch = ALL_ORGANIZATIONS.find((organization) => normalize(organization.name) === name);
    if (exactNameMatch) {
      return Promise.resolve({
        match_found: true,
        confidence: 0.97,
        organization_id: exactNameMatch.id,
      });
    }

    const domainMatch = domain
      ? ALL_ORGANIZATIONS.find((organization) => normalize(organization.email)?.split('@')[1] === domain)
      : undefined;

    if (domainMatch) {
      return Promise.resolve({
        match_found: true,
        confidence: 0.8,
        organization_id: domainMatch.id,
      });
    }

    return Promise.resolve({
      match_found: false,
      confidence: 0,
    });
  }
}
