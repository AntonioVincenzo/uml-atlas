import { mkdir, readFile, writeFile, rename, rm, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateDocument, emptyDocument, type ArchDocument, type Revision, type Proposal } from '../core/model.js';
import { diffDocuments, stable } from '../core/diff.js';
export class ConflictError extends Error {}
export class Store {
  root: string;
  constructor(root: string) { this.root = path.resolve(root); }
  get metadata() { return path.join(this.root, '.atlas'); }
  async atomic(file: string, data: unknown) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try { await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); await rename(temp, file); }
    finally { await rm(temp, { force: true }); }
  }
  async locked<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.metadata, { recursive: true });
    const lock = path.join(this.metadata, 'write.lock');
    let acquired = false;
    for (let i = 0; i < 100; i++) {
      try { await mkdir(lock); acquired = true; break; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 30)); }
    }
    if (!acquired) throw new ConflictError('Workspace is busy. Retry shortly. If a writer crashed, remove .atlas/write.lock after stopping all Atlas processes.');
    try { return await fn(); } finally { await rm(lock, { recursive: true, force: true }); }
  }
  async init(seed = emptyDocument()): Promise<Revision> {
    return this.locked(async () => {
      await mkdir(path.join(this.metadata, 'revisions'), { recursive: true });
      await mkdir(path.join(this.metadata, 'proposals'), { recursive: true });
      try { const current = await this.read(); await this.atomic(path.join(this.metadata, 'revisions', `${current.revision}.json`), current); return current; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      const first: Revision = { revision: randomUUID(), parentRevision: null, createdAt: new Date().toISOString(), author: 'Atlas', rationale: 'Initialize workspace', document: validateDocument(seed) };
      await this.writeRevision(first); return first;
    });
  }
  async read(): Promise<Revision> {
    const r = JSON.parse(await readFile(path.join(this.root, 'architecture.json'), 'utf8')) as Revision;
    this.safeId(r.revision); r.document = validateDocument(r.document); return r;
  }
  safeId(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid revision or proposal ID'); return id; }
  async revision(id: string): Promise<Revision> { return JSON.parse(await readFile(path.join(this.metadata, 'revisions', `${this.safeId(id)}.json`), 'utf8')); }
  async history(): Promise<Omit<Revision, 'document'>[]> {
    let current: Revision | undefined = await this.read(); const result: Omit<Revision, 'document'>[] = []; const seen = new Set<string>();
    while (current && result.length < 200 && !seen.has(current.revision)) {
      seen.add(current.revision); const { document: _, ...meta } = current; result.push(meta);
      if (!current.parentRevision) break;
      try { current = await this.revision(current.parentRevision); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; break; }
    }
    return result;
  }
  private async writeRevision(r: Revision) {
    await this.atomic(path.join(this.metadata, 'revisions', `${r.revision}.json`), r);
    await this.atomic(path.join(this.root, 'architecture.json'), r);
  }
  private checkBase(current: Revision, baseRevision: string) {
    if (current.revision !== baseRevision) throw new ConflictError('The architecture changed since this edit began. Export your draft, reload the latest revision, and reapply or propose the change again.');
  }
  private async commitUnlocked(document: ArchDocument, baseRevision: string, author: string, rationale: string) {
    const current = await this.read(); this.checkBase(current, baseRevision);
    const doc = validateDocument(document);
    if (stable(current.document) === stable(doc)) return current;
    // Ensure an imported head can become the base of a complete new local history.
    await this.atomic(path.join(this.metadata, 'revisions', `${current.revision}.json`), current);
    const next: Revision = { revision: randomUUID(), parentRevision: current.revision, createdAt: new Date().toISOString(), author, rationale, document: doc };
    await this.writeRevision(next); return next;
  }
  async commit(document: ArchDocument, baseRevision: string, author: string, rationale: string) {
    return this.locked(() => this.commitUnlocked(document, baseRevision, author, rationale));
  }
  async propose(document: ArchDocument, baseRevision: string, author: string, rationale: string) {
    return this.locked(async () => {
      const current = await this.read(); this.checkBase(current, baseRevision);
      const doc = validateDocument(document);
      const p: Proposal = { id: randomUUID(), baseRevision, createdAt: new Date().toISOString(), author, rationale, document: doc, status: 'pending' };
      await this.atomic(path.join(this.metadata, 'proposals', `${p.id}.json`), p);
      return { proposal: p, changes: diffDocuments(current.document, doc) };
    });
  }
  async proposal(id: string): Promise<Proposal> { return JSON.parse(await readFile(path.join(this.metadata, 'proposals', `${this.safeId(id)}.json`), 'utf8')); }
  async proposals() {
    const names = await readdir(path.join(this.metadata, 'proposals'));
    return (await Promise.all(names.filter(n => n.endsWith('.json')).map(n => this.proposal(n.slice(0, -5))))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async review(id: string, action: 'accept' | 'reject') {
    return this.locked(async () => {
      const p = await this.proposal(id);
      if (p.status !== 'pending') throw new ConflictError('This proposal has already been reviewed');
      const revision = action === 'accept' ? await this.commitUnlocked(p.document, p.baseRevision, p.author, p.rationale) : await this.read();
      p.status = action === 'accept' ? 'accepted' : 'rejected';
      await this.atomic(path.join(this.metadata, 'proposals', `${p.id}.json`), p);
      return revision;
    });
  }
  async code(file: string, startLine: number, endLine = startLine + 40) {
    if (!Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(endLine) || endLine < startLine) throw new Error('Invalid line range');
    if (path.isAbsolute(file)) throw new Error('Code links must use workspace-relative paths');
    const root = await realpath(this.root); const resolved = await realpath(path.resolve(root, file));
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Code link is outside the workspace');
    if ((await stat(resolved)).size > 2_000_000) throw new Error('Code file exceeds 2 MB');
    const lines = (await readFile(resolved, 'utf8')).split('\n');
    if (startLine > lines.length) throw new Error(`File has only ${lines.length} lines; this code link may be stale`);
    const end = Math.min(endLine, startLine + 199, lines.length);
    return { path: file, startLine, endLine: end, totalLines: lines.length, code: lines.slice(startLine - 1, end).join('\n') };
  }
}
