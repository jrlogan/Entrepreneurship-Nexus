"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const calendar_1 = require("./calendar");
(0, node_test_1.describe)('parseIcal', () => {
    (0, node_test_1.it)('extracts a basic VEVENT', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:abc123@example.com',
            'SUMMARY:Founder Coffee',
            'DESCRIPTION:Drop-in chat for early-stage founders.',
            'LOCATION:MakeHaven\\, 770 Chapel St',
            'URL:https://makehaven.org/events/founder-coffee',
            'DTSTART:20260601T140000Z',
            'DTEND:20260601T150000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');
        const events = (0, calendar_1.parseIcal)(ics);
        strict_1.default.equal(events.length, 1);
        strict_1.default.equal(events[0].title, 'Founder Coffee');
        strict_1.default.equal(events[0].source_event_id, 'abc123@example.com');
        strict_1.default.equal(events[0].location_text, 'MakeHaven, 770 Chapel St');
        strict_1.default.equal(events[0].url, 'https://makehaven.org/events/founder-coffee');
        strict_1.default.match(events[0].start_time, /^2026-06-01T14:00:00/);
    });
    (0, node_test_1.it)('handles all-day DATE values', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:allday@example.com',
            'SUMMARY:Maker Faire',
            'DTSTART;VALUE=DATE:20260815',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');
        const events = (0, calendar_1.parseIcal)(ics);
        strict_1.default.equal(events.length, 1);
        strict_1.default.equal(events[0].all_day, true);
        strict_1.default.match(events[0].start_time, /^2026-08-15T00:00:00/);
    });
    (0, node_test_1.it)('unfolds CRLF+space continuation lines', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:fold@example.com',
            'SUMMARY:Long event title that wraps',
            'DESCRIPTION:This is a description that has been folded onto m',
            ' ultiple lines per RFC 5545 line folding rules.',
            'DTSTART:20260601T140000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');
        const events = (0, calendar_1.parseIcal)(ics);
        strict_1.default.equal(events.length, 1);
        strict_1.default.match(events[0].description, /folded onto multiple lines/);
    });
    (0, node_test_1.it)('skips events missing required fields', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:no-summary@example.com',
            'DTSTART:20260601T140000Z',
            'END:VEVENT',
            'BEGIN:VEVENT',
            'UID:no-start@example.com',
            'SUMMARY:Has title but no date',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');
        const events = (0, calendar_1.parseIcal)(ics);
        strict_1.default.equal(events.length, 0);
    });
});
(0, node_test_1.describe)('parseRss', () => {
    (0, node_test_1.it)('extracts items with pubDate', () => {
        const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Pitch Night at the Grove</title>
        <link>https://example.com/pitch</link>
        <description>Five startups pitch.</description>
        <pubDate>Wed, 03 Jun 2026 18:00:00 -0400</pubDate>
        <guid>pitch-2026-06</guid>
      </item>
    </channel></rss>`;
        const events = (0, calendar_1.parseRss)(xml);
        strict_1.default.equal(events.length, 1);
        strict_1.default.equal(events[0].title, 'Pitch Night at the Grove');
        strict_1.default.equal(events[0].source_event_id, 'pitch-2026-06');
        strict_1.default.match(events[0].start_time, /2026-06-03/);
    });
    (0, node_test_1.it)('skips items with no parseable date', () => {
        const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>No date here</title>
        <link>https://example.com/x</link>
      </item>
    </channel></rss>`;
        const events = (0, calendar_1.parseRss)(xml);
        strict_1.default.equal(events.length, 0);
    });
    (0, node_test_1.it)('strips CDATA and HTML in title and description', () => {
        const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title><![CDATA[Workshop: <b>Build a Brand</b>]]></title>
        <description><![CDATA[<p>Half-day session for makers.</p>]]></description>
        <pubDate>Sat, 12 Jul 2026 09:00:00 +0000</pubDate>
      </item>
    </channel></rss>`;
        const events = (0, calendar_1.parseRss)(xml);
        strict_1.default.equal(events.length, 1);
        strict_1.default.equal(events[0].title, 'Workshop: Build a Brand');
        strict_1.default.equal(events[0].description, 'Half-day session for makers.');
    });
});
(0, node_test_1.describe)('eventFingerprint', () => {
    (0, node_test_1.it)('matches across cosmetic differences', () => {
        const a = (0, calendar_1.eventFingerprint)('Founder Coffee', '2026-06-01T14:00:00Z', 'MakeHaven, 770 Chapel St');
        const b = (0, calendar_1.eventFingerprint)('  Founder   Coffee!! ', '2026-06-01T14:30:00Z', 'makehaven 770 chapel st');
        strict_1.default.equal(a, b);
    });
    (0, node_test_1.it)('differs across distinct events', () => {
        const a = (0, calendar_1.eventFingerprint)('Founder Coffee', '2026-06-01T14:00:00Z', 'MakeHaven');
        const b = (0, calendar_1.eventFingerprint)('Founder Coffee', '2026-06-02T14:00:00Z', 'MakeHaven');
        strict_1.default.notEqual(a, b);
    });
});
