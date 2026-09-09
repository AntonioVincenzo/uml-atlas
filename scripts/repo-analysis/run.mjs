#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(String(args.source ?? '.'));
const out = path.resolve(String(args.out ?? path.join(source, '.repo-analysis', 'current')));
const here = path.dirname(fileURLToPath(import.meta.url));
const inventory = path.join(here, 'inventory.mjs');
const quality = path.join(here, 'quality.mjs');
const repeat = await mkdtemp(path.join(os.tmpdir(), 'uml-atlas-analysis-'));

function run(script, scriptArgs) {
  execFileSync(process.execPath, [script, ...scriptArgs], { stdio: ['ignore', 'inherit', 'inherit'] });
}
try {
  run(inventory, ['--source', source, '--out', out]);
  run(inventory, ['--source', source, '--out', repeat]);
  const relativeOutputs = ['manifest.json', 'inventory/artifacts.jsonl'];
  let reproducible = true;
  for (const relative of relativeOutputs) {
    const [first, second] = await Promise.all([readFile(path.join(out, relative)), readFile(path.join(repeat, relative))]);
    if (!first.equals(second)) reproducible = false;
  }
  run(quality, ['--out', out, '--reproducible', String(reproducible)]);
  process.stdout.write(`${JSON.stringify({ out, reproducible })}\n`);
} finally {
  await rm(repeat, { recursive: true, force: true });
}
