
// Data Quality
export interface DuplicateMatch {
  primary_id: string;
  duplicate_id: string;
  confidence_score: number; // 0-100
  match_reason: string[]; // e.g., ["Same Website", "Similar Name"]
}
