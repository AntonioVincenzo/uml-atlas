import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, ConflictError, LAYOUT_REVISION_RATIONALE } from '../src/server/store';
import { exampleDocument } from '../src/core/example';
async function setup(t: any) { const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-test-')); t.after(() => rm(root, { recursive: true, force: true })); const store = new Store(root); const head = await store.init(exampleDocument); return { root, store, head }; }
test('proposal acceptance records rationale and immutable history', async t => {
  const { store, head } = await setup(t); const doc = structuredClone(head.document); doc.diagrams[0].nodes[0].label = 'Architect';
  const { proposal, changes } = await store.propose(doc, head.revision, 'Agent', 'Clarify actor responsibility'); assert.equal(changes.length, 1); assert.equal((await store.read()).revision, head.revision);
  const accepted = await store.review(proposal.id, 'accept'); assert.notEqual(accepted.revision, head.revision); assert.equal(accepted.rationale, proposal.rationale); assert.equal((await store.proposal(proposal.id)).status, 'accepted'); assert.equal((await store.revision(head.revision)).document.diagrams[0].nodes[0].label, 'Designer'); assert.equal((await store.history()).length, 2);
  await assert.rejects(() => store.review(proposal.id, 'accept'), ConflictError);
});
test('layout commits are verified, standardized, addressable, and hidden from logical history', async t => {
  const { store, head } = await setup(t); const layout = structuredClone(head.document); layout.diagrams[0].nodes[0].position.x += 80;
  const saved = await store.commitLayout(layout, head.revision, 'Designer'); assert.equal(saved.revisionType, 'layout'); assert.equal(saved.rationale, LAYOUT_REVISION_RATIONALE);
  assert.equal((await store.revision(saved.revision)).revision, saved.revision); assert.equal((await store.history()).length, 1);
  const logical = structuredClone(saved.document); logical.diagrams[0].nodes[0].label = 'Changed'; await assert.rejects(() => store.commitLayout(logical, saved.revision, 'Designer'), /logical changes/);
});
test('stale proposal and stale direct save cannot overwrite a newer revision', async t => {
  const { store, head } = await setup(t); const candidate = structuredClone(head.document); candidate.name = 'Candidate'; const { proposal } = await store.propose(candidate, head.revision, 'Agent', 'Rename');
  const newer = structuredClone(head.document); newer.name = 'Human version'; await store.commit(newer, head.revision, 'Human', 'Rename manually');
  await assert.rejects(() => store.review(proposal.id, 'accept'), ConflictError); await assert.rejects(() => store.commit(candidate, head.revision, 'Agent', 'Stale'), ConflictError); assert.equal((await store.read()).document.name, 'Human version'); assert.equal((await store.proposal(proposal.id)).status, 'pending');
});
test('simultaneous clients using the same revision produce exactly one commit', async t => {
  const { root, store, head } = await setup(t); const other = new Store(root); const a = structuredClone(head.document); const b = structuredClone(head.document); a.name = 'A'; b.name = 'B';
  const results = await Promise.allSettled([store.commit(a, head.revision, 'A', 'A edit'), other.commit(b, head.revision, 'B', 'B edit')]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.filter(r => r.status === 'rejected').length, 1); assert.equal((await store.history()).length, 2);
});
test('rejecting a proposal and invalid candidates leave the current model unchanged', async t => {
  const { store, head } = await setup(t); const { proposal } = await store.propose(head.document, head.revision, 'Agent', 'No op'); await store.review(proposal.id, 'reject'); assert.equal((await store.read()).revision, head.revision);
  const invalid = structuredClone(head.document); invalid.diagrams[0].edges[0].target = 'absent'; await assert.rejects(() => store.commit(invalid, head.revision, 'Agent', 'Invalid'), /endpoint/); assert.deepEqual(await store.read(), head);
});
test('code regions are bounded and path traversal plus symlink escapes are rejected', async t => {
  const { root, store } = await setup(t); await writeFile(path.join(root, 'code.py'), 'first\nsecond\nthird\n');
  assert.equal((await store.code('code.py', 2, 3)).code, 'second\nthird'); await assert.rejects(() => store.code('code.py', 10), /stale/); await assert.rejects(() => store.code('code.py', 0), /range/);
  const external = await mkdtemp(path.join(os.tmpdir(), 'atlas-outside-')); t.after(() => rm(external, { recursive: true, force: true })); await writeFile(path.join(external, 'outside.txt'), 'outside'); await symlink(external, path.join(root, 'escape'));
  await assert.rejects(() => store.code('escape/outside.txt', 1), /outside the workspace/); await assert.rejects(() => store.code(path.relative(root, path.join(external, 'outside.txt')), 1), /outside the workspace/); await assert.rejects(() => store.code(path.join(root, 'code.py'), 1), /relative/);
});
test('a portable head copied without local history can be read, proposed against and committed', async t => {
  const { head } = await setup(t); const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-import-')); t.after(() => rm(root, { recursive: true, force: true })); await writeFile(path.join(root, 'architecture.json'), JSON.stringify(head)); const store = new Store(root); await store.init();
  assert.equal((await store.revision(head.revision)).revision, head.revision); const candidate = structuredClone(head.document); candidate.name = 'Imported'; const { proposal } = await store.propose(candidate, head.revision, 'Agent', 'Portable'); await store.review(proposal.id, 'accept'); assert.equal((await store.history()).length, 2);
});
test('revision IDs cannot escape metadata paths', async t => { const { store } = await setup(t); await assert.rejects(() => store.revision('../../etc/passwd'), /Invalid/); await assert.rejects(() => store.proposal('../../etc/passwd'), /Invalid/); });
