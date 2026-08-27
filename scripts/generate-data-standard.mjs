/**
 * Generates the published data standard from the application's live
 * definitions, so the two can't drift.
 *
 * Source of truth:
 *   src/domain/standards/enums.ts       → enums.json   (controlled vocabularies)
 *   src/domain/standards/dictionary.ts  → fields.json  (entities and fields)
 *
 * Output: data-standards/<version>/{enums,fields,schema-meta}.json
 *
 * Usage:
 *   node scripts/generate-data-standard.mjs            # writes the current version
 *   node scripts/generate-data-standard.mjs --version 1.1.0
 *   node scripts/generate-data-standard.mjs --check    # CI: fail if output is stale
 *
 * The published v1.0 folder was hand-extracted and fell behind the app (10
 * vocabularies vs 17, and OrganizationRole disagreed). Regenerating is now a
 * command rather than a transcription exercise.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const versionArg = args.includes('--version') ? args[args.indexOf('--version') + 1] : null;
const VERSION = versionArg || '1.1.0';

/**
 * These two modules are plain data with no imports, so rather than pulling in
 * a TypeScript loader we strip the TS syntax and evaluate the object literal.
 * Keep them import-free or this will need a real transpiler.
 */
const evalExport = (relPath, exportName) => {
  const src = readFileSync(join(rootDir, relPath), 'utf8');
  const marker = `export const ${exportName}`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`${exportName} not found in ${relPath}`);
  const eq = src.indexOf('=', start);
  let body = src.slice(eq + 1);
  // Drop a trailing type annotation on the declaration (": EntityDefinition[]")
  // by starting at the first structural character.
  const firstBrace = body.search(/[[{]/);
  body = body.slice(firstBrace);
  // Balance braces/brackets to find the end of the literal.
  let depth = 0, end = -1, inStr = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error(`Could not parse ${exportName} literal in ${relPath}`);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${body.slice(0, end)});`)();
};

const ENUMS = evalExport('src/domain/standards/enums.ts', 'ENUMS');
const DICTIONARY = evalExport('src/domain/standards/dictionary.ts', 'DATA_DICTIONARY');

// ── enums.json ───────────────────────────────────────────────────────────────
const enumsOut = {};
for (const key of Object.keys(ENUMS).sort()) enumsOut[key] = ENUMS[key];

// ── fields.json ──────────────────────────────────────────────────────────────
// Flattened one row per field, keeping the entity association — the shape
// partners actually iterate over when building a mapping.
const fieldsOut = [];
for (const entity of DICTIONARY) {
  for (const f of entity.fields) {
    fieldsOut.push({
      id: `${entity.id}_${f.name}`,
      entity: entity.id,
      name: f.name,
      label: f.name,
      description: f.description,
      type: f.type,
      required: Boolean(f.required),
      ...(f.enumRef ? { enum_ref: f.enumRef } : {}),
    });
  }
}

// ── schema-meta.json ─────────────────────────────────────────────────────────
const meta = {
  version: VERSION,
  status: 'stable',
  maintainer: 'Entrepreneurship Nexus Core Team',
  generated_from: [
    'src/domain/standards/enums.ts',
    'src/domain/standards/dictionary.ts',
  ],
  generator: 'scripts/generate-data-standard.mjs',
  counts: {
    vocabularies: Object.keys(enumsOut).length,
    entities: DICTIONARY.length,
    fields: fieldsOut.length,
  },
  changelog: [
    {
      version: '1.1.0',
      description:
        'Regenerated from the application definitions. Adds OrganizationType, OwnerCharacteristic, OrgCertification, SupportNeed, VentureStage, ReferralOutcome, OperationalVisibility and ServiceParticipationType; expands MetricType (capital_raised, grant_funding, patents_filed, customer_count) and MetricSource (interaction_log); corrects OrganizationRole to eso/funder/resource.',
    },
    {
      version: '1.0.0',
      description:
        'Initial hand extraction of schema definitions from the application codebase.',
    },
  ],
  compatibility: { hsds_version: '3.0' },
};

// ── write / check ────────────────────────────────────────────────────────────
const outDir = join(rootDir, 'data-standards', `v${VERSION.split('.').slice(0, 2).join('.')}`);
const files = {
  'enums.json': enumsOut,
  'fields.json': fieldsOut,
  'schema-meta.json': meta,
};

let stale = false;
for (const [name, data] of Object.entries(files)) {
  const text = JSON.stringify(data, null, 2) + '\n';
  const path = join(outDir, name);
  if (checkOnly) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (current !== text) {
      stale = true;
      console.error(`STALE: ${path.replace(rootDir + '/', '')}`);
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path, text);
    console.log(`wrote ${path.replace(rootDir + '/', '')}`);
  }
}

if (checkOnly) {
  if (stale) {
    console.error('\nPublished data standard is out of date. Run: node scripts/generate-data-standard.mjs');
    process.exit(1);
  }
  console.log('Published data standard matches the application definitions.');
} else {
  console.log(
    `\nv${VERSION}: ${meta.counts.vocabularies} vocabularies, ` +
    `${meta.counts.entities} entities, ${meta.counts.fields} fields.`
  );
}
