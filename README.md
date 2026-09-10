# Atlas architecture studio

Atlas is a local visual architecture editor with a shared JSON model, round-trip UML text, reusable diagrams, structural diffs, and an MCP server. The browser and agents use the same validator and diff engine. No cloud account, paid feature, API key, database service, Java runtime, or language-specific project setup is required.

The [side-by-side UML notation report](public/uml-comparison.html) compares conventional UML 2.5.1 visualization with Atlas's current equivalents, including a fidelity assessment and implementation roadmap. It is served at `/uml-comparison.html` while Atlas is running.

The [repository decontextualization study](research/repository-decontextualization/REPORT.md) defines a staged, evidence-preserving route from source repositories to structured pseudocode and reviewable Atlas diagrams. It includes a runnable inventory/quality slice, the proposed repository IR schemas, pipeline contracts, and candidate-tool licensing notes.

The [Visua Loom case study](research/case-studies/visua-loom.arch.json) applies that boundary in practice: systems, responsibilities, behavior, and outputs form the architecture, while source locations remain optional evidence links.

## Run it

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4311**. The checked-in `architecture.json` describes Atlas itself. The UI is served by the same local process as the filesystem API.

For development with hot reload:

```sh
npm run dev
```

Open http://127.0.0.1:5173. The development launcher starts both Vite and the local API. API source changes require restarting the launcher.

## Use it in any project

```sh
node /absolute/path/to/atlas/dist/server/cli.js serve --workspace /path/to/your/project
```

The architecture and history live inside the selected project. The architecture is independent of that project's programming language. Use **Switch project** in the top bar to open an onboarded project or register another absolute directory without restarting Atlas. The persistent local catalog lives at `~/.atlas/projects.json`. Each directory has an isolated `architecture.json`, revision history, proposals, and code-link root. The MCP configuration shown by **Connect agent** follows the currently selected project.

A new workspace starts empty. Add `--demo` to seed a new workspace with the initial Atlas architecture; existing files are never overwritten by initialization.

A local distributable can be built without publishing:

```sh
npm run package
npm install -g ./artifacts/atlas-architecture-studio-0.1.0.tgz
atlas serve --workspace /path/to/project
atlas mcp --workspace /path/to/project
```

Choose your own license for the original code before public distribution. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Design and review

1. Add an element, choose its UML kind, and edit its properties in the inspector. Drag nodes to arrange them, or use **Tidy layout** to form deterministic left-to-right relationship layers, prefer shared centerlines for directly connected elements, reserve clearance between labels and endpoint nodes, and report any remaining routing complaints. Fresh graphs authored in UML source receive this layout automatically. Hover over a node to reveal its top, right, bottom, and left connection handles, then drag between handles to create the selected relationship type. Click an edge to edit its endpoints, label, or multiplicities.
2. Switch to **UML source** or **JSON** to edit the same diagram as text. **Apply to diagram** validates the candidate before updating the canvas. The last applied model remains visible while text is incomplete. Stable IDs survive edits. Undo and redo apply to local model edits; un-applied source has its own discard action.
3. Create reusable diagrams in the library. **Embed diagram** inserts a live reference within this document. Expand a reference in place or open its source. The same part can appear in multiple wholes. Nested imports are checked for cycles. Expanded children are read only; open the source to edit them.
4. **Export project** writes a portable `.arch.json` document. **Import project diagrams** accepts that file or another project's `architecture.json`, namespaces all diagram IDs, and preserves references between imported diagrams. Imports are snapshots copied into the destination; they do not watch the original project. Re-importing makes another independent snapshot. Code paths remain relative and may need retargeting in the destination.
5. **Review** compares your draft with the saved revision. Green means added, red removed, and amber modified. Layout changes are counted separately. Changes within referenced diagrams propagate to their containing references. Expand a change row to see exact JSON before and after. Select another diagram to compare. Export the structural diff as JSON.
6. **Save revision** records author and rationale for logical design changes. A position-only draft becomes **Save layout**: the server verifies that every structural change is layout-only, applies a standard rationale, and omits that revision from visible history. Clicking a history entry compares that logical revision with the current saved model. Pending agent proposals appear in the left rail. Accepting requires that the proposal's base revision still match, and that your local draft is saved or discarded.

Node properties also support members, stereotypes, code paths with line ranges, and inert code/pseudocode snippets. Code previews read up to 200 lines from a file inside the selected workspace. Files and symlinks outside it are rejected. Snippets are never executed. Paths and line numbers do not automatically track refactors.

## Connect an agent

The MCP server uses standard stdio. Run it separately from the UI; both processes share the selected workspace safely. It does not need the HTTP server to be running to read or propose.

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": [
        "/absolute/path/to/atlas/dist/server/cli.js",
        "mcp",
        "--workspace",
        "/absolute/path/to/your/project"
      ]
    }
  }
}
```

If installed on PATH, use `"command": "atlas"` and omit the first path argument. Some hosts require an absolute Node executable path. `docs/mcp.example.json` contains a portable template; replace its placeholder paths for your checkout. This file does not automatically modify any agent's settings.

The usual prompt is:

> Use Atlas to read the current architecture. Preserve stable IDs. Propose the design change with a concise rationale and the current base revision. I will inspect the proposal in the studio.

Tools: `get_architecture`, `get_diagram`, `analyze_diagram_layout`, `validate_architecture`, `propose_architecture`, `propose_diagram`, `list_proposals`, `get_proposal`, `get_history`, `compare_revisions`, and `read_code_region`. `analyze_diagram_layout` returns deterministic node, connector, and label geometry plus typed collision complaints. Resources: `atlas://architecture` and `atlas://schema`. Detailed contract and examples: [MCP guide](docs/MCP.md).

Agent writes create proposals; the MCP surface does not expose acceptance. Atlas detects proposals every four seconds. If another writer saves first, stale acceptance fails instead of overwriting it. Refresh and create a new proposal; Atlas does not automatically merge conflicting designs.

For a real agent round-trip demonstration against a workspace containing the initial Atlas demo:

```sh
node scripts/demo-proposal.mjs /path/to/workspace
```

This uses the actual MCP client SDK, reads the live model, and submits a self-description refinement for review. It does not accept it. The current checkout already contains an accepted self-design refinement in local history.

## Files and architecture

- `architecture.json`: current revision envelope, including the complete portable document; suitable for Git.
- `.atlas/revisions/*.json`: revision snapshots.
- `.atlas/proposals/*.json`: candidates and review status.
- `.atlas/write.lock/`: temporary cross-process writer lock.
- `examples/self/`: exported self-description, UML sources, and an example structural diff.
- `docs/architecture.schema.json`: JSON Schema for interchange. Graph invariants are additionally enforced in code.
- `src/core/`: model, validation, text conversion, layout helpers, structural diff.
- `src/server/`: atomic file store, loopback HTTP API, stdio MCP server, and CLI.
- `src/ui/`: React Flow canvas, source editor, inspector, and review workflow.

This repository ignores `.atlas/` because its contents are local working history. Copy that directory too if you want to preserve review history when moving machines. The current `architecture.json` works without it; Atlas reconstitutes the head snapshot on initialization. Keep the whole workspace backed up if revision history matters. Do not edit a live `architecture.json` behind Atlas; use the validated UI or MCP proposal path.

Unsaved model/source drafts remain in browser memory. Save a revision to persist them; exporting can also preserve a draft. The app warns on closing with unsaved edits. It does not provide crash recovery for unsaved drafts.

## Scope of version 0.1

Supported: component, class, interface, actor, usecase, package, database, service, state, note, and enum elements; association, dependency, generalization, realization, composition, aggregation, and transition relationships; members, stereotypes and multiplicities; reusable diagram references; code links and snippets; structural diffs and local revision review; isolated switching among local project workspaces.

This is a documented **PlantUML-style subset with Atlas extensions**, not a full PlantUML renderer or a UML 2.5 conformance implementation. It validates graph structure, imports and inheritance cycles, not every UML metamodel constraint or behavioral property. The diff compares model structure, not formal behavioral equivalence. Specialized node renderings are useful architecture views, not complete UML diagram-family editors.

Not implemented: sequence/activity timing semantics, state hierarchy, ports and provided/required interface semantics, PlantUML preprocessing, arbitrary PlantUML import, XMI, automatic code extraction or drift tracking, automatic merge/rebase, synchronized multi-user cursors, remote MCP authentication, PNG/SVG export, and full keyboard graph construction. Nested references may be modeled to eight levels; the canvas expands one level at a time. Use source/JSON for keyboard-based graph authoring. The desktop workspace is the primary UI; narrow windows offer a compact canvas and selection inspector.

## Validation and release notes

```sh
npm run typecheck
npm test
npm run build
npm run licenses
```

Tests exercise round trips, graph invariants, structural diffs, imported references, concurrent writers, stale proposals, code path boundaries, HTTP origin guards, and a real stdio MCP client. See [verification notes](docs/VERIFICATION.md) for browser flows exercised.

License texts, third-party notices and an exact installed dependency inventory are collected in `LICENSES/`. The core UI/MCP libraries are MIT. Lightning CSS is an MPL-2.0 build dependency; redistribution of that compiler has obligations distinct from distribution of the generated UI. The original Atlas code is intentionally `UNLICENSED`: public visibility permits inspection but does not grant reuse or redistribution rights. Assign a project license before an open-source release.

The server binds to `127.0.0.1` and checks host/origin on the HTTP API. It is a trusted local developer tool, not an authenticated multi-tenant service. Do not expose it to the public network. Atomic renames and a writer lock prevent overlapping ordinary saves; this is not a power-loss durable database. If a writer is forcibly killed while holding the lock, stop all Atlas processes and remove `.atlas/write.lock` before restarting.
