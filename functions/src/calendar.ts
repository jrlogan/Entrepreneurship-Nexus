import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = () => admin.firestore();

// ----------------------------------------------------------------------------
// Types — kept inline to avoid coupling functions/ to the frontend domain.
// ----------------------------------------------------------------------------

type EventScope = 'local' | 'regional' | 'state' | 'national';
type EventStatus = 'auto_approved' | 'pending_review' | 'rejected' | 'approved' | 'archived';
type EventVisibility = 'public' | 'ecosystem_only';
type EventSourceType = 'ical' | 'rss' | 'url_scrape' | 'email_route';
type EventSubmissionType = 'url_submission' | 'url_source_poll' | 'ical' | 'rss' | 'email' | 'manual';

interface RawEventCandidate {
  title: string;
  description: string;
  url?: string;
  start_time: string;       // ISO string
  end_time?: string;
  all_day?: boolean;
  location_text?: string;
  organizer_name?: string;
  organizer_email?: string;
  registration_url?: string;
  source_event_id?: string; // External UID
}

interface EventSourceDoc {
  id: string;
  name: string;
  type: EventSourceType;
  url?: string;
  email_address?: string;
  ecosystem_id: string;
  active: boolean;
  check_interval_hours: number;
  last_checked_at?: string;
  last_check_status?: 'success' | 'error' | 'needs_manual_check';
  consecutive_failures: number;
  filter_mode: 'trust' | 'classify';
  auto_approve_threshold: number;
  default_scope?: EventScope;
  default_geographic_tags?: string[];
  default_visibility: EventVisibility;
  default_tags?: string[];
}

interface ClassifyResult {
  is_entrepreneurial: boolean;
  confidence: number;
  reasoning: string;
  suggested_tags: string[];
  scope: EventScope;
  geographic_tags: string[];
  cleaned_description: string;
  flags: string[];
}

const DEFAULT_TAGS = [
  'funding-investment',
  'pitch-competition',
  'networking-community',
  'education-workshop',
  'mentorship-coaching',
  'manufacturing-making',
  'real-estate-development',
  'technology-innovation',
  'export-international-trade',
  'marketing-sales',
  'legal-compliance',
  'diversity-inclusion',
];

const AUTO_APPROVE_DEFAULT = 0.85;
const PENDING_REVIEW_FLOOR = 0.5;
const MAX_CONSECUTIVE_FAILURES = 5;

// ----------------------------------------------------------------------------
// Fingerprinting + dedup
// ----------------------------------------------------------------------------

const normalizeForHash = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 200);

export const eventFingerprint = (title: string, startTime: string, locationText?: string): string => {
  const dateOnly = (startTime || '').slice(0, 10);
  const normalized = `${normalizeForHash(title)}|${dateOnly}|${normalizeForHash(locationText || '')}`;
  return createHash('sha1').update(normalized).digest('hex');
};

// ----------------------------------------------------------------------------
// iCal parser — RFC 5545 minimal. Handles VEVENT, line-folding, common props.
// ----------------------------------------------------------------------------

const unfoldIcal = (text: string): string[] => {
  // Replace folded lines (CRLF + space/tab) with continuations.
  const normalized = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  return normalized.split(/\r?\n/);
};

const decodeIcalText = (s: string): string =>
  s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

const parseIcalDate = (raw: string): { iso: string; allDay: boolean } | null => {
  if (!raw) return null;
  // Strip TZID prefix if present (we treat values as floating local; downstream consumers can reinterpret)
  const value = raw.includes(':') ? raw.split(':').pop()! : raw;
  // YYYYMMDD (all-day)
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, allDay: true };
  }
  // YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] === 'Z' ? '.000Z' : ''}`;
    // If no Z, treat as floating; we'll persist the literal ISO without tz. Safe enough for display.
    return { iso, allDay: false };
  }
  return null;
};

export const parseIcal = (icalText: string): RawEventCandidate[] => {
  const lines = unfoldIcal(icalText);
  const events: RawEventCandidate[] = [];
  let inEvent = false;
  let cur: Partial<RawEventCandidate> & { _allDay?: boolean } = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur.title && cur.start_time) {
        events.push({
          title: cur.title,
          description: cur.description || '',
          url: cur.url,
          start_time: cur.start_time,
          end_time: cur.end_time,
          all_day: cur._allDay,
          location_text: cur.location_text,
          organizer_name: cur.organizer_name,
          organizer_email: cur.organizer_email,
          source_event_id: cur.source_event_id,
        });
      }
      inEvent = false;
      cur = {};
      continue;
    }
    if (!inEvent) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const keyPart = line.slice(0, sep);
    const value = line.slice(sep + 1);
    const key = keyPart.split(';')[0].toUpperCase();

    switch (key) {
      case 'SUMMARY':
        cur.title = decodeIcalText(value);
        break;
      case 'DESCRIPTION':
        cur.description = decodeIcalText(value);
        break;
      case 'URL':
        cur.url = value;
        break;
      case 'LOCATION':
        cur.location_text = decodeIcalText(value);
        break;
      case 'UID':
        cur.source_event_id = value;
        break;
      case 'DTSTART': {
        const d = parseIcalDate(line);
        if (d) {
          cur.start_time = d.iso;
          cur._allDay = d.allDay;
        }
        break;
      }
      case 'DTEND': {
        const d = parseIcalDate(line);
        if (d) cur.end_time = d.iso;
        break;
      }
      case 'ORGANIZER': {
        const cn = keyPart.match(/CN=([^;:]+)/i);
        if (cn) cur.organizer_name = cn[1];
        const mail = value.match(/mailto:(.+)/i);
        if (mail) cur.organizer_email = mail[1];
        break;
      }
    }
  }
  return events;
};

// ----------------------------------------------------------------------------
// RSS parser — minimal. Pulls title/link/description/pubDate from <item> tags.
// ----------------------------------------------------------------------------

const stripCdata = (s: string): string =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();

const stripTags = (s: string): string =>
  stripCdata(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const extractTag = (xml: string, tag: string): string | undefined => {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? stripCdata(m[1]).trim() : undefined;
};

export const parseRss = (xml: string): RawEventCandidate[] => {
  const items: RawEventCandidate[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    if (!title) continue;
    const link = extractTag(block, 'link');
    const description = extractTag(block, 'description') || '';
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    const guid = extractTag(block, 'guid');

    let startIso: string | undefined;
    if (pubDate) {
      const parsed = new Date(pubDate);
      if (!isNaN(parsed.getTime())) startIso = parsed.toISOString();
    }
    if (!startIso) continue; // RSS items without dates can't anchor on a calendar

    items.push({
      title: stripTags(title),
      description: stripTags(description),
      url: link,
      start_time: startIso,
      source_event_id: guid || link,
    });
  }
  return items;
};

// ----------------------------------------------------------------------------
// Gemini classification
// ----------------------------------------------------------------------------

const buildClassifyPrompt = (candidate: RawEventCandidate, ctx: {
  ecosystem_name?: string;
  default_geographic_tags?: string[];
  allowed_tags: string[];
}): string => `You are an event classification assistant for an entrepreneurship ecosystem calendar.

Decide whether the following event is relevant to entrepreneurs, small business owners, makers, or the support organizations (ESOs) that serve them. Score your confidence in that judgment.

Return JSON with these fields exactly:
{
  "is_entrepreneurial": boolean,
  "confidence": number,        // 0.0–1.0; how confident you are in is_entrepreneurial
  "reasoning": string,         // 1–2 sentences
  "suggested_tags": string[],  // pick ONLY from the allowed list below; 0–3 tags
  "scope": "local" | "regional" | "state" | "national",
  "geographic_tags": string[], // e.g. ["CT", "new-haven-metro"]; empty array if unknown
  "cleaned_description": string, // strip boilerplate/promotional noise; max ~400 chars
  "flags": string[]            // e.g. ["missing_date", "promotional_only", "recurring_series"]; empty if none
}

Allowed tags: ${ctx.allowed_tags.join(', ')}

Default geographic context for this source: ${ctx.default_geographic_tags?.join(', ') || '(unknown)'}
Ecosystem name: ${ctx.ecosystem_name || '(unknown)'}

Event title: ${candidate.title}
Start time: ${candidate.start_time}
Location: ${candidate.location_text || '(unknown)'}
URL: ${candidate.url || '(none)'}
Organizer: ${candidate.organizer_name || '(unknown)'}
Description:
${(candidate.description || '').slice(0, 2000)}

Respond with JSON only, no prose, no code fences.`;

export const classifyEventCandidate = async (
  candidate: RawEventCandidate,
  ctx: { ecosystem_name?: string; default_geographic_tags?: string[] },
): Promise<ClassifyResult | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[calendar] GEMINI_API_KEY missing — skipping AI classification');
    return null;
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildClassifyPrompt(candidate, { ...ctx, allowed_tags: DEFAULT_TAGS });

  const modelNames = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];
  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned) as ClassifyResult;
      // Coerce + sanitize
      return {
        is_entrepreneurial: !!parsed.is_entrepreneurial,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        reasoning: String(parsed.reasoning || '').slice(0, 500),
        suggested_tags: Array.isArray(parsed.suggested_tags)
          ? parsed.suggested_tags.filter((t) => DEFAULT_TAGS.includes(t)).slice(0, 5)
          : [],
        scope: (['local', 'regional', 'state', 'national'].includes(parsed.scope) ? parsed.scope : 'local') as EventScope,
        geographic_tags: Array.isArray(parsed.geographic_tags) ? parsed.geographic_tags.slice(0, 5) : [],
        cleaned_description: String(parsed.cleaned_description || candidate.description || '').slice(0, 1000),
        flags: Array.isArray(parsed.flags) ? parsed.flags.slice(0, 8) : [],
      };
    } catch (err: any) {
      console.warn(`[calendar] Gemini ${modelName} failed:`, err?.message || err);
    }
  }
  return null;
};

// ----------------------------------------------------------------------------
// Core ingest: dedup, classify, route to status, write event.
// ----------------------------------------------------------------------------

const decideStatus = (
  source: Pick<EventSourceDoc, 'filter_mode' | 'auto_approve_threshold'>,
  classification: ClassifyResult | null,
): EventStatus => {
  if (source.filter_mode === 'trust') return 'auto_approved';
  if (!classification) return 'pending_review';
  if (!classification.is_entrepreneurial && classification.confidence >= PENDING_REVIEW_FLOOR) {
    return 'rejected';
  }
  const threshold = source.auto_approve_threshold || AUTO_APPROVE_DEFAULT;
  if (classification.confidence >= threshold && classification.is_entrepreneurial) return 'auto_approved';
  if (classification.confidence >= PENDING_REVIEW_FLOOR) return 'pending_review';
  return 'rejected';
};

interface IngestSummary {
  events_found: number;
  events_added: number;
  events_deduped: number;
}

interface IngestContext {
  source: EventSourceDoc | null;
  ecosystem_id: string;
  source_type: EventSubmissionType;
  ecosystem_name?: string;
  submitted_by?: string;
  submitted_url?: string;
}

const findExistingEvent = async (
  source_id: string | undefined,
  source_event_id: string | undefined,
  fingerprint: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> => {
  if (source_id && source_event_id) {
    const q = await db()
      .collection('events')
      .where('source_id', '==', source_id)
      .where('source_event_id', '==', source_event_id)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0];
  }
  const fp = await db().collection('events').where('fingerprint', '==', fingerprint).limit(1).get();
  return fp.empty ? null : fp.docs[0];
};

export const ingestEventCandidate = async (
  candidate: RawEventCandidate,
  ctx: IngestContext,
): Promise<{ status: 'added' | 'deduped' | 'rejected'; eventId?: string }> => {
  const fingerprint = eventFingerprint(candidate.title, candidate.start_time, candidate.location_text);

  const existing = await findExistingEvent(ctx.source?.id, candidate.source_event_id, fingerprint);
  if (existing) {
    // Could merge updates here in a future iteration; for now treat as dedup.
    return { status: 'deduped', eventId: existing.id };
  }

  // Trust mode: skip Gemini entirely.
  let classification: ClassifyResult | null = null;
  if (ctx.source?.filter_mode !== 'trust') {
    classification = await classifyEventCandidate(candidate, {
      ecosystem_name: ctx.ecosystem_name,
      default_geographic_tags: ctx.source?.default_geographic_tags,
    });
  }

  const status = decideStatus(
    {
      filter_mode: ctx.source?.filter_mode || 'classify',
      auto_approve_threshold: ctx.source?.auto_approve_threshold || AUTO_APPROVE_DEFAULT,
    },
    classification,
  );

  if (status === 'rejected') {
    // Log to source_runs but do not persist a doc — we don't want soft-rejected noise piling up.
    return { status: 'rejected' };
  }

  const now = new Date().toISOString();
  const id = `event_${Math.random().toString(36).slice(2, 11)}`;
  const tags = Array.from(
    new Set([...(ctx.source?.default_tags || []), ...(classification?.suggested_tags || [])]),
  );
  const geographic_tags = Array.from(
    new Set([
      ...(ctx.source?.default_geographic_tags || []),
      ...(classification?.geographic_tags || []),
    ]),
  );
  const scope: EventScope = classification?.scope || ctx.source?.default_scope || 'local';
  const visibility: EventVisibility = ctx.source?.default_visibility || 'public';

  const eventDoc = {
    id,
    title: candidate.title,
    description: classification?.cleaned_description || candidate.description || '',
    url: candidate.url || null,
    start_time: candidate.start_time,
    end_time: candidate.end_time || null,
    all_day: !!candidate.all_day,
    location: candidate.location_text ? { text: candidate.location_text } : null,
    organizer: candidate.organizer_name
      ? { name: candidate.organizer_name, email: candidate.organizer_email || null }
      : null,
    registration_url: candidate.registration_url || null,

    tags,
    scope,
    geographic_tags,

    source_type: ctx.source_type,
    source_id: ctx.source?.id || null,
    submitted_by: ctx.submitted_by || null,
    submitted_url: ctx.submitted_url || null,
    source_event_id: candidate.source_event_id || null,
    fingerprint,

    ai_confidence: classification?.confidence ?? (ctx.source?.filter_mode === 'trust' ? 1 : 0),
    ai_flags: classification?.flags || [],
    ai_reasoning: classification?.reasoning || null,

    status,
    visibility,
    source_ecosystem_id: ctx.ecosystem_id,
    visible_in_ecosystems: [ctx.ecosystem_id],
    cross_ecosystem_status: {},

    created_at: now,
    updated_at: now,
    open_flag_count: 0,
  };

  await db().collection('events').doc(id).set(eventDoc);
  return { status: 'added', eventId: id };
};

// ----------------------------------------------------------------------------
// Source polling
// ----------------------------------------------------------------------------

const fetchSource = async (source: EventSourceDoc): Promise<RawEventCandidate[]> => {
  if (!source.url) return [];
  if (source.type === 'url_scrape') {
    return extractEventsFromUrl(source.url);
  }
  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'Entrepreneurship-Nexus-Calendar/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${source.url}`);
  }
  const body = await res.text();
  if (source.type === 'ical') return parseIcal(body);
  if (source.type === 'rss') return parseRss(body);
  throw new Error(`Source type ${source.type} not supported by pollEventSources`);
};

const runSourceCheck = async (source: EventSourceDoc): Promise<IngestSummary> => {
  const candidates = await fetchSource(source);
  let added = 0;
  let deduped = 0;
  const submissionType: EventSubmissionType =
    source.type === 'ical' ? 'ical' : source.type === 'rss' ? 'rss' : 'url_source_poll';
  for (const c of candidates) {
    try {
      const result = await ingestEventCandidate(c, {
        source,
        ecosystem_id: source.ecosystem_id,
        source_type: submissionType,
      });
      if (result.status === 'added') added += 1;
      if (result.status === 'deduped') deduped += 1;
    } catch (err: any) {
      console.error(`[calendar] ingest failed for "${c.title}":`, err?.message || err);
    }
  }
  return { events_found: candidates.length, events_added: added, events_deduped: deduped };
};

const recordSourceRun = async (
  source: EventSourceDoc,
  startedAt: string,
  result: { ok: boolean; error?: string; summary?: IngestSummary },
): Promise<void> => {
  const finishedAt = new Date().toISOString();
  const runId = `srcrun_${Math.random().toString(36).slice(2, 11)}`;
  await db().collection('event_source_runs').doc(runId).set({
    id: runId,
    source_id: source.id,
    ecosystem_id: source.ecosystem_id,
    started_at: startedAt,
    finished_at: finishedAt,
    status: result.ok ? 'success' : 'error',
    events_found: result.summary?.events_found || 0,
    events_added: result.summary?.events_added || 0,
    events_deduped: result.summary?.events_deduped || 0,
    error: result.error || null,
  });

  const consecutive_failures = result.ok ? 0 : (source.consecutive_failures || 0) + 1;
  const updates: Record<string, unknown> = {
    last_checked_at: finishedAt,
    last_check_status: result.ok ? 'success' : 'error',
    consecutive_failures,
    updated_at: finishedAt,
  };
  if (!result.ok) updates.last_error = result.error || 'Unknown error';
  if (consecutive_failures >= MAX_CONSECUTIVE_FAILURES) {
    updates.active = false;
    updates.last_check_status = 'needs_manual_check';
  }
  await db().collection('event_sources').doc(source.id).update(updates);
};

const pollAllSources = async (): Promise<{ checked: number; errors: number }> => {
  const snap = await db().collection('event_sources').where('active', '==', true).get();
  let checked = 0;
  let errors = 0;
  for (const doc of snap.docs) {
    const source = doc.data() as EventSourceDoc;
    // email_route sources are ingested via the inbound email webhook; skip them here.
    if (source.type === 'email_route') continue;
    if (source.type !== 'ical' && source.type !== 'rss' && source.type !== 'url_scrape') continue;

    const intervalMs = (source.check_interval_hours || 24) * 60 * 60 * 1000;
    if (source.last_checked_at && Date.now() - new Date(source.last_checked_at).getTime() < intervalMs) {
      continue; // not due yet
    }

    const startedAt = new Date().toISOString();
    try {
      const summary = await runSourceCheck(source);
      await recordSourceRun(source, startedAt, { ok: true, summary });
      checked += 1;
    } catch (err: any) {
      errors += 1;
      await recordSourceRun(source, startedAt, { ok: false, error: err?.message || String(err) });
    }
  }
  return { checked, errors };
};

export const pollEventSources = onSchedule(
  { schedule: 'every 4 hours', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const result = await pollAllSources();
    console.log('[calendar] poll complete', result);
  },
);

// Manual trigger for ops/testing.
export const triggerEventSourcePoll = onRequest({ invoker: 'public' }, async (req, res) => {
  const expected = process.env.CALENDAR_POLL_SECRET;
  if (!expected) {
    res.status(503).json({ error: 'CALENDAR_POLL_SECRET not configured' });
    return;
  }
  const provided = (req.query.secret || req.get('x-calendar-poll-secret') || '').toString().trim();
  if (provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const result = await pollAllSources();
  res.json({ ok: true, ...result });
});

// ----------------------------------------------------------------------------
// Email-route ingestion (called from the existing postmarkInboundWebhook
// when route.activity_type === 'calendar').
// ----------------------------------------------------------------------------

export const processCalendarSubmissionEmail = async (args: {
  ecosystemId: string;
  ecosystemName?: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  routeAddress?: string;
}): Promise<{ ok: boolean; eventId?: string; status?: 'added' | 'deduped' | 'rejected' }> => {
  // Ask Gemini to extract a single primary event from the email body. Newsletters
  // often have many — we'll only take the first/primary for now to avoid blasts.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[calendar] email submission received but GEMINI_API_KEY missing');
    return { ok: false };
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  const prompt = `You are an assistant extracting events from forwarded emails.
The email below may describe one or more events. Extract the primary/most prominent event.
Return JSON exactly: {
  "title": string,
  "description": string,
  "url": string | null,
  "start_time": string (ISO 8601),
  "end_time": string (ISO 8601) | null,
  "location_text": string | null,
  "organizer_name": string | null
}
If no event can be extracted, return {"title": ""}.

Subject: ${args.subject}
From: ${args.fromName || ''} <${args.fromEmail}>

Body:
${args.textBody.slice(0, 6000)}

JSON only.`;

  let extracted: any = null;
  for (const modelName of ['gemini-2.5-flash', 'gemini-1.5-flash']) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const cleaned = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      extracted = JSON.parse(cleaned);
      break;
    } catch (err: any) {
      console.warn(`[calendar] email extract via ${modelName} failed:`, err?.message || err);
    }
  }
  if (!extracted || !extracted.title) {
    return { ok: false };
  }

  const candidate: RawEventCandidate = {
    title: extracted.title,
    description: extracted.description || '',
    url: extracted.url || undefined,
    start_time: extracted.start_time,
    end_time: extracted.end_time || undefined,
    location_text: extracted.location_text || undefined,
    organizer_name: extracted.organizer_name || args.fromName,
    organizer_email: args.fromEmail,
  };

  if (!candidate.start_time) return { ok: false };

  const result = await ingestEventCandidate(candidate, {
    source: null,
    ecosystem_id: args.ecosystemId,
    ecosystem_name: args.ecosystemName,
    source_type: 'email',
  });
  return { ok: true, eventId: result.eventId, status: result.status };
};

// ----------------------------------------------------------------------------
// URL extraction — shared by submitEventUrl (single-page) and pollEventSources
// (recurring url_scrape sources, where the page may list many events).
// ----------------------------------------------------------------------------

const fetchPageText = async (url: string): Promise<string> => {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Entrepreneurship-Nexus-Calendar/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return stripTags(html).slice(0, 12000);
};

const URL_EXTRACT_PROMPT = (url: string, pageText: string): string => `Extract entrepreneurial events listed on this page. The page may describe one event or list several upcoming events. Skip anything that isn't a dated event (e.g. blog posts, generic program descriptions).

Return JSON exactly:
{ "events": [
  { "title": string, "description": string, "start_time": string (ISO 8601), "end_time": string|null, "location_text": string|null, "organizer_name": string|null, "url": string|null }
] }

Use the page URL to resolve relative event links. If no events are present, return {"events": []}.

URL: ${url}

Page text:
${pageText}

JSON only.`;

const extractEventsFromUrl = async (url: string): Promise<RawEventCandidate[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[calendar] GEMINI_API_KEY missing — cannot extract from url_scrape source');
    return [];
  }
  let pageText: string;
  try {
    pageText = await fetchPageText(url);
  } catch (err: any) {
    throw new Error(`Could not fetch ${url}: ${err?.message || err}`);
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = URL_EXTRACT_PROMPT(url, pageText);

  for (const modelName of ['gemini-2.5-flash', 'gemini-1.5-flash']) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const cleaned = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const events = Array.isArray(parsed?.events) ? parsed.events : [];
      return events
        .filter((e: any) => e && e.title && e.start_time)
        .slice(0, 25)
        .map((e: any) => ({
          title: String(e.title),
          description: String(e.description || ''),
          start_time: String(e.start_time),
          end_time: e.end_time || undefined,
          location_text: e.location_text || undefined,
          organizer_name: e.organizer_name || undefined,
          url: e.url || url,
        } as RawEventCandidate));
    } catch (err: any) {
      console.warn(`[calendar] URL extract via ${modelName} failed:`, err?.message || err);
    }
  }
  return [];
};

// ----------------------------------------------------------------------------
// URL submission (callable) — primary user-facing submission path
// ----------------------------------------------------------------------------

export const submitEventUrl = onCall({ timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to submit events');
  const url = String(request.data?.url || '').trim();
  const ecosystemId = String(request.data?.ecosystem_id || '').trim();
  if (!url || !ecosystemId) throw new HttpsError('invalid-argument', 'url and ecosystem_id required');

  let candidates: RawEventCandidate[];
  try {
    candidates = await extractEventsFromUrl(url);
  } catch (err: any) {
    throw new HttpsError('failed-precondition', err?.message || String(err));
  }
  if (candidates.length === 0) {
    throw new HttpsError('not-found', 'Could not extract an event from that URL');
  }

  // User submission ingests the primary (first) extracted event to preserve existing UX.
  const result = await ingestEventCandidate(candidates[0], {
    source: null,
    ecosystem_id: ecosystemId,
    source_type: 'url_submission',
    submitted_by: request.auth.uid,
    submitted_url: url,
  });
  return result;
});

// ----------------------------------------------------------------------------
// Feed detection (callable) — when an admin adds a URL source, sniff the page
// for a linked RSS/Atom feed and return a small preview so they can opt to use
// the feed instead of LLM scraping.
// ----------------------------------------------------------------------------

const FEED_LINK_RE = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
const ATTR_RE = (name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i');

const resolveUrl = (base: string, ref: string): string => {
  try { return new URL(ref, base).toString(); } catch { return ref; }
};

const findFeedLinks = (html: string, baseUrl: string): { url: string; type: 'rss' | 'atom'; title?: string }[] => {
  const out: { url: string; type: 'rss' | 'atom'; title?: string }[] = [];
  const head = html.slice(0, 30000); // feed links are in <head>; cap to keep regex fast
  const matches = head.match(FEED_LINK_RE) || [];
  for (const tag of matches) {
    const typeAttr = tag.match(ATTR_RE('type'))?.[1] || '';
    const href = tag.match(ATTR_RE('href'))?.[1];
    if (!href) continue;
    let kind: 'rss' | 'atom' | null = null;
    if (/application\/rss\+xml/i.test(typeAttr)) kind = 'rss';
    else if (/application\/atom\+xml/i.test(typeAttr)) kind = 'atom';
    if (!kind) continue;
    const title = tag.match(ATTR_RE('title'))?.[1];
    out.push({ url: resolveUrl(baseUrl, href), type: kind, title });
  }
  return out;
};

export const detectFeedFromUrl = onCall({ timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to add sources');
  const url = String(request.data?.url || '').trim();
  if (!url) throw new HttpsError('invalid-argument', 'url required');

  let html = '';
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Entrepreneurship-Nexus-Calendar/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err: any) {
    return { ok: false, reason: `fetch_failed`, message: err?.message || String(err) };
  }

  const feeds = findFeedLinks(html, url);
  if (feeds.length === 0) {
    return { ok: true, found: false };
  }

  // Try the first feed; if it parses, return a preview. We don't try every link — most pages
  // declare one or two and the first is almost always the canonical one.
  const candidate = feeds[0];
  try {
    const feedRes = await fetch(candidate.url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Entrepreneurship-Nexus-Calendar/1.0' },
    });
    if (!feedRes.ok) {
      return { ok: true, found: true, feed_url: candidate.url, feed_type: candidate.type, preview: [], reason: `feed_http_${feedRes.status}` };
    }
    const body = await feedRes.text();
    const parsed = parseRss(body);
    return {
      ok: true,
      found: true,
      feed_url: candidate.url,
      feed_type: candidate.type,
      feed_title: candidate.title || null,
      preview: parsed.slice(0, 3).map((e) => ({
        title: e.title,
        start_time: e.start_time,
        url: e.url || null,
      })),
      total_items: parsed.length,
    };
  } catch (err: any) {
    return { ok: true, found: true, feed_url: candidate.url, feed_type: candidate.type, preview: [], reason: 'parse_failed', message: err?.message || String(err) };
  }
});

// ----------------------------------------------------------------------------
// iCal feed generation
// ----------------------------------------------------------------------------

const escapeIcal = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const foldIcalLine = (line: string): string => {
  // 75 octets per line; continuation lines start with a single space.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    const slice = line.slice(i, i + 75);
    parts.push(i === 0 ? slice : ' ' + slice);
    i += 75;
  }
  return parts.join('\r\n');
};

const toIcalDate = (iso: string, allDay: boolean): { key: string; value: string } => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return { key: 'DTSTART', value: '20000101T000000Z' };
  }
  if (allDay) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return { key: 'DTSTART;VALUE=DATE', value: `${y}${m}${day}` };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    key: 'DTSTART',
    value: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`,
  };
};

const buildIcalFeed = (events: any[], feedName: string): string => {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Entrepreneurship Nexus//Community Calendar//EN');
  lines.push(foldIcalLine(`X-WR-CALNAME:${escapeIcal(feedName)}`));
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@nexus`);
    const dtstamp = new Date(ev.updated_at || ev.created_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    lines.push(`DTSTAMP:${dtstamp}`);

    const start = toIcalDate(ev.start_time, !!ev.all_day);
    lines.push(`${start.key}:${start.value}`);
    if (ev.end_time) {
      const end = toIcalDate(ev.end_time, !!ev.all_day);
      const endKey = ev.all_day ? 'DTEND;VALUE=DATE' : 'DTEND';
      lines.push(`${endKey}:${end.value}`);
    }

    lines.push(foldIcalLine(`SUMMARY:${escapeIcal(ev.title || '')}`));
    if (ev.description) lines.push(foldIcalLine(`DESCRIPTION:${escapeIcal(ev.description)}`));
    if (ev.location?.text) lines.push(foldIcalLine(`LOCATION:${escapeIcal(ev.location.text)}`));
    if (ev.url) lines.push(foldIcalLine(`URL:${ev.url}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};

export const generateCalendarFeed = onRequest({ invoker: 'public' }, async (req, res) => {
  // Path: /generateCalendarFeed?ecosystem=ID&tags=funding,pitch&scope=local
  // Or: /generateCalendarFeed (platform aggregate)
  const ecosystemId = (req.query.ecosystem as string) || '';
  const tagsCsv = (req.query.tags as string) || '';
  const scopeFilter = (req.query.scope as string) || '';
  const stateFilter = (req.query.state as string) || '';

  const requestedTags = tagsCsv ? tagsCsv.split(',').map((t) => t.trim()).filter(Boolean) : [];

  let q: FirebaseFirestore.Query = db().collection('events');
  if (ecosystemId) {
    q = q.where('visible_in_ecosystems', 'array-contains', ecosystemId);
  }
  // Pull approved + auto_approved + public
  q = q.where('status', 'in', ['auto_approved', 'approved']);

  // Defer further filtering to in-memory because Firestore composite limits.
  const snap = await q.limit(1000).get();
  const now = Date.now();
  const events = snap.docs
    .map((d) => d.data())
    .filter((ev) => ev.visibility === 'public')
    .filter((ev) => {
      const t = new Date(ev.start_time).getTime();
      // Drop events that ended more than a day ago.
      if (isNaN(t)) return false;
      const endT = ev.end_time ? new Date(ev.end_time).getTime() : t + 24 * 60 * 60 * 1000;
      return endT >= now - 24 * 60 * 60 * 1000;
    })
    .filter((ev) => (scopeFilter ? ev.scope === scopeFilter : true))
    .filter((ev) => (stateFilter ? (ev.geographic_tags || []).includes(stateFilter) : true))
    .filter((ev) => (requestedTags.length ? requestedTags.some((t) => (ev.tags || []).includes(t)) : true))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const feedName = ecosystemId ? `Ecosystem ${ecosystemId} Events` : 'Entrepreneurship Nexus — All Ecosystems';
  const ics = buildIcalFeed(events, feedName);
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="calendar.ics"');
  res.set('Cache-Control', 'public, max-age=600');
  res.status(200).send(ics);
});

// ----------------------------------------------------------------------------
// Flagging
// ----------------------------------------------------------------------------

export const flagEvent = onCall(async (request) => {
  const event_id = String(request.data?.event_id || '').trim();
  const flag_type = String(request.data?.flag_type || '').trim();
  const notes = String(request.data?.notes || '').slice(0, 500);
  if (!event_id || !flag_type) throw new HttpsError('invalid-argument', 'event_id and flag_type required');

  const allowed = ['wrong_date', 'wrong_location', 'not_relevant', 'duplicate', 'other'];
  if (!allowed.includes(flag_type)) throw new HttpsError('invalid-argument', 'invalid flag_type');

  const eventDoc = await db().collection('events').doc(event_id).get();
  if (!eventDoc.exists) throw new HttpsError('not-found', 'event not found');
  const ecosystemId = eventDoc.data()?.source_ecosystem_id;

  const id = `flag_${Math.random().toString(36).slice(2, 11)}`;
  const now = new Date().toISOString();
  await db().collection('event_flags').doc(id).set({
    id,
    event_id,
    ecosystem_id: ecosystemId,
    flagged_by: request.auth?.uid || null,
    flag_type,
    notes,
    status: 'open',
    created_at: now,
  });
  await db().collection('events').doc(event_id).update({
    open_flag_count: admin.firestore.FieldValue.increment(1),
    updated_at: now,
  });
  return { ok: true, id };
});

export const resolveEventFlag = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'sign-in required');
  const flag_id = String(request.data?.flag_id || '').trim();
  const decision = String(request.data?.decision || '').trim();
  if (!['resolved', 'dismissed'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'decision must be resolved|dismissed');
  }
  const flagDoc = await db().collection('event_flags').doc(flag_id).get();
  if (!flagDoc.exists) throw new HttpsError('not-found', 'flag not found');
  const eventId = flagDoc.data()?.event_id as string | undefined;
  const now = new Date().toISOString();
  await db().collection('event_flags').doc(flag_id).update({
    status: decision,
    resolved_by: request.auth.uid,
    resolved_at: now,
  });
  if (eventId) {
    await db().collection('events').doc(eventId).update({
      open_flag_count: admin.firestore.FieldValue.increment(-1),
      updated_at: now,
    });
  }
  return { ok: true };
});
