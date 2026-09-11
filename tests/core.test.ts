import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleDocument } from '../src/core/example';
import { emptyDocument, newNode, validateDocument, mergeDocument, PROJECT_OVERVIEW_ID, PROJECT_OVERVIEW_NAME, type ArchDocument } from '../src/core/model';
import { toUml, parseUml } from '../src/core/uml';
import { diffDocuments } from '../src/core/diff';
const fixture = () => structuredClone(exampleDocument);
test('every self-description diagram round trips through UML without data loss', () => {
  for (const diagram of fixture().diagrams) assert.deepEqual(parseUml(toUml(diagram)), diagram);
});
test('round trip preserves escaped text, all relationships, code ranges, snippets and nested imports', () => {
  const doc = fixture(); const d = doc.diagrams[0];
  d.name = 'Quotes " and\nnewlines'; d.nodes[0].label = 'Quote " and\\slash\nline';
  d.nodes[0].snippet = { language: 'python', code: 'print("Hello")\n# multiline' };
  d.nodes[0].codeLinks = [{ path: 'src/core/model.ts', startLine: 2, endLine: 7, symbol: 'Thing' }];
  for (const [i, kind] of ['association', 'dependency', 'generalization', 'realization', 'composition', 'aggregation', 'transition'].entries()) {
    d.edges.push({ id: `type_${i}`, source: 'designer', target: 'studio', kind: kind as any, label: 'A "quoted"\nlabel', sourceMultiplicity: '1', targetMultiplicity: '0..*' });
  }
  assert.deepEqual(parseUml(toUml(d)), d);
});
test('plain UML edits preserve stable IDs and existing metadata', () => {
  const old = fixture().diagrams[0]; const source = '@startuml overview\ntitle Renamed\nactor "Person" as designer\ncomponent "Studio" as studio\ndesigner --> studio : changed\n@enduml';
  const parsed = parseUml(source, old); assert.equal(parsed.edges[0].id, 'design'); assert.deepEqual(parsed.nodes[1].codeLinks, old.nodes[1].codeLinks); assert.equal(parsed.nodes[0].label, 'Person');
});
test('use cases are valid elements and round trip through UML', () => {
  const diagram = fixture().diagrams[0];
  diagram.nodes.push({ ...newNode('checkout', 'usecase'), label: 'Checkout' });
  assert.deepEqual(parseUml(toUml(diagram)), diagram);
});
test('unsupported syntax and unterminated blocks report errors', () => {
  assert.throws(() => parseUml('@startuml\nskinparam backgroundColor red\n@enduml'), /Line 2/);
  assert.throws(() => parseUml('@startuml\nclass A {\nfield'), /Unclosed/);
  assert.throws(() => parseUml('@startuml\nclass A'), /@enduml/);
});
test('rejects dangling endpoints, duplicate IDs, inheritance cycles and invalid ranges', () => {
  const d = fixture(); d.diagrams[0].edges[0].target = 'missing'; assert.throws(() => validateDocument(d), /endpoint/);
  const dupe = fixture(); dupe.diagrams[0].nodes.push(dupe.diagrams[0].nodes[0]); assert.throws(() => validateDocument(dupe), /Duplicate/);
  const cycle = fixture(); const graph = cycle.diagrams[0]; graph.edges = [{ id: 'a', source: 'designer', target: 'studio', kind: 'generalization', label: '', sourceMultiplicity: '', targetMultiplicity: '' }, { id: 'b', source: 'studio', target: 'designer', kind: 'generalization', label: '', sourceMultiplicity: '', targetMultiplicity: '' }]; assert.throws(() => validateDocument(cycle), /generalization cycle/);
  const range = fixture(); range.diagrams[0].nodes[0].codeLinks = [{ path: 'src/a', startLine: 9, endLine: 2 }]; assert.throws(() => validateDocument(range), /End line/);
});
test('import validation detects cycles across reusable diagrams and missing references', () => {
  const d = fixture(); d.diagrams[1].imports.push({ id: 'recursive', diagramId: 'overview', label: 'Cycle', position: { x: 0, y: 0 }, expanded: false }); assert.throws(() => validateDocument(d), /import cycle/);
  d.diagrams[1].imports[0].diagramId = 'not_found'; assert.throws(() => validateDocument(d), /unknown imported/);
});
test('project import namespaces all diagrams and rewrites nested references', () => {
  const d = mergeDocument(fixture(), fixture(), 'shared'); assert.equal(d.diagrams.length, 6); assert.equal(d.diagrams[3].imports[0].diagramId, 'shared_model_core');
  assert.throws(() => mergeDocument(d, fixture(), 'shared'), /Duplicate/);
});
test('diff distinguishes layout, label changes, edge rewiring, addition and deletion independent of array order', () => {
  const before = fixture(); const after = fixture(); after.diagrams[0].nodes.reverse(); assert.deepEqual(diffDocuments(before, after), []);
  after.diagrams[0].nodes.find(n => n.id === 'designer')!.position.x += 100;
  after.diagrams[0].nodes.find(n => n.id === 'studio')!.label = 'Visual editor';
  after.diagrams[0].edges.find(e => e.id === 'design')!.target = 'mcp';
  after.diagrams[0].nodes.push(newNode('cache', 'database'));
  after.diagrams[0].edges = after.diagrams[0].edges.filter(e => e.id !== 'persist');
  const diff = diffDocuments(before, after); assert.equal(diff.find(c => c.id === 'designer')!.kind, 'layout'); assert.deepEqual(diff.find(c => c.id === 'studio')!.fields, ['label']); assert.equal(diff.find(c => c.id === 'design')!.kind, 'modified'); assert.equal(diff.find(c => c.id === 'cache')!.kind, 'added'); assert.equal(diff.find(c => c.id === 'persist')!.kind, 'removed');
});
test('schema rejects unknown data instead of silently discarding it', () => {
  assert.throws(() => validateDocument({ ...fixture(), typo: true }), /Unrecognized/);
});
test('project overview has one canonical name, position, and reference titles', () => {
  const blank = emptyDocument(); assert.equal(blank.diagrams[0].id, PROJECT_OVERVIEW_ID); assert.equal(blank.diagrams[0].name, PROJECT_OVERVIEW_NAME);
  const source = fixture(); const overview = { id: PROJECT_OVERVIEW_ID, name: PROJECT_OVERVIEW_NAME, description: '', nodes: [], edges: [], imports: [{ id: 'system', diagramId: 'overview', label: 'System architecture', position: { x: 0, y: 0 }, expanded: false }] };
  const valid = { ...source, diagrams: [overview, ...source.diagrams] }; validateDocument(valid);
  assert.throws(() => validateDocument({ ...valid, diagrams: [source.diagrams[0], overview, ...source.diagrams.slice(1)] }), /must be the first/);
  assert.throws(() => validateDocument({ ...valid, diagrams: [{ ...overview, name: 'Start here' }, ...source.diagrams] }), /must be named Project Overview/);
  assert.throws(() => validateDocument({ ...valid, diagrams: [{ ...overview, imports: [{ ...overview.imports[0], label: 'How Atlas fits together' }] }, ...source.diagrams] }), /label must match diagram name System architecture/);
});
test('a representative generated model round trips repeatedly', () => {
  const doc: ArchDocument = { schemaVersion: 1, id: 'generated', name: 'Generated', diagrams: [{ id: 'root', name: 'Generated diagram', description: 'Round trip', nodes: Array.from({ length: 80 }, (_, i) => ({ ...newNode(`node_${i}`, i % 2 ? 'class' : 'component'), label: `Element ${i}`, members: i % 2 ? [`+field_${i}: String`] : [], position: { x: i * 23, y: i ? i * -17 : 0 } })), edges: [], imports: [] }] };
  let diagram = doc.diagrams[0]; for (let i = 0; i < 3; i++) diagram = parseUml(toUml(diagram)); assert.deepEqual(diagram, doc.diagrams[0]);
});
test('changes inside a reused diagram propagate to containing references, but layout alone does not', () => {
  const before = fixture(); const after = fixture(); after.diagrams[1].nodes[0].label = 'Model';
  const changes = diffDocuments(before, after); assert.equal(changes.find(c => c.id === 'core')?.kind, 'modified'); assert.deepEqual(changes.find(c => c.id === 'core')?.fields, ['referencedContent']);
  after.diagrams[1].nodes[0].label = before.diagrams[1].nodes[0].label; after.diagrams[1].nodes[0].position.x++;
  assert.equal(diffDocuments(before, after).filter(c => c.id === 'core').length, 0);
});
test('project import supports maximum-length diagram identifiers without breaking references', () => {
  const imported = fixture(); const longId = 'd'.repeat(100); imported.diagrams[1].id = longId; imported.diagrams[0].imports[0].diagramId = longId;
  const merged = mergeDocument(fixture(), imported, 'n'.repeat(100));
  assert.ok(merged.diagrams.every(d => d.id.length <= 100));
  assert.equal(merged.diagrams[3].imports[0].diagramId, merged.diagrams[4].id);
});
