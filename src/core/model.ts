import { z } from 'zod';

export const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/, 'Use a letter or underscore, then letters, numbers, underscores or hyphens').max(100);
export const nodeKinds = ['component', 'class', 'interface', 'package', 'actor', 'usecase', 'database', 'service', 'state', 'note', 'enum'] as const;
export const edgeKinds = ['association', 'dependency', 'generalization', 'realization', 'composition', 'aggregation', 'transition'] as const;
const point = z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000) }).strict();
export const codeLinkSchema = z.object({ path: z.string().min(1).max(500), startLine: z.number().int().positive(), endLine: z.number().int().positive().optional(), symbol: z.string().max(200).optional() }).strict().refine(v => !v.endLine || v.endLine >= v.startLine, 'End line must be at or after start line');
export const nodeSchema = z.object({
  id: identifier, kind: z.enum(nodeKinds), label: z.string().min(1).max(300), position: point,
  description: z.string().max(10000).default(''), stereotype: z.string().max(100).default(''),
  members: z.array(z.string().min(1).max(1000).refine(s => s === s.trim() && !/[\r\n]/.test(s) && s !== '}', 'Members must be nonempty single lines, trimmed, and not a closing brace')).max(200).default([]),
  codeLinks: z.array(codeLinkSchema).max(50).default([]),
  snippet: z.object({ language: z.string().max(50), code: z.string().max(20000) }).strict().optional(),
}).strict();
export const edgeSchema = z.object({ id: identifier, source: identifier, target: identifier, kind: z.enum(edgeKinds), label: z.string().max(1000).default(''), sourceMultiplicity: z.string().max(30).default(''), targetMultiplicity: z.string().max(30).default('') }).strict();
export const importSchema = z.object({ id: identifier, diagramId: identifier, label: z.string().max(300), position: point, expanded: z.boolean().default(false) }).strict();
export const diagramSchema = z.object({ id: identifier, name: z.string().min(1).max(300), description: z.string().max(10000).default(''), nodes: z.array(nodeSchema).max(500), edges: z.array(edgeSchema).max(2000), imports: z.array(importSchema).max(50).default([]) }).strict();
export const documentSchema = z.object({ schemaVersion: z.literal(1), id: identifier, name: z.string().min(1).max(300), diagrams: z.array(diagramSchema).min(1).max(100) }).strict();
export type ArchNode = z.infer<typeof nodeSchema>;
export type ArchEdge = z.infer<typeof edgeSchema>;
export type DiagramImport = z.infer<typeof importSchema>;
export type Diagram = z.infer<typeof diagramSchema>;
export type ArchDocument = z.infer<typeof documentSchema>;
export type Revision = { revision: string; parentRevision: string | null; createdAt: string; author: string; rationale: string; document: ArchDocument };
export type Proposal = { id: string; baseRevision: string; createdAt: string; author: string; rationale: string; document: ArchDocument; status: 'pending' | 'accepted' | 'rejected' };

export function validateDocument(input: unknown): ArchDocument {
  const doc = documentSchema.parse(input);
  const unique = (ids: string[], context: string) => { if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ID in ${context}`); };
  unique(doc.diagrams.map(d => d.id), 'diagrams');
  const diagrams = new Map(doc.diagrams.map(d => [d.id, d]));
  for (const d of doc.diagrams) {
    unique([...d.nodes, ...d.imports, ...d.edges].map(n => n.id), d.id);
    const entities = new Set([...d.nodes, ...d.imports].map(n => n.id));
    for (const e of d.edges) {
      if (!entities.has(e.source) || !entities.has(e.target)) throw new Error(`${d.id}/${e.id}: relationship endpoint does not exist`);
      if (['generalization', 'realization', 'composition', 'aggregation'].includes(e.kind) && e.source === e.target) throw new Error(`${d.id}/${e.id}: ${e.kind} cannot reference itself`);
    }
    for (const i of d.imports) if (!diagrams.has(i.diagramId)) throw new Error(`${d.id}/${i.id}: unknown imported diagram ${i.diagramId}`);
    // Generalization must be acyclic; association and state-machine loops are valid.
    const complete = new Set<string>();
    const active = new Set<string>();
    const inheritance = new Map<string, string[]>();
    for (const e of d.edges.filter(e => e.kind === 'generalization')) inheritance.set(e.source, [...(inheritance.get(e.source) ?? []), e.target]);
    const visitInheritance = (id: string) => {
      if (active.has(id)) throw new Error(`${d.id}: generalization cycle at ${id}`);
      if (complete.has(id)) return;
      active.add(id);
      for (const target of inheritance.get(id) ?? []) visitInheritance(target);
      active.delete(id); complete.add(id);
    };
    for (const n of d.nodes) visitInheritance(n.id);
  }
  const visit = (id: string, path: string[], budget: { count: number }) => {
    if (path.includes(id)) throw new Error(`Diagram import cycle: ${[...path, id].join(' → ')}`);
    if (path.length > 8) throw new Error('Diagram imports may be nested at most 8 levels');
    const d = diagrams.get(id)!;
    budget.count += d.nodes.length + d.imports.length;
    if (budget.count > 2000) throw new Error('Expanded diagram exceeds 2000 elements');
    for (const i of d.imports) visit(i.diagramId, [...path, id], budget);
  };
  for (const d of doc.diagrams) visit(d.id, [], { count: 0 });
  return doc;
}
export function emptyDocument(name = 'Untitled architecture'): ArchDocument {
  return { schemaVersion: 1, id: 'workspace', name, diagrams: [{ id: 'overview', name: 'System overview', description: '', nodes: [], edges: [], imports: [] }] };
}
export function newNode(id: string, kind: ArchNode['kind'], position = { x: 100, y: 100 }): ArchNode {
  return { id, kind, label: `New ${kind}`, position, description: '', stereotype: '', members: [], codeLinks: [] };
}
export function mergeDocument(current: ArchDocument, imported: ArchDocument, namespace: string): ArchDocument {
  identifier.parse(namespace);
  const assigned = new Set<string>();
  const mapping = new Map(imported.diagrams.map((d, index) => {
    const base = `${namespace}_${d.id}`;
    let id = base.length <= 100 ? base : `${base.slice(0, 94)}_${index}`;
    let attempt = 0;
    while (assigned.has(id)) id = `${base.slice(0, 88)}_${index}_${++attempt}`;
    assigned.add(id); return [d.id, id];
  }));
  return validateDocument({ ...current, diagrams: [...current.diagrams, ...imported.diagrams.map(d => ({ ...d, id: mapping.get(d.id), imports: d.imports.map(i => ({ ...i, diagramId: mapping.get(i.diagramId) })) }))] });
}
