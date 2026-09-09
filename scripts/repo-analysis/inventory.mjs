#!/usr/bin/env node
import path from 'node:path';
import {
  ANALYZER_VERSION, artifactRecord, collectPaths, hash, parseArgs, stableJson,
  writeJson, writeJsonLines,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(String(args.source ?? '.'));
const out = path.resolve(String(args.out ?? path.join(source, '.repo-analysis', 'current')));
const paths = await collectPaths(source);
const artifacts = [];
for (const item of paths) artifacts.push(await artifactRecord(source, item));
artifacts.sort((left, right) => left.uri.localeCompare(right.uri, 'en'));

const inputDigest = hash(stableJson(artifacts.map(({ id, contentHash, bytes }) => ({ id, contentHash, bytes }))));
const manifest = {
  schemaVersion: 1,
  analyzer: { name: 'uml-atlas-repository-analysis', version: ANALYZER_VERSION },
  runId: `sha256:${hash(stableJson({ analyzerVersion: ANALYZER_VERSION, inputDigest }))}`,
  source: { root: '.', inputDigest: `sha256:${inputDigest}` },
  configuration: { ignoredDirectoryNames: ['.atlas', '.git', '.repo-analysis', 'artifacts', 'coverage', 'dist', 'node_modules'] },
  outputs: { inventory: 'inventory/artifacts.jsonl', quality: 'quality/report.json' },
};

await writeJsonLines(path.join(out, 'inventory', 'artifacts.jsonl'), artifacts);
await writeJson(path.join(out, 'manifest.json'), manifest);
process.stdout.write(`${JSON.stringify({ out, runId: manifest.runId, artifacts: artifacts.length })}\n`);
