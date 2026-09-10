import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleDocument } from '../src/core/example';
import { CONNECTOR_LABEL_NODE_GAP, expansionBounds, expansionOffset, layoutSize, nextNodePosition, tidyDiagram } from '../src/core/layout';
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
test('tidy prefers adjacent centerlines and reserves label clearance from endpoint nodes', () => {
  const node = (id: string, y: number) => ({ ...newNode(id, 'component', { x: 0, y }), label: id });
  const diagram: Diagram = { id: 'alignment', name: 'Alignment fixture', description: '', imports: [], nodes: [node('source-a', 0), node('source-b', 200), node('unrelated', 400), node('target-a', 0), node('target-b', 200)], edges: [
    { id: 'a', source: 'source-a', target: 'target-a', kind: 'dependency', label: 'sends validated architecture proposal', sourceMultiplicity: '', targetMultiplicity: '' },
    { id: 'b', source: 'source-b', target: 'target-b', kind: 'dependency', label: 'reads', sourceMultiplicity: '', targetMultiplicity: '' },
  ] };
  const tidy = tidyDiagram(diagram); const audit = inspectDiagramGeometry(tidy); const bounds = new Map(audit.nodes.map(item => [item.id, item.bounds])); const centerY = (id: string) => (bounds.get(id)!.top + bounds.get(id)!.bottom) / 2;
  assert.equal(centerY('source-a'), centerY('target-a')); assert.equal(centerY('source-b'), centerY('target-b'));
  const connector = audit.connectors.find(item => item.id === 'a')!; assert.ok(connector.label); assert.ok(connector.label!.bounds.left - bounds.get('source-a')!.right >= CONNECTOR_LABEL_NODE_GAP); assert.ok(bounds.get('target-a')!.left - connector.label!.bounds.right >= CONNECTOR_LABEL_NODE_GAP);
  assert.ok(!audit.complaints.some(complaint => complaint.kind === 'label-node-clearance'));
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
test('routing uses vertical ports for row-separated neighbors and horizontal ports for aligned neighbors', () => {
  const diagram: Diagram = { id: 'ports', name: 'Port fixture', description: '', imports: [], nodes: [
    { ...newNode('upper', 'component', { x: 0, y: 0 }), label: 'Upper' },
    { ...newNode('aligned', 'component', { x: 500, y: 0 }), label: 'Aligned' },
    { ...newNode('lower', 'component', { x: 500, y: 300 }), label: 'Lower' },
  ], edges: [
    { id: 'across', source: 'upper', target: 'aligned', kind: 'dependency', label: '', sourceMultiplicity: '', targetMultiplicity: '' },
    { id: 'diagonal', source: 'upper', target: 'lower', kind: 'dependency', label: '', sourceMultiplicity: '', targetMultiplicity: '' },
  ] };
  const audit = inspectDiagramGeometry(diagram); const across = audit.connectors.find(connector => connector.id === 'across')!; const diagonal = audit.connectors.find(connector => connector.id === 'diagonal')!;
  assert.deepEqual({ source: across.sourceSide, target: across.targetSide }, { source: 'right', target: 'left' }); assert.deepEqual({ source: diagonal.sourceSide, target: diagonal.targetSide }, { source: 'bottom', target: 'top' });
});
test('tidy preserves a forward review flow and routes its cycle-closing edge outside the graph', () => {
  const source = structuredClone(exampleDocument.diagrams.find(diagram => diagram.id === 'review_flow')!); const tidy = tidyDiagram(source); const audit = inspectDiagramGeometry(tidy);
  assert.deepEqual(tidyDiagram(tidy), tidy);
  const position = (id: string) => tidy.nodes.find(node => node.id === id)!.position;
  assert.ok(position('read').x < position('propose').x); assert.ok(position('propose').x < position('review').x); assert.ok(position('review').x < position('accept').x);
  const stale = audit.connectors.find(connector => connector.id === 'stale')!; assert.equal(stale.sourceSide, 'top'); assert.equal(stale.targetSide, 'top'); assert.ok(stale.labelPoint.y >= 20); assert.ok(stale.labelPoint.y < Math.min(...audit.nodes.map(node => node.bounds.top)));
  assert.deepEqual(audit.complaints, []);
});
