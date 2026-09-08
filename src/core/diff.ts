import type { ArchDocument } from './model.js';
export type Change = { diagramId: string; entity: 'diagram' | 'node' | 'edge' | 'import' | 'workspace'; id: string; label: string; kind: 'added' | 'removed' | 'modified' | 'layout'; fields: string[]; before?: unknown; after?: unknown };
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function diffDocuments(before: ArchDocument, after: ArchDocument): Change[] {
  const changes: Change[] = [];
  function compare(a: Record<string, any>[], b: Record<string, any>[], entity: Change['entity'], diagramId: string, omit: string[] = []) {
    const left = new Map(a.map(x => [x.id, x])); const right = new Map(b.map(x => [x.id, x]));
    for (const id of new Set([...left.keys(), ...right.keys()])) {
      const old = left.get(id); const next = right.get(id);
      const fields = old && next ? [...new Set([...Object.keys(old), ...Object.keys(next)])].filter(k => !omit.includes(k) && stable(old[k]) !== stable(next[k])) : [];
      if (!old || !next || fields.length) changes.push({ diagramId, entity, id, label: next?.label || next?.name || old?.label || old?.name || id, kind: !old ? 'added' : !next ? 'removed' : fields.every(f => ['position', 'expanded'].includes(f)) ? 'layout' : 'modified', fields, before: old, after: next });
    }
  }
  compare([before], [after], 'workspace', '', ['diagrams']);
  compare(before.diagrams, after.diagrams, 'diagram', '', ['nodes', 'edges', 'imports']);
  for (const id of new Set([...before.diagrams, ...after.diagrams].map(d => d.id))) {
    const a = before.diagrams.find(d => d.id === id); const b = after.diagrams.find(d => d.id === id);
    compare(a?.nodes ?? [], b?.nodes ?? [], 'node', id);
    compare(a?.edges ?? [], b?.edges ?? [], 'edge', id);
    compare(a?.imports ?? [], b?.imports ?? [], 'import', id);
  }
  // A referenced diagram is part of every containing architecture. Surface those
  // impacts without treating a move inside the child as a design change.
  const changedDiagrams = new Set(changes.filter(c => c.kind !== 'layout').map(c => c.entity === 'diagram' ? c.id : c.diagramId));
  const hasImpact = (id: string, seen = new Set<string>()): boolean => {
    if (changedDiagrams.has(id)) return true;
    if (seen.has(id)) return false;
    const refs = [...(before.diagrams.find(d => d.id === id)?.imports ?? []), ...(after.diagrams.find(d => d.id === id)?.imports ?? [])];
    return refs.some(i => hasImpact(i.diagramId, new Set([...seen, id])));
  };
  for (const d of after.diagrams) {
    const oldDiagram = before.diagrams.find(x => x.id === d.id);
    for (const reference of d.imports) {
      const old = oldDiagram?.imports.find(i => i.id === reference.id);
      if (!old || old.diagramId !== reference.diagramId || !hasImpact(reference.diagramId)) continue;
      const existing = changes.find(c => c.diagramId === d.id && c.entity === 'import' && c.id === reference.id);
      if (existing) { existing.fields.push('referencedContent'); if (existing.kind === 'layout') existing.kind = 'modified'; }
      else changes.push({ diagramId: d.id, entity: 'import', id: reference.id, label: reference.label, kind: 'modified', fields: ['referencedContent'], before: { reference: old, diagram: before.diagrams.find(x => x.id === old.diagramId) }, after: { reference, diagram: after.diagrams.find(x => x.id === reference.diagramId) } });
    }
  }
  return changes;
}
