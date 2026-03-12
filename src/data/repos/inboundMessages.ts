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
  getRoutes() {
    return MOCK_INBOUND_ROUTES;
  }

  getMessages() {
    return MOCK_INBOUND_MESSAGES;
  }

  getParseResults() {
    return MOCK_INBOUND_PARSE_RESULTS;
  }

  addMessage(message: InboundMessage) {
    MOCK_INBOUND_MESSAGES.push(message);
  }

  addParseResult(result: InboundParseResult) {
    MOCK_INBOUND_PARSE_RESULTS.push(result);
  }

  resolvePerson(request: ResolvePersonRequest): ResolvePersonResult {
    const email = normalize(request.email);
    const organizationName = normalize(request.organization_name);
    const fullName = normalize(request.full_name);

    const emailMatch = email
      ? MOCK_PEOPLE.find((person) => normalize(person.email) === email)
      : undefined;

    if (emailMatch) {
      return {
        match_found: true,
        confidence: 0.98,
        person_id: emailMatch.id,
        organization_id: emailMatch.organization_id,
        network_profile_url: `/people/${emailMatch.id}`,
      };
    }

    const nameMatch = fullName
      ? MOCK_PEOPLE.find((person) => normalize(`${person.first_name} ${person.last_name}`) === fullName)
      : undefined;

    if (nameMatch) {
      const org = ALL_ORGANIZATIONS.find((candidate) => candidate.id === nameMatch.organization_id);
      const orgBoost = org && organizationName && normalize(org.name) === organizationName ? 0.12 : 0;
      return {
        match_found: true,
        confidence: Math.min(0.85 + orgBoost, 0.95),
        person_id: nameMatch.id,
        organization_id: nameMatch.organization_id,
        network_profile_url: `/people/${nameMatch.id}`,
      };
    }

    return {
      match_found: false,
      confidence: 0,
    };
  }

  resolveOrganization(request: ResolveOrganizationRequest): ResolveOrganizationResult {
    const name = normalize(request.name);
    const domain = normalize(request.domain);

    const exactNameMatch = ALL_ORGANIZATIONS.find((organization) => normalize(organization.name) === name);
    if (exactNameMatch) {
      return {
        match_found: true,
        confidence: 0.97,
        organization_id: exactNameMatch.id,
      };
    }

    const domainMatch = domain
      ? ALL_ORGANIZATIONS.find((organization) => normalize(organization.email)?.split('@')[1] === domain)
      : undefined;

    if (domainMatch) {
      return {
        match_found: true,
        confidence: 0.8,
        organization_id: domainMatch.id,
      };
    }

    return {
      match_found: false,
      confidence: 0,
    };
  }
}
