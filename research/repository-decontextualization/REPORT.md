# Recovering a language-neutral architecture model from a repository

Status: research-backed working strategy, September 2026
Audience: Atlas implementers and reviewers
Decision horizon: build an extensible analysis pipeline; do not promise complete semantic recovery

## Executive finding

A repository can be dissolved into a useful, language-neutral model, but not into a single complete or context-free truth. The tractable solution is a staged analysis in which each stage makes a narrower claim and records what evidence supports it. Files, hashes, declarations, source spans, and many dependency relations are recoverable with high repeatability. Control flow, data flow, and dynamic calls are recoverable to different degrees depending on language and build context. Architectural boundaries, responsibilities, and intent are hypotheses that must remain distinguishable from extracted facts.

The proposed artifact is therefore a **Repository Intermediate Representation (RIR)**, not generic pseudocode alone. RIR is an attributed graph with six epistemic states: `observed`, `parsed`, `resolved`, `derived`, `inferred`, and `asserted`. A structured behavior subgraph can be rendered as pseudocode, while an accepted architecture projection can be rendered as UML in Atlas. The source graph remains canonical so that a human or agent can inspect the evidence behind any diagram element.

This approach is workable because it composes methods that are already proven in narrower domains. OMG KDM defines source, code, action, data, platform, structure, conceptual, and other layers for software modernization, including normative machine-readable metamodel files.[^kdm] Code Property Graphs combine abstract syntax, control flow, and program dependence in one language-neutral attributed multigraph.[^cpg] SCIP and Kythe demonstrate language-neutral interchange for symbols, definitions, references, and relations while delegating language semantics to indexers.[^scip][^kythe] Software Reflexion Models show why architecture recovery should compare a source model to an explicit high-level hypothesis and iteratively report convergence, divergence, and absence.[^reflexion]

The recommendation is to implement the pipeline incrementally:

1. Ship deterministic inventory, manifests, provenance, stable schemas, and quality reports first.
2. Add syntax adapters, initially Tree-sitter based, without treating syntax as semantics.
3. Prefer compiler-produced SCIP or equivalent semantic indexes when available.
4. Add a small structured behavior IR and preserve unsupported operations as opaque records.
5. Infer architecture as scored candidates with evidence and contradictions.
6. Project accepted candidates into Atlas through MCP, with traceability and structural diffs.

The repository now includes an executable first slice for stages 1 and 6, the proposed schemas, and the complete script contract. Running `npm run analyze:repo` inventories this repository twice, compares the byte-level outputs for determinism, and emits a quality report under `.repo-analysis/current/`.

## The actual problem

“Convert code to pseudocode” combines several different problems:

- **Lexical recovery** identifies files, encodings, tokens, comments, and spans.
- **Syntactic recovery** determines declarations, expressions, statements, and nesting.
- **Semantic recovery** resolves names, types, overloads, dispatch targets, macros, generated code, and dependencies.
- **Behavior recovery** models control, data, state changes, effects, concurrency, and failures.
- **Architecture recovery** groups program entities into purposeful subsystems and names their roles.
- **Representation** selects what to retain, erase, or expose in pseudocode and UML.
- **Validation** determines whether the output is faithful enough for a stated use.

These stages have different evidence and failure modes. Collapsing them into a single transformation loses the ability to tell a parser fact from an architectural guess. A generic AST is useful inside the pipeline, but it is not a sufficient final model: it says little about cross-file identity, resolved calls, runtime wiring, architectural grouping, or why information was discarded.

The word “decontextualize” also needs a limit. Some context is accidental, such as punctuation, local variable spelling, or a language’s exact loop syntax. Other context determines meaning: compiler flags, conditional compilation, module resolution, framework configuration, dependency versions, runtime injection, database migrations, and deployment manifests. The pipeline should remove accidental language syntax while carrying semantic context forward as explicit records.

## Degree of solvability

The following ratings are engineering judgments for a static, repeatable pipeline. They assume access to source, dependency metadata, and—where required—a reproducible build.

| Question | Practical recoverability | Conditions and limits |
|---|---:|---|
| Which artifacts exist and what are their exact bytes? | 0.99 | Filesystem access, defined ignore policy, hashes; symlink and submodule policy must be explicit. |
| Which language and role does each file have? | 0.90 | Extensions and manifests are strong signals; generated, embedded, templated, and polyglot files need adapters. |
| Which declarations and lexical spans exist? | 0.90–0.99 | A compatible parser can usually recover these even from partially invalid files; grammar coverage must be measured. |
| Which symbol does a reference denote? | 0.65–0.99 | Near the upper bound with the correct compiler/indexer and build; lower with missing dependencies, macros, dynamic lookup, or generated sources. |
| Which functions may be called? | 0.40–0.95 | Direct static calls are easy; virtual dispatch, higher-order functions, reflection, monkey patching, RPC, and dependency injection expand candidate sets. |
| What is the control-flow graph? | 0.75–0.99 | High for supported functions; exceptions, async lowering, generators, macros, and implicit cleanup complicate equivalence. |
| What data and state may flow? | 0.30–0.90 | Precision depends on alias, heap, context, path, and interprocedural sensitivity; scalable analyses intentionally approximate. |
| What behavior is equivalent across languages? | 0.20–0.85 | Narrow operation classes can be normalized; full equivalence is not a realistic general objective. |
| What are the system’s components and responsibilities? | 0.30–0.85 | Build modules, deployables, namespaces, APIs, and persistent stores are evidence; intent and useful granularity remain task-dependent. |
| Is the recovered architecture useful? | 0.20–0.95 | “Useful” requires a named task, such as onboarding, change impact, security boundaries, or design conformance. |

Static analysis is normally an abstraction rather than a replay of all executions. The foundational abstract-interpretation formulation explicitly obtains information by computing in an abstract domain and accepts that the result can be incomplete or imprecise.[^abstract-interpretation] That is the right mental model here: select an abstraction that preserves the properties Atlas needs, expose the loss, and never equate an over-approximation with observed runtime behavior.

Three ceilings remain even with excellent tooling:

1. **Open-world ceiling.** The repository may not contain services, generated artifacts, runtime plugins, infrastructure, schemas, or dependencies that determine behavior.
2. **Static ceiling.** Reflection, evaluation of generated strings, native calls, runtime dispatch, and environment-dependent configuration may be undecidable or economically impractical to resolve precisely.
3. **Intent ceiling.** Code structure does not uniquely determine the architecture a person finds explanatory. The same call graph can support views by deployment, domain, data ownership, trust boundary, or team.

These ceilings make uncertainty a part of the data model, rather than an exception emitted to a log.

## Representation strategy

### Preserve a source model and lower through layers

The proposed RIR borrows KDM’s layered scope without implementing the whole 372-page standard. KDM is strong evidence that inventory, program elements, behavior, data, platform, and conceptual structures belong in related but separate packages; its source model includes inventory, source regions, dependencies, and traceability, while its code model includes modules, callable units, data elements, types, inheritance, macros, and imports.[^kdm] Atlas should use a smaller JSON-native profile and publish an explicit mapping to KDM concepts later.

Each record has:

- a stable record ID;
- a record kind and normalized properties;
- an epistemic status and confidence;
- a producing tool and versioned rule;
- source spans or evidence record IDs;
- contradicting evidence where relevant;
- language-specific extensions that prevent forced information loss;
- loss records that say what the lowering did not preserve.

The six statuses have strict meanings:

| Status | Meaning | Example |
|---|---|---|
| `observed` | Directly read from controlled input | File bytes and SHA-256 digest |
| `parsed` | Recognized according to a named grammar | A TypeScript `class_declaration` span |
| `resolved` | Bound by a semantic tool and build context | An occurrence resolves to a symbol |
| `derived` | Computed deterministically from other records | A package dependency aggregated from resolved references |
| `inferred` | Best explanation selected among alternatives | A directory cluster is probably a service |
| `asserted` | Supplied or accepted by a human/agent | “Billing owns these modules” |

Confidence does not replace status. An observed file hash has confidence 1.0. A compiler-resolved reference can also have confidence 1.0 within its captured build context, but it is still `resolved`, because its truth depends on that context. An architectural assertion can be authoritative for design even if it diverges from the implementation.

### Use syntax trees as evidence, not as the universal ontology

Tree-sitter is a strong default for tolerant concrete-syntax recovery. It constructs concrete syntax trees, updates them incrementally, and is designed to keep producing useful results in the presence of syntax errors.[^tree-sitter] Its query language can match node types and named fields, while `ERROR` and `MISSING` nodes make parse failure measurable instead of silently dropping text.[^tree-sitter-queries]

Every supported language still needs a grammar lock and a lowering adapter. Node names and grammar choices differ. A query such as “all methods” is not automatically portable. The adapter must map native syntax into RIR while retaining the native node kind and source span in `languageExtensions`.

Semgrep offers useful corroboration for the generic-AST approach: its engine converts multiple concrete syntax trees into a generic AST that is roughly the union of supported-language ASTs, and it has added equivalences, limited constant propagation, type inference, and alias resolution over time.[^semgrep-generic] That history is also a warning. A common AST grows as language exceptions are encountered; it does not eliminate language expertise. Atlas should use an extensible sum of normalized constructs plus opaque fallbacks, not require every language to fit a closed minimal grammar.

### Separate symbol interchange from parsing

SCIP is the recommended interchange format when a mature indexer exists. A SCIP index contains documents, occurrences with source ranges and roles, and symbols; the indexer documentation emphasizes deterministic output and snapshot testing.[^scip] The available ecosystem covers several major language families, but coverage and build requirements differ by indexer. Atlas should import SCIP into RIR rather than expose SCIP as its only internal model.

Kythe is a richer alternative for large polyglot environments. Its graph separates source anchors from semantic nodes and connects them with labeled edges such as definitions, references, calls, and inheritance.[^kythe] Kythe’s VName identity model is useful for corpus-level indexing, but its own schema notes that a signature needs to be unique and need not remain stable across edits. Atlas needs an additional identity-correlation layer for human-facing diffs.

Language Server Protocol responses are a fallback interface, especially where no exportable index exists. Definitions, references, symbols, call hierarchy, type hierarchy, implementations, semantic tokens, diagnostics, and monikers can contribute facts.[^lsp] LSP servers are interactive services, and implementations may return partial or view-oriented results. Their results should be marked by capability and server version, not assumed equivalent to a compiler database.

### Make behavior structured and render pseudocode later

Pseudocode should be a view over structured operations. Text is difficult to diff reliably, awkward to query, and likely to hide unsupported semantics. The canonical behavior record uses a deliberately small opcode family:

```json
{
  "recordType": "operation",
  "id": "op:checkout.submit:7",
  "callableId": "callable:checkout.submit",
  "blockId": "block:checkout.submit:success",
  "order": 7,
  "opcode": "call",
  "operands": ["symbol:payments.authorize", "value:total"],
  "resultId": "value:authorization",
  "effects": ["network"],
  "loss": ["remote implementation is outside the repository"],
  "epistemic": {
    "status": "resolved",
    "confidence": 1,
    "method": "scip-typescript@locked-version"
  },
  "trace": {
    "evidenceIds": ["occurrence:src/checkout.ts:814:831"]
  }
}
```

The renderer can express this as `authorization = call payments.authorize(total)`. A different renderer can create a UML sequence message or activity edge without reparsing English-like text.

Code Property Graphs are the best existing model for the behavior stage. The CPG specification defines an attributed, directed multigraph with syntax, control-flow, dominator, and program-dependence layers, and permits overlays for additional abstraction.[^cpg] Joern supplies open-source frontends for several languages.[^joern] Its graph should be treated as one adapter family: it is broad and useful, but its frontends do not provide identical precision for every language or framework.

Operations that cannot be normalized become `opaque`, with their original span, native node kind, effects if known, and a loss record. This prevents two common failures: discarding unfamiliar constructs and pretending that superficially similar constructs have identical semantics. Async scheduling, cancellation, destructors, pattern matching, macros, ownership, exceptions, continuations, and transactions should receive dedicated opcodes only after cross-language test cases establish a stable meaning.

### Recover architecture as candidates and conformance

Architecture inference operates on the RIR graph. Useful signals include:

- build units and deployable artifacts;
- package and namespace containment;
- public API surfaces and exported symbols;
- import, call, data-access, and event edges;
- framework routes, dependency-injection registrations, RPC schemas, and queue topics;
- database tables and migration ownership;
- naming, documentation, CODEOWNERS, and directory structure;
- graph communities, fan-in/fan-out, and strongly connected components;
- existing Atlas models or other declared architecture.

No single signal defines a component. Each rule produces an `architecture-candidate` with members, rationale, support, contradictions, alternatives, and confidence. A policy can auto-accept narrow facts such as “this package manifest defines a build unit.” Broader labels such as “Order Management bounded context” should require a human or agent assertion.

The Software Reflexion Model technique supplies the right review loop: define a high-level model, extract a source model, map source entities to the high-level model, and compute where source and model converge, diverge, or leave expected relations absent.[^reflexion] SEI’s architecture-reconstruction guidance likewise describes extraction followed by successive aggregation and warns that some systems may not yield a useful representation.[^sei] Atlas can make this loop bidirectional:

```text
accepted Atlas architecture
        ↓ mapping rules
source/RIR graph → convergence + divergence + absence → visual proposal
        ↑ accepted mappings and boundary corrections
```

This is more useful than regenerating a diagram from scratch on every run. It preserves human intent, shows drift, and lets a reviewer correct mappings without rewriting extraction logic.

## Script procedure

The authoritative script array is [`pipeline.json`](pipeline.json). Stages use numeric order so adapters can be inserted without changing the data contract.

### Execution contract

1. **Pin the environment.** Record analyzer version, adapter versions, grammar commits, compiler versions, dependency lockfiles, platform, and configuration. Run with network disabled after dependencies are prepared when feasible.
2. **Snapshot inputs.** Inventory relative paths, roles, byte counts, content hashes, and ignored roots. Do not follow symlinks outside the source root.
3. **Discover build contexts.** Identify independent build roots and generated-source steps. Failure to construct a build context lowers the semantic ceiling; it does not erase the affected files.
4. **Parse per language.** Produce native syntax records and diagnostics. Store parser errors and missing nodes. Retain byte spans into hashed artifacts.
5. **Resolve semantics.** Run the strongest available indexer for each build unit. Keep exact, candidate, and unresolved references separate.
6. **Lower structure.** Map declarations and relations into the RIR schema through versioned adapter rules. Emit a loss record for omitted or merged meaning.
7. **Lower behavior.** Build operations and control/data-flow edges where supported. Preserve native semantics as extensions and opaque operations.
8. **Infer candidates.** Apply deterministic rules first, then graph aggregation. An optional agent may label or rank already-bounded candidate records; it should not consume raw repositories by default.
9. **Run quality gates.** Validate schemas, referential integrity, coverage, determinism, evidence density, unresolved ratios, and confidence calibration.
10. **Project through Atlas MCP.** Convert accepted facts/candidates to an Atlas document, call `validate_architecture`, and submit a proposal against the current revision. Keep a traceability sidecar because Atlas’s current document schema is intentionally compact.
11. **Diff against a baseline.** Match stable semantic identities and evidence fingerprints. Report source changes, extractor changes, confidence changes, moves/renames, and architecture changes separately.

### Filesystem shape

```text
.repo-analysis/<run-id-or-current>/
  manifest.json
  inventory/artifacts.jsonl
  context/build-units.jsonl
  context/dependencies.jsonl
  syntax/units.jsonl
  syntax/diagnostics.jsonl
  semantic/symbols.jsonl
  semantic/occurrences.jsonl
  semantic/relations.jsonl
  ir/entities.jsonl
  ir/relations.jsonl
  ir/evidence.jsonl
  ir/loss.jsonl
  behavior/callables.jsonl
  behavior/operations.jsonl
  behavior/control-flow.jsonl
  behavior/data-flow.jsonl
  architecture/candidates.jsonl
  architecture/mappings.jsonl
  architecture/conformance.jsonl
  quality/report.json
  quality/diagnostics.sarif
  atlas/recovered.arch.json
  atlas/traceability.jsonl
  diff/structural.json
  diff/quality.json
```

JSON Lines is used for large appendable fact sets; JSON documents are used for manifests, reports, and Atlas files. IDs and ordering are deterministic. Absolute paths, timestamps, random UUIDs, and host-specific values must not enter content fingerprints.

The first runnable slice is:

```bash
npm run analyze:repo
node scripts/repo-analysis/run.mjs --source /path/to/repository --out /path/to/output
```

It is intentionally narrow. It proves inventory identity, portable paths, output layout, repeatability, and the quality-report contract before parser dependencies are selected.

## Validation and the second analysis layer

A sensible output is not established by schema validity alone. Validation should use five independent classes.

### Structural integrity

- Every ID is unique in its record namespace.
- Every relation endpoint and evidence reference exists.
- Every source span is within the byte bounds of the hashed artifact.
- Containment and inheritance cycles obey their domain rules.
- Operation order and control-flow blocks are internally consistent.
- Every normalized or inferred record has evidence or an explicit assertion.

### Coverage with denominators

Report `numerator`, `denominator`, and exclusions for each stage: included files, recognized languages, parsed bytes, declarations lowered, definitions indexed, references resolved, functions with CFGs, calls resolved exactly, calls represented as candidate sets, and architecture nodes with traceability. “95% resolved” is meaningless unless the unresolved population and exclusions are inspectable.

Parser maturity should be measured on representative corpora. Semgrep’s language-maturity process uses parse rate and rule coverage, which is a useful precedent for adapter qualification.[^semgrep-maturity] Atlas should add lowering coverage, semantic-resolution coverage, and preservation tests.

### Reproducibility and differential checks

- Run the same locked pipeline twice and require byte-identical canonical outputs.
- Change comments and formatting; semantic facts should remain stable while spans may move.
- Rename a local variable; architecture output should remain stable.
- Rename/move a public type; identity correlation should mark a probable move rather than delete/add when evidence is strong.
- Break a build dependency; resolved coverage should decline and diagnostics should explain why.
- Compare two independent extractors on a gold corpus where possible.

SARIF can carry analysis diagnostics alongside RIR. It standardizes artifacts, physical and logical locations, provenance, baseline state, and versioned fingerprints; its specification cautions that line numbers are poor stable identifiers and that perfect fingerprint stability is difficult.[^sarif] RIR should adopt those lessons while keeping domain facts in its own schema.

### Semantic probes

Each adapter needs small fixtures that exercise imports, shadowing, overloads, generics, inheritance, closures, exceptions, async behavior, generated code, conditional compilation, reflection, and framework wiring. Expected output is asserted at the RIR level, not only as native parse trees. Mutation probes confirm that a targeted source edit changes the expected fact and no unrelated facts.

### Usefulness tests

Usefulness needs task-based tests with a human-readable question:

- Can a developer locate the implementation behind an Atlas component?
- Does the model reveal an unexpected dependency that exists in source?
- Does a code change produce a concise architecture diff?
- Can an agent propose a boundary correction using facts rather than raw source?
- Does the recovered sequence omit an effect that changes the design decision?

The report should give a verdict per intended task. A model may pass package dependency analysis and fail behavioral explanation. Global “good/bad” scores conceal this distinction.

Confidence values also need calibration. For a labeled corpus of candidate calls or component memberships, records emitted near 0.8 should be correct roughly 80% of the time. Until calibration exists, confidence values should be treated as ordinal bands with documented rules, not probabilities.

## Tool choices and licensing

The default stack should remain replaceable through adapters. The following is a technical and distribution-oriented shortlist, not legal advice.

| Tool/specification | Proposed role | License/distribution consequence |
|---|---|---|
| Tree-sitter | Tolerant CST and incremental reparse | Core is MIT; each grammar must be inventoried separately.[^tree-sitter-license] |
| SCIP plus language indexers | Preferred symbol/reference interchange | Protocol repository is Apache-2.0; each indexer and bundled compiler must be checked.[^scip-license] |
| Kythe | Alternative semantic graph and large-repo indexing | Apache-2.0.[^kythe-license] |
| Joern / CPG | Behavior graph and optional multi-language frontend | Joern is Apache-2.0; pin frontend versions and inventory transitive artifacts.[^joern] |
| Semgrep CE | Optional generic-AST experiments and rule probes | LGPL-2.1; linking/distribution obligations need review before embedding.[^semgrep-license] |
| srcML | Optional source-preserving XML for supported languages | GPL tooling; use as a separate optional process only after distribution review. Its site emphasizes source preservation and round trips.[^srcml] |
| CodeQL | Optional research oracle, not default product dependency | Query libraries are MIT, but the CLI has separate restrictive terms, including limits for closed-source analysis without a commercial license.[^codeql-license] |
| OMG KDM / ASTM | Conceptual compatibility and metamodel references | Specifications provide normative models; copying spec text or claiming conformance has separate OMG conditions. Implement concepts and document mappings rather than vendoring documents.[^kdm][^astm] |

Babelfish/UAST is instructive but should not be adopted as a foundation. Its repositories demonstrate the desired native-AST → UAST → semantic-UAST adapter/test pattern, but the server and driver SDK are GPLv3 and the ecosystem is no longer a strong maintenance bet.[^bblfsh] The adapter architecture proposed here preserves that useful idea without depending on the project.

Before shipping any adapter, extend Atlas’s existing `LICENSES/inventory.json` to capture component version, source URL, SPDX expression, how it is invoked, whether it is distributed, and the licenses of grammar packages and downloaded binaries. Runtime invocation and distribution are different decisions and should be recorded separately.

## Critical review of this strategy

### What it solves

- It makes exact observations reproducible and cheap.
- It lets parsers and semantic indexers be upgraded independently.
- It supports multiple languages without requiring identical depth on day one.
- It produces compact records that agents can query instead of repeatedly reading repositories.
- It makes every Atlas element traceable to source facts or an explicit assertion.
- It gives diffs a stable semantic basis and can separate source drift from extractor drift.
- It allows partial results without presenting missing analysis as absence in the system.

### What it does not solve

- It cannot infer a single objectively correct architecture because architecture is a view selected for a purpose.
- It cannot precisely model every dynamic behavior or external dependency from source alone.
- It does not make language adapters cheap; normalization rules require language and framework expertise.
- It cannot use numeric confidence to repair biased or missing evidence.
- It does not establish semantic equivalence between arbitrary programs.
- It will not make large behavior graphs visually useful without query-driven slicing and aggregation.

### Main failure risks

**Universal-schema inflation.** The RIR can become a union of every language feature. Counter this by keeping a small core, typed extension records, and explicit opaque operations.

**False authority.** Clean UML may look more certain than the underlying analysis. Atlas should visually distinguish asserted design, recovered facts, inferred candidates, conflicts, and missing coverage.

**Build fragility.** Compiler-grade indexes often require exact dependencies and generated files. Capture build-context failure as data and retain syntax-only coverage.

**Identity churn.** IDs based only on paths or source positions make diffs noisy. Use a hierarchy of symbol identity, qualified signature, structural fingerprint, content neighborhood, and path; report the matching basis and ambiguity.

**Framework blindness.** Generic call graphs miss routing, injection, persistence, and messaging. Add framework adapters as independent evidence producers rather than hard-coding frameworks into the core ontology.

**Metric gaming.** High parse coverage can coexist with useless architecture. Keep task-based usefulness gates and curated gold repositories.

**Agent leakage into the deterministic core.** An LLM can help label candidates and explain diffs, but raw-source semantic extraction should remain scriptable and testable. Persist agent outputs as `inferred` or `asserted`, with prompt/model metadata outside canonical fingerprints.

## Implementation sequence

### Milestone A — evidence substrate

Harden the included inventory runner. Add JSON Schema validation, submodule/symlink policy, executable and generated-file detection, Git revision metadata outside canonical hashes, SARIF diagnostics, and fixtures for filesystem edge cases. Exit criteria: deterministic output on macOS/Linux and path-independent run IDs.

### Milestone B — two end-to-end language adapters

Implement TypeScript first because Atlas is a TypeScript repository, then choose a language with a different semantic model such as Python or Rust. Each adapter must emit declarations, containment, imports, inheritance/implementation, calls, basic structured behavior, errors, and loss records. This pairing will expose which abstractions are truly shared.

Prefer SCIP for symbols where the indexer works, with Tree-sitter as tolerant syntax evidence. Do not block syntax recovery when the semantic build fails. Exit criteria: gold fixtures, measured parse/lowering/resolution coverage, deterministic reruns, and an Atlas class/component proposal for this repository.

### Milestone C — architecture reflexion loop

Add mapping rules between RIR entities and Atlas nodes. Compute convergence, divergence, and absence against the accepted Atlas architecture. Expose each edge’s evidence and aggregate count. Submit changes through the existing MCP proposal mechanism so a person reviews the visual diff.

Exit criteria: a change to an Atlas source dependency produces a concise proposal; a layout-only change produces no recovered architecture change; a parser upgrade is distinguishable from a source change.

### Milestone D — behavior slices and pseudocode

Add query-driven slices around an endpoint, method, event, or database write. Render operations as pseudocode and UML activity/sequence diagrams. Avoid whole-repository sequence diagrams. Exit criteria: reviewers can trace every rendered step to code and see opaque/uncertain transitions.

### Milestone E — ecosystem expansion

Add adapters based on actual projects, not a feature-completeness checklist. Publish an adapter conformance kit: fixtures, required metrics, schema versions, license manifest fields, and capability levels (`inventory`, `syntax`, `symbols`, `behavior`, `framework`).

## Decision

Proceed with RIR and the staged pipeline. Treat generic pseudocode as a renderer, architecture as a set of reviewable hypotheses, and Atlas as the acceptance/diff surface. Adopt Tree-sitter and SCIP first behind adapters; evaluate Joern for behavior; keep Kythe as an alternative semantic backend. Exclude CodeQL from the default product path because its CLI terms conflict with a freely distributable general analyzer, and avoid GPL-based dependencies in the default bundled distribution until a deliberate licensing decision is made.

The design is sufficiently grounded to implement Milestones A and B. Its confidence is lower for the exact behavior opcode set and automated architecture clustering; those should be learned from two contrasting language adapters and task-based evaluation before the schema is declared stable.

## Sources

[^kdm]: Object Management Group, [Knowledge Discovery Metamodel 1.4 specification and machine-readable models](https://www.omg.org/spec/KDM/1.4/PDF), 2016.
[^astm]: Object Management Group, [Abstract Syntax Tree Metamodel 1.0](https://www.omg.org/spec/ASTM/1.0/), 2011.
[^cpg]: Joern project, [Code Property Graph Specification 1.1](https://cpg.joern.io/).
[^scip]: Sourcegraph, [Writing a SCIP indexer](https://sourcegraph.com/docs/code-navigation/writing-an-indexer).
[^kythe]: Kythe project, [Schema overview](https://kythe.io/docs/schema-overview.html).
[^reflexion]: Gail C. Murphy, David Notkin, Kevin J. Sullivan, [Software Reflexion Models: Bridging the Gap Between Design and Implementation](https://www.cs.ubc.ca/~murphy/papers/rm/rm-case-study.pdf), IEEE Computer, 1997; see also the authors’ [technique description](https://www.cs.ubc.ca/~murphy/jRMTool/doc/rms.htm).
[^sei]: Rick Kazman, Liam O’Brien, Chris Verhoef, [Architecture Reconstruction Guidelines](https://www.sei.cmu.edu/library/architecture-reconstruction-guidelines/), CMU/SEI-2001-TR-026, 2001.
[^abstract-interpretation]: Patrick Cousot, Radhia Cousot, [Abstract Interpretation: A Unified Lattice Model for Static Analysis of Programs by Construction or Approximation of Fixpoints](https://doi.org/10.1145/512950.512973), POPL 1977.
[^tree-sitter]: Tree-sitter project, [Tree-sitter repository and design goals](https://github.com/tree-sitter/tree-sitter).
[^tree-sitter-queries]: Tree-sitter project, [Query syntax](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html).
[^semgrep-generic]: Semgrep, [Type-awareness in semantic grep](https://semgrep.dev/blog/2020/type-awareness-in-semantic-grep/) and [A static analysis journey](https://semgrep.dev/blog/2021/semgrep-a-static-analysis-journey), 2020–2021.
[^lsp]: Microsoft, [Language Server Protocol 3.17 specification](https://github.com/Microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md).
[^joern]: Joern project, [Open-source Code Property Graph analysis platform](https://github.com/joernio/joern), Apache-2.0.
[^semgrep-maturity]: Semgrep, [The journey of a language from experimental to GA](https://semgrep.dev/blog/2023/kotlin-ga/), 2023.
[^sarif]: OASIS, [Static Analysis Results Interchange Format 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html), 2020.
[^tree-sitter-license]: Tree-sitter project, [MIT License](https://github.com/tree-sitter/tree-sitter/blob/master/LICENSE).
[^scip-license]: SCIP project, [SCIP protocol repository](https://github.com/sourcegraph/scip/), Apache-2.0.
[^kythe-license]: Kythe project, [Apache License 2.0](https://github.com/kythe/kythe/blob/master/LICENSE).
[^semgrep-license]: Semgrep, [Copyright and LGPL-2.1 notice](https://github.com/semgrep/semgrep/blob/develop/COPYRIGHT).
[^srcml]: srcML project, [About srcML](https://www.srcml.org/about.html).
[^codeql-license]: GitHub, [CodeQL CLI terms and conditions](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md) and [open-source query-library license distinction](https://github.com/github/codeql).
[^bblfsh]: Babelfish project, [Driver SDK and test architecture](https://github.com/bblfsh/sdk), GPL-3.0.
