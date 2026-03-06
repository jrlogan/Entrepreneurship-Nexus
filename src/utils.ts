
import { Initiative, PipelineDefinition, Organization, DuplicateMatch } from './types';

// Part 3: Helper Function
export function calculatePipelineProgress(initiative: Initiative, pipelineDef: PipelineDefinition): number {
  if (!pipelineDef || !pipelineDef.stages || pipelineDef.stages.length === 0) {
    return 0;
  }
  
  // Ensure index is within bounds
  const stageIndex = Math.max(0, Math.min(initiative.current_stage_index, pipelineDef.stages.length - 1));
  
  // Calculate percentage (0 to 100)
  if (pipelineDef.stages.length === 1) return 100;
  
  return Math.round((stageIndex / (pipelineDef.stages.length - 1)) * 100);
}

// Helper to calculate days between two dates
export function calculateDaysBetween(start: string, end?: string): number {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  
  // Normalize to start of day
  startDate.setHours(0,0,0,0);
  endDate.setHours(0,0,0,0);
  
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays;
}

// --- Deduplication Logic ---

// Simple Levenshtein distance for fuzzy string matching (optional, using simpler inclusion for now)
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) {
    return 1.0;
  }
  return (longer.length - editDistance(longer, shorter)) / parseFloat(longer.length.toString());
}

function editDistance(s1: string, s2: string) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  const costs = new Array();
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export function detectDuplicates(organizations: Organization[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < organizations.length; i++) {
    for (let j = i + 1; j < organizations.length; j++) {
      const orgA = organizations[i];
      const orgB = organizations[j];
      const key = [orgA.id, orgB.id].sort().join('_');

      if (processed.has(key)) continue;

      let score = 0;
      const reasons: string[] = [];

      // 1. Exact Website Match (High Confidence)
      if (orgA.url && orgB.url && orgA.url === orgB.url) {
        score += 90;
        reasons.push("Identical Website URL");
      }

      // 2. Name Similarity
      const nameSim = similarity(orgA.name, orgB.name);
      if (nameSim > 0.85) {
        score += 80;
        reasons.push(`Similar Name (${Math.round(nameSim * 100)}%)`);
      } else if (orgA.name.toLowerCase().includes(orgB.name.toLowerCase()) || orgB.name.toLowerCase().includes(orgA.name.toLowerCase())) {
        score += 60;
        reasons.push("Name inclusion");
      }

      // 3. Tax ID or External ID (Simulation)
      // In real app, check tax_id or external_refs

      if (score > 50) {
        matches.push({
          primary_id: orgA.id, // Default to A, user can swap
          duplicate_id: orgB.id,
          confidence_score: Math.min(score, 100),
          match_reason: reasons
        });
      }
      processed.add(key);
    }
  }
  return matches;
}

// --- Audio Utilities for Live API ---

export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function createPcmBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: bytesToBase64(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}
