#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { Store } from '../dist/server/store.js';
import { PROJECT_OVERVIEW_ID, validateDocument } from '../dist/core/model.js';
import { synchronizeProjectOverview } from '../dist/core/overview.js';
import { tidyDiagram } from '../dist/core/layout.js';

const catalogPath = path.join(homedir(), '.atlas', 'projects.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const results = [];

function synchronize(document) {
  const previous = document.diagrams.find(diagram => diagram.id === PROJECT_OVERVIEW_ID);
  const needsArrangement = !previous || previous.edges.length === 0;
  const synchronized = synchronizeProjectOverview(document);
  if (!needsArrangement) return synchronized;
  return { ...synchronized, diagrams: synchronized.diagrams.map(diagram => diagram.id === PROJECT_OVERVIEW_ID ? tidyDiagram(diagram) : diagram) };
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
