import { diagramSchema, type Diagram, type ArchNode, type ArchEdge } from './model.js';
const arrows: Record<ArchEdge['kind'], string> = { association: '-->', dependency: '..>', generalization: '--|>', realization: '..|>', composition: '*--', aggregation: 'o--', transition: '->' };
const kinds = Object.fromEntries(Object.entries(arrows).map(([k, v]) => [v, k]));
const q = JSON.stringify;
// Metadata is carried in PlantUML comments, so IDs and extra fields survive a round trip.
export function toUml(d: Diagram): string {
  const lines = [`@startuml ${d.id}`, `title ${q(d.name)}`, `' @diagram ${q({ description: d.description })}`, ''];
  for (const n of d.nodes) {
    const { id, kind, label, members, ...meta } = n;
    lines.push(`' @node ${q(meta)}`, `${kind} ${q(label)} as ${id}${members.length ? ' {' : ''}`);
    if (members.length) { members.forEach(m => lines.push(`  ${m}`)); lines.push('}'); }
    lines.push('');
  }
  for (const i of d.imports) lines.push(`' @import ${q(i)}`);
  if (d.imports.length) lines.push('');
  for (const e of d.edges) {
    const { source, target, kind, label, ...meta } = e;
    lines.push(`' @edge ${q(meta)}`, `${source} ${arrows[kind]} ${target}${label ? ` : ${q(label)}` : ''}`);
  }
  lines.push('@enduml'); return lines.join('\n');
}
export function parseUml(text: string, previous?: Diagram): Diagram {
  if (text.length > 1_000_000) throw new Error('UML text is too large');
  const d: Diagram = { id: previous?.id ?? 'diagram', name: previous?.name ?? 'Untitled diagram', description: previous?.description ?? '', nodes: [], edges: [], imports: [] };
  let nodeMeta: Record<string, unknown> = {}, edgeMeta: Record<string, unknown> = {}, body: ArchNode | undefined;
  let started = false, ended = false;
  const readJson = (s: string) => { const v = JSON.parse(s); if (!v || Array.isArray(v) || typeof v !== 'object') throw new Error('Metadata must be a JSON object'); return v; };
  for (const [idx, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim(); if (!line) continue;
    try {
      if (ended) throw new Error('Unexpected text after @enduml');
      if (body) {
        if (line === '}') { body = undefined; continue; }
        body.members.push(line); continue;
      }
      if (line.startsWith("' @node ")) { nodeMeta = readJson(line.slice(8)); continue; }
      if (line.startsWith("' @edge ")) { edgeMeta = readJson(line.slice(8)); continue; }
      if (line.startsWith("' @diagram ")) { const meta = readJson(line.slice(11)); if (Object.keys(meta).some(k => k !== 'description')) throw new Error('Unknown diagram metadata'); d.description = meta.description ?? ''; continue; }
      if (line.startsWith("' @import ")) { d.imports.push(readJson(line.slice(10))); continue; }
      if (line.startsWith("'")) continue;
      const start = line.match(/^@startuml(?:\s+([\w-]+))?$/);
      if (start) { if (started) throw new Error('Only one diagram per source'); started = true; if (start[1]) d.id = start[1]; continue; }
      if (!started) throw new Error('Start with @startuml diagram_id');
      if (line === '@enduml') { ended = true; continue; }
      if (line.startsWith('title ')) { d.name = line.slice(6).startsWith('"') ? JSON.parse(line.slice(6)) : line.slice(6); continue; }
      const n = line.match(/^(component|class|interface|package|actor|usecase|database|service|state|note|enum)\s+(?:((?:"(?:[^"\\]|\\.)*"))\s+as\s+([\w-]+)|([\w-]+))(?:\s*\{)?$/);
      if (n) {
        const id = n[3] ?? n[4]; const old = previous?.nodes.find(x => x.id === id);
        const node: ArchNode = { position: { x: (d.nodes.length % 3) * 310 + 60, y: Math.floor(d.nodes.length / 3) * 200 + 60 }, description: '', stereotype: '', codeLinks: [], ...old, ...nodeMeta, id, kind: n[1] as ArchNode['kind'], label: n[2] ? JSON.parse(n[2]) : id, members: [] };
        d.nodes.push(node); nodeMeta = {}; if (line.endsWith('{')) body = node; continue;
      }
      const e = line.match(/^([\w-]+)\s+(--\|>|\.\.\|>|\*--|o--|-->|\.\.>|->)\s+([\w-]+)(?:\s*:\s*(.*))?$/);
      if (e) {
        const kind = kinds[e[2]] as ArchEdge['kind']; const occurrence = d.edges.filter(x => x.source === e[1] && x.target === e[3] && x.kind === kind).length;
        const old = previous?.edges.filter(x => x.source === e[1] && x.target === e[3] && x.kind === kind)[occurrence];
        const label = e[4]?.startsWith('"') ? JSON.parse(e[4]) : e[4] ?? '';
        d.edges.push({ id: old?.id ?? `rel_${e[1]}_${e[3]}_${d.edges.length + 1}`, sourceMultiplicity: '', targetMultiplicity: '', ...old, ...edgeMeta, source: e[1], target: e[3], kind, label }); edgeMeta = {}; continue;
      }
      throw new Error('Unsupported syntax. See the syntax reference for the supported UML subset.');
    } catch (error) { throw new Error(`Line ${idx + 1}: ${(error as Error).message}`); }
  }
  if (body) throw new Error('Unclosed member block: expected }');
  if (!started || !ended) throw new Error('Include @startuml and @enduml');
  if (Object.keys(nodeMeta).length || Object.keys(edgeMeta).length) throw new Error('Metadata must be followed by its element');
  return diagramSchema.parse(d);
}
