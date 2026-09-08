# Design decisions

The primary deliverable is a local developer tool with a browser interface and a filesystem-backed MCP service. Architecture documents should stay with the projects they describe. This is why the application does not require a hosted website, remote database or account.

## One model, multiple interfaces

The canonical document is a versioned JSON graph with stable IDs, descriptions, references, code links and layout. React Flow renders it, the UML codec reads/writes it, and MCP exchanges it. The same validation and structural diff modules run in the browser and server. Unknown model fields are rejected, so unsupported agent output cannot be silently lost.

A full UML implementation would require a much broader metamodel, dedicated renderers and semantic checks. Version 0.1 provides architecture-oriented elements and relationships with a clearly bounded syntax. This gives a useful bidirectional editing loop without pretending to be a conforming full UML tool.

## Composition and portability

A document owns multiple diagrams. An import points to another diagram ID within that document. Repeated references therefore share one model and cannot drift independently. Export includes all diagrams. Importing another project namespaces diagram IDs and copies the complete project snapshot, preserving internal references. There are no hidden external file/URL dependencies in the resulting graph. Live cross-project mounts and version pin updates are future work.

## Agent edits and review

Agents propose a complete candidate document or one diagram. A proposal includes its base revision, author and rationale. The server validates it and stores it without changing the current head. The studio renders the structural diff and accepts or rejects. Competing writers use a filesystem lock and base-revision comparison. This is optimistic concurrency, not collaborative character-level editing.

Diffs match stable IDs, ignore entity-array ordering, separate layout changes and propagate referenced-content impacts. They explain structural changes; they do not establish behavioral equivalence between UML models.

## Dependency choices and primary sources

- [React Flow core](https://reactflow.dev/pro): mature MIT-licensed canvas with pan/zoom, handles, selection and custom node/edge rendering. No paid Pro code is used.
- [Official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server): stdio transport, tool/resource registration and schema validation. The installed version is pinned by package-lock.json.
- [PlantUML class syntax](https://plantuml.com/class-diagram) and [component syntax](https://plantuml.com/en/component-diagram): familiar textual inspiration. No PlantUML runtime or source is included, and Atlas does not claim full parser compatibility.
- Zod: one runtime schema shared between the browser, server and MCP contracts.
- React/Vite/TypeScript: local UI and build tooling; the production Node server uses emitted ESM without a runtime TypeScript compiler.

Full dependency license texts and inventory are maintained separately in THIRD_PARTY_NOTICES.md and LICENSES/.
