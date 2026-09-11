import { PROJECT_OVERVIEW_ID, PROJECT_OVERVIEW_NAME, type ArchDocument, type ArchEdge, type Diagram, type DiagramImport } from './model.js';

function uniqueId(stem: string, used: Set<string>) {
  const base = stem.slice(0, 91); let id = base; let suffix = 1;
  while (used.has(id)) id = `${base}_${suffix++}`;
  used.add(id); return id;
}

export function inferProjectOverviewEdges(diagrams: Diagram[], references: DiagramImport[]): ArchEdge[] {
  const referenceByDiagram = new Map(references.map(reference => [reference.diagramId, reference]));
  const used = new Set<string>(); const seen = new Set<string>(); const edges: ArchEdge[] = [];
  for (const source of diagrams) for (const imported of source.imports) {
    const sourceReference = referenceByDiagram.get(source.id); const targetReference = referenceByDiagram.get(imported.diagramId);
    if (!sourceReference || !targetReference || sourceReference.id === targetReference.id) continue;
    const relation = `${sourceReference.id}:${targetReference.id}`;
    if (seen.has(relation)) continue;
    seen.add(relation);
    edges.push({ id: uniqueId(`overview_${source.id}_${imported.diagramId}`, used), source: sourceReference.id, target: targetReference.id, kind: 'dependency', label: 'includes', sourceMultiplicity: '', targetMultiplicity: '' });
  }
  return edges;
}

export function synchronizeProjectOverview(document: ArchDocument): ArchDocument {
  const existing = document.diagrams.find(diagram => diagram.id === PROJECT_OVERVIEW_ID);
  const targets = document.diagrams.filter(diagram => diagram.id !== PROJECT_OVERVIEW_ID);
  const existingByTarget = new Map(existing?.imports.map(reference => [reference.diagramId, reference]) ?? []);
  const used = new Set(existing?.imports.map(reference => reference.id) ?? []);
  const imports = targets.map((target, index) => {
    const reference = existingByTarget.get(target.id);
    return reference
      ? { ...reference, label: target.name }
      : { id: uniqueId(`map_${target.id}`, used), diagramId: target.id, label: target.name, position: { x: 60 + index % 3 * 390, y: 80 + Math.floor(index / 3) * 285 }, expanded: false };
  });
  const entityIds = new Set([...(existing?.nodes.map(node => node.id) ?? []), ...imports.map(reference => reference.id)]);
  const preservedEdges = existing?.edges.filter(edge => entityIds.has(edge.source) && entityIds.has(edge.target)) ?? [];
  const overview: Diagram = {
    id: PROJECT_OVERVIEW_ID,
    name: PROJECT_OVERVIEW_NAME,
    description: existing?.description || 'Start here. Each card uses the exact title and purpose of its diagram and opens the detailed view.',
    nodes: existing?.nodes ?? [],
    edges: preservedEdges.length ? preservedEdges : inferProjectOverviewEdges(targets, imports),
    imports,
  };
  return { ...document, diagrams: [overview, ...targets] };
}
