# Verification record

## Automated checks

The production UI and server pass TypeScript checking and build from the locked dependencies. The test suite includes:

- Exact UML/JSON round trips for the self-description, escaped text, code links, snippets, multiplicities and all relationship kinds.
- A generated 80-node model round-tripped repeatedly.
- Unsupported text, invalid IDs, duplicate IDs, dangling endpoints, invalid line ranges, import cycles and inheritance cycles.
- Structural additions, removals, label changes, rewired edges, member changes, layout-only changes, array reordering, and propagated reference impacts.
- Namespaced project imports with internal references preserved.
- Expansion layout that keeps unrelated components outside reference containers without mutating their saved coordinates.
- Atomic save behavior with two competing clients; exactly one writer wins against the same base revision.
- Proposal acceptance/rejection and prevention of stale overwrites.
- Portable heads opened without prior local history.
- Code range bounds, traversal rejection, and symlink escape rejection.
- HTTP reads/writes, host/origin protections and malformed/stale request handling.
- A real official-SDK stdio MCP client that discovers tools, reads, proposes UML, inspects diffs, sees acceptance, reads history and consumes the schema resource.

Run `npm test` to reproduce. Tests create isolated temporary workspaces and clean them up.

## Browser walkthrough

Checked in the Codex in-app browser against the production build on localhost:

1. Opened the self-description and verified rendered nodes, edges, library, toolbar and inspector.
2. Applied a UML label edit; reviewed the before/after canvases and exact `label` change record.
3. Saved a revision with a rationale; verified the revision appeared in history and the draft became clean.
4. Expanded a reusable diagram; verified its members and relationships appear, and used undo to restore the compact view.
5. Opened the shared source diagram, selected its document class, and opened its linked source region inside the studio.
6. Used a real MCP client process to propose a schema correction to Atlas's own model, including a class and composition relationship.
7. Verified the proposal's rationale, added/modified/layout counts, UML composition marker, and impact on the containing diagram reference.
8. Accepted the proposal through the UI; verified the updated class model, clean saved state, new revision, and cleared pending queue.
9. Created a temporary diagram, added and named two components, connected their handles, and confirmed the labeled dependency appeared in UML source.
10. Imported the exported self-description through the file picker, verified all three diagrams and their reference were copied, and restored the saved design using the in-app discard dialog.
11. Checked the browser console; no error or warning entries were recorded during those flows.
12. Opened the UML visual comparison report from the production server and verified its title, source links, status legend, relationship matrix, diagram-family coverage, and original SVG comparison plates.
13. Checked the report at the in-app browser's 639-pixel width; the UML and Atlas plates remain side by side, while wider page grids collapse for readable navigation.
14. Verified the revised node grammar in the production canvas: class names are centered inside darker three-compartment nodes; generic kinds use centered stereotypes; actor cards omit the kind label; and a temporary enumeration showed the centered `«enumeration»` header plus one literal compartment. The temporary element was discarded and the saved architecture restored.

Desktop inspector behavior and a narrow 639-pixel viewport were inspected. This is a functional prototype validation, not an exhaustive accessibility audit, multi-browser certification or large-model performance benchmark.

## Packaged installation

The generated tarball was installed into an isolated temporary directory with only runtime dependencies. Its CLI initialized a different workspace, its production HTTP server served the UI and UML comparison report, and a real stdio client discovered all 10 MCP tools and read the model. Run `npm run package` followed by `npm run test:package` to repeat this check. No global installation is required for verification.
