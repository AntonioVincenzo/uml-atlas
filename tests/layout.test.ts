import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleDocument } from '../src/core/example';
import { expansionBounds, expansionOffset } from '../src/core/layout';
test('expanded references push neighboring nodes outside their visual container without editing coordinates', () => {
  const doc = structuredClone(exampleDocument); const d = doc.diagrams[0]; const reference = d.imports[0]; const store = d.nodes.find(n => n.id === 'store')!;
  assert.deepEqual(expansionOffset(doc, d, store), { x: 0, y: 0 }); reference.expanded = true;
  const originalX = store.position.x; const shift = expansionOffset(doc, d, store); const bounds = expansionBounds(doc, reference);
  assert.ok(store.position.x + shift.x > reference.position.x + bounds.width); assert.equal(store.position.x, originalX); assert.deepEqual(expansionOffset(doc, d, reference), { x: 0, y: 0 });
});
