import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Store } from './store.js';
import { documentSchema, diagramSchema, validateDocument } from '../core/model.js';
import { toUml, parseUml } from '../core/uml.js';
import { diffDocuments } from '../core/diff.js';
import { inspectDiagramGeometry } from '../core/geometry.js';

const codeLinkDriftNotice = 'Code links are user-maintained pointers and may drift as the code changes. Read the current region before relying on a link; a successful read confirms only that the path and line range still exist.';

export function createMcp(store: Store) {
  const server = new McpServer({ name: 'atlas-architecture', version: '0.1.0' });
  const wrap = (fn: (input: any) => Promise<unknown>) => async (input: any) => {
    try { return { content: [{ type: 'text' as const, text: JSON.stringify(await fn(input), null, 2) }] }; }
    catch (e) { return { isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] }; }
  };
  const base = { baseRevision: z.string(), author: z.string().min(1).max(200), rationale: z.string().min(1).max(10000) };
  server.registerTool('get_architecture', { description: `Read the current architecture document, stable element IDs, and revision. Always read before proposing changes. ${codeLinkDriftNotice}`, inputSchema: {}, annotations: { readOnlyHint: true } }, wrap(() => store.read()));
  server.registerTool('get_diagram', { description: `Read one diagram as JSON and round-trip UML source, with the current revision. ${codeLinkDriftNotice}`, inputSchema: { diagramId: z.string() }, annotations: { readOnlyHint: true } }, wrap(async ({ diagramId }) => { const current = await store.read(); const diagram = current.document.diagrams.find(d => d.id === diagramId); if (!diagram) throw new Error('Diagram not found'); return { revision: current.revision, diagram, uml: toUml(diagram) }; }));
  server.registerTool('analyze_diagram_layout', { description: 'Return node rectangles, connector ports and segments, label rectangles, and typed collision complaints for one diagram.', inputSchema: { diagramId: z.string() }, annotations: { readOnlyHint: true } }, wrap(async ({ diagramId }) => { const current = await store.read(); const diagram = current.document.diagrams.find(d => d.id === diagramId); if (!diagram) throw new Error('Diagram not found'); return inspectDiagramGeometry(diagram); }));
  server.registerTool('validate_architecture', { description: 'Validate a candidate document and return its structural diff against current architecture. Does not write.', inputSchema: { document: documentSchema }, annotations: { readOnlyHint: true } }, wrap(async ({ document }) => { const doc = validateDocument(document); const current = await store.read(); return { valid: true, baseRevision: current.revision, changes: diffDocuments(current.document, doc) }; }));
  server.registerTool('propose_architecture', { description: 'Submit a complete candidate document for visual human review. Keep existing stable IDs. Does not modify the current architecture. A stale baseRevision is rejected.', inputSchema: { ...base, document: documentSchema } }, wrap(({ document, baseRevision, author, rationale }) => store.propose(document, baseRevision, author, rationale)));
  server.registerTool('propose_diagram', { description: 'Replace or add one diagram in a proposal. Supply either diagram JSON or UML text, not both. The rest of the current document is preserved. Review occurs in the studio.', inputSchema: { ...base, diagramId: z.string(), diagram: diagramSchema.optional(), uml: z.string().max(1_000_000).optional() } }, wrap(async ({ diagramId, diagram, uml, ...meta }) => {
    if (!!diagram === (uml !== undefined)) throw new Error('Provide exactly one of diagram or uml');
    const current = await store.read(); const previous = current.document.diagrams.find(d => d.id === diagramId);
    const candidate = diagram ?? parseUml(uml, previous);
    if (candidate.id !== diagramId) throw new Error('Diagram ID must match diagramId');
    const doc = { ...current.document, diagrams: previous ? current.document.diagrams.map(d => d.id === diagramId ? candidate : d) : [...current.document.diagrams, candidate] };
    return store.propose(doc, meta.baseRevision, meta.author, meta.rationale);
  }));
  server.registerTool('list_proposals', { description: 'List proposal metadata and current status.', inputSchema: {}, annotations: { readOnlyHint: true } }, wrap(async () => (await store.proposals()).map(({ document: _, ...meta }) => meta)));
  server.registerTool('get_proposal', { description: 'Read a proposal and its changes against the original base revision.', inputSchema: { proposalId: z.string() }, annotations: { readOnlyHint: true } }, wrap(async ({ proposalId }) => { const proposal = await store.proposal(proposalId); const base = await store.revision(proposal.baseRevision); return { proposal, changes: diffDocuments(base.document, proposal.document) }; }));
  server.registerTool('get_history', { description: 'Read logical design revision metadata, newest first. Layout-only revisions are omitted.', inputSchema: {}, annotations: { readOnlyHint: true } }, wrap(() => store.history()));
  server.registerTool('compare_revisions', { description: 'Compare two saved revisions by stable IDs, separating layout from model changes.', inputSchema: { before: z.string(), after: z.string() }, annotations: { readOnlyHint: true } }, wrap(async ({ before, after }) => diffDocuments((await store.revision(before)).document, (await store.revision(after)).document)));
  server.registerTool('read_code_region', { description: `Read up to 200 lines from a workspace-relative code path. No execution. Rejects paths and symlinks outside this workspace. ${codeLinkDriftNotice}`, inputSchema: { path: z.string(), startLine: z.number().int().positive(), endLine: z.number().int().positive().optional() }, annotations: { readOnlyHint: true } }, wrap(async ({ path, startLine, endLine }) => ({ ...await store.code(path, startLine, endLine), linkStatus: 'unverified', notice: codeLinkDriftNotice })));
  server.registerResource('architecture', 'atlas://architecture', { description: `Current architecture model and revision. ${codeLinkDriftNotice}`, mimeType: 'application/json' }, async () => ({ contents: [{ uri: 'atlas://architecture', mimeType: 'application/json', text: JSON.stringify(await store.read()) }] }));
  server.registerResource('schema', 'atlas://schema', { description: 'Portable architecture JSON Schema', mimeType: 'application/schema+json' }, async () => ({ contents: [{ uri: 'atlas://schema', mimeType: 'application/schema+json', text: JSON.stringify(z.toJSONSchema(documentSchema)) }] }));
  return server;
}
export async function startMcp(store: Store) { await store.init(); const server = createMcp(store); await server.connect(new StdioServerTransport()); }
