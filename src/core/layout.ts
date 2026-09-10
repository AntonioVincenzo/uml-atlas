import type { ArchDocument, ArchNode, Diagram, DiagramImport } from './model.js';

type LayoutItem = ArchNode | DiagramImport;
const isImport = (item: LayoutItem): item is DiagramImport => 'diagramId' in item;

export function layoutSize(item: LayoutItem) {
  if (isImport(item)) return { width: 270, height: 150 };
  const members = Math.min(item.members.length, 6);
  if (item.kind === 'class') return { width: 240, height: 48 + Math.max(34, members * 18) + 34 };
  if (item.kind === 'enum') return { width: 240, height: 48 + Math.max(34, members * 18) };
  if (item.kind === 'actor' || item.kind === 'usecase') return { width: 240, height: 64 + members * 18 };
  if (item.kind === 'note') return { width: 240, height: Math.min(220, 70 + Math.ceil(item.description.length / 34) * 18) };
  return { width: 240, height: 106 + members * 18 };
}

export function nextNodePosition(diagram: Diagram) {
  const items = [...diagram.nodes, ...diagram.imports];
  for (let row = 0; row < 500; row++) for (let column = 0; column < 4; column++) {
    const candidate = { x: 60 + column * 390, y: 60 + row * 230 };
    const free = items.every(item => {
      const size = layoutSize(item); return candidate.x + 240 < item.position.x - 40 || candidate.x > item.position.x + size.width + 40 || candidate.y + 120 < item.position.y - 40 || candidate.y > item.position.y + size.height + 40;
    });
    if (free) return candidate;
  }
  return { x: 60, y: 60 };
}

// Deterministic layered layout. Cycles are reduced to a forward acyclic backbone;
// cycle-closing edges are then rendered as return paths outside the node field.
export function tidyDiagram(diagram: Diagram): Diagram {
  const items: LayoutItem[] = [...diagram.nodes, ...diagram.imports];
  if (items.length < 2) return structuredClone(diagram);
  const ids = new Set(items.map(item => item.id));
  const itemById = new Map(items.map(item => [item.id, item]));
  const adjacency = new Map(items.map(item => [item.id, new Set<string>()]));
  const hasPath = (source: string, target: string) => {
    const pending = [source]; const seen = new Set<string>();
    while (pending.length) { const current = pending.pop()!; if (current === target) return true; if (seen.has(current)) continue; seen.add(current); pending.push(...adjacency.get(current)!); }
    return false;
  };
  const candidates = diagram.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target).sort((left, right) => {
    const delta = (edge: Diagram['edges'][number]) => itemById.get(edge.target)!.position.x - itemById.get(edge.source)!.position.x;
    const leftDelta = delta(left); const rightDelta = delta(right);
    return Number(leftDelta < 0) - Number(rightDelta < 0) || rightDelta - leftDelta || left.id.localeCompare(right.id);
  });
  let returnEdgeCount = 0;
  for (const edge of candidates) {
    if (hasPath(edge.target, edge.source)) returnEdgeCount++;
    else adjacency.get(edge.source)!.add(edge.target);
  }

  const indegree = new Map(items.map(item => [item.id, 0]));
  for (const targets of adjacency.values()) for (const target of targets) indegree.set(target, indegree.get(target)! + 1);
  const queue = items.filter(item => indegree.get(item.id) === 0).map(item => item.id).sort((a, b) => itemById.get(a)!.position.y - itemById.get(b)!.position.y || a.localeCompare(b));
  const layerOf = new Map(items.map(item => [item.id, 0]));
  while (queue.length) {
    const current = queue.shift()!;
    for (const target of [...adjacency.get(current)!].sort()) {
      layerOf.set(target, Math.max(layerOf.get(target)!, Math.min(200, layerOf.get(current)! + 1)));
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) { queue.push(target); queue.sort((a, b) => itemById.get(a)!.position.y - itemById.get(b)!.position.y || a.localeCompare(b)); }
    }
  }
  const inbound = new Map(items.map(item => [item.id, [] as string[]]));
  for (const edge of diagram.edges) if (ids.has(edge.source) && ids.has(edge.target)) inbound.get(edge.target)!.push(edge.source);
  const byLayer = new Map<number, LayoutItem[]>();
  for (const item of items) { const layer = layerOf.get(item.id)!; byLayer.set(layer, [...(byLayer.get(layer) ?? []), item]); }
  const order = new Map<string, number>();
  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    const group = byLayer.get(layer)!; group.sort((left, right) => {
      const score = (item: LayoutItem) => { const previous = inbound.get(item.id)!.filter(id => (layerOf.get(id) ?? layer) < layer && order.has(id)); return previous.length ? previous.reduce((sum, id) => sum + order.get(id)!, 0) / previous.length : item.position.y / 1000; };
      return score(left) - score(right) || left.position.y - right.position.y || left.id.localeCompare(right.id);
    });
    group.forEach((item, index) => order.set(item.id, index));
  }

  const layers = [...byLayer.keys()].sort((a, b) => a - b); const rowGap = 90; const returnGutter = returnEdgeCount ? 110 + (returnEdgeCount - 1) * 42 : 0;
  const heights = new Map(layers.map(layer => [layer, byLayer.get(layer)!.reduce((sum, item) => sum + layoutSize(item).height, 0) + Math.max(0, byLayer.get(layer)!.length - 1) * rowGap]));
  const tallest = Math.max(...heights.values()); const positions = new Map<string, { x: number; y: number }>(); let x = 60;
  for (const layer of layers) {
    const group = byLayer.get(layer)!; let y = 60 + returnGutter + (tallest - heights.get(layer)!) / 2; const width = Math.max(...group.map(item => layoutSize(item).width));
    for (const item of group) { positions.set(item.id, { x, y }); y += layoutSize(item).height + rowGap; }
    const labels = diagram.edges.filter(edge => layerOf.get(edge.source) === layer && (layerOf.get(edge.target) ?? layer) > layer).map(edge => edge.label.length);
    const labelClearance = Math.min(330, Math.max(190, 55 + Math.max(0, ...labels) * 7)); x += width + labelClearance;
  }
  return { ...structuredClone(diagram), nodes: diagram.nodes.map(node => ({ ...node, position: positions.get(node.id)! })), imports: diagram.imports.map(reference => ({ ...reference, position: positions.get(reference.id)! })) };
}
export function expansionBounds(document: ArchDocument, reference: DiagramImport) {
  const child = document.diagrams.find(d => d.id === reference.diagramId)!;
  const items = [...child.nodes, ...child.imports];
  const minX = Math.min(0, ...items.map(n => n.position.x));
  const minY = Math.min(0, ...items.map(n => n.position.y));
  return { minX, minY, width: Math.max(420, ...items.map(n => n.position.x - minX + 330)), height: Math.max(240, ...items.map(n => n.position.y - minY + 380)) };
}
// Display-only separation keeps unrelated nodes outside expanded reference containers.
// Persisted coordinates remain those of the compact architecture.
export function expansionOffset(document: ArchDocument, diagram: Diagram, entity: { id: string; position: { x: number; y: number } }) {
  let x = 0; let y = 0;
  for (const reference of diagram.imports.filter(i => i.expanded && i.id !== entity.id)) {
    const bounds = expansionBounds(document, reference);
    if (entity.position.x >= reference.position.x + 270) x += bounds.width - 270 + 45;
    else if (entity.position.x >= reference.position.x && entity.position.y >= reference.position.y + 190) y += bounds.height - 190 + 45;
  }
  return { x, y };
}
