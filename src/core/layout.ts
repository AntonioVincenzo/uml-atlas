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

// Deterministic layered layout. Strongly connected groups share a column, so valid
// cyclic diagrams remain readable while acyclic flows progress from left to right.
export function tidyDiagram(diagram: Diagram): Diagram {
  const items: LayoutItem[] = [...diagram.nodes, ...diagram.imports];
  if (items.length < 2) return structuredClone(diagram);
  const ids = new Set(items.map(item => item.id));
  const adjacency = new Map(items.map(item => [item.id, [] as string[]]));
  for (const edge of diagram.edges) if (ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) adjacency.get(edge.source)!.push(edge.target);
  for (const targets of adjacency.values()) targets.sort();

  let cursor = 0; const indices = new Map<string, number>(); const low = new Map<string, number>(); const active = new Set<string>(); const stack: string[] = []; const components: string[][] = [];
  const visit = (id: string) => {
    indices.set(id, cursor); low.set(id, cursor++); stack.push(id); active.add(id);
    for (const target of adjacency.get(id) ?? []) {
      if (!indices.has(target)) { visit(target); low.set(id, Math.min(low.get(id)!, low.get(target)!)); }
      else if (active.has(target)) low.set(id, Math.min(low.get(id)!, indices.get(target)!));
    }
    if (low.get(id) !== indices.get(id)) return;
    const component: string[] = []; let member = '';
    do { member = stack.pop()!; active.delete(member); component.push(member); } while (member !== id);
    components.push(component.sort());
  };
  for (const item of items) if (!indices.has(item.id)) visit(item.id);

  const componentOf = new Map<string, number>(); components.forEach((component, index) => component.forEach(id => componentOf.set(id, index)));
  const successors = new Map(components.map((_, index) => [index, new Set<number>()])); const indegree = components.map(() => 0);
  for (const [source, targets] of adjacency) for (const target of targets) {
    const from = componentOf.get(source)!; const to = componentOf.get(target)!;
    if (from !== to && !successors.get(from)!.has(to)) { successors.get(from)!.add(to); indegree[to]++; }
  }
  const componentKey = (index: number) => components[index][0]; const queue = indegree.map((degree, index) => ({ degree, index })).filter(item => item.degree === 0).map(item => item.index).sort((a, b) => componentKey(a).localeCompare(componentKey(b)));
  const componentLayer = components.map(() => 0);
  while (queue.length) {
    const current = queue.shift()!;
    for (const target of [...successors.get(current)!].sort((a, b) => componentKey(a).localeCompare(componentKey(b)))) {
      componentLayer[target] = Math.max(componentLayer[target], Math.min(200, componentLayer[current] + 1));
      if (--indegree[target] === 0) { queue.push(target); queue.sort((a, b) => componentKey(a).localeCompare(componentKey(b))); }
    }
  }
  const layerOf = new Map(items.map(item => [item.id, componentLayer[componentOf.get(item.id)!]]));
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

  const layers = [...byLayer.keys()].sort((a, b) => a - b); const rowGap = 90;
  const heights = new Map(layers.map(layer => [layer, byLayer.get(layer)!.reduce((sum, item) => sum + layoutSize(item).height, 0) + Math.max(0, byLayer.get(layer)!.length - 1) * rowGap]));
  const tallest = Math.max(...heights.values()); const positions = new Map<string, { x: number; y: number }>(); let x = 60;
  for (const layer of layers) {
    const group = byLayer.get(layer)!; let y = 60 + (tallest - heights.get(layer)!) / 2; const width = Math.max(...group.map(item => layoutSize(item).width));
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
