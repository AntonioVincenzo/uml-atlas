import express from 'express';
import path from 'node:path';
import { z } from 'zod';
import { Store, ConflictError } from './store.js';
import { documentSchema, validateDocument } from '../core/model.js';
import { diffDocuments } from '../core/diff.js';
export function createApp(store: Store, uiDir: string, port: number) {
  const app = express();
  app.disable('x-powered-by');
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, '127.0.0.1:5173', 'localhost:5173']);
  app.use((req, res, next) => {
    if (!allowedHosts.has(req.headers.host ?? '')) return void res.status(403).json({ error: 'Unrecognized host' });
    if (req.headers.origin) { try { const origin = new URL(req.headers.origin); if (origin.protocol !== 'http:' || !allowedHosts.has(origin.host)) return void res.status(403).json({ error: 'Cross-origin request rejected' }); } catch { return void res.status(403).json({ error: 'Invalid origin' }); } }
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-atlas-client'] !== 'studio') return void res.status(403).json({ error: 'Missing Atlas request header' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const save = z.object({ document: documentSchema, baseRevision: z.string(), author: z.string().min(1).max(200), rationale: z.string().min(1).max(10000) }).strict();
  app.get('/api/workspace', async (_req, res) => { res.json({ ...await store.read(), workspacePath: store.root, mcpConfig: { mcpServers: { atlas: { command: process.execPath, args: [path.resolve(uiDir, '../server/cli.js'), 'mcp', '--workspace', store.root] } } } }); });
  app.post('/api/save', async (req, res) => { const v = save.parse(req.body); res.json(await store.commit(validateDocument(v.document), v.baseRevision, v.author, v.rationale)); });
  app.get('/api/history', async (_req, res) => { res.json(await store.history()); });
  app.get('/api/revisions/:id', async (req, res) => { res.json(await store.revision(req.params.id)); });
  app.get('/api/proposals', async (_req, res) => { res.json((await store.proposals()).map(({ document: _, ...meta }) => meta)); });
  app.get('/api/proposals/:id', async (req, res) => { const proposal = await store.proposal(req.params.id); const base = await store.revision(proposal.baseRevision); res.json({ proposal, base, changes: diffDocuments(base.document, proposal.document) }); });
  app.post('/api/proposals', async (req, res) => { const v = save.parse(req.body); res.json(await store.propose(v.document, v.baseRevision, v.author, v.rationale)); });
  app.post('/api/proposals/:id/review', async (req, res) => { const { action } = z.object({ action: z.enum(['accept', 'reject']) }).parse(req.body); res.json(await store.review(req.params.id, action)); });
  app.get('/api/code', async (req, res) => { const v = z.object({ path: z.string(), startLine: z.coerce.number().int().positive(), endLine: z.coerce.number().int().positive().optional() }).parse(req.query); res.json(await store.code(v.path, v.startLine, v.endLine)); });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found' }); });
  app.use(express.static(uiDir));
  app.get('/{*path}', (_req, res) => { res.sendFile(path.join(uiDir, 'index.html')); });
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error instanceof ConflictError ? 409 : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 400).json({ error: error.message }); });
  return app;
}
