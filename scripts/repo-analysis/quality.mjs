#!/usr/bin/env node
import path from 'node:path';
import { parseArgs, readJsonLines, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const out = path.resolve(String(args.out ?? path.join('.', '.repo-analysis', 'current')));
const reproducible = args.reproducible === 'true';
const artifacts = await readJsonLines(path.join(out, 'inventory', 'artifacts.jsonl'));
const ids = new Set();
const uris = new Set();
const diagnostics = [];
let analyzableText = 0;
let recognized = 0;

for (const artifact of artifacts) {
  if (artifact.recordType !== 'artifact' || artifact.schemaVersion !== 1) diagnostics.push({ severity: 'error', ruleId: 'record-shape', artifactId: artifact.id ?? null });
  if (ids.has(artifact.id)) diagnostics.push({ severity: 'error', ruleId: 'duplicate-id', artifactId: artifact.id });
  if (uris.has(artifact.uri)) diagnostics.push({ severity: 'error', ruleId: 'duplicate-uri', artifactId: artifact.id });
  ids.add(artifact.id); uris.add(artifact.uri);
  if (artifact.artifactType === 'text' && ['source', 'test', 'configuration'].includes(artifact.role)) {
    analyzableText += 1;
    if (artifact.language) recognized += 1;
  }
  if (artifact.contentHash && !/^sha256:[a-f0-9]{64}$/.test(artifact.contentHash)) diagnostics.push({ severity: 'error', ruleId: 'invalid-content-hash', artifactId: artifact.id });
  if (artifact.epistemic?.status !== 'observed' || artifact.epistemic?.confidence !== 1) diagnostics.push({ severity: 'error', ruleId: 'inventory-epistemic-class', artifactId: artifact.id });
}

const errorCount = diagnostics.filter(item => item.severity === 'error').length;
const report = {
  schemaVersion: 1,
  analysisLevel: 'inventory',
  verdict: errorCount === 0 && reproducible ? 'pass' : 'fail',
  gates: [
    { id: 'inventory-integrity', verdict: errorCount === 0 ? 'pass' : 'fail', evidence: { errors: errorCount, artifacts: artifacts.length } },
    { id: 'deterministic-repeat', verdict: reproducible ? 'pass' : 'fail', evidence: { byteIdenticalOutputs: reproducible } },
  ],
  coverage: {
    inventory: { numerator: artifacts.length, denominator: artifacts.length, ratio: artifacts.length ? 1 : 0 },
    textLanguageRecognition: { numerator: recognized, denominator: analyzableText, ratio: analyzableText ? recognized / analyzableText : 1 },
    syntaxParsing: { numerator: 0, denominator: analyzableText, ratio: analyzableText ? 0 : 1, status: 'not-run' },
    symbolResolution: { numerator: 0, denominator: 0, ratio: null, status: 'not-run' },
    behaviorLowering: { numerator: 0, denominator: 0, ratio: null, status: 'not-run' },
  },
  uncertainty: {
    observedRecords: artifacts.length, parsedRecords: 0, resolvedRecords: 0,
    derivedRecords: 0, inferredRecords: 0, assertedRecords: 0,
  },
  diagnostics,
};
await writeJson(path.join(out, 'quality', 'report.json'), report);
process.stdout.write(`${JSON.stringify({ out, verdict: report.verdict, diagnostics: diagnostics.length })}\n`);
if (report.verdict !== 'pass') process.exitCode = 1;
