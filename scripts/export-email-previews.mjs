/**
 * Fetches queued notices from the local emulator and writes each rendered
 * htmlBody to output/email-previews/ as a standalone .html file, then
 * generates an index.html with a sidebar for quick browsing.
 *
 * Usage:
 *   node scripts/export-email-previews.mjs
 *   # Then open output/email-previews/index.html in a browser.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;
const limit = parseInt(process.argv[2] || '50', 10);

const outDir = join(rootDir, 'output', 'email-previews');
mkdirSync(outDir, { recursive: true });

const response = await fetch(`${baseUrl}/previewQueuedNotices?limit=${limit}`);
const json = await response.json().catch(() => null);

if (!response.ok || !json?.ok) {
  console.error('Failed to fetch notices:', json?.error || response.status);
  process.exit(1);
}

const notices = json.notices || [];

const typeLabels = {
  referral_new_intake: 'Agency: New Referral',
  referral_follow_up: 'Entrepreneur: Referral Intro',
  sender_referral_receipt: 'Sender: Receipt',
  sender_domain_claim: 'Sender: Claim Account',
  sender_access_request: 'Sender: Request Access',
  sender_invite_required: 'Sender: Invite Required',
  referral_sender_reminder: 'Agency: Reminder',
  referral_sender_follow_up: 'Agency: Follow-up',
  referral_decision_update: 'Decision Update',
  access_invite: 'Platform Invite',
};

const typeColors = {
  referral_new_intake: '#2563eb',
  referral_follow_up: '#16a34a',
  sender_referral_receipt: '#7c3aed',
  sender_domain_claim: '#d97706',
  sender_access_request: '#dc2626',
  sender_invite_required: '#db2777',
  referral_sender_reminder: '#0891b2',
  referral_sender_follow_up: '#0891b2',
  referral_decision_update: '#059669',
  access_invite: '#6366f1',
};

// Write individual email files
const emailFiles = notices.map((notice, i) => {
  const filename = `${String(i + 1).padStart(2, '0')}-${notice.type}-${notice.id.slice(0, 6)}.html`;
  const html = notice.rendered?.htmlBody || '<p>No HTML body</p>';
  writeFileSync(join(outDir, filename), html, 'utf8');
  return { filename, notice };
});

// Build index
const sidebar = emailFiles.map(({ filename, notice }, i) => {
  const color = typeColors[notice.type] || '#6b7280';
  const label = typeLabels[notice.type] || notice.type;
  return `
    <a href="${filename}" target="preview" class="email-link" data-index="${i}">
      <span class="badge" style="background:${color}">${label}</span>
      <span class="subject">${(notice.rendered?.subject || '(no subject)').slice(0, 55)}</span>
      <span class="meta">To: ${notice.to_email}</span>
    </a>`;
}).join('');

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Email Preview — Entrepreneurship Nexus</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; display: flex; height: 100vh; background: #f4f4f5; }
    #sidebar {
      width: 320px; min-width: 260px; overflow-y: auto;
      background: #1a1a2e; color: #fff; display: flex; flex-direction: column;
    }
    #sidebar h1 {
      padding: 16px 20px; font-size: 14px; font-weight: bold; letter-spacing: 0.5px;
      border-bottom: 1px solid rgba(255,255,255,0.1); color: #fff;
      text-transform: uppercase;
    }
    #sidebar .count {
      padding: 8px 20px; font-size: 12px; color: #9ca3af;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .email-link {
      display: flex; flex-direction: column; gap: 4px;
      padding: 12px 20px; text-decoration: none; color: inherit;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      transition: background 0.1s;
    }
    .email-link:hover { background: rgba(255,255,255,0.07); }
    .email-link.active { background: rgba(255,255,255,0.12); }
    .badge {
      display: inline-block; font-size: 10px; font-weight: bold;
      letter-spacing: 0.4px; padding: 2px 7px; border-radius: 10px;
      color: #fff; text-transform: uppercase; width: fit-content;
    }
    .subject { font-size: 13px; color: #e5e7eb; line-height: 1.4; }
    .meta { font-size: 11px; color: #6b7280; }
    #preview-frame {
      flex: 1; border: none; background: #fff;
    }
    #placeholder {
      flex: 1; display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 12px; color: #6b7280;
    }
    #placeholder svg { opacity: 0.3; }
  </style>
</head>
<body>
  <div id="sidebar">
    <h1>Email Previews</h1>
    <div class="count">${notices.length} notice${notices.length !== 1 ? 's' : ''} rendered</div>
    ${sidebar}
  </div>
  <iframe id="preview-frame" name="preview" style="display:none"></iframe>
  <div id="placeholder">
    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
    </svg>
    <p>Select an email on the left to preview it</p>
  </div>
  <script>
    const frame = document.getElementById('preview-frame');
    const placeholder = document.getElementById('placeholder');
    document.querySelectorAll('.email-link').forEach(link => {
      link.addEventListener('click', () => {
        document.querySelectorAll('.email-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        frame.style.display = 'block';
        placeholder.style.display = 'none';
      });
    });
    // Auto-select first
    const first = document.querySelector('.email-link');
    if (first) first.click();
  </script>
</body>
</html>`;

writeFileSync(join(outDir, 'index.html'), indexHtml, 'utf8');

console.log(`\nWrote ${emailFiles.length} email previews to:\n  ${outDir}/index.html\n`);
console.log('Open in browser:');
console.log(`  file://${outDir}/index.html\n`);
