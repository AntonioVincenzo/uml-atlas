# Atlas UML subset, version 1

Atlas's canonical interchange format is JSON. Its text editor implements a strict PlantUML-style structural subset plus metadata comments. It does not embed the PlantUML engine. A syntax error preserves the current canvas; unsupported directives fail with a line number instead of being guessed or partially applied.

## Diagram and elements

```text
@startuml checkout
title "Checkout architecture"

component "Checkout API" as api
interface "Payment gateway" as gateway
class "Order" as order {
  +id: UUID
  +submit(): Result
}

api ..> gateway : "authorize"
api --> order : "creates"
@enduml
```

A single source contains one `@startuml`/`@enduml` pair. Diagram IDs and element IDs begin with a letter or underscore and then use letters, numbers, underscores or hyphens, at most 100 characters. Names and relationship labels can be JSON-quoted strings, including escaped characters. Unquoted diagram titles and relationship labels are also accepted. A quoted element label requires `as id`; an unquoted declaration such as `class Order` uses `Order` as both ID and label.

Element keywords: `component`, `class`, `interface`, `package`, `actor`, `usecase`, `database`, `service`, `state`, `note`, `enum`. A member block may follow any declaration. Members are preserved as nonempty trimmed single lines, excluding a lone closing brace. Atlas displays up to six members on a node; the inspector/source contains the complete list. Class members containing `(` render in the operation compartment; other class members render as attributes. Empty/trailing member lines should be removed before saving.

## Relationships

| Syntax | Model kind | Meaning of source / target |
| --- | --- | --- |
| `a --> b` | association | source a, target b |
| `a ..> b` | dependency | a depends on b |
| `a --\|> b` | generalization | a specializes b |
| `a ..\|> b` | realization | a realizes b |
| `a *-- b` | composition | whole a contains part b |
| `a o-- b` | aggregation | aggregate a refers to part b |
| `a -> b` | transition | a transitions to b |

Endpoints must already be declared somewhere in the diagram (forward references are allowed) or name an imported diagram reference. Multiple edges between the same endpoints are permitted with distinct IDs. Self-association and transition loops are permitted. Generalization cycles and self generalization/realization/composition/aggregation are rejected.

## Metadata comments

The serializer emits ordinary apostrophe comments with JSON payloads. Keep these comments for fully portable round trips:

```text
' @diagram {"description":"System purpose"}
' @node {"position":{"x":100,"y":140},"description":"Owns orders","stereotype":"boundary","codeLinks":[{"path":"src/orders.py","startLine":12,"endLine":30}],"snippet":{"language":"pseudocode","code":"validate(order)\npersist(order)"}}
component "Orders" as orders
' @edge {"id":"uses_payments","sourceMultiplicity":"1","targetMultiplicity":"0..*"}
orders ..> payments : "authorize"
' @import {"id":"payments","diagramId":"payment_subsystem","label":"Payments","position":{"x":450,"y":140},"expanded":false}
```

A `@node` comment applies to the following declaration, and an `@edge` comment to the following relationship. `@diagram` supports description. `@import` is a complete reference record. Unknown fields are rejected by the model schema. Stereotypes, code links, snippets, and multiplicities are edited visually or via metadata; inline PlantUML stereotype/multiplicity notation is not supported in this version.

Existing node metadata is preserved by stable node ID when parsing within the editor, even if its metadata comment is omitted. Existing edge IDs are reused for matching endpoint/kind/occurrence combinations. Preserve explicit `@edge` IDs when rewiring an edge; this allows the diff to represent the change as a modification.

JSON export/import is the complete project interchange. UML export is a single diagram and may reference other diagrams not included in the text file. Import the whole project to preserve these references. Standard PlantUML readers ignore metadata and do not understand all Atlas element extensions; generated `.puml` files are intended for Atlas's documented subset, not guaranteed complete rendering elsewhere.

## Explicitly unsupported

`!include`, preprocessor directives, themes/skinparams, sequence messages/lifelines, activity forks/joins, specialized state nesting, use-case system boundaries/include/extend semantics, arbitrary inline styles, directional arrow variants, inline notes, full package blocks, XMI and the full UML metamodel. Atlas's validation rules are documented graph invariants, not UML 2.5 conformance.
