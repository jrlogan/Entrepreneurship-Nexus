
export interface PortalLink {
  id: string;
  label: string;
  url: string;
  icon?: string; // emoji or svg name
  description?: string;
  audience: 'all' | 'entrepreneur' | 'eso'; // New: Who sees this link
}

export interface Ecosystem {
  id: string;
  name: string;
  region: string;
  settings: {
    // Default visibility for newly logged interactions (InteractionVisibility vocabulary)
    interaction_privacy_default: 'network_shared' | 'eso_private';
    feature_flags?: {
      dashboard?: boolean;
      interactions?: boolean;
      reports?: boolean;
      api_console?: boolean;
      data_quality?: boolean;
      data_standards?: boolean;
      inbound_intake?: boolean;
      notify_entrepreneurs?: boolean;
    };
  };
  // Admin configurable links for the client portal
  portal_links?: PortalLink[];
  // Admin configurable tags available for entities in this ecosystem
  tags?: string[];
}
