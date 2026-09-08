import type { ArchDocument, Diagram, DiagramImport } from './model.js';
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
