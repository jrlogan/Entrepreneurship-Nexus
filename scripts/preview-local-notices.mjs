const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;
const limit = Math.max(1, Math.min(parseInt(process.argv[2] || '20', 10), 100));

const response = await fetch(`${baseUrl}/previewQueuedNotices?limit=${limit}`);
const json = await response.json().catch(() => null);

if (!response.ok) {
  throw new Error(json?.error || `Unable to preview notices (${response.status})`);
}

console.log(JSON.stringify(json, null, 2));
