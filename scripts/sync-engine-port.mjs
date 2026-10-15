#!/usr/bin/env node
/**
 * Copy exercise-engine's pure grading code into this repository (offline plan, B4–B5).
 *
 * Offline the phone grades an attempt itself and the engine grades it again when it arrives,
 * so the two must reach the same verdict — byte for byte, the way the kernel is shared. The
 * engine's per-template validators and the services they lean on are pure functions over
 * `@ssz/shared-kernel`; the only things tying them to the server are a Nest decorator and the
 * package name of the kernel. So they are copied, mechanically, under `src/enginePort/` with
 * the engine's own directory layout — every relative import keeps working — and each file
 * carries a DO-NOT-EDIT header; `--check` fails when the copy and the source disagree.
 *
 * What is NOT copied is the attempt state machine around them (the command handlers and the
 * `Attempt` entity): those are tied to repositories and Nest, and are ported by hand in
 * `src/offline/engine/`, held to the engine's verdicts by recorded fixtures instead.
 *
 *   node scripts/sync-engine-port.mjs           # write the copy
 *   node scripts/sync-engine-port.mjs --check   # verify, exit 1 on drift
 *
 * The source repository is expected as a sibling directory; override with SSZ_PLATFORM_PATH.
 * Run `npm run kernel:sync` first: the copy imports the kernel from `src/kernel`.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(
  process.env.SSZ_PLATFORM_PATH ?? path.join(repoRoot, '..', 'ssz-platform'),
  'services/exercise-engine-service/src',
);
const targetRoot = path.join(repoRoot, 'src/enginePort');
const kernelRoot = path.join(repoRoot, 'src/kernel');

const check = process.argv.slice(2).includes('--check');

/** What is copied: whole directories (their `.ts` files, not tests) and single files. */
const SOURCES = [
  'infrastructure/validation/validators',
  'shared/kernel/result.ts',
  'shared/application/ports/answer-validator.port.ts',
  'shared/application/services/sentence-schema-rows.ts',
  'modules/attempts/application/services/item-states.ts',
  'modules/attempts/application/services/information-transfer-details.ts',
  'modules/attempts/application/services/audio-transcript.ts',
  'modules/attempts/application/services/minimal-pairs-attempt.ts',
  'modules/attempts/application/commands/submit-answer/submit-facts.ts',
  'shared/application/services/multiple-choice-attempt.ts',
];

function header(relativePath) {
  return [
    '// ---------------------------------------------------------------------------',
    '// GENERATED FILE — DO NOT EDIT.',
    `// Source: ssz-platform/services/exercise-engine-service/src/${relativePath}`,
    '// Regenerate with `npm run engine:sync`; verify with `npm run engine:check`.',
    '// ---------------------------------------------------------------------------',
    '',
    '',
  ].join('\n');
}

/**
 * The engine's imports, made to resolve here: the kernel package becomes a relative path to
 * the vendored kernel, `.js` extensions go (Metro resolves the literal string), and the Nest
 * decorator — the one thing these files need from the framework — is dropped.
 */
function rewrite(source, relativePath) {
  const fromDir = path.dirname(path.join(targetRoot, relativePath));
  let out = source.replace(/'@ssz\/shared-kernel(\/[a-z-]+)?'/g, (_m, sub) => {
    const target = path.join(kernelRoot, sub ? sub.slice(1) : 'index');
    let rel = path.relative(fromDir, target).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `'${rel}'`;
  });
  out = out.replace(/(from\s+'\.[^']*)\.js'/g, "$1'");
  out = out.replace(/^import \{ Injectable \} from '@nestjs\/common';\n/m, '');
  out = out.replace(/^@Injectable\(\)\n/gm, '');
  return out;
}

async function collect(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await collect(path.join(dir, entry.name), relativePath)));
    else if (entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name)) files.push(relativePath);
  }
  return files;
}

async function sourceFiles() {
  const files = [];
  for (const source of SOURCES) {
    if (source.endsWith('.ts')) files.push(source);
    else files.push(...(await collect(path.join(sourceRoot, source), source)));
  }
  return files.sort();
}

async function targetFiles(dir = targetRoot, prefix = '') {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await targetFiles(path.join(dir, entry.name), relativePath)));
    else if (entry.name.endsWith('.ts')) files.push(relativePath);
  }
  return files.sort();
}

if (!existsSync(sourceRoot)) {
  const message = `exercise-engine source not found at ${sourceRoot}`;
  if (check) {
    console.warn(`⚠ ${message} — skipping the drift check (set SSZ_PLATFORM_PATH to run it).`);
    process.exit(0);
  }
  console.error(`✗ ${message}. Set SSZ_PLATFORM_PATH to the ssz-platform checkout.`);
  process.exit(1);
}

const sources = await sourceFiles();
const targets = await targetFiles();
const drift = [];
let written = 0;

for (const relativePath of sources) {
  const expected =
    header(relativePath) + rewrite(await readFile(path.join(sourceRoot, relativePath), 'utf8'), relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  const actual = existsSync(targetPath) ? await readFile(targetPath, 'utf8') : null;
  if (actual === expected) continue;
  if (check) {
    drift.push(`${actual === null ? 'missing' : 'stale'}: src/enginePort/${relativePath}`);
    continue;
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, expected, 'utf8');
  written += 1;
}

for (const relativePath of targets) {
  if (sources.includes(relativePath)) continue;
  if (check) drift.push(`orphaned: src/enginePort/${relativePath}`);
  else {
    await rm(path.join(targetRoot, relativePath));
    written += 1;
  }
}

if (check) {
  if (drift.length) {
    console.error('✗ src/enginePort is out of sync with exercise-engine:\n');
    for (const line of drift) console.error(`    ${line}`);
    console.error('\n  Run `npm run engine:sync` and commit the result.');
    process.exit(1);
  }
  console.log(`✓ engine port in sync (${sources.length} files)`);
} else {
  console.log(
    written === 0
      ? `✓ engine port already up to date (${sources.length} files)`
      : `✓ synced engine port: ${written} file(s) changed, ${sources.length} total`,
  );
}
