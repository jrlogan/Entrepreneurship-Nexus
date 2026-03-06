
// Defines the strict shape expected from the GenAI model
// Compatible with @google/genai ResponseSchema

export const ADVISOR_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "A concise, actionable title for the suggestion." },
          reason: { type: "STRING", description: "Why this is relevant to the specific user context." },
          type: { 
            type: "STRING", 
            enum: ["action", "resource", "referral", "connection"],
            description: "The category of the suggestion."
          },
          confidence_score: { type: "NUMBER", description: "0 to 100 confidence level." },
          priority: { type: "STRING", enum: ["high", "medium", "low"] },
          target_id: { type: "STRING", description: "The ID of the referenced entity (Org ID, Link ID) if applicable." },
          action_url: { type: "STRING", description: "External URL if applicable." }
        },
        required: ["title", "reason", "type", "confidence_score", "priority"]
      }
    }
  },
  required: ["suggestions"]
};
