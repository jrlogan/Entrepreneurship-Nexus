import { queryCollection, whereEquals, setDocument } from '../../../services/firestoreClient';
import type { 
  InboundMessage, 
  InboundParseResult, 
  InboundRoute,
  ResolvePersonRequest,
  ResolvePersonResult,
  ResolveOrganizationRequest,
  ResolveOrganizationResult
} from '../../../domain/inbound/types';
import { callHttpFunction } from '../../../services/httpFunctionClient';

export class FirebaseInboundMessagesRepo {
  async getRoutes(): Promise<InboundRoute[]> {
    return queryCollection<InboundRoute>('inbound_routes');
  }

  async getMessages(ecosystemId?: string): Promise<InboundMessage[]> {
    const constraints = ecosystemId ? [whereEquals('ecosystem_id', ecosystemId)] : [];
    return queryCollection<InboundMessage>('inbound_messages', constraints);
  }

  async getParseResults(inboundMessageId?: string): Promise<InboundParseResult[]> {
    const constraints = inboundMessageId ? [whereEquals('inbound_message_id', inboundMessageId)] : [];
    return queryCollection<InboundParseResult>('inbound_parse_results', constraints);
  }

  async addMessage(message: InboundMessage): Promise<void> {
    await setDocument('inbound_messages', message.id, message);
  }

  async addParseResult(result: InboundParseResult): Promise<void> {
    await setDocument('inbound_parse_results', result.id, result);
  }

  async resolvePerson(request: ResolvePersonRequest): Promise<ResolvePersonResult> {
    // For now, we'll use a Cloud Function for resolution as it's more secure and powerful
    try {
      const result = await callHttpFunction<ResolvePersonRequest, ResolvePersonResult>('resolvePerson', request);
      return result;
    } catch (error) {
      console.error('Failed to resolve person via Cloud Function:', error);
      return { match_found: false, confidence: 0 };
    }
  }

  async resolveOrganization(request: ResolveOrganizationRequest): Promise<ResolveOrganizationResult> {
    try {
      const result = await callHttpFunction<ResolveOrganizationRequest, ResolveOrganizationResult>('resolveOrganization', request);
      return result;
    } catch (error) {
      console.error('Failed to resolve organization via Cloud Function:', error);
      return { match_found: false, confidence: 0 };
    }
  }
}
