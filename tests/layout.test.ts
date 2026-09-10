import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleDocument } from '../src/core/example';
import { expansionBounds, expansionOffset, layoutSize, nextNodePosition, tidyDiagram } from '../src/core/layout';
import { inspectDiagramGeometry } from '../src/core/geometry';
import { newNode, type Diagram } from '../src/core/model';
test('expanded references push neighboring nodes outside their visual container without editing coordinates', () => {
  const doc = structuredClone(exampleDocument); const d = doc.diagrams[0]; const reference = d.imports[0]; const store = d.nodes.find(n => n.id === 'store')!;
  assert.deepEqual(expansionOffset(doc, d, store), { x: 0, y: 0 }); reference.expanded = true;
  const originalX = store.position.x; const shift = expansionOffset(doc, d, store); const bounds = expansionBounds(doc, reference);
  assert.ok(store.position.x + shift.x > reference.position.x + bounds.width); assert.equal(store.position.x, originalX); assert.deepEqual(expansionOffset(doc, d, reference), { x: 0, y: 0 });
});
test('tidy layout forms deterministic relationship layers without overlapping nodes', () => {
  const diagram = structuredClone(exampleDocument.diagrams[0]); const tidy = tidyDiagram(diagram); const again = tidyDiagram(diagram);
  assert.deepEqual(tidy, again); const positions = new Map([...tidy.nodes, ...tidy.imports].map(item => [item.id, item.position]));
  assert.ok(positions.get('designer')!.x < positions.get('studio')!.x); assert.ok(positions.get('studio')!.x < positions.get('core')!.x); assert.ok(positions.get('core')!.x < positions.get('store')!.x);
  const items = [...tidy.nodes, ...tidy.imports];
  for (let left = 0; left < items.length; left++) for (let right = left + 1; right < items.length; right++) {
    const a = items[left]; const b = items[right]; const as = layoutSize(a); const bs = layoutSize(b);
    assert.ok(a.position.x + as.width <= b.position.x || b.position.x + bs.width <= a.position.x || a.position.y + as.height <= b.position.y || b.position.y + bs.height <= a.position.y, `${a.id} overlaps ${b.id}`);
  }
  const next = nextNodePosition(tidy); assert.ok(items.every(item => next.x !== item.position.x || next.y !== item.position.y));
});
test('geometry audit records ports and reports connector, label, and node collisions', () => {
  const diagram: Diagram = { id: 'collisions', name: 'Collision fixture', description: '', imports: [], nodes: [
    { ...newNode('source', 'component', { x: 0, y: 0 }), label: 'Source' },
    { ...newNode('target', 'component', { x: 600, y: 0 }), label: 'Target' },
    { ...newNode('obstruction', 'component', { x: 330, y: 0 }), label: 'Obstruction' },
    { ...newNode('below', 'component', { x: 0, y: 400 }), label: 'Below' },
  ], edges: [
    { id: 'blocked', source: 'source', target: 'target', kind: 'dependency', label: 'crossing label', sourceMultiplicity: '', targetMultiplicity: '' },
    { id: 'vertical', source: 'source', target: 'below', kind: 'dependency', label: 'down', sourceMultiplicity: '', targetMultiplicity: '' },
  ] };
  const audit = inspectDiagramGeometry(diagram); const blocked = audit.connectors.find(connector => connector.id === 'blocked')!; const vertical = audit.connectors.find(connector => connector.id === 'vertical')!;
  assert.deepEqual({ source: blocked.sourceSide, target: blocked.targetSide }, { source: 'right', target: 'left' }); assert.deepEqual({ source: vertical.sourceSide, target: vertical.targetSide }, { source: 'bottom', target: 'top' });
  assert.ok(audit.complaints.some(complaint => complaint.kind === 'label-node-overlap' && complaint.nodeId === 'obstruction'));
  assert.ok(audit.complaints.some(complaint => complaint.kind === 'connector-through-node' && complaint.nodeId === 'obstruction'));
});
