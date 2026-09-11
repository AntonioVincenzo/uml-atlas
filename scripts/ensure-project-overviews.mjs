#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { Store } from '../dist/server/store.js';
import { PROJECT_OVERVIEW_ID, PROJECT_OVERVIEW_NAME, validateDocument } from '../dist/core/model.js';

const catalogPath = path.join(homedir(), '.atlas', 'projects.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const results = [];

function referenceId(diagramId, used) {
  const stem = `map_${diagramId}`.slice(0, 91);
  let id = stem; let suffix = 1;
  while (used.has(id)) id = `${stem}_${suffix++}`;
  used.add(id); return id;
}

function synchronize(document) {
  const existing = document.diagrams.find(diagram => diagram.id === PROJECT_OVERVIEW_ID);
  const targets = document.diagrams.filter(diagram => diagram.id !== PROJECT_OVERVIEW_ID);
  const existingByTarget = new Map(existing?.imports.map(reference => [reference.diagramId, reference]) ?? []);
  const used = new Set(existing?.imports.map(reference => reference.id) ?? []);
  const imports = targets.map((target, index) => {
    const reference = existingByTarget.get(target.id);
    return reference
      ? { ...reference, label: target.name }
      : { id: referenceId(target.id, used), diagramId: target.id, label: target.name, position: { x: 60 + index % 3 * 390, y: 80 + Math.floor(index / 3) * 285 }, expanded: false };
  });
  const entityIds = new Set([...(existing?.nodes.map(node => node.id) ?? []), ...imports.map(reference => reference.id)]);
  const overview = {
    id: PROJECT_OVERVIEW_ID,
    name: PROJECT_OVERVIEW_NAME,
    description: existing?.description || 'Start here. Each card uses the exact title and purpose of its diagram and opens the detailed view.',
    nodes: existing?.nodes ?? [],
    edges: existing?.edges.filter(edge => entityIds.has(edge.source) && entityIds.has(edge.target)) ?? [],
    imports,
  };
  return { ...document, diagrams: [overview, ...targets] };
}

async function migrateInvalidOverview(store, projectPath, current) {
  const document = validateDocument(synchronize(current.document));
  return store.locked(async () => {
    store.safeId(current.revision);
    await mkdir(path.join(store.metadata, 'revisions'), { recursive: true });
    await mkdir(path.join(store.metadata, 'proposals'), { recursive: true });
    await store.atomic(path.join(store.metadata, 'revisions', `${current.revision}.json`), current);
    const saved = { revision: randomUUID(), parentRevision: current.revision, createdAt: new Date().toISOString(), author: 'Atlas project overview maintenance', rationale: 'Keep Project Overview canonical and use the exact title of every referenced diagram.', revisionType: 'design', document };
    await store.atomic(path.join(store.metadata, 'revisions', `${saved.revision}.json`), saved);
    await store.atomic(path.join(projectPath, 'architecture.json'), saved);
    return saved;
  });
}

for (const project of catalog.projects) {
  try {
    const projectPath = path.resolve(project.path); const store = new Store(projectPath);
    let current;
    try { current = await store.init(); }
    catch (error) {
      if (!/Project Overview|project_overview/.test(error.message)) throw error;
      const invalid = JSON.parse(await readFile(path.join(projectPath, 'architecture.json'), 'utf8'));
      const saved = await migrateInvalidOverview(store, projectPath, invalid);
      results.push({ project: project.name, path: project.path, changed: true, revision: saved.revision });
      continue;
    }
    const document = synchronize(current.document);
    const changed = JSON.stringify(document) !== JSON.stringify(current.document);
    const saved = changed ? await store.commit(document, current.revision, 'Atlas project overview maintenance', 'Keep Project Overview canonical and use the exact title of every referenced diagram.') : current;
    results.push({ project: project.name, path: project.path, changed, revision: saved.revision });
  } catch (error) {
    results.push({ project: project.name, path: project.path, changed: false, error: error.message });
  }
}

process.stdout.write(`${JSON.stringify({ catalog: catalogPath, results }, null, 2)}\n`);
